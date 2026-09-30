import { dateISO, emptyDraft } from './model'
// Conservative, labeled extraction: never use the first company as the debtor.
// All proposals remain unconfirmed, even when a label was unambiguous.
export function extractInvoice(text: string, source: string) {
  const row = emptyDraft(source)
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const labels = /^(?:client(?:\s*\/\s*d[ée]biteur)?|destinataire|factur[ée]\s+[àa]|bill\s+to|acheteur)\s*[:\-]?\s*(.*)$/i
  const index = lines.findIndex(l => labels.test(l))
  if (index >= 0) {
    const labelValue = lines[index].match(labels)?.[1] || ''
    const start = labelValue ? index : index + 1
    row.client = labelValue || lines[start] || ''
    const block: string[] = [row.client]
    for (let i = start + 1; i < Math.min(start + 8, lines.length); i++) {
      if (/^(?:fournisseur|[ée]metteur|vendeur|facture|date|d[ée]signation|description|total|iban|conditions)\b/i.test(lines[i])) break
      block.push(lines[i])
    }
    const debtor = block.join('\n')
    row.email = debtor.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || ''
    row.phone = debtor.match(/(?:t[ée]l(?:[ée]phone)?|phone)\s*[:.]?\s*([+\d][\d .()-]{7,20})/i)?.[1]?.trim() || ''
    row.siren = debtor.match(/(?:SIREN|SIRET)\s*[:.]?\s*([\d ]{9,20})/i)?.[1]?.replace(/\s/g, '') || ''
    const postal = debtor.match(/\b(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\-]+)/)
    row.postalCode = postal?.[1] || ''; row.city = postal?.[2]?.trim() || ''
    row.address = block.find(l => /^\d+[ ,]/.test(l) && /rue|avenue|boulevard|chemin|route|place|all[ée]e|impasse/i.test(l)) || ''
  }
  row.issuer = text.match(/(?:fournisseur|[ée]metteur|vendeur)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim() || ''
  row.invoiceNumber = text.match(/(?:facture|invoice)\s*(?:n[°ºo.]|num[ée]ro|number|#)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i)?.[1] || ''
  const datePattern = '(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{4})'
  row.due = dateISO(text.match(new RegExp('(?:[ée]ch[ée]ance|due date|[àa] payer avant)\\s*:?\\s*' + datePattern, 'i'))?.[1] || '')
  row.invoiceDate = dateISO(text.match(new RegExp('(?:date (?:de )?facture|invoice date|[ée]mise le)\\s*:?\\s*' + datePattern, 'i'))?.[1] || '')
  const amount = '([0-9][0-9 \\u00a0\\u202f.,]*[0-9]|[0-9])'
  for (const [key, label] of [['total','total\\s*(?:TTC|[àa] payer)'],['net','total\\s*HT'],['tax','(?:montant\\s*)?TVA(?!\\s*[:]?\\s*\\d+\\s*%)'],['amount','(?:reste?\\s*d[uû]|restant\\s*d[uû]|solde(?:\\s*[àa] payer)?)']] as const) {
    row[key] = text.match(new RegExp(label + '\\s*[:]?\\s*' + amount, 'i'))?.[1]?.trim() || ''
  }
  if (!row.amount) row.amount = row.total
  const currencies = [...text.matchAll(/\b(EUR|USD|GBP|CHF)\b|€/g)].map(m => m[1] || 'EUR')
  if (currencies.length && new Set(currencies).size === 1) row.currency = currencies[0]
  return row
}
