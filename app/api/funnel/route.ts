import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/imports/server'
import { utmKeys } from '@/lib/funnel'
const allowed = new Set(['landing_page_view','trial_cta_clicked','signup_completed','demo_started','import_started','document_uploaded','document_parsed'])
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 })
  const text = await req.text()
  if (text.length > 4096) return new NextResponse(null, { status: 413 })
  let body; try { body = JSON.parse(text) } catch { return new NextResponse(null, { status: 400 }) }
  if (!body || !allowed.has(body.name)) return new NextResponse(null, { status: 400 })
  const db = await createClient(); const { data: { user } } = await db.auth.getUser()
  // Anonymous advertising attribution is kept in sessionStorage then signup metadata.
  // No public database writer or tracking service is introduced.
  if (!user) return new NextResponse(null, { status: 204 })
  const properties = { count: Math.max(0, Math.min(200, Number(body.count) || 0)),
    ...Object.fromEntries(utmKeys.filter(k => typeof body.attribution?.[k] === 'string').map(k => [k, body.attribution[k].slice(0, 100)])) }
  const { error } = await db.from('funnel_events').insert({ user_id: user.id, name: body.name, properties })
  if (body.name === 'document_parsed') {
    await db.from('onboarding_state').update({ stage: 'review', updated_at: new Date().toISOString() }).eq('user_id', user.id).neq('stage', 'scheduled')
  }
  return new NextResponse(null, { status: error ? 503 : 204 })
}
