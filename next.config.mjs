/** @type {import('next').NextConfig} */
export default {
  // PDF page counting stays on Node; keep PDF.js' native worker resolution intact.
  serverExternalPackages: ['pdfjs-dist'],
  outputFileTracingIncludes: {
    '/api/imports/analyze': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/@napi-rs/canvas*/**/*',
    ],
  },
}
