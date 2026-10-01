// Isolated test services: loopback only, fake users, no provider keys or real emails.
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
// The real application route runs; only the external provider is replaced in this test process.
const nativeFetch=globalThis.fetch
const samples=new Map(['invoice.pdf','invoice2.pdf','invoice.png','invoice.jpg','french-screenshot.png','scanned.pdf','missing-email.pdf','missing-due.pdf'].map(name=>[createHash('sha256').update(readFileSync(`tests/fixtures/${name}`)).digest('hex'),name]))
globalThis.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url
  if(url==='https://api.openai.com/v1/responses') {
    openaiCalls++
    const body=JSON.parse(init.body), doc=body.input[0].content[0]
    const bytes=Buffer.from((doc.file_data||doc.image_url).split(',')[1],'base64')
    const name=samples.get(createHash('sha256').update(bytes).digest('hex'))
    if(!name) throw new Error('Unknown synthetic fixture')
    const french=['french-screenshot.png','scanned.pdf','missing-email.pdf','missing-due.pdf'].includes(name)
    const data={...Object.fromEntries(body.text.format.schema.required.map(k=>[k,null])),isInvoice:true,
      issuer:french?'EMETTEUR SAS':'FOURNISSEUR SAS',client:french?'DUPONT CONSTRUCTION SAS':'MARTIN SARL',
      email:french?'acheteur@example.invalid':'compta@example.invalid',invoiceNumber:name==='invoice2.pdf'?'FA-261':french?'FA-2026-123':'FA-260',
      invoiceDate:'2026-09-01',due:french?'2026-10-16':'2026-09-30',amount:french?'800,00':'1280,00',total:french?'1200,00':'1280,00',currency:'EUR'}
    if(name==='missing-email.pdf')data.email=null
    if(name==='missing-due.pdf')data.due=null
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]})
  }
  if(new URL(url).hostname==='api.stripe.com') {
    const p=new URL(url).pathname
    if(p==='/v1/checkout/sessions'&&init?.method==='POST') return Response.json({id:'cs_test',url:'http://127.0.0.1:3027/billing/return?session_id=cs_test'})
    if(p==='/v1/checkout/sessions/cs_test') return Response.json({id:'cs_test',mode:'subscription',status:'complete',customer:'cus_test',subscription:'sub_test',client_reference_id:org.id,metadata:{organization_id:org.id}})
    if(p==='/v1/subscriptions/sub_test') return Response.json({id:'sub_test',customer:'cus_test',created:123,status:'trialing',metadata:{organization_id:org.id,plan:'pro'},items:{data:[]}})
    throw Error('Unknown synthetic Stripe operation')
  }
  if(!['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw new Error('External network forbidden in E2E')
  return nativeFetch(input,init)
}
const id='11111111-1111-4111-8111-111111111111'
let user,org,draft,invoices,events,state,analyses,openaiCalls
function reset(){user={id,aud:'authenticated',role:'authenticated',email:'test@example.invalid',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},identities:[]};org=null;draft=null;invoices=[];events=[];state=null;analyses=[];openaiCalls=0}
reset()
const token=()=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url')}.test-signature`
const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3027');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS')
  if(req.method==='OPTIONS'){res.end();return}
  const url=new URL(req.url,'http://127.0.0.1:54440');let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):null
  const send=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}
  if(url.pathname==='/reset'){reset();return send({ok:true})}
  if(url.pathname==='/subscription') {org={...org,subscription_status:body.status||'trialing',stripe_subscription_id:body.subscription===null?null:'sub_test',stripe_customer_id:'cus_test'};return send({ok:true})}
  if(url.pathname==='/shutdown'){send({ok:true});setTimeout(()=>process.exit(0),100);return}
  if(url.pathname==='/inspect')return send({org,invoices,events,draft,state,metadata:user.user_metadata,openaiCalls})
  if(url.pathname.startsWith('/auth/v1/')){
    if(url.pathname.endsWith('/user'))return send(user)
    if(body?.data)user.user_metadata=body.data
    return send({access_token:token(),refresh_token:'local-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})
  }
  const table=url.pathname.split('/').pop()
  if(table==='sync_stripe_subscription') {org={...org,subscription_status:body.p_status,stripe_subscription_id:body.p_subscription};return send(org)}
  if(table==='manage_invoice_server'){
    const inv=invoices.find(i=>i.id===body.target_invoice)
    if(inv&&body.action==='paid')inv.status='paid'
    return send({ok:true,action:body.action})
  }
  if(table==='reserve_import_analysis') {
    const cached=analyses.find(a=>a.hash===body.p_hash&&a.status==='completed')
    if(cached)return send({status:'cached',result:cached.result})
    const a={id:crypto.randomUUID(),hash:body.p_hash,status:'pending'};analyses.push(a);return send({status:'new',id:a.id})
  }
  if(table==='import_analyses'&&req.method==='PATCH') {Object.assign(analyses.find(a=>'eq.'+a.id===url.searchParams.get('id')),body);return send(null)}
  if(table==='confirm_import_server'){
    if(!body.rows.every(r=>r.confirmed&&r.currency==='EUR')){res.statusCode=400;return send({message:'review_required'})}
    for(const r of body.rows)invoices.push({id:crypto.randomUUID(),invoice_number:r.invoiceNumber,amount_cents:r.amount_cents,due_date:r.due,status:'open',import_key:r.invoiceNumber,import_details:r.details,reminder_scenario:body.schedule?body.scenario:null,customers:{name:r.client,email:r.email}})
    draft=null;state={...state,stage:body.schedule?'scheduled':'draft'};return send({created:body.rows.length,duplicates:0,scheduled:body.schedule?body.rows.length*3:0})
  }
  if(table==='activate_imported_invoice_server'){const inv=invoices.find(i=>i.id===body.target_invoice);if(inv){inv.reminder_scenario=body.chosen_scenario;inv.customers.email=body.confirmed_email}return send(3)}
  if(req.method==='POST'||req.method==='PATCH'){
    if(table==='organizations')org ||= {id:'33333333-3333-4333-8333-333333333333',created_at:new Date().toISOString(),subscription_status:'cancelled',stripe_customer_id:'cus_test',stripe_subscription_id:null,...body}
    if(table==='onboarding_state')state={...state,...body}
    if(table==='funnel_events')events.push(body)
    if(table==='import_drafts')draft={...body}
    return send(null)
  }
  if(req.method==='DELETE'){if(table==='import_drafts')draft=null;return send(null)}
  let data=table==='organizations'?org:table==='onboarding_state'?state:table==='import_drafts'?draft:table==='invoices'?invoices:[]
  const single=req.headers.accept?.includes('vnd.pgrst.object')
  if(!single&&!Array.isArray(data))data=data?[data]:[]
  send(data)
})
server.listen(54440,'127.0.0.1')
Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54440',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-test-publishable',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3027',SUPABASE_SECRET_KEY:'local-test-service',STRIPE_SECRET_KEY:'sk_test_local_only',STRIPE_PRICE_PRO:'price_test',RESEND_API_KEY:'',OPENAI_API_KEY:'fake-local-test-only',CASHLANCE_ONBOARDING_EMAILS:'false',NEXT_TELEMETRY_DISABLED:'1'})
const next=(await import('next')).default
const app=next({dev:true,hostname:'127.0.0.1',port:3027});await app.prepare()
const appServer=createServer(app.getRequestHandler());appServer.listen(3027,'127.0.0.1')
const stop=()=>{appServer.close();server.close();process.exit()};process.on('SIGTERM',stop);process.on('SIGINT',stop)
