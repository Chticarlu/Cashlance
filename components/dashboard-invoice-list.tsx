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
  reminders_stopped_at:string|null
  customers:{name:string;email:string|null}|null
}

const labels:Record<string,string>={open:'En relance',promised:'Promesse de paiement',disputed:'Litige',paid:'Payée'}
const euro=(cents:number)=>(cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})
const invoiceState=(i:DashboardInvoice)=>{
  if(i.status==='promised') return 'promised'
  if(i.status==='disputed') return 'disputed'
  if(i.status==='paid') return 'paid'
  if(i.status==='open'&&!i.reminder_scenario) return i.reminders_stopped_at||i.last_contact_at?'stopped':'todo'
  return 'active'
}
const invoiceLabel=(i:DashboardInvoice)=>{
  const state=invoiceState(i)
  return state==='stopped'?'Relances arrêtées':state==='todo'?'À programmer':labels[i.status]||'En relance'
}

export default function DashboardInvoiceList({invoices}:{invoices:DashboardInvoice[]}) {
  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')
  const [sort,setSort]=useState('priority')

  const counts=useMemo(()=>Object.fromEntries(['active','stopped','todo','promised','disputed','paid'].map(key=>[
    key,invoices.filter(i=>invoiceState(i)===key).length
  ])),[invoices])

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase()
    const filtered=invoices.filter(i=>{
      const state=invoiceState(i)
      const matchesFilter=filter==='all'||state===filter
      const haystack=`${i.customers?.name||''} ${i.invoice_number||''}`.toLowerCase()
      return matchesFilter&&(!q||haystack.includes(q))
    })
    const priority:Record<string,number>={disputed:0,todo:1,active:2,promised:3,stopped:4,paid:5}
    return filtered.sort((a,b)=>{
      if(sort==='amount-desc') return b.amount_cents-a.amount_cents
      if(sort==='due-asc') return a.due_date.localeCompare(b.due_date)
      if(sort==='due-desc') return b.due_date.localeCompare(a.due_date)
      const stateDiff=(priority[invoiceState(a)]??9)-(priority[invoiceState(b)]??9)
      return stateDiff||a.due_date.localeCompare(b.due_date)
    })
  },[invoices,filter,search,sort])

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
      <div className="dashboard-filter-row">
        <div className="filter-chips">
        {[
          ['all','Toutes',invoices.length],
          ['active','En relance',counts.active],
          ['stopped','Arrêtées',counts.stopped],
          ['todo','À programmer',counts.todo],
          ['promised','Promesses',counts.promised],
          ['disputed','Litiges',counts.disputed],
          ['paid','Payées',counts.paid],
        ].map(([value,label,count])=><button
          key={String(value)}
          type="button"
          className={`filter-chip ${filter===value?'active':''}`}
          onClick={()=>setFilter(String(value))}
        >{label} <span>{count}</span></button>)}
        </div>
        <label className="sort-control">Trier
          <select className="field" value={sort} onChange={e=>setSort(e.target.value)}>
            <option value="priority">Priorité</option>
            <option value="due-asc">Échéance la plus proche</option>
            <option value="due-desc">Échéance la plus lointaine</option>
            <option value="amount-desc">Montant le plus élevé</option>
          </select>
        </label>
      </div>
      <p className="muted filter-result">{visible.length} facture{visible.length>1?'s':''} affichée{visible.length>1?'s':''}</p>
    </section>

    <div className="invoice-list">
      {visible.map(i=>{
        const days=Math.floor((Date.now()-new Date(i.due_date+'T12:00:00').getTime())/86400000)
        const timing=days>0?`${days} j de retard`:days===0?'Échéance aujourd’hui':`Échéance dans ${Math.abs(days)} j`
        const state=invoiceState(i)
        const next=state==='paid'?'Facture réglée':state==='disputed'?'Traiter le litige':state==='todo'?'Programmer les relances':state==='active'?'Relances automatiques actives':state==='promised'?'Attendre le paiement promis':'Aucun nouvel envoi automatique'
        return <article className="card dashboard-invoice-card" key={i.id}>
        <div className="invoice-card-head"><div><h2>{i.customers?.name||'Client'}</h2><span className="muted">{i.invoice_number||'Sans numéro'}</span></div><strong className="invoice-amount">{euro(i.amount_cents)}</strong></div>
        <div className="invoice-card-meta"><span>{timing}</span><span>{i.customers?.email||'Email manquant'}</span></div>
        <div className="invoice-next"><small>Prochaine action</small><strong>{next}</strong></div>
        <div className="actions">
          <span className="badge">{invoiceLabel(i)}</span>
          <Link className="btn alt" href={`/invoices/${i.id}`}>Voir la facture</Link>
        </div>
        {state==='todo'&&i.import_key&&<ActivateInvoice id={i.id} email={i.customers?.email||''} />}
      </article>})}
      {!visible.length&&<div className="card"><p className="muted">Aucune facture ne correspond à ce filtre.</p></div>}
    </div>
  </>
}
