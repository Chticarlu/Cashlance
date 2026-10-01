import { requireSubscription } from '@/lib/subscription-server'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import InvoiceActions from '@/components/invoice-actions'
import InvoiceEdit from '@/components/invoice-edit'
import ThemeToggle from '@/components/theme-toggle'
import ReminderPlanner from '@/components/reminder-planner'

type Customer = { name:string; email:string|null } | null
type Invoice = {
  id:string
  import_key:string|null
  invoice_number:string|null
  amount_cents:number
  due_date:string
  status:string
  paid_at:string|null
  promise_date:string|null
  dispute_reason:string|null
  last_contact_at:string|null
  reminders_stopped_at:string|null
  reminder_scenario:string|null
  created_at:string
  customers:Customer
  import_details:Record<string,unknown>|null
}
type Reminder = { id:string; scheduled_for:string; stage:string; state:string }
type Outbound = { id:string; subject:string; body_text:string; state:string; sent_at:string|null; delivered_at:string|null; delivery_failed_at:string|null; delivery_error:string|null; replied_at:string|null; created_at:string; reminder_id:string|null }
type Inbound = { id:string; subject:string|null; body_text:string|null; classification:string; extracted_date:string|null; needs_review:boolean; created_at:string; sender_email:string }

const euro=(cents:number)=>(cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})
const date=(value:string|null)=>value?new Date(value.includes('T')?value:value+'T12:00:00').toLocaleDateString('fr-FR'):'—'
const dateTime=(value:string|null)=>value?new Date(value).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'—'
const statusLabels:Record<string,string>={open:'En relance',promised:'Promesse de paiement',disputed:'Litige',paid:'Payée'}
const reminderLabels:Record<string,string>={pending:'Programmée',sent:'Envoyée',cancelled:'Annulée',failed:'Échec',needs_review:'À vérifier'}
const replyLabels:Record<string,string>={promise:'Promesse de paiement',paid:'Paiement annoncé',dispute:'Litige',duplicate:'Copie demandée',other:'À examiner'}
const deliveryLabels:Record<string,string>={queued:'En attente de prise en charge',sent:'Envoyé · distribution non confirmée',delivered:'Distribué au serveur destinataire',failed:'Échec de livraison',bounced:'Adresse rejetée / rebond'}
const invoiceLabel=(i:Invoice)=>i.status==='open'&&!i.reminder_scenario?(i.reminders_stopped_at||i.reminders_stopped_at||i.last_contact_at?'Relances arrêtées':'À programmer'):(statusLabels[i.status]||i.status)
const followLabel=(i:Invoice)=>i.status==='open'&&!i.reminder_scenario?(i.last_contact_at?'Relances arrêtées':'À programmer'):(i.reminder_scenario?'Relances actives':statusLabels[i.status]||i.status)

export const metadata={title:'Détail facture — CashLance',robots:{index:false,follow:false}}

export default async function InvoicePage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params
  const db=await createClient()
  const {data:{user}}=await db.auth.getUser()
  if(!user) redirect('/login')
  await requireSubscription(db, user.id)

  const invoiceResult=await db.from('invoices')
    .select('id,import_key,invoice_number,amount_cents,due_date,status,paid_at,promise_date,dispute_reason,last_contact_at,reminder_scenario,reminders_stopped_at,import_details,created_at,customers(name,email)')
    .eq('id',id).maybeSingle()
  if(invoiceResult.error||!invoiceResult.data) notFound()
  const invoice=invoiceResult.data as unknown as Invoice

  const [reminderResult,outboundResult,inboundResult]=await Promise.all([
    db.from('reminders').select('id,scheduled_for,stage,state').eq('invoice_id',id).order('scheduled_for',{ascending:true}),
    db.from('outbound_messages').select('id,subject,body_text,state,sent_at,delivered_at,delivery_failed_at,delivery_error,replied_at,created_at,reminder_id').eq('invoice_id',id).order('created_at',{ascending:false}),
    db.from('inbound_messages').select('id,subject,body_text,classification,extracted_date,needs_review,created_at,sender_email').eq('invoice_id',id).order('created_at',{ascending:false}),
  ])

  const reminders=(reminderResult.data||[]) as Reminder[]
  const outbound=(outboundResult.data||[]) as Outbound[]
  const inbound=(inboundResult.data||[]) as Inbound[]
  const pendingReminders=reminders.filter(r=>r.state==='pending')
  const sentReminders=reminders.filter(r=>r.state==='sent').length
  const cancelledReminders=reminders.filter(r=>r.state==='cancelled').length
  const nextReminder=pendingReminders[0]||null
  const reviewCount=inbound.filter(m=>m.needs_review).length
  const nextAction=invoice.status==='paid'
    ? 'Aucune action — facture payée'
    : invoice.status==='disputed'
      ? 'Traiter le litige'
      : invoice.status==='promised'&&invoice.promise_date
        ? `Attendre le paiement promis le ${date(invoice.promise_date)}`
        : invoice.status==='open'&&!invoice.reminder_scenario&&(invoice.reminders_stopped_at||invoice.last_contact_at)
          ? 'Relances arrêtées'
          : nextReminder
            ? `Prochaine relance ${nextReminder.stage} le ${dateTime(nextReminder.scheduled_for)}`
            : 'Programmer les relances'

  const timeline=[
    ...outbound.map(m=>({id:'out-'+m.id,kind:'out' as const,at:m.sent_at||m.created_at,title:m.subject,body:m.body_text,meta:deliveryLabels[m.state]||m.state,detail:m.delivery_failed_at ? `${m.delivery_error || 'Échec de livraison'} — ${dateTime(m.delivery_failed_at)}. Les relances suivantes sont suspendues pour vérification.` : (m.delivered_at ? `Distribution confirmée le ${dateTime(m.delivered_at)} (lecture non garantie).` : null),reply:m.replied_at ? `Réponse du destinataire enregistrée le ${dateTime(m.replied_at)}.` : null})),
    ...inbound.map(m=>({id:'in-'+m.id,kind:'in' as const,at:m.created_at,title:m.subject||'Réponse reçue',body:m.body_text||'',meta:replyLabels[m.classification]||m.classification,review:m.needs_review})),
  ].sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime())

  return <main className="wrap">
    <nav className="nav"><Link className="brand" href="/">Cash<b>lance</b></Link><div className="nav-controls"><ThemeToggle/><Link href="/dashboard">← Tableau de bord</Link></div></nav>
    <section className="section">
      <div className="toolbar"><div><span className="ecosystem">Facture</span><h1>{invoice.invoice_number||'Sans numéro'}</h1><p className="muted">{invoice.customers?.name||'Client'}</p></div><span className="badge">{invoiceLabel(invoice)}</span></div>

      <div className="detail-grid">
        <article className="card"><small className="muted">{invoice.status==='paid'?'Montant réglé':'Montant restant'}</small><h2>{euro(invoice.amount_cents)}</h2><p>Échéance : <strong>{date(invoice.due_date)}</strong></p></article>
        <article className="card"><small className="muted">Client</small><h2>{invoice.customers?.name||'—'}</h2><p>{invoice.customers?.email||'Email non renseigné'}</p></article>
        <article className="card"><small className="muted">Suivi</small><h2>{followLabel(invoice)}</h2><p>Dernier contact : {dateTime(invoice.last_contact_at)}</p></article>
      </div>

      <section className="invoice-overview">
        <div className="overview-main">
          <span className="muted">Prochaine action</span>
          <strong>{nextAction}</strong>
        </div>
        <div className="overview-stats">
          <div><span>Envoyées</span><strong>{sentReminders}</strong></div>
          <div><span>À venir</span><strong>{pendingReminders.length}</strong></div>
          <div><span>Réponses</span><strong>{inbound.length}</strong></div>
          <div><span>À vérifier</span><strong>{reviewCount}</strong></div>
        </div>
      </section>

      {(invoice.promise_date||invoice.dispute_reason||invoice.paid_at)&&<article className="card detail-note">
        <h2>État de la créance</h2>
        {invoice.promise_date&&<p>Promesse de paiement : <strong>{date(invoice.promise_date)}</strong></p>}
        {invoice.dispute_reason&&<p>Motif du litige : {invoice.dispute_reason}</p>}
        {invoice.paid_at&&<p>Marquée payée le : <strong>{dateTime(invoice.paid_at)}</strong></p>}
      </article>}

      <InvoiceEdit initial={{id:invoice.id,issuer:typeof invoice.import_details?.issuer==='string'?invoice.import_details.issuer:'',client:invoice.customers?.name||'',email:invoice.customers?.email||'',invoiceNumber:invoice.invoice_number||'',amountCents:invoice.amount_cents,dueDate:invoice.due_date,locked:invoice.status!=='open'||Boolean(invoice.reminder_scenario||invoice.reminders_stopped_at||invoice.last_contact_at)||reminders.length>0||outbound.length>0||inbound.length>0}} />

      <InvoiceActions id={invoice.id} status={invoice.status} remindersActive={Boolean(invoice.reminder_scenario)} hasContact={Boolean(invoice.reminders_stopped_at||invoice.last_contact_at)} />
      {invoice.status==='open' && invoice.import_key && !invoice.reminder_scenario && !invoice.reminders_stopped_at && !invoice.last_contact_at && reminders.length===0 && <ReminderPlanner invoiceId={invoice.id} due={invoice.due_date} initialEmail={invoice.customers?.email||''} />}

      <div className="detail-columns">
        <section>
          <h2>Planning des relances</h2>
          <div className="card">
            {reminders.length?reminders.map(r=><div className="row reminder-row" key={r.id}><div><strong>{r.stage}</strong><div className="muted">{dateTime(r.scheduled_for)}</div></div><span className={`status reminder-${r.state}`}>{reminderLabels[r.state]||r.state}</span></div>):<p className="muted">Aucune relance programmée pour cette facture.</p>}
            {cancelledReminders>0&&<p className="muted reminder-summary">{cancelledReminders} relance{cancelledReminders>1?'s':''} annulée{cancelledReminders>1?'s':''}.</p>}
          </div>
        </section>

        <section>
          <h2>Historique des échanges</h2>
          <div className="timeline">
            {timeline.length?timeline.map(item=><article className="card timeline-item" key={item.id}>
              <div className="timeline-head"><strong>{item.kind==='out'?'↗ Envoyé':'↙ Reçu'} · {item.title}</strong><span className="muted">{dateTime(item.at)}</span></div>
              <div className="timeline-meta"><span className={item.kind==='out'?'status':'status status-inbound'}>{item.meta}</span>{'review' in item&&item.review&&<span className="status status-review">Vérification nécessaire</span>}</div>
              {'detail' in item&&item.detail&&<p className="muted">{item.detail}</p>}{'reply' in item&&item.reply&&<p className="notice">{item.reply}</p>}
              {item.body&&<details><summary>Voir le message</summary><pre className="message-body">{item.body}</pre></details>}
            </article>):<div className="card"><p className="muted">Aucun échange enregistré pour cette facture.</p></div>}
          </div>
        </section>
      </div>
    </section>
  </main>
}
