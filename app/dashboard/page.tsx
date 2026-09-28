import { redirect } from 'next/navigation'
import Link from 'next/link'
import AddInvoiceForm from '@/components/add-invoice-form'
import { createClient } from '@/lib/supabase/server'

type InvoiceRow = { id:string, invoice_number:string|null, amount_cents:number, due_date:string, status:string, customers:{name:string}|null }
const demo: InvoiceRow[] = [
  { id:'1', invoice_number:'FAC-1042', amount_cents:248000, due_date:'2026-09-19', status:'promised', customers:{name:'Durand Bâtiment'} },
  { id:'2', invoice_number:'FAC-1047', amount_cents:195000, due_date:'2026-09-17', status:'open', customers:{name:'Studio Nova'} },
  { id:'3', invoice_number:'FAC-1051', amount_cents:42000, due_date:'2026-09-23', status:'disputed', customers:{name:'Maison Lemaire'} },
]

const labels: Record<string,string> = { open:'En relance', promised:'Promesse de paiement', disputed:'Litige', paid:'Payée' }

export default async function Dashboard() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  let invoices = demo
  let isDemo = true

  if (configured) {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) redirect('/login')
    const { data, error } = await supabase
      .from('invoices')
      .select('id,invoice_number,amount_cents,due_date,status,customers(name)')
      .neq('status','paid')
      .order('due_date', { ascending: true })
    if (!error) {
      invoices = (data || []) as unknown as InvoiceRow[]
      isDemo = false
    }
  }

  const total = invoices.reduce((sum, x) => sum + x.amount_cents, 0)
  const promises = invoices.filter(x => x.status === 'promised').reduce((sum,x) => sum + x.amount_cents,0)
  const actions = invoices.filter(x => x.status === 'disputed').length

  return <div className="dash">
    <aside className="side"><Link href="/" className="brand">Cash<b>lance</b></Link><nav><a className="active">Tableau de bord</a><a>Factures</a><a>Relances</a><a>Clients</a><a>Paramètres</a></nav></aside>
    <main className="main">
      <div className="toolbar"><div><h1>Trésorerie à récupérer</h1><div className="muted">Priorisez les factures qui nécessitent une action.</div></div><AddInvoiceForm /></div>
      {isDemo && <div className="demoBanner">Mode démo — connectez Supabase pour enregistrer les vraies factures.</div>}
      <div className="kpis kpisDash"><div className="kpi"><small>À encaisser</small><strong>{(total/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</strong></div><div className="kpi"><small>Promesses</small><strong>{(promises/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</strong></div><div className="kpi"><small>Actions manuelles</small><strong>{actions}</strong></div></div>
      <div className="table"><table><thead><tr><th>Facture</th><th>Client</th><th>Montant</th><th>Échéance</th><th>État</th></tr></thead><tbody>{invoices.length ? invoices.map(x => <tr key={x.id}><td>{x.invoice_number || '—'}</td><td>{x.customers?.name || 'Client'}</td><td>{(x.amount_cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</td><td>{new Date(x.due_date+'T12:00:00').toLocaleDateString('fr-FR')}</td><td><span className={`status status-${x.status}`}>{labels[x.status] || x.status}</span></td></tr>) : <tr><td colSpan={5} className="empty">Aucune facture en retard. Bonne nouvelle.</td></tr>}</tbody></table></div>
    </main>
  </div>
}
