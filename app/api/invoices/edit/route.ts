import { subscriptionApiError } from '@/lib/subscription-server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sameOrigin, uuid } from '@/lib/imports/server'

export async function POST(req:Request) {
 if(!sameOrigin(req)) return new NextResponse(null,{status:403})
 const db=await createClient()
 const {data:{user}}=await db.auth.getUser()
 if(!user) return new NextResponse(null,{status:401})
  const denied = await subscriptionApiError(db, user.id)
  if (denied) return denied
 const b=await req.json().catch(()=>null)
 if(!b||!uuid(b.invoiceId)) return NextResponse.json({error:'Facture invalide.'},{status:400})
 const strings=['issuer','client','email','invoiceNumber','dueDate']
 if(strings.some(k=>typeof b[k]!=='string')) return NextResponse.json({error:'Champs invalides.'},{status:400})
 const due=b.dueDate
 const amount=Number(b.amountCents)
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(due)||!Number.isSafeInteger(amount)||amount<1||amount>1000000000
 ||b.issuer.length>200||b.client.trim().length<2||b.client.length>200||b.email.length>254||b.invoiceNumber.length>100)
 return NextResponse.json({error:'Vérifiez les champs de la facture.'},{status:400})
 const admin=createAdminClient()
 const {data,error}=await admin.rpc('edit_invoice_server',{
   p_owner:user.id,target_invoice:b.invoiceId,p_issuer:b.issuer,
   p_client:b.client,p_email:b.email,p_number:b.invoiceNumber,
   p_amount_cents:amount,p_due_date:due
 })
 if(error) return NextResponse.json({error:error.message?.includes('financial_fields_locked')
 ?'Cette facture a déjà un suivi : seuls les renseignements fournisseur peuvent être corrigés.'
 :'Enregistrement impossible. Vérifiez les informations.'},{status:409})
 return NextResponse.json(data||{ok:true})
}
