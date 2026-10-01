import { requireSubscription } from '@/lib/subscription-server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import ImportWorkspace from '@/components/import-workspace'
import { createClient } from '@/lib/supabase/server'
export const metadata = { title: 'Importer vos créances — CashLance', robots: { index: false, follow: false } }
export default async function ImportPage() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login?next=import')
  await requireSubscription(db, user.id)
  return <main className="wrap"><nav className="nav"><Link href="/dashboard" className="brand">Cash<b>lance</b></Link><Link href="/dashboard">Tableau de bord</Link></nav><ImportWorkspace /></main>
}
