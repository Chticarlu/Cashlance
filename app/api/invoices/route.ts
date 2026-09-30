import { NextResponse } from 'next/server'
import { POST as confirmImport } from '@/app/api/imports/route'
import { emptyDraft } from '@/lib/imports/model'
// Keep the existing endpoint, but share the same review and atomic scheduling path.
export async function POST(request: Request) {
  const text=await request.text()
  if(text.length>16000) return NextResponse.json({error:'Formulaire trop volumineux.'},{status:413})
  let body; try { body=JSON.parse(text) } catch { return NextResponse.json({error:'Formulaire invalide.'},{status:400}) }
  if(body?.confirmed!=='on') return NextResponse.json({error:'Confirmez les informations et le scénario.'},{status:400})
  return confirmImport(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({
    batchId:body.batchId,reviewed:true,schedule:true,scenario:'gentle',
    rows:[{...emptyDraft('Saisie manuelle'),client:body.client,email:body.email,amount:body.amount,due:body.due,invoiceNumber:body.invoiceNumber,currency:'EUR',confirmed:true}],
  })}))
}
