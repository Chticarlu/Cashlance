import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readSubscription } from '@/lib/subscription-server'
import { subscriptionDestination } from '@/lib/subscription'
export const metadata = { title: 'Bienvenue — CashLance', robots: { index: false, follow: false } }
export default async function Onboarding() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login?mode=signup')
  const admin = createAdminClient()
  const { error } = await admin.from('organizations').upsert({ owner_id: user.id, name: String(user.user_metadata?.company_name || 'Mon entreprise').slice(0,120) }, { onConflict: 'owner_id', ignoreDuplicates: true })
  if (error) throw new Error('Initialisation du compte indisponible')
  const preferences = await db.from('onboarding_state').upsert({ user_id: user.id, opted_in: user.user_metadata?.onboarding_emails === true }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (preferences.error) throw new Error('Initialisation des préférences indisponible')
  redirect(subscriptionDestination(await readSubscription(db, user.id)))
}
