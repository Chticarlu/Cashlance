import type Stripe from 'stripe'
import { getStripe, planFromPriceId, type PlanKey } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id || null
}
export function normalizeStatus(status: Stripe.Subscription.Status) {
  if (status === 'active' || status === 'trialing') return status
  if (['past_due', 'unpaid', 'incomplete', 'paused'].includes(status)) return 'past_due'
  return 'cancelled'
}
export function planFromSubscription(sub: Stripe.Subscription): PlanKey {
  const plan = planFromPriceId(sub.items.data[0]?.price?.id) || sub.metadata?.plan
  if (plan !== 'solo' && plan !== 'pro' && plan !== 'team') throw new Error('Offre Stripe inconnue')
  return plan
}

// Retrieve current Stripe state even for retries/out-of-order invoice notifications.
// The database applies the snapshot and event ledger in one locked transaction.
export async function syncSubscription(subscriptionId: string, organizationId: string | null, eventId: string | null = null) {
  const started = new Date().toISOString()
  const sub = await getStripe().subscriptions.retrieve(subscriptionId)
  const org = organizationId || sub.metadata?.organization_id || null
  const { data, error } = await createAdminClient().rpc('sync_stripe_subscription', {
    p_org: org, p_customer: stripeId(sub.customer), p_subscription: sub.id,
    p_status: normalizeStatus(sub.status), p_plan: planFromSubscription(sub),
    p_started: started, p_created: sub.created, p_event: eventId,
  })
  if (error || !data) throw new Error('Synchronisation Stripe indisponible')
  return data as { id: string; subscription_status: string; stripe_subscription_id: string | null }
}
