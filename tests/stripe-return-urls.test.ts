import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ checkout: vi.fn(), portal: vi.fn(), retrieve: vi.fn(), org: { id: 'org_test', name: 'Test', stripe_customer_id: 'cus_test', stripe_subscription_id: null as string | null, subscription_status: 'inactive' } }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user_test', email: 'user@example.com' } } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.org, error: null }) }) }) }) }) }))
vi.mock('@/lib/stripe', async (original) => ({
  ...await original<typeof import('../lib/stripe')>(),
  getStripe: () => ({ subscriptions: { retrieve: mocks.retrieve }, checkout: { sessions: { create: mocks.checkout } }, billingPortal: { sessions: { create: mocks.portal } } }),
}))
import { POST as checkout } from '../app/api/stripe/checkout/route'
import { POST as portal } from '../app/api/stripe/portal/route'
beforeEach(() => {
  mocks.org.stripe_subscription_id=null; mocks.org.subscription_status='inactive'
  mocks.retrieve.mockResolvedValue({status:'canceled'})
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
  vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_test')
  vi.stubEnv('STRIPE_AUTOMATIC_TAX_ENABLED', 'false')
  mocks.checkout.mockResolvedValue({ url: 'https://checkout.stripe.com/test' })
  mocks.portal.mockResolvedValue({ url: 'https://billing.stripe.com/test' })
})
afterEach(() => vi.unstubAllEnvs())
it('builds Checkout returns on cashlance.fretixo.fr independently of request Host', async () => {
  const form = new FormData(); form.set('plan', 'pro')
  const result = await checkout(new Request('https://untrusted.example/api/stripe/checkout', { method: 'POST', headers:{origin:'https://cashlance.fretixo.fr'}, body: form }))
  expect(result.status).toBe(303)
  expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({
    success_url: 'https://cashlance.fretixo.fr/billing/return?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://cashlance.fretixo.fr/pricing?billing=cancelled',
    automatic_tax: { enabled: false },
  }), expect.objectContaining({idempotencyKey:expect.any(String)}))
})
it('builds Customer Portal return on cashlance.fretixo.fr', async () => {
  expect((await portal(new Request('https://cashlance.fretixo.fr/api/stripe/portal', { method: 'POST', headers: { origin: 'https://cashlance.fretixo.fr' } }))).status).toBe(303)
  expect(mocks.portal).toHaveBeenCalledWith({ customer: 'cus_test', return_url: 'https://cashlance.fretixo.fr/account/billing' })
})
it('rejects inherited plan keys', async () => {
  const form = new FormData(); form.set('plan', 'constructor')
  expect((await checkout(new Request('https://cashlance.fretixo.fr/api/stripe/checkout', { method: 'POST', headers:{origin:'https://cashlance.fretixo.fr'}, body: form }))).status).toBe(400)
  expect(mocks.checkout).not.toHaveBeenCalled()
})

it('prevents a second Checkout for an existing subscription',async()=>{
  mocks.org.stripe_subscription_id='sub_test';mocks.org.subscription_status='trialing'
  const form=new FormData();form.set('plan','pro')
  const result=await checkout(new Request('https://cashlance.fretixo.fr/api/stripe/checkout',{method:'POST',headers:{origin:'https://cashlance.fretixo.fr'},body:form}))
  expect(result.headers.get('location')).toBe('https://cashlance.fretixo.fr/account/billing')
  expect(mocks.checkout).not.toHaveBeenCalled()
})
it('allows a former subscriber to return without a new trial',async()=>{
  mocks.org.stripe_subscription_id='sub_old';mocks.org.subscription_status='canceled'
  const form=new FormData();form.set('plan','pro')
  await checkout(new Request('https://cashlance.fretixo.fr/api/stripe/checkout',{method:'POST',headers:{origin:'https://cashlance.fretixo.fr'},body:form}))
  expect(mocks.checkout.mock.calls[0][0].subscription_data).not.toHaveProperty('trial_period_days')
})
it('rejects another Checkout when a cached cancellation disagrees with Stripe',async()=>{
  mocks.org.stripe_subscription_id='sub_existing';mocks.org.subscription_status='cancelled'
  mocks.retrieve.mockResolvedValueOnce({status:'trialing'})
  const form=new FormData();form.set('plan','pro')
  const res=await checkout(new Request('https://cashlance.fretixo.fr/api/stripe/checkout',{method:'POST',headers:{origin:'https://cashlance.fretixo.fr'},body:form}))
  expect(res.headers.get('location')).toBe('https://cashlance.fretixo.fr/account/billing')
  expect(mocks.checkout).not.toHaveBeenCalled()
})
