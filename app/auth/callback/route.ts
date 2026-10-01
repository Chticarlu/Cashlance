import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRequestAppUrl } from '@/lib/app-url'
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code')
  if (code) {
    const db = await createClient()
    const { error } = await db.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL('/onboarding', getRequestAppUrl(request)))
  }
  return NextResponse.redirect(new URL('/login?confirmation=retry', getRequestAppUrl(request)))
}
