import { Draft } from './model'
import { MAX_ANALYSIS_BYTES } from './analysis-limits'
import { MAX_FILE_BYTES, MAX_ROWS } from './model'
import { parseCSV, Table } from './tabular'

export function checkFile(file: File) {
  if (!/\.(pdf|jpe?g|png|csv|xlsx)$/i.test(file.name)) throw new Error('Formats acceptés : PDF, JPG, PNG, XLSX et CSV.')
  if (file.size > MAX_FILE_BYTES || !file.size) throw new Error('Chaque fichier doit contenir entre 1 octet et 10 Mo.')
}
export async function parseDocument(file: File, progress: (s: string) => void): Promise<Draft> {
  checkFile(file)
  if (file.size > MAX_ANALYSIS_BYTES) throw new Error('PDF et images : 3 Mo maximum par document.')
  progress('Analyse sécurisée avec OpenAI…')
  const data = new FormData(); data.append('document', file)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 65000)
  try {
    const response = await fetch('/api/imports/analyze', { method: 'POST', body: data, signal: controller.signal })
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Analyse indisponible. Vérifiez la taille du document ou réessayez plus tard.')
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Analyse indisponible. Complétez les informations manuellement.')
    return { ...result.row, source: file.name, confirmed: false }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('L’analyse prend trop de temps. Réessayez plus tard ; si elle est terminée, son résultat sera réutilisé.')
    throw error
  } finally { clearTimeout(timer) }
}
export async function parseTable(file: File): Promise<Table[]> {
  checkFile(file)
  if (/\.csv$/i.test(file.name)) {
    const bytes = await file.arrayBuffer()
    let text = new TextDecoder('utf-8').decode(bytes)
    if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(bytes)
    const [headers, ...rows] = parseCSV(text)
    if (!headers || !rows.length) throw new Error('Le fichier doit contenir des en-têtes et au moins une ligne.')
    return [{ name: file.name, headers, rows }]
  }
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const sheets = await readXlsxFile(file)
  const result: Table[] = []
  for (const sheet of sheets.slice(0, 10)) {
    const raw = sheet.data
    if (!raw.length) continue
    if (raw.length > MAX_ROWS + 1 || raw.some(r => r.length > 60)) throw new Error('200 lignes et 60 colonnes maximum par feuille.')
    const cells = raw.map(row => row.map(v => v instanceof Date ? v.toISOString().slice(0, 10) : v === null ? '' : String(v)))
    result.push({ name: `${file.name} · ${sheet.sheet}`, headers: cells[0], rows: cells.slice(1) })
  }
  if (sheets.length > 10) throw new Error('10 feuilles maximum. Exportez les feuilles utiles séparément.')
  if (!result.length) throw new Error('Classeur vide.')
  return result
}
