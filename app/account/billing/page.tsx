import Link from 'next/link'
import {redirect} from 'next/navigation'
import {createClient} from '@/lib/supabase/server'
import ThemeToggle from '@/components/theme-toggle'
export const metadata={title:'Mon abonnement — CashLance',robots:{index:false,follow:false}}
const names:Record<string,string>={solo:'Solo',pro:'Pro',team:'Équipe'}
export default async function BillingPage(){
 const db=await createClient()
 const {data:{user}}=await db.auth.getUser()
 if(!user) redirect('/login')
 const {data:org}=await db.from('organizations').select('subscription_status,subscription_plan,stripe_customer_id').eq('owner_id',user.id).maybeSingle()
 const status=org?.subscription_status||'inactive'
 const statusLabel:Record<string,string>={active:'Actif',trialing:'Essai en cours',past_due:'Paiement à régulariser',canceled:'Résilié',cancelled:'Résilié',inactive:'Aucun abonnement'}
 return <main className="wrap">
  <nav className="nav"><Link href="/dashboard" className="brand">Cash<b>lance</b></Link><div className="nav-controls"><ThemeToggle/><Link href="/dashboard">← Tableau de bord</Link></div></nav>
  <section className="section billing-panel">
   <span className="ecosystem">Espace client</span><h1>Mon abonnement</h1>
   <p className="muted">Consultez votre formule et gérez la facturation en toute sécurité.</p>
   <div className="card">
    <p>Formule : <strong>{names[String(org?.subscription_plan||'')]||String(org?.subscription_plan||'Non renseignée')}</strong></p>
    <p>Statut : <strong>{statusLabel[status]||status}</strong></p>
    {org?.stripe_customer_id?<form action="/api/stripe/portal" method="post"><button className="btn" type="submit">Gérer mon abonnement</button></form>
     :<><p className="muted">Aucun espace de facturation Stripe n’est encore associé à ce compte.</p><Link href="/pricing" className="btn alt">Découvrir les offres</Link></>}
   </div>
   <p className="muted">Le portail sécurisé permet notamment de retrouver les factures Stripe, les moyens de paiement et les options de résiliation disponibles.</p>
  </section>
 </main>
}
