import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest'
let db:PGlite
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222'
const sql=readFileSync(new URL('../supabase/migrations/20260930124759_openai_import_analysis.sql',import.meta.url),'utf8')
const hash=(n=1)=>n.toString(16).padStart(64,'0')
const reserve=async(user=alice,n=1)=>(await db.query<{r:{status:string;id:string;result?:unknown}}>('select reserve_import_analysis($1,$2) r',[user,hash(n)])).rows[0].r
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${alice}'),('${bob}');grant usage on schema public to anon,authenticated,service_role;`)
  await db.exec(sql);await db.exec(sql)
},30000)
beforeEach(async()=>{await db.exec('reset role;delete from import_analyses;set role service_role;')})
afterAll(async()=>{await db?.close()})
it('reserves atomically, blocks parallel work and caches only for the same user',async()=>{
  const a=await reserve();expect(a.status).toBe('new');expect((await reserve()).status).toBe('busy');expect((await reserve(alice,2)).status).toBe('busy')
  await db.query("update import_analyses set status='completed',result=$1 where id=$2",[JSON.stringify({client:'PRIVATE'}),a.id])
  expect(await reserve()).toMatchObject({status:'cached',result:{client:'PRIVATE'}})
  expect((await reserve(bob)).status).toBe('new')
})
it('denies direct reads, writes and quota calls from both client roles',async()=>{
  await reserve()
  for(const role of ['anon','authenticated']){
    await db.exec(`reset role;set role ${role};`)
    await expect(db.query('select * from import_analyses')).rejects.toThrow('permission denied')
    await expect(reserve()).rejects.toThrow('permission denied')
    await expect(db.query("update import_analyses set status='completed'")).rejects.toThrow('permission denied')
  }
})
it('enforces the rolling per-user quota across sessions, including failures',async()=>{
  await db.query("insert into import_analyses(user_id,document_hash,status,created_at) select $1,lpad(to_hex(n),64,'0'),'failed',now()-interval '2 minutes' from generate_series(1,20) n",[alice])
  expect((await reserve(alice,99)).status).toBe('limited');expect((await reserve(bob)).status).toBe('new')
})
it('enforces per-minute and total application limits',async()=>{
  await db.query("insert into import_analyses(user_id,document_hash,status) select $1,lpad(to_hex(n),64,'0'),'failed' from generate_series(1,10) n",[alice])
  expect((await reserve(alice,99)).status).toBe('limited')
  await db.query("insert into import_analyses(user_id,document_hash,status,created_at) select $1,lpad(to_hex(n),64,'0'),'failed',now()-interval '2 hours' from generate_series(11,200) n",[alice])
  expect((await reserve(bob)).status).toBe('limited')
})
it('expires cached content and recovers abandoned reservations without bypassing counts',async()=>{
  await db.query("insert into import_analyses(user_id,document_hash,status,created_at,result) values($1,$2,'completed',now()-interval '25 hours','{\"client\":\"PRIVATE\"}')",[alice,hash()])
  expect((await reserve()).status).toBe('new')
  expect((await db.query<{result:unknown}>('select result from import_analyses where created_at<now()-interval \'24 hours\'')).rows[0].result).toBeNull()
  await db.exec("update import_analyses set created_at=now()-interval '2 minutes' where status='pending'")
  expect((await reserve()).status).toBe('new')
})
