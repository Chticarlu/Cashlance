export type SubscriptionAccess = { subscription_status: string; stripe_subscription_id: string | null }

export function hasSubscription(org: SubscriptionAccess | null | undefined) {
  return Boolean(org?.stripe_subscription_id && ['active', 'trialing'].includes(org.subscription_status))
}

export function subscriptionDestination(org: SubscriptionAccess | null | undefined) {
  if (hasSubscription(org)) return '/dashboard'
  if (org?.stripe_subscription_id && ['past_due', 'unpaid', 'incomplete', 'paused'].includes(org.subscription_status)) return '/account/billing'
  return '/pricing'
}
