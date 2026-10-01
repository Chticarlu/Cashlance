import { redirect } from 'next/navigation'
import Link from 'next/link'
import DemoPanel from '@/components/demo-panel'
import DashboardInvoiceList, { type DashboardInvoice } from '@/components/dashboard-invoice-list'
import EmailPreferences from '@/components/email-preferences'
import { createClient } from '@/lib/supabase/server'
const euro=(cents:number)=>(cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})
export const metadata={title:'Mon tableau de bord — CashLance',robots:{index:false,follow:false}}
export default async function Dashboard() {
  const db=await createClient(); const {data:{user}}=await db.auth.getUser(); if(!user) redirect('/login')
  const [result,organization,preferences]=await Promise.all([
    db.from('invoices').select('id,invoice_number,amount_cents,due_date,status,import_key,reminder_scenario,last_contact_at,reminders_stopped_at,customers(name,email)').order('due_date',{ascending:true}),
    db.from('organizations').select('created_at,subscription_status,stripe_customer_id').eq('owner_id',user.id).maybeSingle(),
    db.from('onboarding_state').select('opted_in').eq('user_id',user.id).maybeSingle(),
  ])
  const invoices=result.data||[]
  const openInvoices=invoices.filter(i=>i.status!=='paid')
  const total=openInvoices.reduce((n,i)=>n+i.amount_cents,0)
  return <main className="wrap"><nav className="nav"><Link className="brand" href="/">Cash<b>lance</b></Link><Link href="/pricing">Mon abonnement</Link></nav>
    <section className="section"><div className="toolbar"><div><h1>Vos créances, vos prochaines actions</h1><p className="muted">Importez, vérifiez, puis programmez vos relances.</p></div><Link className="btn" href="/import">Importer mes documents</Link></div>
    {result.error && <p className="notice error" role="alert">Impossible de charger les créances. Réessayez dans un instant.</p>}
    {!result.error && !invoices.length && <div className="card"><h2>Comment voulez-vous commencer ?</h2><p>Importez vos documents, ou découvrez le fonctionnement avec un exemple sans envoi.</p><DemoPanel /></div>}
    <div className="kpis kpisDash"><div className="kpi"><small>À encaisser</small><strong>{euro(total)}</strong></div><div className="kpi"><small>Promesses</small><strong>{euro(openInvoices.filter(i=>i.status==='promised').reduce((n,i)=>n+i.amount_cents,0))}</strong></div><div className="kpi"><small>À vérifier / programmer</small><strong>{openInvoices.filter(i=>i.status==='disputed'||(i.status==='open'&&i.import_key&&!i.reminder_scenario&&!i.reminders_stopped_at&&!i.last_contact_at)).length}</strong></div></div>
    <DashboardInvoiceList invoices={invoices as unknown as DashboardInvoice[]} />
    <p className="muted">Vous pouvez aussi saisir une créance dans l’écran d’import, puis vérifier les informations avant de programmer.</p>
    {organization.data?.stripe_customer_id && <form method="POST" action="/api/stripe/portal"><button className="btn alt">Gérer mon abonnement</button></form>}
    <details><summary>Préférences emails</summary><EmailPreferences initial={preferences.data?.opted_in===true} /></details></section></main>
}
