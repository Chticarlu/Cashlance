export function getAppUrl() {
  const previewUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined
  const url = new URL(previewUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://cashlance.fretixo.fr')
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('NEXT_PUBLIC_APP_URL invalide')
  }
  return url.origin
}

export function getRequestAppUrl(req: Request) {
  if (process.env.VERCEL_ENV === 'preview') return new URL(req.url).origin
  return getAppUrl()
}

// Call only after same-origin validation for authenticated billing actions.
export function getBillingAppUrl(req: Request) {
  if (process.env.VERCEL_ENV === 'production') return 'https://cashlance.fretixo.fr'
  if (process.env.VERCEL_ENV === 'preview') return new URL(req.url).origin
  return getAppUrl()
}
