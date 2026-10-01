import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({exchange:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{exchangeCodeForSession:m.exchange}})}))
import { GET } from '../app/auth/callback/route'
beforeEach(()=>{m.exchange.mockResolvedValue({error:null});vi.stubEnv('VERCEL_ENV','preview')})
afterEach(()=>vi.unstubAllEnvs())
it('keeps confirmation on the Preview and enters server-side onboarding',async()=>{
 const response=await GET(new Request('https://preview.example/auth/callback?code=synthetic'))
 expect(m.exchange).toHaveBeenCalledWith('synthetic')
 expect(response.headers.get('location')).toBe('https://preview.example/onboarding')
})
it('returns failed or missing confirmation to login without granting dashboard access',async()=>{
 m.exchange.mockResolvedValueOnce({error:{message:'invalid'}})
 for(const url of ['https://preview.example/auth/callback?code=expired','https://preview.example/auth/callback']) {
  expect((await GET(new Request(url))).headers.get('location')).toBe('https://preview.example/login?confirmation=retry')
 }
})
