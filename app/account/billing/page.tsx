import Link from 'next/link'
import {redirect} from 'next/navigation'
import {createClient} from '@/lib/supabase/server'
import ThemeToggle from '@/components/theme-toggle'
export const metadata={title:'Mon abonnement — CashLance',robots:{index:false,follow:false}}
const names:Record<string,string>={solo:'Solo',pro:'Pro',team:'Équipe'}
export default async function BillingPage({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error:billingError}=await searchParams
 const db=await createClient()
 const {data:{user}}=await db.auth.getUser()
 if(!user) redirect('/login')
 const {data:org}=await db.from('organizations').select('subscription_status,plan,stripe_customer_id,stripe_subscription_id').eq('owner_id',user.id).maybeSingle()
 const status=org?.subscription_status||'inactive'
 const statusLabel:Record<string,string>={active:'Actif',trialing:'Essai en cours',past_due:'Paiement à régulariser',canceled:'Résilié',cancelled:'Résilié',inactive:'Aucun abonnement'}
 return <main className="wrap">
  <nav className="nav"><Link href="/dashboard" className="brand">Cash<b>lance</b></Link><div className="nav-controls"><ThemeToggle/><Link href="/dashboard">← Tableau de bord</Link></div></nav>
  <section className="section billing-panel">
   <span className="ecosystem">Espace client</span><h1>Mon abonnement</h1>
   <p className="muted">Consultez votre formule et gérez la facturation en toute sécurité.</p>
   <div className="card">
    <p>Formule : <strong>{names[String(org?.plan||'')]||String(org?.plan||'Non renseignée')}</strong></p>
    <p>Statut : <strong>{statusLabel[status]||status}</strong></p>
    {billingError&&<p role="alert" className="notice error">{billingError==='scheduled_cancellation'?'Cet abonnement est programmé pour être résilié à la fin de l’essai ou de la période. Ouvrez « Gérer mon abonnement » dans Stripe et, si vous souhaitez conserver le service, annulez la résiliation programmée avant de changer de formule.':billingError==='configuration'?'Le changement de formule doit être activé dans le portail Stripe (Solo, Pro et Équipe).':billingError==='unavailable'?'Le changement de formule n’est pas disponible pour cet abonnement.':'Impossible d’ouvrir le portail Stripe pour le moment.'}</p>}
    {org?.stripe_customer_id?<div className="billing-actions"><form action="/api/stripe/portal" method="post"><button className="btn alt" type="submit">Gérer mon abonnement</button></form>
    {org.stripe_subscription_id&&['active','trialing'].includes(status)&&<form action="/api/stripe/change-plan" method="post"><button className="btn" type="submit">Changer de formule</button></form>}</div>
     :<><p className="muted">Aucun espace de facturation Stripe n’est encore associé à ce compte.</p><Link href="/pricing" className="btn alt">Découvrir les offres</Link></>}
   </div>
   <p className="muted">Passez de Solo à Pro ou Équipe, ou revenez vers une formule plus petite. Stripe indique les éventuels ajustements de facturation avant confirmation. Le portail sécurisé permet aussi de retrouver vos factures, vos moyens de paiement et les options de résiliation disponibles.</p>
  </section>
 </main>
}
