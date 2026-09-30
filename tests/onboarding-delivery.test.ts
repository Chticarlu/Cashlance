import {it,expect,vi,afterEach} from 'vitest'
import {sendOnboardingEmails} from '../lib/onboarding-emails'
afterEach(()=>vi.unstubAllEnvs())
it('does not query or send when onboarding emails are disabled',async()=>{
  vi.stubEnv('CASHLANCE_ONBOARDING_EMAILS','false')
  const from=vi.fn(),send=vi.fn()
  expect(await sendOnboardingEmails({from} as any,{emails:{send}} as any)).toBe(0)
  expect(from).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled()
})
it('skips users who withdrew consent or whose milestone was already delivered',async()=>{
  vi.stubEnv('CASHLANCE_ONBOARDING_EMAILS','true')
  const state={user_id:'fake',stage:'scheduled',updated_at:new Date().toISOString(),created_at:new Date().toISOString()}
  const send=vi.fn();let seen=false
  const db={auth:{admin:{getUserById:async()=>({data:{user:{email:'test@example.invalid',email_confirmed_at:'2026-09-30'}}})}},from:(table:string)=>{
    const value=table==='onboarding_state'?(seen?{data:{opted_in:false,stage:'scheduled'}}:{data:[state]}):table==='organizations'?{data:{created_at:state.created_at,subscription_status:'trialing',stripe_subscription_id:null}}:{data:[]}
    if(table==='onboarding_state')seen=true
    const q:any={then:(f:Function)=>Promise.resolve(value).then(f as any)}
    for(const k of ['select','eq','gte','order','limit','maybeSingle'])q[k]=()=>q
    q.insert=()=>{throw new Error('Must not claim after opt-out')};return q
  }}
  expect(await sendOnboardingEmails(db as any,{emails:{send}} as any)).toBe(0);expect(send).not.toHaveBeenCalled()
})
