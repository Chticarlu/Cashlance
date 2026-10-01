import { subscriptionApiError } from '@/lib/subscription-server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sameOrigin, uuid } from '@/lib/imports/server'

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null,{status:403})
  const db=await createClient()
  const {data:{user}}=await db.auth.getUser()
  if(!user) return new NextResponse(null,{status:401})
  const denied = await subscriptionApiError(db, user.id)
  if (denied) return denied

  const body=await req.json().catch(()=>null)
  if(!body || !uuid(body.invoiceId) || !['paid','promise','dispute','stop'].includes(body.action)) {
    return NextResponse.json({error:'Action invalide.'},{status:400})
  }

  let value:string|null=null
  if(body.action==='promise') {
    value=typeof body.value==='string'?body.value:null
    if(!value || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return NextResponse.json({error:'Date de promesse invalide.'},{status:400})
  }
  if(body.action==='dispute') {
    value=typeof body.value==='string'?body.value.trim():null
    if(!value || value.length<3 || value.length>500) return NextResponse.json({error:'Motif du litige invalide.'},{status:400})
  }

  const admin=createAdminClient()
  const {data,error}=await admin.rpc('manage_invoice_server',{
    p_owner:user.id,
    target_invoice:body.invoiceId,
    action:body.action,
    action_value:value
  })
  if(error) return NextResponse.json({error:'Modification impossible.'},{status:409})
  return NextResponse.json(data||{ok:true})
}
