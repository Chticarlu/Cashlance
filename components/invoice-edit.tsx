'use client'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

type Initial={id:string;issuer:string;client:string;email:string;invoiceNumber:string;amountCents:number;dueDate:string;locked:boolean}
export default function InvoiceEdit({initial}:{initial:Initial}) {
 const router=useRouter()
 const [opened,setOpened]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 async function submit(e:FormEvent<HTMLFormElement>) {
  e.preventDefault()
  if(busy)return
  const f=new FormData(e.currentTarget)
  const amount=String(f.get('amount')||'').replace(',','.')
  const amountCents=Math.round(Number(amount)*100)
  if(!Number.isSafeInteger(amountCents)||amountCents<1){setError('Montant invalide.');return}
  setBusy(true);setError('');setSuccess('')
  try{
   const res=await fetch('/api/invoices/edit',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({invoiceId:initial.id,issuer:String(f.get('issuer')||''),client:String(f.get('client')||''),
      email:String(f.get('email')||''),invoiceNumber:String(f.get('invoiceNumber')||''),amountCents,dueDate:String(f.get('dueDate')||'')})})
   const data=await res.json().catch(()=>({}))
   if(!res.ok)throw new Error(data.error||'Modification impossible.')
   setSuccess('Informations enregistrées.')
   setOpened(false)
   router.refresh()
  }catch(e){setError(e instanceof Error?e.message:'Réessayez.')}
  finally{setBusy(false)}
 }
 return <article className="card invoice-edit">
  <div className="invoice-edit-head"><div><h2>Informations de la facture</h2><p className="muted">Corriger une donnée extraite lors de l’import.</p></div>
   <button className="btn alt" type="button" onClick={()=>setOpened(v=>!v)} disabled={busy}>{opened?'Fermer':'Modifier'}</button></div>
  {opened&&<form onSubmit={submit} className="invoice-edit-form">
   {initial.locked&&<p className="notice">Un suivi existe déjà : seul le fournisseur peut être modifié. Les autres champs sont verrouillés pour préserver l’historique des relances.</p>}
   <label>Émetteur / fournisseur<input className="field" name="issuer" defaultValue={initial.issuer} maxLength={200} placeholder="Nom du fournisseur" /></label>
   <label>Client<input className="field" name="client" defaultValue={initial.client} maxLength={200} required disabled={initial.locked} /></label>
   <label>Email du client<input className="field" name="email" type="email" defaultValue={initial.email} maxLength={254} disabled={initial.locked} /></label>
   <label>Numéro de facture<input className="field" name="invoiceNumber" defaultValue={initial.invoiceNumber} maxLength={100} disabled={initial.locked} /></label>
   <div className="invoice-edit-columns">
    <label>Montant TTC (€)<input className="field" name="amount" type="number" min="0.01" max="10000000" step="0.01" defaultValue={(initial.amountCents/100).toFixed(2)} required disabled={initial.locked} /></label>
    <label>Échéance<input className="field" name="dueDate" type="date" defaultValue={initial.dueDate} required disabled={initial.locked} /></label>
   </div>
   <button className="btn" disabled={busy} type="submit">{busy?'Enregistrement…':'Enregistrer les modifications'}</button>
  </form>}
  {success&&<p role="status" className="notice">{success}</p>}
  {error&&<p role="alert" className="notice error">{error}</p>}
 </article>
}
