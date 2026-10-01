import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refresh cookies only. Authorization lives in pages, handlers and database guards.
export async function proxy(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return NextResponse.next({ request })
  let response = NextResponse.next({ request })
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  await db.auth.getUser()
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = { matcher: ['/dashboard/:path*', '/import/:path*', '/invoices/:path*', '/onboarding', '/pricing', '/login', '/account/:path*', '/billing/:path*', '/auth/:path*', '/api/imports/:path*', '/api/invoices/:path*', '/api/stripe/checkout', '/api/stripe/portal', '/api/stripe/change-plan'] }
