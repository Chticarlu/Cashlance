import { subscriptionApiError } from '@/lib/subscription-server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cleanDrafts, sameOrigin, uuid } from '@/lib/imports/server'
export async function GET() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const denied = await subscriptionApiError(db, user.id)
  if (denied) return denied
  const { data, error } = await db.from('import_drafts').select('batch_id,rows').eq('user_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Brouillons indisponibles. Vérifiez la migration.' }, { status: 503 })
  return NextResponse.json(data || null)
}
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 })
  const db = await createClient(); const { data: { user } } = await db.auth.getUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const denied = await subscriptionApiError(db, user.id)
  if (denied) return denied
  try {
    const text = await req.text(); if (text.length > 2_000_000) throw new Error()
    const body = JSON.parse(text); if (!uuid(body.batchId)) throw new Error()
    const rows = cleanDrafts(body.rows)
    const { error } = await db.from('import_drafts').upsert({ user_id: user.id, batch_id: body.batchId, rows, updated_at: new Date().toISOString() })
    return NextResponse.json({ ok: !error }, { status: error ? 503 : 200 })
  } catch { return NextResponse.json({ error: 'Brouillon invalide.' }, { status: 400 }) }
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 })
  const db = await createClient(); const { data: { user } } = await db.auth.getUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const denied = await subscriptionApiError(db, user.id)
  if (denied) return denied
  const { error } = await db.from('import_drafts').delete().eq('user_id', user.id)
  return NextResponse.json({ ok: !error }, { status: error ? 503 : 200 })
}
