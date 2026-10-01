import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ org: { id: 'org', stripe_customer_id: 'cus' }, user: { id: 'owner' } as any, session: vi.fn(), retrieve: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.org, error: null }) }) }) }) }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: m.rpc }) }))
vi.mock('@/lib/stripe', async original => ({ ...await original<typeof import('../lib/stripe')>(), getStripe: () => ({ checkout: { sessions: { retrieve: m.session } }, subscriptions: { retrieve: m.retrieve } }) }))
import { GET } from '../app/billing/return/route'
const session = () => ({ mode: 'subscription', status: 'complete', subscription: 'sub', customer: 'cus', client_reference_id: 'org', metadata: { organization_id: 'org' } })
const req = () => new Request('https://cashlance.fretixo.fr/billing/return?session_id=cs_test')
beforeEach(() => {
  m.user = { id: 'owner' }; m.session.mockResolvedValue(session())
  m.retrieve.mockResolvedValue({ id: 'sub', created: 1, customer: 'cus', status: 'trialing', metadata: { plan: 'solo' }, items: { data: [] } })
  m.rpc.mockResolvedValue({ data: { subscription_status: 'trialing', stripe_subscription_id: 'sub' }, error: null })
})
it('grants dashboard only after a verified owned session and persisted synchronization', async () => {
  expect((await GET(req())).headers.get('location')).toMatch(/\/dashboard$/)
  expect(m.session).toHaveBeenCalledWith('cs_test'); expect(m.retrieve).toHaveBeenCalledWith('sub')
  expect(m.rpc).toHaveBeenCalledWith('sync_stripe_subscription', expect.objectContaining({ p_org: 'org', p_status: 'trialing' }))
})
it.each([{ customer: 'foreign' }, { client_reference_id: 'foreign' }, { metadata: {} }, { status: 'open' }, { subscription: null }, { mode: 'payment' }])('rejects a forged/incomplete session %j', async override => {
  m.session.mockResolvedValue({ ...session(), ...override })
  expect((await GET(req())).headers.get('location')).toContain('/pricing?billing=invalid')
  expect(m.rpc).not.toHaveBeenCalled()
})
it('does not redirect to dashboard when Stripe or database sync fails', async () => {
  m.rpc.mockResolvedValueOnce({ error: { message: 'private' }, data: null })
  expect((await GET(req())).headers.get('location')).toContain('/account/billing?error=sync')
  m.retrieve.mockRejectedValueOnce(Error('private'))
  expect((await GET(req())).headers.get('location')).toContain('/account/billing?error=sync')
})
it.each(['past_due','cancelled'])('respects synchronized %s status', async status => {
  m.rpc.mockResolvedValue({ data: { subscription_status: status, stripe_subscription_id: 'sub' }, error: null })
  expect((await GET(req())).headers.get('location')).toMatch(status === 'past_due' ? /\/account\/billing$/ : /\/pricing$/)
})
