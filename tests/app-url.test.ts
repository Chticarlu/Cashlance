import { afterEach, expect, it, vi } from 'vitest'
import { getAppUrl } from '../lib/app-url'
afterEach(() => vi.unstubAllEnvs())
it('defaults Stripe return URLs to the target production domain', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
  expect(getAppUrl()).toBe('https://cashlance.fretixo.fr')
})
it('normalizes explicit preview URLs', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://preview.example.com/')
  expect(getAppUrl()).toBe('https://preview.example.com')
})
it('rejects non-web URLs', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'javascript:alert(1)')
  expect(getAppUrl).toThrow()
})
