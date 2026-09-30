import type { SupabaseClient } from '@supabase/supabase-js'
import type { Resend } from 'resend'
import { getAppUrl } from './app-url'
type State={stage:string;created_at:string;updated_at:string}
export function onboardingMessage(state:State,org:{created_at:string;subscription_status:string;stripe_subscription_id:string|null},now=new Date()) {
  const age=(now.getTime()-new Date(org.created_at).getTime())/86400000
  const idle=(now.getTime()-new Date(state.updated_at).getTime())/86400000
  if(org.subscription_status==='trialing'&&!org.stripe_subscription_id&&age>=12&&age<14) return {kind:'trial_end',subject:'Votre essai CashLance se termine bientôt',text:'Votre essai gratuit arrive à son terme. Choisissez votre abonnement pour continuer les relances.',path:'/pricing'}
  if(state.stage==='scheduled') return {kind:'activated',subject:'Votre première relance CashLance est programmée ✓',text:'Retrouvez vos créances et les prochaines actions dans votre tableau de bord.',path:'/dashboard'}
  if(idle<1||age>=14) return null
  if(state.stage==='review') return {kind:'review',subject:'Votre import CashLance attend votre validation',text:'Vérifiez les informations et complétez ce qui manque. Aucun envoi avant votre confirmation.',path:'/import'}
  if(state.stage==='draft') return {kind:'schedule',subject:'Votre facture est prête',text:'Programmez maintenant ses relances après avoir vérifié le destinataire et le scénario.',path:'/dashboard'}
  return {kind:'welcome',subject:'Votre compte CashLance est prêt',text:'Importez votre première facture pour préparer votre première relance. Vous pouvez aussi tester avec un exemple.',path:'/onboarding'}
}
// Opt-in only, at most one message per day and per milestone. All provider calls
// use stable idempotency keys. Failed/ambiguous deliveries are not retried blindly.
export async function sendOnboardingEmails(db:SupabaseClient,resend:Resend) {
  if(process.env.CASHLANCE_ONBOARDING_EMAILS!=='true') return 0
  const {data:states,error}=await db.from('onboarding_state').select('user_id,stage,created_at,updated_at').eq('opted_in',true).gte('created_at',new Date(Date.now()-14*86400000).toISOString()).order('created_at').limit(100)
  if(error) return 0
  let sent=0
  for(const state of states||[]) {
    const {data:org}=await db.from('organizations').select('created_at,subscription_status,stripe_subscription_id').eq('owner_id',state.user_id).maybeSingle()
    if(!org) continue
    const message=onboardingMessage(state,org); if(!message) continue
    const {data:deliveries,error:readError}=await db.from('onboarding_email_deliveries').select('kind,created_at').eq('user_id',state.user_id)
    if(readError||deliveries?.some(d=>d.kind===message.kind||Date.now()-new Date(d.created_at).getTime()<86400000)) continue
    const {data:{user},error:authError}=await db.auth.admin.getUserById(state.user_id)
    if(authError||!user?.email||!user.email_confirmed_at) continue
    const {data:latest}=await db.from('onboarding_state').select('opted_in,stage').eq('user_id',state.user_id).maybeSingle()
    if(!latest?.opted_in||latest.stage!==state.stage) continue
    const {error:claimError}=await db.from('onboarding_email_deliveries').insert({user_id:state.user_id,kind:message.kind})
    if(claimError) continue
    try {
      const {error:sendError}=await resend.emails.send({from:process.env.CASHLANCE_FROM_EMAIL!,to:[user.email],subject:message.subject,text:`${message.text}\n\n${getAppUrl()}${message.path}\n\nDésactiver ces rappels : ${getAppUrl()}/dashboard (Préférences emails).`},{idempotencyKey:`onboarding/${state.user_id}/${message.kind}`})
      await db.from('onboarding_email_deliveries').update({state:sendError?'failed':'sent'}).eq('user_id',state.user_id).eq('kind',message.kind)
      if(!sendError) sent++
    } catch { await db.from('onboarding_email_deliveries').update({state:'failed'}).eq('user_id',state.user_id).eq('kind',message.kind) }
  }
  return sent
}
