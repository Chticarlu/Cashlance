import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sameOrigin, uuid } from '@/lib/imports/server'
import { isValidEmail } from '@/lib/imports/model'
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 })
  const db = await createClient(); const { data: { user } } = await db.auth.getUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || !uuid(body.invoiceId) || body.confirmed !== true || !['gentle','complete'].includes(body.scenario) || typeof body.email !== 'string' || body.email.length > 300 || !isValidEmail(body.email)) return NextResponse.json({ error: 'Vérifiez l’adresse email et les informations.' }, { status: 400 })
  const { data, error } = await db.rpc('activate_imported_invoice', { target_invoice: body.invoiceId, confirmed_email: body.email, chosen_scenario: body.scenario })
  if (error) return NextResponse.json({ error: error.message?.includes('subscription_required') ? 'Essai terminé : choisissez votre abonnement.' : 'Programmation impossible. Vérifiez l’email, le client et la facture.' }, { status: 409 })
  return NextResponse.json({ ok: true, scheduled: data })
}
