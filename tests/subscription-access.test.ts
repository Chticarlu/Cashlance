import { beforeEach, expect, it, vi } from 'vitest'
import { hasSubscription, subscriptionDestination } from '../lib/subscription'
const m = vi.hoisted(() => ({ org: null as any, error: null as any, user: { id: 'owner' } as any, rpc: vi.fn(), analyze: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.org, error: m.error }) }) }) }) }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: m.rpc }) }))
import { GET as continueLogin } from '../app/auth/continue/route'
import { POST as confirm } from '../app/api/imports/route'
import { POST as activate } from '../app/api/imports/activate/route'
import { POST as analyze } from '../app/api/imports/analyze/route'
import { GET as draft, PUT as saveDraft, DELETE as deleteDraft } from '../app/api/imports/draft/route'
import { POST as edit } from '../app/api/invoices/edit/route'
import { POST as manage } from '../app/api/invoices/manage/route'
const req = () => new Request('https://cashlance.fretixo.fr/api/test', { method: 'POST', headers: { origin: 'https://cashlance.fretixo.fr' }, body: '{}' })
beforeEach(() => { m.org = null; m.error = null; m.user = { id: 'owner', email_confirmed_at: '2026-10-01' } })
it.each([
  [null, false, '/pricing'],
  [{ subscription_status: 'trialing', stripe_subscription_id: null }, false, '/pricing'],
  [{ subscription_status: 'active', stripe_subscription_id: null }, false, '/pricing'],
  ...['active','trialing'].map(status => [{ subscription_status: status, stripe_subscription_id: 'sub' }, true, '/dashboard'] as const),
  [{ subscription_status: 'past_due', stripe_subscription_id: 'sub' }, false, '/account/billing'],
  ...['canceled','cancelled','incomplete_expired'].map(status => [{ subscription_status: status, stripe_subscription_id: 'sub' }, false, '/pricing'] as const),
] as Array<[any, boolean, string]>)('routes %j consistently after login', async (org, permitted, destination) => {
  m.org = org
  expect(hasSubscription(m.org)).toBe(permitted)
  expect(subscriptionDestination(m.org)).toBe(destination)
  expect((await continueLogin(new Request('https://cashlance.fretixo.fr/auth/continue'))).headers.get('location')).toBe(`https://cashlance.fretixo.fr${destination}`)
})
it.each([confirm,activate,analyze,saveDraft,deleteDraft,edit,manage])('rejects unsubscribed API requests before any mutation/provider call', async handler => {
  expect((await handler(req())).status).toBe(402)
  expect(m.rpc).not.toHaveBeenCalled()
})
it('denies draft reads and fails closed on database errors', async () => {
  expect((await draft()).status).toBe(402)
  m.error = { message: 'database unavailable' }
  expect((await confirm(req())).status).toBe(503)
})
it('preserves import intent only for entitled users and ignores external destinations', async () => {
  m.org = { subscription_status: 'active', stripe_subscription_id: 'sub' }
  expect((await continueLogin(new Request('https://cashlance.fretixo.fr/auth/continue?next=import'))).headers.get('location')).toMatch(/\/import$/)
  expect((await continueLogin(new Request('https://cashlance.fretixo.fr/auth/continue?next=https://evil.invalid'))).headers.get('location')).toMatch(/\/dashboard$/)
})
