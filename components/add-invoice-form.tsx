'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddInvoiceForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(e.currentTarget)
    const payload = { ...Object.fromEntries(form.entries()), batchId: crypto.randomUUID() }
    const res = await fetch('/api/invoices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Impossible d’ajouter la facture.')
    else {
      setOpen(false)
      ;(e.target as HTMLFormElement).reset()
      router.refresh()
    }
    setLoading(false)
  }

  return <>
    <button className="btn" onClick={() => setOpen(true)}>+ Ajouter une facture</button>
    {open && <div className="modalBackdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>Nouvelle facture</h2><button className="iconBtn" onClick={() => setOpen(false)}>×</button></div>
        <form onSubmit={submit}>
          <label>Client</label><input className="field" name="client" required placeholder="Durand Bâtiment" />
          <label>E-mail client</label><input className="field" name="email" type="email" required placeholder="compta@client.fr" />
          <div className="formGrid"><div><label>Montant TTC (€)</label><input className="field" name="amount" inputMode="decimal" required placeholder="2480" /></div><div><label>Échéance</label><input className="field" name="due" type="date" required /></div></div>
          <label>N° de facture</label><input className="field" name="invoiceNumber" required placeholder="FAC-2026-001" />
          <label className="check"><input type="checkbox" name="confirmed" required />Je confirme le client, son email, le montant, l’échéance et le scénario progressif (J+1, J+7, J+15). Première relance au plus tôt demain.</label>
          {error && <p className="notice error">{error}</p>}
          <button className="btn full" disabled={loading}>{loading ? 'Ajout…' : 'Ajouter et planifier les relances'}</button>
        </form>
      </div>
    </div>}
  </>
}
