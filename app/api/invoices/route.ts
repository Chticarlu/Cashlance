import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.json({ error: 'Supabase n’est pas encore connecté.' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  const body = await request.json()
  const client = String(body.client || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const amount = Number(String(body.amount || '').replace(',', '.'))
  const due = String(body.due || '')
  const invoiceNumber = String(body.invoiceNumber || '').trim()

  if (!client || !email || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return NextResponse.json({ error: 'Données de facture invalides.' }, { status: 400 })
  }

  let { data: org } = await supabase.from('organizations').select('id').eq('owner_id', auth.user.id).maybeSingle()
  if (!org) {
    const name = String(auth.user.user_metadata?.company_name || 'Mon entreprise').slice(0, 120)
    const created = await supabase.from('organizations').insert({ owner_id: auth.user.id, name }).select('id').single()
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 400 })
    org = created.data
  }

  let { data: customer } = await supabase.from('customers').select('id').eq('organization_id', org.id).eq('email', email).maybeSingle()
  if (!customer) {
    const created = await supabase.from('customers').insert({ organization_id: org.id, name: client, email }).select('id').single()
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 400 })
    customer = created.data
  }

  const invoice = await supabase.from('invoices').insert({
    organization_id: org.id,
    customer_id: customer.id,
    invoice_number: invoiceNumber || null,
    amount_cents: Math.round(amount * 100),
    due_date: due,
  }).select('id').single()

  if (invoice.error) return NextResponse.json({ error: invoice.error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: invoice.data.id })
}
