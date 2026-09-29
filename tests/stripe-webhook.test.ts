import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ constructEvent: vi.fn(), retrieve: vi.fn(), admin: vi.fn(), writes: [] as any[], error: null as any }))
vi.mock('@/lib/stripe', async (original) => ({
  ...await original<typeof import('../lib/stripe')>(),
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent }, subscriptions: { retrieve: mocks.retrieve } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
import { POST } from '../app/api/stripe/webhook/route'

const subscription = (status = 'active') => ({ id: 'sub_test', customer: { id: 'cus_test' }, status, metadata: { plan: 'solo', organization_id: 'org_test' }, items: { data: [{ price: { id: 'price_team_test' } }] } })
function event(type: string, object: object) { mocks.constructEvent.mockReturnValue({ type, data: { object } }) }
function request(signature = true) { return new Request('https://cashlance.fretixo.fr/api/stripe/webhook', { method: 'POST', body: '{}', headers: signature ? { 'stripe-signature': 'test-signature' } : {} }) }
beforeEach(() => {
  mocks.writes = []; mocks.error = null
  vi.stubEnv('STRIPE_SECRET_KEY', 'test-only-placeholder')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-only-placeholder')
  vi.stubEnv('STRIPE_PRICE_TEAM', 'price_team_test')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.retrieve.mockResolvedValue(subscription())
  mocks.admin.mockImplementation(() => ({ from: () => ({ update: (values: any) => ({ eq: async (key: string, value: string) => { mocks.writes.push({ values, key, value }); return { error: mocks.error } } }) }) }))
})
afterEach(() => vi.unstubAllEnvs())
it('rejects missing or invalid signatures before database access', async () => {
  expect((await POST(request(false))).status).toBe(400)
  mocks.constructEvent.mockImplementationOnce(() => { throw new Error('invalid') })
  expect((await POST(request())).status).toBe(400)
  expect(mocks.admin).not.toHaveBeenCalled()
})
it.each(['active', 'trialing', 'past_due', 'canceled'])('reads the actual subscription state %s and current price', async (status) => {
  mocks.retrieve.mockResolvedValue(subscription(status))
  event('checkout.session.completed', { customer: { id: 'cus_test' }, subscription: { id: 'sub_test' }, metadata: { organization_id: 'org_test', plan: 'pro' } })
  expect((await POST(request())).status).toBe(200)
  expect(mocks.retrieve).toHaveBeenCalledWith('sub_test')
  expect(mocks.writes[0].values).toMatchObject({ plan: 'team', subscription_status: status === 'canceled' ? 'cancelled' : status, stripe_customer_id: 'cus_test' })
})
it('does not invent or erase billing state when Checkout has no subscription', async () => {
  event('checkout.session.completed', { customer: 'cus_test', client_reference_id: 'org_test', metadata: { plan: 'invalid' } })
  expect((await POST(request())).status).toBe(200)
  expect(mocks.writes[0].values).toEqual({ stripe_customer_id: 'cus_test' })
})
it.each(['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'])('returns 500 on database failure for %s', async (type) => {
  mocks.error = { message: 'simulated database failure' }
  event(type, { ...subscription(), subscription: 'sub_test', amount_paid: 3900 })
  expect((await POST(request())).status).toBe(500)
})
it('returns 500 when Stripe retrieval fails', async () => {
  event('checkout.session.completed', { subscription: 'sub_test', client_reference_id: 'org_test' })
  mocks.retrieve.mockRejectedValueOnce(new Error('Stripe unavailable'))
  expect((await POST(request())).status).toBe(500)
  expect(mocks.writes).toHaveLength(0)
})
it('returns 500 when admin configuration fails', async () => {
  event('customer.subscription.updated', subscription())
  mocks.admin.mockImplementationOnce(() => { throw new Error('missing configuration') })
  expect((await POST(request())).status).toBe(500)
})
it('does not activate an account for a zero-value trial invoice', async () => {
  event('invoice.paid', { customer: { id: 'cus_test' }, amount_paid: 0 })
  expect((await POST(request())).status).toBe(200)
  expect(mocks.writes).toHaveLength(0)
})
it('uses expanded customer ID when subscription metadata is missing', async () => {
  event('customer.subscription.updated', { ...subscription(), metadata: {} })
  expect((await POST(request())).status).toBe(200)
  expect(mocks.writes[0]).toMatchObject({ key: 'stripe_customer_id', value: 'cus_test' })
})
