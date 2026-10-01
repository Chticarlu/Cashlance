export const MAX_ROWS = 200
export const MAX_FILES = 10
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const fields = {
  client: 'Client / raison sociale', firstName: 'Prénom', lastName: 'Nom',
  email: 'Email du client', phone: 'Téléphone', address: 'Adresse', postalCode: 'Code postal',
  city: 'Ville', siren: 'SIREN / SIRET', invoiceNumber: 'N° de facture', reference: 'Référence',
  invoiceDate: 'Date de facture', due: 'Échéance', net: 'Montant HT', tax: 'TVA (montant)',
  total: 'Montant TTC', amount: 'Restant dû', currency: 'Devise', paymentTerms: 'Conditions de paiement',
} as const
export type Field = keyof typeof fields
export type Draft = Record<Field, string> & { id: string; source: string; issuer: string; confirmed: boolean }
export const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,63}$/.test(value.trim())
export function emptyDraft(source = ''): Draft {
  return { ...Object.fromEntries(Object.keys(fields).map(k => [k, ''])), id: crypto.randomUUID(), source, issuer: '', confirmed: false } as Draft
}
// Saved drafts can predate optional fields added in a later release.
export function restoreDraft(value: unknown): Draft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Brouillon illisible. Réessayez avant de modifier vos créances.')
  const saved = value as Record<string, unknown>
  const row = emptyDraft()
  for (const key of [...Object.keys(fields), 'id', 'source', 'issuer'] as (keyof Omit<Draft, 'confirmed'>)[]) {
    if (typeof saved[key] === 'string') row[key] = saved[key]
  }
  return row // Every restored proposal must be confirmed again.
}
export function moneyCents(value: string): number | null {
  let s = value.trim().replace(/(?:EUR|€)/gi, '').replace(/[\s\u00a0\u202f]/g, '')
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1)
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else s = s.replace(',', '.')
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) return null
  const n = Math.round(Number(s) * 100)
  return Number.isSafeInteger(n) && Math.abs(n) <= 2147483647 ? n : null
}
export function dateISO(value: string): string {
  const s = value.trim()
  let y: number, m: number, d: number
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const fr = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s)
  if (iso) [, y, m, d] = iso.map(Number)
  else if (fr) { d = +fr[1]; m = +fr[2]; y = +fr[3] }
  else return ''
  const dt = new Date(Date.UTC(y, m - 1, d))
  return y >= 2000 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : ''
}
export function draftErrors(row: Draft, schedule: boolean): string[] {
  const errors: string[] = []
  if (!row.client.trim() && ![row.firstName, row.lastName].some(v => v.trim())) errors.push('Client à relancer manquant')
  if (!row.invoiceNumber.trim()) errors.push('Numéro de facture manquant')
  if (row.client.length > 160 || row.invoiceNumber.length > 160) errors.push('Client et numéro : 160 caractères maximum')
  if (!dateISO(row.due)) errors.push('Échéance invalide ou manquante')
  const cents = moneyCents(row.amount)
  if (cents === null || cents <= 0) errors.push('Restant dû invalide ou manquant')
  if (row.currency.toUpperCase() !== 'EUR') errors.push('Confirmez la devise EUR (seule devise prise en charge)')
  if ((schedule || row.email.trim()) && !isValidEmail(row.email)) errors.push('Email client invalide ou manquant')
  if (row.invoiceDate && !dateISO(row.invoiceDate)) errors.push('Date de facture invalide')
  for (const k of ['net','tax','total'] as const) if (row[k] && (moneyCents(row[k]) === null || moneyCents(row[k])! < 0)) errors.push(`${fields[k]} invalide`)
  if (row.total && cents !== null && moneyCents(row.total) !== null && cents > moneyCents(row.total)!) errors.push('Restant dû supérieur au TTC')
  if (Object.keys(fields).some(k => row[k as Field].length > 300)) errors.push('Champ trop long (300 caractères maximum)')
  return errors
}
export const scenarios = {
  gentle: { label: 'Progressif — J+1, J+7, J+15', stages: ['J+1', 'J+7', 'J+15'] },
  complete: { label: 'Complet — avant et après échéance (5 relances)', stages: ['J-3', 'J+1', 'J+7', 'J+15', 'J+30'] },
  custom: { label: 'Personnalisé — choisissez vos délais', stages: [] },
} as const
export type Scenario = keyof typeof scenarios
// Custom reminders are 1–5 strictly increasing delays, from 1 to 60 days.
export function validCustomDays(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 5 &&
    value.every((n, i) => Number.isInteger(n) && n >= 1 && n <= 60 && (i === 0 || n > value[i - 1]))
}
export function scenarioPayload(scenario: Scenario, customDays: number[]): string {
  if (scenario !== 'custom') return scenario
  if (!validCustomDays(customDays)) throw new Error('Choisissez 1 à 5 délais croissants, entre 1 et 60 jours.')
  return 'custom:' + customDays.join(',')
}
export function previewSchedule(due: string, scenario: Scenario, now = new Date(), customDays: number[] = [1, 7, 15]) {
  const today = now.toISOString().slice(0, 10)
  const overdue = due < today
  const base = overdue ? today : due
  const offsets = scenario === 'custom' ? (validCustomDays(customDays) ? customDays : []) :
    scenario === 'complete' ? (overdue ? [1, 4, 10, 18, 33] : [-3, 1, 7, 15, 30]) : [1, 7, 15]
  let last = now.getTime()
  return offsets.map((offset, i) => {
    const natural = new Date(base + 'T09:00:00Z').getTime() + offset * 86400000
    const at = Math.max(natural, last + 86400000)
    last = at
    return { stage: 'J' + (offset > 0 ? '+' : '') + offset, at: new Date(at).toISOString(), sequence: i + 1 }
  })
}
