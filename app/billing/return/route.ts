import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readSubscription } from '@/lib/subscription-server'
import { hasSubscription, subscriptionDestination } from '@/lib/subscription'
import { syncSubscription, stripeId } from '@/lib/stripe-sync'
import { getStripe } from '@/lib/stripe'
import { getRequestAppUrl } from '@/lib/app-url'

export async function GET(req: Request) {
  const origin = getRequestAppUrl(req)
  const id = new URL(req.url).searchParams.get('session_id')
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', origin))
  try {
    const org = await readSubscription(db, user.id)
    if (!id || !org?.stripe_customer_id) return NextResponse.redirect(new URL('/pricing?billing=invalid', origin))
    const session = await getStripe().checkout.sessions.retrieve(id)
    if (session.mode !== 'subscription' || session.status !== 'complete' ||
        stripeId(session.customer) !== org.stripe_customer_id || session.client_reference_id !== org.id ||
        session.metadata?.organization_id !== org.id || !stripeId(session.subscription)) {
      return NextResponse.redirect(new URL('/pricing?billing=invalid', origin))
    }
    const synced = await syncSubscription(stripeId(session.subscription)!, org.id)
    const destination = hasSubscription(synced) ? '/dashboard' : subscriptionDestination(synced)
    return NextResponse.redirect(new URL(destination, origin), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    // Never grant access from a URL parameter, nor fall back to an unsynchronized state.
    return NextResponse.redirect(new URL('/account/billing?error=sync', origin), { headers: { 'Cache-Control': 'private, no-store' } })
  }
}
