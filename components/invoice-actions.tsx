'use client'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function InvoiceActions({id,status,remindersActive}:{id:string;status:string;remindersActive:boolean}) {
  const router=useRouter()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  async function send(action:string,value?:string) {
    setBusy(true)
    setError('')
    try {
      const res=await fetch('/api/invoices/manage',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({invoiceId:id,action,value})
      })
      const data=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(data.error||'Modification impossible.')
      router.refresh()
    } catch(e) {
      setError(e instanceof Error?e.message:'Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  function promise(e:FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form=new FormData(e.currentTarget)
    send('promise',String(form.get('date')||''))
  }

  function dispute(e:FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form=new FormData(e.currentTarget)
    send('dispute',String(form.get('reason')||''))
  }

  return <div className="card invoice-actions">
    <h2>Actions</h2>
    <div className="actions">
      {status!=='paid'&&<button className="btn" disabled={busy} onClick={()=>send('paid')}>Marquer payée</button>}
      {remindersActive&&<button className="btn alt" disabled={busy} onClick={()=>send('stop')}>Arrêter les relances</button>}
    </div>

    {!remindersActive&&status!=='paid'&&<p className="notice">Relances arrêtées — aucun nouvel email automatique ne sera programmé pour cette facture.</p>}

    <details>
      <summary>Promesse de paiement</summary>
      <form onSubmit={promise}>
        <label>Date promise<input className="field" type="date" name="date" required /></label>
        <button className="btn alt" disabled={busy}>Enregistrer la promesse</button>
      </form>
    </details>

    <details>
      <summary>Déclarer un litige</summary>
      <form onSubmit={dispute}>
        <label>Motif<textarea className="field" name="reason" rows={4} maxLength={500} required /></label>
        <button className="btn alt" disabled={busy}>Enregistrer le litige</button>
      </form>
    </details>

    {error&&<p className="notice error" role="alert">{error}</p>}
  </div>
}
