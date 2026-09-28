import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { headers } from 'next/headers'
import { getStripe, planFromPriceId, type PlanKey } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

function planFromSubscription(sub: Stripe.Subscription): PlanKey {
  const fromMetadata = sub.metadata?.plan as PlanKey | undefined
  if (fromMetadata === 'solo' || fromMetadata === 'pro' || fromMetadata === 'team') return fromMetadata
  const firstPrice = sub.items.data[0]?.price?.id
  return planFromPriceId(firstPrice) || 'pro'
}

function normalizeStatus(status: Stripe.Subscription.Status) {
  if (status === 'trialing') return 'trialing'
  if (status === 'active') return 'active'
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'past_due'
  return 'cancelled'
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new NextResponse('Webhook non configuré', { status: 500 })

  const raw = await req.text()
  const h = await headers()
  const signature = h.get('stripe-signature')
  if (!signature) return new NextResponse('Signature manquante', { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret)
  } catch {
    return new NextResponse('Signature invalide', { status: 400 })
  }

  const admin = createAdminClient()
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.organization_id || session.client_reference_id
      if (orgId) {
        await admin.from('organizations').update({
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
          stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
          plan: session.metadata?.plan || 'pro',
          subscription_status: 'trialing',
        }).eq('id', orgId)
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.organization_id
      const values = {
        stripe_subscription_id: sub.id,
        plan: planFromSubscription(sub),
        subscription_status: normalizeStatus(sub.status),
      }
      if (orgId) await admin.from('organizations').update(values).eq('id', orgId)
      else if (typeof sub.customer === 'string') await admin.from('organizations').update(values).eq('stripe_customer_id', sub.customer)
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
      if (customerId) {
        if (event.type === 'invoice.payment_failed') {
          await admin.from('organizations').update({ subscription_status: 'past_due' }).eq('stripe_customer_id', customerId)
        } else if ((invoice.amount_paid ?? 0) > 0) {
          // A trial can generate a 0 EUR invoice. Do not turn a trialing account active because of that invoice.
          await admin.from('organizations').update({ subscription_status: 'active' }).eq('stripe_customer_id', customerId)
        }
      }
    }
  } catch (e) {
    console.error('Stripe webhook processing error', e)
    return new NextResponse('Erreur de traitement', { status: 500 })
  }

  return NextResponse.json({ received: true })
}
