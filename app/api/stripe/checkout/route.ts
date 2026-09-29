import { NextResponse } from 'next/server'
import { getAppUrl } from '@/lib/app-url'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, getStripePriceId, PLAN_CONFIG, type PlanKey } from '@/lib/stripe'

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const plan = String(form.get('plan') || '') as PlanKey
    if (!Object.hasOwn(PLAN_CONFIG, plan)) return NextResponse.json({ error: 'Offre invalide' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', req.url), 303)

    const admin = createAdminClient()
    let { data: org, error } = await admin
      .from('organizations')
      .select('id,name,stripe_customer_id,subscription_status')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!org) {
      const created = await admin.from('organizations').insert({
        owner_id: user.id,
        name: user.email?.split('@')[0] || 'Mon entreprise',
      }).select('id,name,stripe_customer_id,subscription_status').single()
      if (created.error) throw created.error
      org = created.data
    }

    const stripe = getStripe()
    let customerId = org.stripe_customer_id as string | null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: org.name,
        metadata: { organization_id: org.id, owner_id: user.id },
      })
      customerId = customer.id
      const updated = await admin.from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id)
      if (updated.error) throw updated.error
    }

    const appUrl = getAppUrl()
    const automaticTaxEnabled = process.env.STRIPE_AUTOMATIC_TAX_ENABLED === 'true'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: getStripePriceId(plan), quantity: 1 }],
      success_url: `${appUrl}/dashboard?billing=success`,
      cancel_url: `${appUrl}/pricing?billing=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: automaticTaxEnabled ? 'required' : 'auto',
      automatic_tax: { enabled: automaticTaxEnabled },
      tax_id_collection: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      client_reference_id: org.id,
      metadata: { organization_id: org.id, plan },
      subscription_data: {
        trial_period_days: 14,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        metadata: { organization_id: org.id, plan },
      },
    })

    if (!session.url) throw new Error('URL Stripe Checkout absente')
    return NextResponse.redirect(session.url, 303)
  } catch (e) {
    console.error('Stripe checkout error', e)
    return NextResponse.json({ error: 'Impossible de démarrer le paiement' }, { status: 500 })
  }
}
