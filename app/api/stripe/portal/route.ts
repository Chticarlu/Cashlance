import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url), 303)

  const admin = createAdminClient()
  const { data: org } = await admin.from('organizations').select('stripe_customer_id').eq('owner_id', user.id).maybeSingle()
  if (!org?.stripe_customer_id) return NextResponse.redirect(new URL('/pricing', req.url), 303)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${appUrl}/dashboard`,
  })
  return NextResponse.redirect(session.url, 303)
}
