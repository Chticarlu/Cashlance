import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ verify: vi.fn(), receive: vi.fn(), classify: vi.fn(), from: vi.fn(), writes: [] as any[], status: 'open', error: null as any, insertError: null as any }))
vi.mock('resend', () => ({ Resend: class { webhooks = { verify: mocks.verify }; emails = { receiving: { get: mocks.receive } } } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('@/lib/reminders', () => ({ classifyReply: mocks.classify }))
import { POST } from '../app/api/webhooks/resend/route'
const invoiceId = '00000000-0000-4000-8000-000000000001'
const request = () => new Request('https://cashlance.fretixo.fr/api/webhooks/resend', { method: 'POST', body: '{}' })
beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-placeholder')
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'test-placeholder')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.writes = []; mocks.status = 'open'; mocks.error = null; mocks.insertError = null
  mocks.verify.mockReturnValue({ type: 'email.received', data: { email_id: 'email_test', from: 'customer@example.com', to: [`invoice+${invoiceId}@inbound.fretixo.fr`] } })
  mocks.receive.mockResolvedValue({ data: { text: 'Je paierai demain' }, error: null })
  mocks.classify.mockResolvedValue({ classification: 'promise', confidence: 'high', extractedDate: '2026-09-30', source: 'rules' })
  mocks.from.mockImplementation((table: string) => {
    const query: any = {
      select: () => query, eq: () => query, neq: () => query,
      maybeSingle: async () => ({ data: { id: invoiceId, organization_id: 'org_test', status: mocks.status }, error: mocks.error }),
      insert: async (values: any) => { mocks.writes.push({ table, operation: 'insert', values }); return { error: mocks.insertError } },
      update: (values: any) => { mocks.writes.push({ table, operation: 'update', values }); return query },
      then: (resolve: any) => Promise.resolve({ error: mocks.error }).then(resolve),
    }
    return query
  })
})
afterEach(() => vi.unstubAllEnvs())
it('rejects an invalid signature before retrieving or writing emails', async () => {
  mocks.verify.mockImplementationOnce(() => { throw new Error('bad signature') })
  expect((await POST(request())).status).toBe(400)
  expect(mocks.receive).not.toHaveBeenCalled()
  expect(mocks.writes).toHaveLength(0)
})
it('stores extracted promise dates and cancels pending reminders', async () => {
  expect((await POST(request())).status).toBe(200)
  expect(mocks.writes).toContainEqual({ table: 'invoices', operation: 'update', values: { status: 'promised', promise_date: '2026-09-30' } })
})
it('requires review for a claimed payment and never marks an invoice paid', async () => {
  mocks.classify.mockResolvedValue({ classification: 'paid', confidence: 'high' })
  expect((await POST(request())).status).toBe(200)
  expect(mocks.writes[0].values.needs_review).toBe(true)
  expect(mocks.writes.some((write) => write.table === 'invoices')).toBe(false)
})
it('does not automate an uncertain promise', async () => {
  mocks.classify.mockResolvedValue({ classification: 'promise', confidence: 'low' })
  expect((await POST(request())).status).toBe(200)
  expect(mocks.writes.some((write) => write.table === 'invoices')).toBe(false)
  expect(mocks.writes.at(-1).values).toEqual({ state: 'needs_review' })
})
it('does not reopen a paid invoice', async () => {
  mocks.status = 'paid'
  expect((await POST(request())).status).toBe(200)
  expect(mocks.writes.filter((write) => write.operation === 'update')).toHaveLength(0)
})
it('returns 500 if receiving the email fails', async () => {
  mocks.receive.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
  expect((await POST(request())).status).toBe(500)
  expect(mocks.writes).toHaveLength(0)
})
it('returns 500 on database errors', async () => {
  mocks.error = { message: 'unavailable' }
  expect((await POST(request())).status).toBe(500)
})
it('returns 500 on failed message storage', async () => {
  mocks.insertError = { code: 'XX000' }
  expect((await POST(request())).status).toBe(500)
  expect(mocks.writes).toHaveLength(1)
})
it('can retry status updates after the message was already stored', async () => {
  mocks.insertError = { code: '23505' }
  expect((await POST(request())).status).toBe(200)
  expect(mocks.writes).toHaveLength(3)
})
