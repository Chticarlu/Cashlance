import { MAX_ANALYSIS_BYTES, MAX_ANALYSIS_PAGES } from './analysis-limits'

export class AnalysisError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

// Check the bytes, not the client-supplied MIME type. No file is written to disk.
export async function inspectDocument(bytes: Uint8Array, name: string) {
  if (!bytes.length || bytes.length > MAX_ANALYSIS_BYTES) throw new AnalysisError('PDF et images : entre 1 octet et 3 Mo par document.')
  const b = Buffer.from(bytes)
  if (/\.pdf$/i.test(name) && b.subarray(0,5).toString() === '%PDF-') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, verbosity: 0 })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([(async () => {
        const doc = await task.promise
        if (doc.numPages > MAX_ANALYSIS_PAGES) throw new AnalysisError('3 pages maximum par facture. Séparez les documents plus longs.')
        let length = 0
        for (let i=1;i<=doc.numPages;i++) {
          const page = await doc.getPage(i)
          const content = await page.getTextContent()
          length += content.items.reduce((n,item) => n + ('str' in item ? item.str.length : 0), 0)
          page.cleanup()
          if (length > 50000) throw new AnalysisError('PDF trop dense. Importez une facture simple ou utilisez Excel/CSV.')
        }
      })(), new Promise<never>((_,reject) => { timer=setTimeout(()=>reject(new AnalysisError('Lecture PDF trop longue. Essayez un document plus simple.')),8000) })])
      return 'application/pdf' as const
    } catch (error) {
      if (error instanceof AnalysisError) throw error
      throw new AnalysisError('PDF illisible ou protégé. Utilisez un PDF sans mot de passe ou une image nette.')
    } finally { clearTimeout(timer); await task.destroy() }
  }
  let width=0, height=0, type: 'image/png'|'image/jpeg'|undefined
  if (/\.png$/i.test(name) && b.length>=24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.subarray(12,16).toString()==='IHDR') {
    width=b.readUInt32BE(16); height=b.readUInt32BE(20); type='image/png'
  } else if (/\.jpe?g$/i.test(name) && b[0]===255 && b[1]===216) {
    let p=2
    while(p+4<b.length) {
      if(b[p++]!==255) break
      while(b[p]===255) p++
      const marker=b[p++]; if(marker===218||marker===217) break
      const size=b.readUInt16BE(p)
      if(size<2||p+size>b.length) break
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=8) {
        height=b.readUInt16BE(p+3); width=b.readUInt16BE(p+5); type='image/jpeg'; break
      }
      p+=size
    }
  }
  if (!type || !width || !height) throw new AnalysisError('Document invalide : choisissez un PDF, JPG ou PNG lisible.')
  if(width>10000||height>10000||width*height>20_000_000) throw new AnalysisError('Image trop grande. Réduisez-la à 20 mégapixels maximum.')
  return type
}
