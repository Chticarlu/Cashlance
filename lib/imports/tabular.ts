import { dateISO, emptyDraft, Field, MAX_ROWS, normalize } from './model'
const aliases: Partial<Record<Field, string[]>> = {
  client: ['client','raison sociale','tiers','libelle','nom client','raison sociale client','debiteur'],
  firstName: ['prenom'], lastName: ['nom'], invoiceNumber: ['num facture','num piece','piece','facture','numero facture','invoice number'],
  reference: ['reference','ref'], due: ['echeance','date echeance','due date'], invoiceDate: ['date facture','date piece','invoice date'],
  amount: ['solde','reste du','restant du','montant restant du','solde du'], total: ['montant','ttc','montant ttc','total ttc'],
  net: ['ht','montant ht','total ht'], tax: ['tva','montant tva'], email: ['email','email tiers','mail','email client','courriel'],
  phone: ['telephone','tel','phone'], address: ['adresse','adresse client'], postalCode: ['cp','code postal'], city: ['ville'],
  siren: ['siren','siret'], currency: ['devise','currency'],
}
export function suggestMapping(headers: string[]): Record<string, Field | ''> {
  const used = new Set<Field>()
  return Object.fromEntries(headers.map((header, i) => {
    const n = normalize(header)
    const candidates = Object.entries(aliases).filter(([, names]) => names!.some(a => normalize(a) === n))
    const field = candidates.length === 1 ? candidates[0][0] as Field : ''
    if (!field || used.has(field)) return [String(i), '']
    used.add(field)
    return [String(i), field]
  }))
}
export function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '')
  const first = text.split(/\r?\n/, 1)[0]
  const delimiter = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0]
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else if (quoted || !field) quoted = !quoted
      else field += c
    } else if (c === delimiter && !quoted) { row.push(field); field = '' }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ''
    } else field += c
    if (rows.length > MAX_ROWS + 1 || row.length > 60 || field.length > 10000) throw new Error('Fichier trop volumineux : 200 lignes et 60 colonnes maximum.')
  }
  if (quoted) throw new Error('CSV invalide : guillemet non fermé.')
  row.push(field); if (row.some(v => v.trim())) rows.push(row)
  if (rows.length > MAX_ROWS + 1) throw new Error('200 créances maximum par import.')
  return rows
}
export type Table = { name: string; headers: string[]; rows: string[][] }
export function mappedRows(table: Table, mapping: Record<string, Field | ''>) {
  return table.rows.filter(r => r.some(v => v.trim())).map((cells, index) => {
    const draft = emptyDraft(`${table.name} · ligne ${index + 2}`)
    Object.entries(mapping).forEach(([i, field]) => { if (field) draft[field] = (cells[+i] || '').trim() })
    if (!draft.client) draft.client = [draft.firstName, draft.lastName].filter(Boolean).join(' ')
    if (!draft.amount) draft.amount = draft.total
    for (const field of ['due','invoiceDate'] as const) draft[field] = dateISO(draft[field]) || draft[field]
    return draft
  })
}
