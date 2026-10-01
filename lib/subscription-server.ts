import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasSubscription, subscriptionDestination } from '@/lib/subscription'

type Client = Awaited<ReturnType<typeof createClient>>
export async function readSubscription(db: Client, owner: string) {
  const { data, error } = await db.from('organizations')
    .select('id,subscription_status,stripe_subscription_id,stripe_customer_id')
    .eq('owner_id', owner).maybeSingle()
  if (error) throw new Error('Vérification de l’abonnement indisponible')
  return data
}

export async function requireSubscription(db: Client, owner: string) {
  const org = await readSubscription(db, owner)
  if (!hasSubscription(org)) redirect(subscriptionDestination(org))
  return org!
}

export async function subscriptionApiError(db: Client, owner: string) {
  try {
    const org = await readSubscription(db, owner)
    if (hasSubscription(org)) return null
    return NextResponse.json({ error: 'Un abonnement actif ou un essai Stripe est nécessaire.', code: 'subscription_required', redirect: subscriptionDestination(org) }, { status: 402, headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Vérification de l’abonnement indisponible.' }, { status: 503 })
  }
}
