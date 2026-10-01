import { createClient } from '@/lib/supabase/server'
import { hasSubscription } from '@/lib/subscription'
import Link from 'next/link'

const plans = [
  { key:'solo', name:'Solo', price:19, desc:'Pour indépendants et très petites structures.', features:['20 factures actives','Relances automatiques','Tableau de bord','14 jours gratuits'] },
  { key:'pro', name:'Pro', price:39, desc:'L’offre centrale pour les TPE B2B.', features:['100 factures actives','Analyse des réponses','Promesses & litiges','14 jours gratuits'], featured:true },
  { key:'team', name:'Équipe', price:79, desc:'Pour plusieurs collaborateurs.', features:['Factures illimitées','5 utilisateurs','Règles personnalisées','14 jours gratuits'] },
]

export default async function PricingPage(){
  const db = await createClient()
  const {data:{user}} = await db.auth.getUser()
  const org = user ? (await db.from('organizations').select('subscription_status,stripe_subscription_id').eq('owner_id',user.id).maybeSingle()).data : null
  const subscribed = hasSubscription(org)
  return <main className="wrap">
  <div className="nav"><Link href="/" className="brand">Cash<b>lance</b></Link><Link href={user ? '/account/billing' : '/login'} className="btn alt">{user ? 'Mon abonnement' : 'Connexion'}</Link></div>
  <section className="section" style={{paddingTop:70}}><span className="badge">14 jours gratuits</span><h1 style={{fontSize:48,maxWidth:760}}>Choisissez selon votre volume de factures.</h1><p className="lead">Paiement sécurisé par Stripe. Vous pouvez résilier depuis votre espace client.</p>
    <div className="grid3" style={{marginTop:30}}>{plans.map(p=><div className="card" key={p.key} style={p.featured?{borderColor:'#3c8f70'}:{}}><h3>{p.name}</h3><div style={{fontSize:40,fontWeight:850}}>{p.price} € <small className="muted" style={{fontSize:14}}>/ mois HT</small></div><p>{p.desc}</p><ul>{p.features.map(x=><li key={x}>{x}</li>)}</ul>{subscribed ? <Link className="btn" href="/account/billing">Gérer mon abonnement</Link> : <form action="/api/stripe/checkout" method="post"><input type="hidden" name="plan" value={p.key}/><button className="btn" type="submit">Démarrer l’essai</button></form>}</div>)}</div>
  </section>
</main>}
