import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { syncSubscription, stripeId } from '@/lib/stripe-sync'

export async function POST(req: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) return new NextResponse('Webhook non configuré', { status: 500 })
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new NextResponse('Signature manquante', { status: 400 })
  let event: Stripe.Event
  try { event = getStripe().webhooks.constructEvent(await req.text(), signature, process.env.STRIPE_WEBHOOK_SECRET) }
  catch { return new NextResponse('Signature invalide', { status: 400 }) }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session
      const sub = stripeId(session.subscription)
      if (sub && session.mode === 'subscription') await syncSubscription(sub, session.metadata?.organization_id || session.client_reference_id, event.id)
    } else if (['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) {
      const sub = event.data.object as Stripe.Subscription
      await syncSubscription(sub.id, sub.metadata?.organization_id || null, event.id)
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const sub = stripeId(invoice.parent?.subscription_details?.subscription)
      if (sub) await syncSubscription(sub, null, event.id)
    }
  } catch {
    return new NextResponse('Erreur de synchronisation', { status: 500 })
  }
  return NextResponse.json({ received: true })
}
