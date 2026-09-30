'use client'
import { useEffect } from 'react'
import { track, utmKeys } from '@/lib/funnel'
export default function FunnelTracker() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search)
      const values = Object.fromEntries(utmKeys.filter(k => params.has(k)).map(k => [k, params.get(k)!.slice(0, 100)]))
      if (Object.keys(values).length && !sessionStorage.getItem('cashlance:utm')) sessionStorage.setItem('cashlance:utm', JSON.stringify(values))
    } catch {}
    track('landing_page_view')
    const listener = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('[data-trial-cta]')) track('trial_cta_clicked')
    }
    document.addEventListener('click', listener)
    return () => document.removeEventListener('click', listener)
  }, [])
  return null
}
