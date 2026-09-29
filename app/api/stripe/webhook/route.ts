import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, planFromPriceId, type PlanKey } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

function planFromSubscription(sub: Stripe.Subscription): PlanKey {
  const fromPrice = planFromPriceId(sub.items.data[0]?.price?.id)
  if (fromPrice) return fromPrice
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

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id || null
}

async function assertSupabaseWrite<T extends { error: unknown }>(operation: PromiseLike<T>, context: string) {
  const result = await operation
  if (result.error) {
    console.error(`Supabase synchronization failed: ${context}`, result.error)
    throw result.error
  }
  return result
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.STRIPE_SECRET_KEY) return new NextResponse('Webhook non configuré', { status: 500 })

  const raw = await req.text()
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new NextResponse('Signature manquante', { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret)
  } catch {
    return new NextResponse('Signature invalide', { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const stripe = getStripe()
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.organization_id || session.client_reference_id
      const subscriptionId = stripeId(session.subscription)
      const customerId = stripeId(session.customer)

      if (orgId && subscriptionId) {
        // Checkout is only a signal that the session completed. Stripe remains the source of truth
        // for the actual subscription status and plan at the time this webhook is processed.
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)

        await assertSupabaseWrite(
          admin.from('organizations').update({
            stripe_customer_id: customerId || stripeId(subscription.customer),
            stripe_subscription_id: subscription.id,
            plan: planFromSubscription(subscription),
            subscription_status: normalizeStatus(subscription.status),
          }).eq('id', orgId),
          `checkout.session.completed for organization ${orgId}`,
        )
      } else if (orgId && customerId) {
        // Defensive fallback. A subscription checkout should normally always provide a subscription.
        // Keep the row linked to the customer, but do not invent an active/trialing state.
        await assertSupabaseWrite(
          admin.from('organizations').update({
            stripe_customer_id: customerId,
          }).eq('id', orgId),
          `checkout.session.completed fallback for organization ${orgId}`,
        )
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

      if (orgId) {
        await assertSupabaseWrite(
          admin.from('organizations').update(values).eq('id', orgId),
          `${event.type} for organization ${orgId}`,
        )
      } else {
        const customerId = stripeId(sub.customer)
        if (customerId) {
          await assertSupabaseWrite(
            admin.from('organizations').update(values).eq('stripe_customer_id', customerId),
            `${event.type} for Stripe customer ${customerId}`,
          )
        }
      }
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = stripeId(invoice.customer)
      if (customerId) {
        if (event.type === 'invoice.payment_failed') {
          await assertSupabaseWrite(
            admin.from('organizations').update({ subscription_status: 'past_due' }).eq('stripe_customer_id', customerId),
            `invoice.payment_failed for Stripe customer ${customerId}`,
          )
        } else if ((invoice.amount_paid ?? 0) > 0) {
          // A trial can generate a 0 EUR invoice. Do not turn a trialing account active because of that invoice.
          await assertSupabaseWrite(
            admin.from('organizations').update({ subscription_status: 'active' }).eq('stripe_customer_id', customerId),
            `invoice.paid for Stripe customer ${customerId}`,
          )
        }
      }
    }
  } catch (e) {
    // Returning 500 is intentional: Stripe will retry the event instead of considering a failed
    // database synchronization successfully processed.
    console.error('Stripe webhook processing error', e)
    return new NextResponse('Erreur de traitement', { status: 500 })
  }

  return NextResponse.json({ received: true })
}
