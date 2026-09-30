import { beforeEach,it,expect,vi } from 'vitest'
import {emptyDraft} from '../lib/imports/model'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),user:{id:'user-test'} as {id:string}|null}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:mocks.user}})},rpc:mocks.rpc})}))
import {POST} from '../app/api/imports/route'
const payload=()=>({batchId:crypto.randomUUID(),reviewed:true,schedule:true,scenario:'gentle',rows:[{...emptyDraft(),client:'Client',email:'test@example.invalid',invoiceNumber:'FA-1',amount:'1280,00',due:'2026-09-30',currency:'EUR',confirmed:true}]})
const req=(body:unknown,origin='https://cashlance.fretixo.fr')=>new Request('https://cashlance.fretixo.fr/api/imports',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{mocks.user={id:'user-test'};mocks.rpc.mockResolvedValue({data:{created:1,scheduled:3,duplicates:0},error:null})})
it('requires same-origin and authenticated user before database mutations',async()=>{
  expect((await POST(req(payload(),'https://attacker.invalid'))).status).toBe(403)
  mocks.user=null;expect((await POST(req(payload()))).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled()
})
it.each(['reviewed','confirmed','email'])('rejects missing %s',async(field)=>{
  const body=payload();if(field==='reviewed')body.reviewed=false;else if(field==='confirmed')body.rows[0].confirmed=false;else body.rows[0].email=''
  expect((await POST(req(body))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled()
})
it('rejects malformed customer email domains before the import RPC',async()=>{
  const body=payload();body.rows[0].email='client@gmail.c'
  expect((await POST(req(body))).status).toBe(400)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('uses one atomic RPC with normalized amount/date and no client-supplied owner',async()=>{
  const body=payload();expect((await POST(req({...body,organization_id:'foreign'}))).status).toBe(200)
  expect(mocks.rpc).toHaveBeenCalledWith('confirm_import',expect.objectContaining({rows:[expect.objectContaining({amount_cents:128000,due:'2026-09-30',confirmed:true})]}))
  expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty('organization_id')
})
it('sanitizes database errors',async()=>{
  mocks.rpc.mockResolvedValue({error:{message:'private invoice content secret'},data:null})
  const res=await POST(req(payload()));expect(res.status).toBe(409);expect(await res.text()).not.toContain('secret')
})
