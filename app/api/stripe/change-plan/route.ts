import {NextResponse} from 'next/server'
import {getAppUrl} from '@/lib/app-url'
import {createClient} from '@/lib/supabase/server'
import {createAdminClient} from '@/lib/supabase/admin'
import {getStripe,getStripePriceId} from '@/lib/stripe'
import {sameOrigin} from '@/lib/imports/server'

export async function POST(req:Request){
 if(!sameOrigin(req)) return new NextResponse(null,{status:403})
 const appUrl=getAppUrl()
 const back=(error:string)=>NextResponse.redirect(new URL('/account/billing?error='+encodeURIComponent(error),appUrl),303)
 const db=await createClient()
 const {data:{user}}=await db.auth.getUser()
 if(!user) return NextResponse.redirect(new URL('/login',appUrl),303)
 const admin=createAdminClient()
 const {data:org,error}=await admin.from('organizations')
  .select('stripe_customer_id,stripe_subscription_id,subscription_status')
  .eq('owner_id',user.id).maybeSingle()
 if(error||!org?.stripe_customer_id||!org.stripe_subscription_id||
   !['active','trialing'].includes(org.subscription_status||''))return back('unavailable')
 try{
  const stripe=getStripe()
  const sub=await stripe.subscriptions.retrieve(org.stripe_subscription_id)
  const customerId=typeof sub.customer==='string'?sub.customer:sub.customer.id
  if(customerId!==org.stripe_customer_id||!['active','trialing'].includes(sub.status)
    ||sub.items.data.length!==1||sub.cancel_at_period_end) return back('unavailable')
  const portal=await stripe.billingPortal.configurations.list({is_default:true,limit:1})
  const configuration=portal.data[0]
  const configuredPrices=new Set(configuration?.features.subscription_update.products.flatMap(p=>p.prices)||[])
  const allPrices=[getStripePriceId('solo'),getStripePriceId('pro'),getStripePriceId('team')]
  if(!configuration?.features.subscription_update.enabled||!allPrices.every(id=>configuredPrices.has(id)))
   return back('configuration')
  const session=await stripe.billingPortal.sessions.create({
   customer:org.stripe_customer_id,
   configuration:configuration.id,
   return_url:appUrl+'/account/billing',
   flow_data:{
    type:'subscription_update',
    subscription_update:{subscription:sub.id},
    after_completion:{type:'redirect',redirect:{return_url:appUrl+'/account/billing'}}
   }
  })
  return NextResponse.redirect(session.url,303)
 }catch{
  return back('portal')
 }
}
