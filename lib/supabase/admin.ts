import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase admin non configuré')
  if (process.env.VERCEL_ENV === 'preview' && new URL(url).hostname !== 'nropdaayfhfuftyuacgt.supabase.co') throw new Error('La Preview exige Supabase Test')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
