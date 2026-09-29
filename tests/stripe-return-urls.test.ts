import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ checkout: vi.fn(), portal: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user_test', email: 'user@example.com' } } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'org_test', name: 'Test', stripe_customer_id: 'cus_test' }, error: null }) }) }) }) }) }))
vi.mock('@/lib/stripe', async (original) => ({
  ...await original<typeof import('../lib/stripe')>(),
  getStripe: () => ({ checkout: { sessions: { create: mocks.checkout } }, billingPortal: { sessions: { create: mocks.portal } } }),
}))
import { POST as checkout } from '../app/api/stripe/checkout/route'
import { POST as portal } from '../app/api/stripe/portal/route'
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
  vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_test')
  vi.stubEnv('STRIPE_AUTOMATIC_TAX_ENABLED', 'false')
  mocks.checkout.mockResolvedValue({ url: 'https://checkout.stripe.com/test' })
  mocks.portal.mockResolvedValue({ url: 'https://billing.stripe.com/test' })
})
afterEach(() => vi.unstubAllEnvs())
it('builds Checkout returns on cashlance.fretixo.fr independently of request Host', async () => {
  const form = new FormData(); form.set('plan', 'pro')
  const result = await checkout(new Request('https://untrusted.example/api/stripe/checkout', { method: 'POST', body: form }))
  expect(result.status).toBe(303)
  expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({
    success_url: 'https://cashlance.fretixo.fr/dashboard?billing=success',
    cancel_url: 'https://cashlance.fretixo.fr/pricing?billing=cancelled',
    automatic_tax: { enabled: false },
  }))
})
it('builds Customer Portal return on cashlance.fretixo.fr', async () => {
  expect((await portal(new Request('https://untrusted.example/api/stripe/portal', { method: 'POST' }))).status).toBe(303)
  expect(mocks.portal).toHaveBeenCalledWith({ customer: 'cus_test', return_url: 'https://cashlance.fretixo.fr/dashboard' })
})
it('rejects inherited plan keys', async () => {
  const form = new FormData(); form.set('plan', 'constructor')
  expect((await checkout(new Request('https://cashlance.fretixo.fr/api/stripe/checkout', { method: 'POST', body: form }))).status).toBe(400)
  expect(mocks.checkout).not.toHaveBeenCalled()
})
