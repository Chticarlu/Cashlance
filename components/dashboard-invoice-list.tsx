'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import ActivateInvoice from '@/components/activate-invoice'

export type DashboardInvoice = {
  id:string
  invoice_number:string|null
  amount_cents:number
  due_date:string
  status:string
  import_key:string|null
  reminder_scenario:string|null
  last_contact_at:string|null
  customers:{name:string;email:string|null}|null
}

const labels:Record<string,string>={open:'En relance',promised:'Promesse de paiement',disputed:'Litige',paid:'Payée'}
const euro=(cents:number)=>(cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})
const invoiceState=(i:DashboardInvoice)=>{
  if(i.status==='promised') return 'promised'
  if(i.status==='disputed') return 'disputed'
  if(i.status==='paid') return 'paid'
  if(i.status==='open'&&!i.reminder_scenario) return i.last_contact_at?'stopped':'todo'
  return 'active'
}
const invoiceLabel=(i:DashboardInvoice)=>{
  const state=invoiceState(i)
  return state==='stopped'?'Relances arrêtées':state==='todo'?'À programmer':labels[i.status]||'En relance'
}

export default function DashboardInvoiceList({invoices}:{invoices:DashboardInvoice[]}) {
  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')

  const counts=useMemo(()=>Object.fromEntries(['active','stopped','todo','promised','disputed'].map(key=>[
    key,invoices.filter(i=>invoiceState(i)===key).length
  ])),[invoices])

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase()
    return invoices.filter(i=>{
      const state=invoiceState(i)
      const matchesFilter=filter==='all'||state===filter
      const haystack=`${i.customers?.name||''} ${i.invoice_number||''}`.toLowerCase()
      return matchesFilter&&(!q||haystack.includes(q))
    })
  },[invoices,filter,search])

  return <>
    <section className="dashboard-filters" aria-label="Filtres des factures">
      <input
        className="field dashboard-search"
        type="search"
        value={search}
        onChange={e=>setSearch(e.target.value)}
        placeholder="Rechercher un client ou une facture"
        aria-label="Rechercher un client ou une facture"
      />
      <div className="filter-chips">
        {[
          ['all','Toutes',invoices.length],
          ['active','En relance',counts.active],
          ['stopped','Arrêtées',counts.stopped],
          ['todo','À programmer',counts.todo],
          ['promised','Promesses',counts.promised],
          ['disputed','Litiges',counts.disputed],
        ].map(([value,label,count])=><button
          key={String(value)}
          type="button"
          className={`filter-chip ${filter===value?'active':''}`}
          onClick={()=>setFilter(String(value))}
        >{label} <span>{count}</span></button>)}
      </div>
      <p className="muted filter-result">{visible.length} facture{visible.length>1?'s':''} affichée{visible.length>1?'s':''}</p>
    </section>

    <div className="invoice-list">
      {visible.map(i=><article className="card" key={i.id}>
        <h2>{i.customers?.name||'Client'}</h2>
        <p>{i.invoice_number||'Sans numéro'} · <strong>{euro(i.amount_cents)}</strong></p>
        <p>Échéance : {new Date(i.due_date+'T12:00:00').toLocaleDateString('fr-FR')}<br />Email : {i.customers?.email||'Information manquante'}</p>
        <div className="actions">
          <span className="badge">{invoiceLabel(i)}</span>
          <Link className="btn alt" href={`/invoices/${i.id}`}>Voir la facture</Link>
        </div>
        {invoiceState(i)==='todo'&&i.import_key&&<ActivateInvoice id={i.id} email={i.customers?.email||''} />}
      </article>)}
      {!visible.length&&<div className="card"><p className="muted">Aucune facture ne correspond à ce filtre.</p></div>}
    </div>
  </>
}
