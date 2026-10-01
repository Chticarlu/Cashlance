import { subscriptionApiError } from '@/lib/subscription-server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sameOrigin, uuid } from '@/lib/imports/server'
import { isValidEmail } from '@/lib/imports/model'
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 })
  const db = await createClient(); const { data: { user } } = await db.auth.getUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const denied = await subscriptionApiError(db, user.id)
  if (denied) return denied
  const body = await req.json().catch(() => null)
  if (!body || !uuid(body.invoiceId) || body.confirmed !== true || !(typeof body.scenario === 'string' && (['gentle','complete'].includes(body.scenario) || /^custom:(?:[1-9]|[1-5][0-9]|60)(?:,(?:[1-9]|[1-5][0-9]|60)){0,4}$/.test(body.scenario) && (() => { const a=body.scenario.slice(7).split(',').map(Number); return a.every((n:number,i:number)=>i===0||n>a[i-1]) })())) || typeof body.email !== 'string' || body.email.length > 300 || !isValidEmail(body.email)) return NextResponse.json({ error: 'Vérifiez l’adresse email et les informations.' }, { status: 400 })
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('activate_imported_invoice_server', { p_owner: user.id, target_invoice: body.invoiceId, confirmed_email: body.email, chosen_scenario: body.scenario })
  if (error) return NextResponse.json({ error: error.message?.includes('subscription_required') ? 'Essai terminé : choisissez votre abonnement.' : 'Programmation impossible. Vérifiez l’email, le client et la facture.' }, { status: 409 })
  return NextResponse.json({ ok: true, scheduled: data })
}
