import { sameOrigin } from '@/lib/imports/server'
import { NextResponse } from 'next/server'
import { getRequestAppUrl } from '@/lib/app-url'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, getStripePriceId, PLAN_CONFIG, type PlanKey } from '@/lib/stripe'

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 })
  try {
    const form = await req.formData()
    const plan = String(form.get('plan') || '') as PlanKey
    if (!Object.hasOwn(PLAN_CONFIG, plan)) return NextResponse.json({ error: 'Offre invalide' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', getRequestAppUrl(req)), 303)

    const admin = createAdminClient()
    let { data: org, error } = await admin
      .from('organizations')
      .select('id,name,stripe_customer_id,stripe_subscription_id,subscription_status')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!org) {
      const created = await admin.from('organizations').insert({
        owner_id: user.id,
        name: user.email?.split('@')[0] || 'Mon entreprise',
      }).select('id,name,stripe_customer_id,stripe_subscription_id,subscription_status').single()
      if (created.error) throw created.error
      org = created.data
    }

    // Changes to an existing subscription belong in the Portal, never a new trial.
    if (org.stripe_subscription_id && !['canceled', 'cancelled', 'incomplete_expired'].includes(org.subscription_status || '')) return NextResponse.redirect(new URL('/account/billing', getRequestAppUrl(req)), 303)
    const stripe = getStripe()
    if (org.stripe_subscription_id) {
      // A delayed cancellation webhook must not create a duplicate subscription.
      const current = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
      if (!['canceled', 'incomplete_expired'].includes(current.status)) return NextResponse.redirect(new URL('/account/billing', getRequestAppUrl(req)), 303)
    }
    let customerId = org.stripe_customer_id as string | null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: org.name,
        metadata: { organization_id: org.id, owner_id: user.id },
      }, { idempotencyKey: `customer/${org.id}` })
      customerId = customer.id
      const updated = await admin.from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id)
      if (updated.error) throw updated.error
    }

    const appUrl = getRequestAppUrl(req)
    const automaticTaxEnabled = process.env.STRIPE_AUTOMATIC_TAX_ENABLED === 'true'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: getStripePriceId(plan), quantity: 1 }],
      success_url: `${appUrl}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?billing=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: automaticTaxEnabled ? 'required' : 'auto',
      automatic_tax: { enabled: automaticTaxEnabled },
      tax_id_collection: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      client_reference_id: org.id,
      metadata: { organization_id: org.id, plan },
      subscription_data: {
        ...(org.stripe_subscription_id ? {} : {
          trial_period_days: 14,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
        }),
        metadata: { organization_id: org.id, plan },
      },
    }, { idempotencyKey: `checkout/${org.id}/${plan}/${Math.floor(Date.now()/1800000)}` })

    if (!session.url) throw new Error('URL Stripe Checkout absente')
    return NextResponse.redirect(session.url, 303)
  } catch (e) {
    // Do not log provider responses or credentials.
    return NextResponse.json({ error: 'Impossible de démarrer le paiement' }, { status: 500 })
  }
}
