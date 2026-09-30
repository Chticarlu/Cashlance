export const utmKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'] as const
export function attribution() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem('cashlance:utm') || '{}') } catch { return {} }
}
export function track(name: string, count?: number) {
  if (typeof window === 'undefined') return
  // No invoice data, email, filename or raw query string in analytics.
  void fetch('/api/funnel', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, count, attribution: attribution() }), keepalive: true }).catch(() => {})
}
