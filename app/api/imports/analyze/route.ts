import { subscriptionApiError } from '@/lib/subscription-server'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sameOrigin } from '@/lib/imports/server'
import { MAX_ANALYSIS_BYTES } from '@/lib/imports/analysis-limits'
import { AnalysisError, inspectDocument } from '@/lib/imports/analysis-document'
import { analyzeWithOpenAI, validateExtraction } from '@/lib/imports/openai'

export const runtime = 'nodejs'
export const maxDuration = 60
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}})

async function readDocument(req:Request) {
  const limit=MAX_ANALYSIS_BYTES+65536
  if(Number(req.headers.get('content-length'))>limit) throw new AnalysisError('Document trop volumineux : 3 Mo maximum.',413)
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new AnalysisError('Format de requête invalide.')
  const reader=req.body?.getReader(); if(!reader) throw new AnalysisError('Document manquant.')
  const chunks:Uint8Array[]=[]; let size=0
  try {
    while(true) {
      const {done,value}=await reader.read(); if(done) break
      size+=value.byteLength
      if(size>limit) { await reader.cancel(); throw new AnalysisError('Document trop volumineux : 3 Mo maximum.',413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers.get('content-type')!}}).formData()
  const files=[...form.values()]
  if(files.length!==1||typeof files[0]==='string'||!files[0].size||files[0].size>MAX_ANALYSIS_BYTES) throw new AnalysisError('Un seul document, de 3 Mo maximum, par analyse.')
  const file=files[0]
  if(!/\.(pdf|jpe?g|png)$/i.test(file.name)) throw new AnalysisError('Formats acceptés : PDF, JPG et PNG.')
  return {name:file.name.slice(0,200),bytes:new Uint8Array(await file.arrayBuffer())}
}

export async function POST(req:Request) {
  if(!sameOrigin(req)) return json({error:'Origine non autorisée.'},403)
  let admin:ReturnType<typeof createAdminClient>|undefined, reservation:string|undefined, owner:string|undefined
  try {
    const db=await createClient(); const {data:{user},error}=await db.auth.getUser()
    if(error||!user||user.is_anonymous) return json({error:'Connectez-vous pour analyser vos documents.'},401)
    if(!user.email_confirmed_at) return json({error:'Confirmez votre adresse email avant l’analyse.'},403)
    const denied = await subscriptionApiError(db, user.id)
    if (denied) return denied
    if(!process.env.OPENAI_API_KEY) return json({error:'L’analyse automatique n’est pas configurée. La saisie manuelle reste disponible.'},503)
    const {bytes,name}=await readDocument(req)
    owner=user.id; admin=createAdminClient()
    // Version the analysis cache when extraction rules change, while keeping documents private.
    const hash=createHash('sha256').update('cashlance-invoice-v4\0').update(bytes).digest('hex')
    const {data:slot,error:quotaError}=await admin.rpc('reserve_import_analysis',{p_user_id:owner,p_hash:hash})
    if(quotaError||!slot) throw new AnalysisError('Protection des analyses indisponible. Vérifiez la migration avant de réessayer.',503)
    if(slot.status==='cached') return json({row:{...validateExtraction(slot.result),source:name},cached:true})
    if(slot.status==='busy') throw new AnalysisError('Une analyse est déjà en cours. Attendez sa fin avant de réessayer.',409)
    if(slot.status==='limited') throw new AnalysisError('Limite d’analyses atteinte. Réessayez plus tard ou utilisez Excel/CSV ou la saisie manuelle.',429)
    if(slot.status!=='new'||typeof slot.id!=='string') throw new AnalysisError('Analyse indisponible.',503)
    reservation=slot.id
    const mime=await inspectDocument(bytes,name)
    const extraction=await analyzeWithOpenAI(bytes,mime)
    const {error:saveError}=await admin.from('import_analyses').update({status:'completed',result:extraction}).eq('id',reservation).eq('user_id',owner)
    reservation=undefined
    if(saveError) throw new AnalysisError('Analyse terminée mais sauvegarde indisponible. Attendez avant de réessayer.',503)
    return json({row:{...validateExtraction(extraction),source:name},cached:false})
  } catch(error) {
    if(admin&&reservation&&owner) {
      try { await admin.from('import_analyses').update({status:'failed'}).eq('id',reservation).eq('user_id',owner) } catch { /* Never log documents, credentials or provider responses. */ }
    }
    return json({error:error instanceof AnalysisError?error.message:'Analyse indisponible. Réessayez plus tard ou complétez manuellement.'},error instanceof AnalysisError?error.status:503)
  }
}
