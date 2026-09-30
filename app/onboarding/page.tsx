import Link from 'next/link'
import { redirect } from 'next/navigation'
import DemoPanel from '@/components/demo-panel'
import { createClient } from '@/lib/supabase/server'
export const metadata = { title: 'Bienvenue — CashLance', robots: { index: false, follow: false } }
export default async function Onboarding() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login?mode=signup')
  // Idempotent initialization; user identity comes only from verified Auth.
  await db.from('organizations').upsert({ owner_id: user.id, name: String(user.user_metadata?.company_name || 'Mon entreprise').slice(0,120) }, { onConflict: 'owner_id', ignoreDuplicates: true })
  await db.from('onboarding_state').upsert({ user_id: user.id, opted_in: user.user_metadata?.onboarding_emails === true }, { onConflict: 'user_id', ignoreDuplicates: true })
  const source = user.user_metadata?.attribution || {}
  const properties = Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].filter(k=>typeof source[k]==='string').map(k=>[k,source[k].slice(0,100)]))
  await db.from('funnel_events').insert({user_id:user.id,name:'signup_completed',properties})
  return <main className="wrap"><nav className="nav"><Link href="/" className="brand">Cash<b>lance</b></Link><Link href="/dashboard">Mon tableau de bord</Link></nav>
    <section className="section"><span className="badge">14 jours pour découvrir CashLance</span><h1>Comment voulez-vous découvrir CashLance ?</h1><p className="lead">Avec vos factures maintenant, ou avec un exemple sans aucun envoi.</p>
    <div className="actions"><Link className="btn" href="/import">Importer mes documents</Link><DemoPanel /></div></section></main>
}
