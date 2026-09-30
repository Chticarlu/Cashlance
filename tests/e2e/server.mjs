// Isolated test services: loopback only, fake users, no provider keys or real emails.
import {createServer} from 'node:http'
const id='11111111-1111-4111-8111-111111111111'
let user,org,draft,invoices,events,state
function reset(){user={id,aud:'authenticated',role:'authenticated',email:'test@example.invalid',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},identities:[]};org=null;draft=null;invoices=[];events=[];state=null}
reset()
const token=()=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url')}.test-signature`
const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3027');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS')
  if(req.method==='OPTIONS'){res.end();return}
  const url=new URL(req.url,'http://127.0.0.1:54440');let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):null
  const send=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}
  if(url.pathname==='/reset'){reset();return send({ok:true})}
  if(url.pathname==='/shutdown'){send({ok:true});setTimeout(()=>process.exit(0),100);return}
  if(url.pathname==='/inspect')return send({invoices,events,draft,state,metadata:user.user_metadata})
  if(url.pathname.startsWith('/auth/v1/')){
    if(url.pathname.endsWith('/user'))return send(user)
    if(body?.data)user.user_metadata=body.data
    return send({access_token:token(),refresh_token:'local-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})
  }
  const table=url.pathname.split('/').pop()
  if(table==='confirm_import'){
    if(!body.rows.every(r=>r.confirmed&&r.currency==='EUR')){res.statusCode=400;return send({message:'review_required'})}
    for(const r of body.rows)invoices.push({id:crypto.randomUUID(),invoice_number:r.invoiceNumber,amount_cents:r.amount_cents,due_date:r.due,status:'open',import_key:r.invoiceNumber,reminder_scenario:body.schedule?body.scenario:null,customers:{name:r.client,email:r.email}})
    draft=null;state={...state,stage:body.schedule?'scheduled':'draft'};return send({created:body.rows.length,duplicates:0,scheduled:body.schedule?body.rows.length*3:0})
  }
  if(table==='activate_imported_invoice'){const inv=invoices.find(i=>i.id===body.target_invoice);if(inv){inv.reminder_scenario=body.chosen_scenario;inv.customers.email=body.confirmed_email}return send(3)}
  if(req.method==='POST'||req.method==='PATCH'){
    if(table==='organizations')org ||= {id:'33333333-3333-4333-8333-333333333333',created_at:new Date().toISOString(),subscription_status:'trialing',stripe_customer_id:null,...body}
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
Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54440',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-test-publishable',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3027',SUPABASE_SECRET_KEY:'local-test-service',STRIPE_SECRET_KEY:'',RESEND_API_KEY:'',CASHLANCE_ONBOARDING_EMAILS:'false',NEXT_TELEMETRY_DISABLED:'1'})
const next=(await import('next')).default
const app=next({dev:true,hostname:'127.0.0.1',port:3027});await app.prepare()
const appServer=createServer(app.getRequestHandler());appServer.listen(3027,'127.0.0.1')
const stop=()=>{appServer.close();server.close();process.exit()};process.on('SIGTERM',stop);process.on('SIGINT',stop)
