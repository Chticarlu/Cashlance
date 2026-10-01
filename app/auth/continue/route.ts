import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readSubscription } from '@/lib/subscription-server'
import { subscriptionDestination, hasSubscription } from '@/lib/subscription'
import { getRequestAppUrl } from '@/lib/app-url'

export async function GET(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  const origin = getRequestAppUrl(req)
  if (!user) return NextResponse.redirect(new URL('/login', origin))
  const org = await readSubscription(db, user.id)
  const next = new URL(req.url).searchParams.get('next')
  const destination = hasSubscription(org) && next === 'import' ? '/import' : subscriptionDestination(org)
  return NextResponse.redirect(new URL(destination, origin), { headers: { 'Cache-Control': 'private, no-store' } })
}
