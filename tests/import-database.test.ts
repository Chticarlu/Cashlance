import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll,afterAll,it,expect } from 'vitest'
let db:PGlite
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222'
const row=(ref:string,extra:Record<string,unknown>={})=>({client:'CLIENT TEST',email:'client@example.invalid',invoiceNumber:ref,amount_cents:128000,due:'2026-01-01',currency:'EUR',confirmed:true,details:{},...extra})
async function asUser(id:string) { await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`) }
async function confirm(rows:unknown[],schedule=true,batch=crypto.randomUUID()) {
  const response=await db.query<{result:{created:number;duplicates:number;scheduled:number}}>('select public.confirm_import($1,$2::jsonb,$3,$4) result',[batch,JSON.stringify(rows),schedule,'gentle'])
  return response.rows[0].result
}
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
    insert into auth.users values('${alice}'),('${bob}');`)
  for(const file of ['001_initial_schema.sql','002_automation_and_billing.sql','20260930000000_import_funnel.sql']) {
    // PGlite has core gen_random_uuid/sha256; initial extension is not needed locally.
    const sql=readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8').replace('create extension if not exists pgcrypto;','')
    await db.exec(sql)
  }
  await asUser(alice)
},30000)
afterAll(async()=>{await db?.close()})
it('atomically creates reviewed client/invoice and spaces all overdue reminders',async()=>{
  expect(await confirm([row('A-1')])).toEqual({created:1,duplicates:0,scheduled:3})
  const dates=(await db.query<{at:string}>('select scheduled_for::text at from reminders order by scheduled_for')).rows.map(r=>Date.parse(r.at))
  expect(dates).toHaveLength(3);expect(dates[0]).toBeGreaterThan(Date.now()+86300000);expect(dates[1]-dates[0]).toBe(86400000)
})
it('idempotently retries batches and skips invoice duplicates across batches',async()=>{
  const batch=crypto.randomUUID(),first=await confirm([row('A-2')],true,batch)
  expect(await confirm([row('A-2')],true,batch)).toEqual(first)
  expect(await confirm([row('A-2',{amount_cents:900})])).toEqual({created:0,duplicates:1,scheduled:0})
  expect((await db.query<{n:number}>("select count(*)::int n from funnel_events where name='first_reminder_scheduled'")).rows[0].n).toBe(1)
})
it('rolls back the entire batch when a later row is invalid',async()=>{
  await expect(confirm([row('ROLLBACK-1'),row('ROLLBACK-2',{confirmed:false})])).rejects.toThrow('review_required')
  expect((await db.query("select id from invoices where invoice_number like 'ROLLBACK%'")).rows).toHaveLength(0)
})
it('never schedules incomplete drafts; permits later explicit activation once',async()=>{
  expect(await confirm([row('DRAFT-1',{email:''})],false)).toEqual({created:1,duplicates:0,scheduled:0})
  const invoice=(await db.query<{id:string}>("select id from invoices where invoice_number='DRAFT-1'")).rows[0].id
  await expect(db.query('select activate_imported_invoice($1,null,$2)',[invoice,'gentle'])).rejects.toThrow('invalid_review')
  const activate=()=>db.query<{n:number}>('select activate_imported_invoice($1,$2,$3) n',[invoice,'draft@example.invalid','gentle'])
  expect((await activate()).rows[0].n).toBe(3);expect((await activate()).rows[0].n).toBe(0)
})
it('keeps another user out of invoices, drafts, batches, events and activation',async()=>{
  const invoice=(await db.query<{id:string}>('select id from invoices limit 1')).rows[0].id
  await db.query('insert into import_drafts(user_id,batch_id,rows) values($1,$2,$3)',[alice,crypto.randomUUID(),'[]'])
  await asUser(bob)
  for(const table of ['invoices','customers','reminders','import_drafts','import_batches','funnel_events']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0)
  await expect(db.query('select activate_imported_invoice($1,$2,$3)',[invoice,'x@example.invalid','gentle'])).rejects.toThrow('invoice_unavailable')
  await expect(db.query('insert into import_drafts(user_id,batch_id,rows) values($1,$2,$3)',[alice,crypto.randomUUID(),'[]'])).rejects.toThrow()
  await expect(db.query('select * from onboarding_email_deliveries')).rejects.toThrow()
  await asUser(alice)
})
it('requires authentication and non-null batch/scenario payloads',async()=>{
  await expect(db.query('select confirm_import($1,null,true,$2)',[crypto.randomUUID(),'gentle'])).rejects.toThrow('invalid_batch')
  await db.exec('reset role;set role anon;')
  await expect(confirm([row('ANON')])).rejects.toThrow('permission denied')
  await asUser(alice)
})
it('rejects expired free trials but still lets users save unscheduled invoices',async()=>{
  await db.exec("update organizations set created_at=now()-interval '15 days'")
  await expect(confirm([row('EXPIRED')])).rejects.toThrow('subscription_required')
  expect(await confirm([row('EXPIRED')],false)).toMatchObject({created:1,scheduled:0})
})
it('filters expired trials before the cron batch limit and keeps legacy reminders available',async()=>{
  await db.exec("update reminders set scheduled_for=now()-interval '1 day'")
  await db.exec('reset role;')
  expect((await db.query('select public.due_reminder_batch()')).rows).toHaveLength(0)
  // Legacy invoices remain eligible, even when an imported trial has ended.
  await asUser(alice)
  await db.exec("insert into invoices(organization_id,customer_id,invoice_number,amount_cents,due_date) select organization_id,id,'LEGACY',100,'2020-01-01' from customers limit 1")
  await db.exec('reset role;')
  expect((await db.query('select public.due_reminder_batch()')).rows).toHaveLength(5)
  await asUser(alice)
  await expect(db.query('select public.due_reminder_batch()')).rejects.toThrow('permission denied')
})
