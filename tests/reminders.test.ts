import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyReply } from '../lib/reminders'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'))
  vi.stubEnv('OPENAI_REPLY_CLASSIFIER_ENABLED', 'false')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request') }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('French reply classification', () => {
  it.each([
    ['Nous avons réglé la facture.', 'paid'],
    ['Le virement a été effectué', 'paid'],
    ['Pouvez-vous renvoyer la facture ?', 'duplicate'],
    ['Je conteste le montant', 'dispute'],
    ['Bonjour, merci pour votre message', 'other'],
    ['Je ne vais pas payer demain', 'other'],
    ['La facture n’est pas encore payée', 'other'],
    ['Je paierai demain si la prestation est conforme', 'other'],
    ['Nous avons payé une partie mais contestons le solde', 'other'],
  ])('%s → %s', async (text, expected) => {
    expect((await classifyReply(text)).classification).toBe(expected)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    ['Je paierai demain', '2026-09-30'],
    ['Je paierai après-demain', '2026-10-01'],
    ['Je paierai vendredi', '2026-10-02'],
    ['Je paierai le 03/10/2026', '2026-10-03'],
    ['Nous réglerons le 5 octobre 2026', '2026-10-05'],
    ['Je paierai le 2026-10-06', '2026-10-06'],
  ])('%s → %s', async (text, date) => {
    expect(await classifyReply(text)).toMatchObject({ classification: 'promise', extractedDate: date, confidence: 'high' })
  })
  it('rejects impossible dates', async () => {
    expect(await classifyReply('Je paierai le 31/02/2026')).toMatchObject({ classification: 'promise', confidence: 'medium' })
    expect((await classifyReply('Je paierai le 31/02/2026')).extractedDate).toBeUndefined()
  })
  it('does not classify a quoted reminder as the customer response', async () => {
    expect((await classifyReply('Merci\n> La facture est payée')).classification).toBe('other')
    expect((await classifyReply('Merci\nLe 28 septembre, Cashlance a écrit :\nLa facture est payée')).classification).toBe('other')
  })
  it('falls back without credentials even when enabled', async () => {
    vi.stubEnv('OPENAI_REPLY_CLASSIFIER_ENABLED', 'true')
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(await classifyReply('Merci')).toMatchObject({ classification: 'other', source: 'fallback' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
