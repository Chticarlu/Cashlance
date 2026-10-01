import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { beforeAll, afterAll, expect, it } from 'vitest'
let db: PGlite, org: string
const owner = '11111111-1111-4111-8111-111111111111'
const directory = new URL('../supabase/migrations/', import.meta.url)
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    insert into auth.users values('${owner}');`)
  for (const f of readdirSync(directory).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f,directory),'utf8').replace('create extension if not exists pgcrypto;',''))
  org = (await db.query<{ id: string }>('insert into organizations(owner_id,name,stripe_customer_id) values($1,$2,$3) returning id',[owner,'Test','cus'])).rows[0].id
  await db.exec('grant all on all tables in schema public to service_role')
},30000)
afterAll(async () => { await db?.close() })
const sync = (sub: string, status: string, started: string, created: number, event: string | null) => db.query('select sync_stripe_subscription($1,$2,$3,$4,$5,$6,$7,$8)',[org,'cus',sub,status,'solo',started,created,event])
it('blocks local trials and gives no default entitlement', async () => {
  expect((await db.query<{ subscription_status: string }>('select subscription_status from organizations')).rows[0].subscription_status).toBe('cancelled')
  await expect(db.query('select confirm_import_server($1,$2,$3,false,$4)',[owner,crypto.randomUUID(),JSON.stringify([{client:'Client',invoiceNumber:'TEST',amount_cents:100,due:'2026-10-01',confirmed:true,currency:'EUR',email:'x@example.invalid',details:{}}]),'gentle'])).rejects.toThrow('subscription_required')
})
it('applies once, rejects stale snapshots and never restores an older subscription', async () => {
  await sync('sub_old','trialing','2026-10-01T10:00:00Z',1,'evt_a')
  await sync('sub_old','active','2026-10-01T10:00:01Z',1,'evt_a') // Duplicate ignored.
  expect((await db.query<{s:string}>('select subscription_status s from organizations')).rows[0].s).toBe('trialing')
  await sync('sub_old','cancelled','2026-10-01T10:00:02Z',1,'evt_b')
  await sync('sub_new','active','2026-10-01T10:00:03Z',2,'evt_c')
  await sync('sub_old','active','2026-10-01T10:00:04Z',1,'evt_d')
  await sync('sub_new','past_due','2026-10-01T09:00:00Z',2,'evt_e')
  expect((await db.query<{s:string;id:string}>('select subscription_status s,stripe_subscription_id id from organizations')).rows[0]).toEqual({s:'active',id:'sub_new'})
  expect((await db.query('select id from stripe_processed_events')).rows).toHaveLength(5)
})
it('denies client billing/ledger access and validates Stripe customer ownership', async () => {
  await expect(db.query('select sync_stripe_subscription($1,$2,$3,$4,$5,now(),2,null)',[org,'foreign','sub_new','active','solo'])).rejects.toThrow('stripe_customer_mismatch')
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false); set role authenticated;`)
  await expect(sync('sub','active','2026-10-01T10:00:10Z',3,'evt_f')).rejects.toThrow('permission denied')
  await expect(db.query('select * from stripe_processed_events')).rejects.toThrow('permission denied')
  await expect(db.exec("update organizations set subscription_status='active'")).rejects.toThrow('permission denied')
  await db.exec('reset role')
})
it('hides paid data and removes legacy reminders from the queue after cancellation', async () => {
  const customer = (await db.query<{id:string}>('insert into customers(organization_id,name,email) values($1,$2,$3) returning id',[org,'Client','client@example.invalid'])).rows[0].id
  await db.query("insert into invoices(organization_id,customer_id,amount_cents,due_date) values($1,$2,100,'2020-01-01')",[org,customer])
  await db.query("update reminders set scheduled_for=now()-interval '1 day'")
  await sync('sub_new','cancelled','2026-10-01T10:00:20Z',2,'evt_cancel')
  expect((await db.query('select due_reminder_batch()')).rows).toHaveLength(0)
  await db.exec('set role authenticated')
  expect((await db.query('select * from invoices')).rows).toHaveLength(0)
  await db.exec('reset role')
})
