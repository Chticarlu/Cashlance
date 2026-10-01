import {beforeEach,afterEach,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({session:vi.fn(),subscription:vi.fn(),config:vi.fn(),user:{id:'owner'} as {id:string}|null}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:mocks.user}})}})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{stripe_customer_id:'cus_test',stripe_subscription_id:'sub_test',subscription_status:'trialing'}})})})})})}))
vi.mock('@/lib/stripe',()=>({getStripe:()=>({subscriptions:{retrieve:mocks.subscription},billingPortal:{configurations:{list:mocks.config},sessions:{create:mocks.session}}})}))
import {POST} from '../app/api/stripe/change-plan/route'
const req=(origin='https://cashlance.fretixo.fr')=>new Request(origin+'/api/stripe/change-plan',{method:'POST',headers:{origin}})
beforeEach(()=>{
 mocks.user={id:'owner'}
 vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://obsolete.vercel.app')
 mocks.subscription.mockResolvedValue({id:'sub_test',customer:'cus_test',status:'trialing',items:{data:[{}]},cancel_at_period_end:false,cancel_at:null})
 mocks.config.mockResolvedValue({data:[{id:'bpc_test',features:{subscription_update:{enabled:true}}}]})
 mocks.session.mockResolvedValue({url:'https://billing.stripe.com/test'})
})
afterEach(()=>vi.unstubAllEnvs())
it('uses the canonical production return and delegates the existing subscription to Stripe without a new trial',async()=>{
 expect((await POST(req())).status).toBe(303)
 expect(mocks.session).toHaveBeenCalledWith({customer:'cus_test',configuration:'bpc_test',return_url:'https://cashlance.fretixo.fr/account/billing',flow_data:{type:'subscription_update',subscription_update:{subscription:'sub_test'},after_completion:{type:'redirect',redirect:{return_url:'https://cashlance.fretixo.fr/account/billing'}}}})
})
it('returns to the actual Preview despite a stale configured URL',async()=>{
 vi.stubEnv('VERCEL_ENV','preview')
 await POST(req('https://current-preview.vercel.app'))
 expect(mocks.session.mock.calls[0][0].return_url).toBe('https://current-preview.vercel.app/account/billing')
})
it('rejects CSRF and unauthenticated requests before opening Stripe',async()=>{
 expect((await POST(new Request('https://cashlance.fretixo.fr/api/stripe/change-plan',{method:'POST',headers:{origin:'https://attacker.invalid'}}))).status).toBe(403)
 mocks.user=null;expect((await POST(req())).headers.get('location')).toBe('https://cashlance.fretixo.fr/login')
 expect(mocks.session).not.toHaveBeenCalled()
})
it('rejects a foreign customer and explains scheduled cancellation',async()=>{
 mocks.subscription.mockResolvedValueOnce({customer:'foreign',status:'active',items:{data:[{}]}})
 expect((await POST(req())).headers.get('location')).toContain('error=unavailable')
 mocks.subscription.mockResolvedValueOnce({customer:'cus_test',status:'active',items:{data:[{}]},cancel_at_period_end:true})
 expect((await POST(req())).headers.get('location')).toContain('error=scheduled_cancellation')
 expect(mocks.session).not.toHaveBeenCalled()
})
it('does not open a disabled plan switch',async()=>{
 mocks.config.mockResolvedValue({data:[]})
 expect((await POST(req())).headers.get('location')).toContain('error=configuration')
 expect(mocks.session).not.toHaveBeenCalled()
})
