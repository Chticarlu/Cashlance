export function getAppUrl() {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://cashlance.fretixo.fr')
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('NEXT_PUBLIC_APP_URL invalide')
  }
  return url.origin
}
