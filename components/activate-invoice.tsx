'use client'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
export default function ActivateInvoice({ id, email }: { id: string; email: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setError('')
    try {
      const response = await fetch('/api/imports/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invoiceId: id, email: form.get('email'), scenario: form.get('scenario'), confirmed: form.get('confirmed') === 'on' }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Programmation impossible.')
      router.refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Réessayez.') } finally { setBusy(false) }
  }
  return <details><summary>Programmer les relances</summary><form onSubmit={submit}><label>Email du client<input name="email" className="field" defaultValue={email} type="email" required maxLength={300} /></label><label>Scénario<select className="field" name="scenario"><option value="gentle">Progressif — 3 relances (J+1, J+7, J+15)</option><option value="complete">Complet — 5 relances (J−3 à J+30)</option></select></label><p className="muted">Première relance au plus tôt demain. Les étapes déjà dépassées sont espacées d’au moins 24 heures.</p><label className="check"><input type="checkbox" name="confirmed" required />Je confirme le client, cet email, le montant, l’échéance et le scénario de cette facture.</label>{error && <p role="alert">{error}</p>}<button className="btn" disabled={busy}>{busy ? 'Programmation…' : 'Confirmer et programmer'}</button></form></details>
}
