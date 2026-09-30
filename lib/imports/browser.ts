import { extractInvoice } from './extract'
import { MAX_FILE_BYTES, MAX_ROWS } from './model'
import { parseCSV, Table } from './tabular'

export function checkFile(file: File) {
  if (!/\.(pdf|jpe?g|png|csv|xlsx)$/i.test(file.name)) throw new Error('Formats acceptés : PDF, JPG, PNG, XLSX et CSV.')
  if (file.size > MAX_FILE_BYTES || !file.size) throw new Error('Chaque fichier doit contenir entre 1 octet et 10 Mo.')
}
async function ocr(canvas: HTMLCanvasElement, progress: (s: string) => void) {
  const { createWorker } = await import('tesseract.js')
  progress('Lecture de l’image sur votre appareil…')
  const worker = await createWorker('fra', 1, {
    workerPath: '/import-engine/tesseract-worker.min.js', corePath: '/import-engine', langPath: '/import-engine',
    workerBlobURL: false, cacheMethod: 'none', logger: () => {},
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      worker.recognize(canvas),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Lecture trop longue. Essayez une photo plus nette ou complétez manuellement.')), 60000) }),
    ])
    return result.data.text
  } finally { clearTimeout(timer); await worker.terminate() }
}
export async function parseDocument(file: File, progress: (s: string) => void) {
  checkFile(file)
  let text = ''
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/import-engine/pdf.worker.min.mjs'
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })
    const doc = await task.promise
    try {
      if (doc.numPages > 10) throw new Error('PDF de plus de 10 pages : utilisez plutôt un export Excel/CSV pour un grand livre.')
      for (let i = 1; i <= doc.numPages; i++) {
        progress(`Lecture de la page ${i}/${doc.numPages}…`)
        const page = await doc.getPage(i)
        const content = await page.getTextContent()
        let part = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('')
        if (part.trim().length < 35) {
          if (doc.numPages > 3) throw new Error('PDF scanné de plus de 3 pages : préférez Excel/CSV ou des factures séparées.')
          const size = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: Math.min(1.8, 2400 / size.width, 3400 / size.height) })
          const canvas = document.createElement('canvas')
          canvas.width = Math.min(2400, Math.ceil(viewport.width)); canvas.height = Math.min(3400, Math.ceil(viewport.height))
          await page.render({ canvas, viewport }).promise
          part = await ocr(canvas, progress); canvas.width = 0; canvas.height = 0
        }
        text += '\n' + part
        page.cleanup()
      }
    } finally { await task.destroy() }
  } else {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(bitmap.width * scale); canvas.height = Math.ceil(bitmap.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      try { text = await ocr(canvas, progress) } finally { canvas.width = 0; canvas.height = 0 }
    } finally { bitmap.close() }
  }
  return extractInvoice(text, file.name)
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
