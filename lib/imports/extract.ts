import { dateISO, emptyDraft } from './model'
// Conservative, labeled extraction: never use the first company as the debtor.
// All proposals remain unconfirmed, even when a label was unambiguous.
export function extractInvoice(text: string, source: string) {
  const row = emptyDraft(source)
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const labels = /^(?:adresse de facturation|destinataire|client(?:\s*\/\s*d[ée]biteur)?|factur[ée]\s+[àa]|bill\s+to|acheteur)(?=\s|:|$)\s*[:\-]?\s*(.*)$/i
  const boundary = /^(?:compte client|fournisseur|[ée]metteur|vendeur|facture|num[ée]ro de facture|date|[ée]ch[ée]ance|d[ée]signation|description|montant|net [àa] payer|total|iban|conditions|paiement)(?=\s|:|$)/i
  const index = lines.findIndex(l => labels.test(l))
  if (index >= 0) {
    const labelValue = lines[index].match(labels)?.[1] || ''
    const start = labelValue ? index : index + 1
    row.client = labelValue || (lines[start] && !boundary.test(lines[start]) ? lines[start] : '')
    const block: string[] = [row.client]
    for (let i = start + 1; row.client && i < Math.min(start + 8, lines.length); i++) {
      if (boundary.test(lines[i])) break
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
  // A customer account number is a reference, never a debtor's name.
  row.reference = text.match(/\bcompte client\s*[:#]?\s*([A-Z0-9][A-Z0-9/_-]*)/i)?.[1] || ''
  const invoice = text.match(/(?:num[ée]ro de facture|(?:facture|invoice)\s*(?:n[°ºo.]|num[ée]ro|number|#))\s*[:.\-]?\s*([A-Z0-9][A-Z0-9/_.-]*)/i)
    || text.match(/^(?:facture|invoice)\s*[:#]?\s+([A-Z0-9][A-Z0-9/_.-]*\d[A-Z0-9/_.-]*)\s*$/im)
  row.invoiceNumber = invoice?.[1] || ''
  const datePattern = '(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{4})'
  row.due = dateISO(text.match(new RegExp('(?:[ée]ch[ée]ance|due date|[àa] payer avant)\\s*:?\\s*' + datePattern, 'i'))?.[1] || '')
  row.invoiceDate = dateISO(text.match(new RegExp('(?:date (?:de (?:la )?)?facture|date du document|invoice date|[ée]mise le)\\s*:?\\s*' + datePattern, 'i'))?.[1] || '')
  // Only an explicit invoice-date starting point permits a calendar-day proposal.
  const terms = text.match(/(?:paiement|r[èe]glement)\s*(?:[àa]|:)\s*(\d{1,3})\s*jours\s*(?:[àa] (?:compter|partir) de (?:la )?date (?:de )?facture|date (?:de )?facture)(?![^\n]*(?:fin de mois|ouvr[ée]s))/i)
  if (!row.due && row.invoiceDate && terms && Number(terms[1]) <= 365) {
    const due = new Date(row.invoiceDate + 'T00:00:00Z')
    due.setUTCDate(due.getUTCDate() + Number(terms[1]))
    row.due = dateISO(due.toISOString().slice(0, 10))
  }
  const amount = '([0-9][0-9 \\u00a0\\u202f.,]*[0-9]|[0-9])(?![0-9.,]|[ \\t]*%)'
  for (const [key, label] of [['total','(?:montant\\s*TTC|(?:montant\\s*)?total\\s*(?:TTC|EUR|[àa] payer)|net\\s*[àa] payer)'],['net','(?:total|montant)\\s*HT'],['tax','(?:montant\\s*)?TVA'],['amount','(?:(?:montant\\s*)?restant\\s*d[uû]|reste?\\s*d[uû]|solde(?:\\s*[àa] payer)?)']] as const) {
    row[key] = text.match(new RegExp(label + '\\s*:?\\s*(?:EUR\\s*)?' + amount, 'i'))?.[1]?.trim() || ''
  }
  if (!row.amount) row.amount = row.total
  const currencies = [...text.matchAll(/\b(EUR|USD|GBP|CHF)\b|€/g)].map(m => m[1] || 'EUR')
  if (currencies.length && new Set(currencies).size === 1) row.currency = currencies[0]
  return row
}
