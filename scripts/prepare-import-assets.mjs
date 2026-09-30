import { mkdir, copyFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const target = resolve('public/import-engine')
await mkdir(target, { recursive: true })
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', `${target}/pdf.worker.min.mjs`)
await copyFile('node_modules/tesseract.js/dist/worker.min.js', `${target}/tesseract-worker.min.js`)
for (const name of await readdir('node_modules/tesseract.js-core')) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name)) await copyFile(`node_modules/tesseract.js-core/${name}`, `${target}/${name}`)
}
await copyFile('node_modules/@tesseract.js-data/fra/4.0.0/fra.traineddata.gz', `${target}/fra.traineddata.gz`)
console.log('Import engine assets ready (local origin only).')
