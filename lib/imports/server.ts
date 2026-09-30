import { Draft, fields, MAX_ROWS } from './model'
import { getAppUrl } from '@/lib/app-url'
export function cleanDrafts(value: unknown): Draft[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_ROWS) throw new Error('Entre 1 et 200 créances sont nécessaires.')
  return value.map(v => {
    if (!v || typeof v !== 'object' || v.demo) throw new Error('Les démonstrations ne peuvent pas être enregistrées.')
    const row = Object.fromEntries(Object.keys(fields).map(key => [key, typeof v[key] === 'string' ? v[key].trim().slice(0, 301) : ''])) as Record<keyof typeof fields, string>
    if (!row.client) row.client = [row.firstName, row.lastName].filter(Boolean).join(' ')
    return { ...row, id: typeof v.id === 'string' ? v.id.slice(0, 64) : '', source: String(v.source || '').slice(0, 200), issuer: String(v.issuer || '').slice(0, 300), confirmed: v.confirmed === true }
  })
}
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin')
  // Next/Vercel may expose an internal request hostname behind the public proxy.
  return Boolean(origin && (origin === new URL(req.url).origin || origin === getAppUrl()))
}
