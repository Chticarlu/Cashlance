import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import {beforeAll,afterAll,it,expect} from 'vitest'
let db:PGlite,org:string,customer:string,invoice:string
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const migrationDir=new URL('../supabase/migrations/',import.meta.url)
beforeAll(async()=>{
 db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon,service_role;
 insert into auth.users values('${owner}'),('${other}');`)
 for(const file of readdirSync(migrationDir).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,migrationDir),'utf8').replace('create extension if not exists pgcrypto;',''))
 org=(await db.query<{id:string}>('insert into organizations(owner_id,name) values($1,$2) returning id',[owner,'Test'])).rows[0].id
 customer=(await db.query<{id:string}>('insert into customers(organization_id,name,email) values($1,$2,$3) returning id',[org,'Client','client@example.invalid'])).rows[0].id
 invoice=(await db.query<{id:string}>("insert into invoices(organization_id,customer_id,invoice_number,amount_cents,due_date,import_key,import_details) values($1,$2,'TEST',100,'2026-10-10','TEST','{}') returning id",[org,customer])).rows[0].id
},30000)
afterAll(async()=>{await db?.close()})
const edit=(who=owner,name='Client corrigé',amount=100,issuer='Fournisseur')=>db.query('select edit_invoice_server($1,$2,$3,$4,$5,$6,$7,$8)',[who,invoice,issuer,name,'client@example.invalid','TEST',amount,'2026-10-10'])
it('is idempotent and executable only by service_role',async()=>{
 await db.exec(readFileSync(new URL('20261001140000_edit_invoice_customer_identity.sql',migrationDir),'utf8'))
 for(const role of ['anon','authenticated','service_role']){
  const result=await db.query<{ok:boolean}>('select has_function_privilege($1,$2,$3) ok',[role,'public.edit_invoice_server(uuid,uuid,text,text,text,text,integer,date)','EXECUTE'])
  expect(result.rows[0].ok).toBe(role==='service_role')
 }
 await db.exec('set role authenticated')
 await expect(edit()).rejects.toThrow('permission denied')
 await db.exec('reset role')
})
it('checks ownership and edits an unshared customer without duplicate email failure',async()=>{
 await expect(edit(other)).rejects.toThrow('invoice_not_found')
 await db.exec('set role service_role');try{await edit()}finally{await db.exec('reset role')}
 expect((await db.query<{name:string}>('select name from customers where id=$1',[customer])).rows[0].name).toBe('Client corrigé')
 expect((await db.query('select id from reminders')).rows).toHaveLength(0)
})
it('does not overwrite a shared customer identity or historical invoice',async()=>{
 await db.query("insert into invoices(organization_id,customer_id,invoice_number,amount_cents,due_date,import_key,import_details) values($1,$2,'OTHER',100,'2026-10-10','OTHER','{}')",[org,customer])
 await expect(edit(owner,'Different')).rejects.toThrow()
 expect((await db.query<{name:string}>('select name from customers where id=$1',[customer])).rows[0].name).toBe('Client corrigé')
})
it('locks financial fields after reminder history but allows issuer correction; paid cancels pending reminders',async()=>{
 await db.query("insert into reminders(organization_id,invoice_id,scheduled_for,stage) values($1,$2,now()+interval '1 day','J+1')",[org,invoice])
 await expect(edit(owner,'Client corrigé',200)).rejects.toThrow('financial_fields_locked')
 await edit(owner,'Client corrigé',100,'Émetteur corrigé')
 await db.query("select manage_invoice_server($1,$2,'paid')",[owner,invoice])
 expect((await db.query<{state:string}>('select state from reminders where invoice_id=$1',[invoice])).rows[0].state).toBe('cancelled')
 expect((await db.query<{status:string}>('select status from invoices where id=$1',[invoice])).rows[0].status).toBe('paid')
})
