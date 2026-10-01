import { createClient } from '@/lib/supabase/server'
import { hasSubscription } from '@/lib/subscription'
import Link from 'next/link'

const plans = [
  { key: 'solo', name: 'Solo', price: 19, desc: 'Pour un indépendant qui veut structurer ses premières relances.', volume: '20 factures actives', features: ['Relances automatiques après validation', 'Tableau de bord', 'Import PDF/photo avec extraction IA', 'Import Excel / CSV', '14 jours gratuits'] },
  { key: 'pro', name: 'Pro', price: 39, desc: 'Pour une TPE qui suit davantage de factures et de réponses.', volume: '100 factures actives', features: ['Relances automatiques après validation', 'Import PDF/photo avec extraction IA', 'Import Excel / CSV', 'Analyse des réponses selon les règles disponibles', 'Suivi des promesses et litiges', '14 jours gratuits'], featured: true },
  { key: 'team', name: 'Équipe', price: 79, desc: 'Pour un suivi partagé et des volumes plus importants.', volume: 'Factures actives illimitées', features: ['Relances automatiques après validation', 'Import PDF/photo avec extraction IA', 'Import Excel / CSV', 'Jusqu’à 5 utilisateurs', 'Règles de relance personnalisées', '14 jours gratuits'] },
]

export default async function PricingPage() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  const org = user ? (await db.from('organizations').select('subscription_status,stripe_subscription_id').eq('owner_id',user.id).maybeSingle()).data : null
  const subscribed = hasSubscription(org)
  const returning = Boolean(org?.stripe_subscription_id)

  return <main className="wrap">
    <div className="nav"><Link href="/" className="brand">Cash<b>lance</b></Link><Link href={user ? '/account/billing' : '/login'} className="btn alt">{user ? 'Mon abonnement' : 'Connexion'}</Link></div>
    <section className="section" style={{paddingTop:70}}>
      <span className="badge">{returning ? 'Votre abonnement CashLance' : '14 jours d’essai gratuit'}</span>
      <h1 style={{fontSize:'clamp(32px, 6vw, 48px)',maxWidth:760}}>Un tarif adapté à vos factures à suivre.</h1>
      <p className="lead">Vous pouvez commencer par quelques factures, sans changer votre logiciel comptable. Prix mensuels hors taxes. Paiement sécurisé par Stripe et résiliation depuis votre espace client.{returning && !subscribed && ' La reprise se fait sans nouvel essai gratuit.'}</p>
      <div className="grid3" style={{marginTop:30}}>
        {plans.map(p=><div className="card" key={p.key} style={p.featured?{borderColor:'#3c8f70'}:{}}>
          {p.featured && <span className="badge">Pour les volumes intermédiaires</span>}
          <h2>{p.name}</h2>
          <p>{p.desc}</p>
          <div style={{fontSize:40,fontWeight:850}}>{p.price} € <small className="muted" style={{fontSize:14}}>/ mois HT</small></div>
          <p><strong>{p.volume}</strong></p>
          <ul>{p.features.filter(x=>!returning||x!=='14 jours gratuits').map(x=><li key={x}>{x}</li>)}</ul>
          {subscribed ? <Link className="btn" href="/account/billing">Gérer mon abonnement</Link> : <form action="/api/stripe/checkout" method="post"><input type="hidden" name="plan" value={p.key}/><button className="btn" type="submit">{returning ? 'Choisir cette offre' : 'Démarrer l’essai'}</button></form>}
        </div>)}
      </div>
      <p className="muted">Une facture active est une facture encore suivie dans votre espace. Les options affichées sont celles du forfait sélectionné ; les données extraites d’un document doivent toujours être vérifiées avant d’activer une relance.</p>
    </section>
    <section className="section">
      <h2>Ce que vous payez — et ce que vous ne payez pas</h2>
      <div className="grid3">
        <div className="card"><h3>Un abonnement de suivi</h3><p>Vous payez l’accès à un espace de suivi de factures et à la préparation des relances, pas une prestation de recouvrement avec paiement garanti.</p></div>
        <div className="card"><h3>Extraction IA des factures</h3><p>OpenAI analyse vos PDF et photos pour proposer des champs à vérifier. Cela ne signifie pas qu’un agent IA négocie automatiquement avec vos clients.</p></div>
        <div className="card"><h3>Vous gardez la main</h3><p>Aucun e-mail à l’import ; vous confirmez les informations et le calendrier avant activation. Gardez les règlements à jour pour éviter une relance inappropriée.</p></div>
      </div>
    </section>
    <section className="section">
      <h2>Questions sur l’abonnement</h2>
      <details><summary>Faut-il une carte bancaire pour créer mon compte ?</summary><p>Non, l’inscription initiale ne nécessite pas de carte. Lorsque vous choisissez une offre payante, le règlement et la gestion de l’abonnement passent par Stripe.</p></details>
      <details><summary>Le logiciel remplace-t-il mon outil de facturation ?</summary><p>Non. Il complète vos outils actuels pour le suivi et les relances. CashLance ne remplace pas une plateforme agréée de facturation électronique.</p></details>
      <details><summary>Les réponses des clients sont-elles déchiffrées par une IA payante ?</summary><p>La classification des réponses peut fonctionner à partir de règles. L’analyse documentaire par OpenAI est une fonction distincte. Une réponse ambiguë ou une déclaration de paiement doit être vérifiée par un humain.</p></details>
      <details><summary>Comment arrêter mon abonnement ?</summary><p>Depuis votre espace de facturation, via le portail client Stripe. Consultez les conditions affichées à la souscription pour le calendrier de facturation.</p></details>
    </section>
    <section className="section"><h2>Testez d’abord le suivi sur une facture.</h2><p>Essayez le parcours d’import et vérifiez les informations détectées avant de programmer vos premières relances.</p><Link href="/" className="btn alt">Revoir comment fonctionne CashLance</Link></section>
  </main>
}
