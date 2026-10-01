'use client'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function InvoiceActions({id,status,remindersActive,hasContact}:{id:string;status:string;remindersActive:boolean;hasContact:boolean}) {
  const router=useRouter()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [confirmPaid,setConfirmPaid]=useState(false)

  async function send(action:string,value?:string) {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const res=await fetch('/api/invoices/manage',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({invoiceId:id,action,value})
      })
      const data=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(data.error||'Modification impossible.')
      setSuccess(action==='paid'?'Facture marquée payée.':action==='stop'?'Relances arrêtées.':action==='promise'?'Promesse de paiement enregistrée.':'Litige enregistré.')
      setConfirmPaid(false)
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
      {status!=='paid'&&!confirmPaid&&<button className="btn" type="button" disabled={busy} onClick={()=>setConfirmPaid(true)}>Marquer payée</button>}
      {status!=='paid'&&confirmPaid&&<div className="notice"><p>Confirmer que cette facture a bien été réglée ? Les relances restantes seront annulées.</p><div className="actions"><button className="btn" type="button" disabled={busy} onClick={()=>send('paid')}>Confirmer le paiement</button><button className="btn alt" type="button" disabled={busy} onClick={()=>setConfirmPaid(false)}>Annuler</button></div></div>}
      {status!=='paid'&&remindersActive&&<button className="btn alt" disabled={busy} onClick={()=>send('stop')}>Arrêter les relances</button>}
    </div>

    {status==='paid'&&<p className="notice">Facture payée — relances automatiques terminées.</p>}
    {!remindersActive&&status==='open'&&<p className="notice">{hasContact?'Relances arrêtées — aucun nouvel email automatique ne sera programmé pour cette facture.':'Aucune relance programmée pour cette facture.'}</p>}

    {status!=='paid'&&<details>
      <summary>Promesse de paiement</summary>
      <form onSubmit={promise}>
        <label>Date promise<input className="field" type="date" name="date" required /></label>
        <button className="btn alt" disabled={busy}>Enregistrer la promesse</button>
      </form>
    </details>}

    {status!=='paid'&&<details>
      <summary>Déclarer un litige</summary>
      <form onSubmit={dispute}>
        <label>Motif<textarea className="field" name="reason" rows={4} maxLength={500} required /></label>
        <button className="btn alt" disabled={busy}>Enregistrer le litige</button>
      </form>
    </details>}

    {success&&<p className="notice" role="status">{success}</p>}
    {error&&<p className="notice error" role="alert">{error}</p>}
  </div>
}
