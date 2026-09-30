import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fields } from '../lib/imports/model'
import { analyzeWithOpenAI, validateExtraction } from '../lib/imports/openai'
import { inspectDocument } from '../lib/imports/analysis-document'
import { MAX_ANALYSIS_BYTES } from '../lib/imports/analysis-limits'
const m=vi.hoisted(()=>({user:{id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-09-30'} as {id:string;email_confirmed_at?:string;is_anonymous?:boolean}|null,rpc:vi.fn(),update:vi.fn(),from:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:m.user},error:null})}})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc,from:m.from})}))
import { POST } from '../app/api/imports/analyze/route'
const extraction=(extra:Record<string,unknown>={})=>({...Object.fromEntries([...Object.keys(fields),'issuer'].map(k=>[k,null])),isInvoice:true,client:'CLIENT TEST',issuer:'VENDEUR TEST',invoiceNumber:'TEST-001',total:'1280.00',currency:'EUR',...extra})
const reply=(value:unknown)=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]})
const file=(name='invoice.pdf')=>new File([readFileSync(`tests/fixtures/${name}`)],name)
function request(files=[file()],origin='https://cashlance.fretixo.fr') {
  const form=new FormData();files.forEach(f=>form.append('document',f))
  return new Request('https://cashlance.fretixo.fr/api/imports/analyze',{method:'POST',headers:{origin},body:form})
}
beforeEach(()=>{
  vi.stubEnv('OPENAI_API_KEY','fake-unit-only')
  m.user={id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-09-30'}
  m.rpc.mockResolvedValue({data:{status:'new',id:'33333333-3333-4333-8333-333333333333'},error:null})
  m.update.mockReturnValue({eq:()=>({eq:async()=>({error:null})})});m.from.mockReturnValue({update:m.update})
  vi.mocked(fetch).mockResolvedValue(Response.json(reply(extraction())))
})
afterEach(()=>vi.unstubAllEnvs())
it.each(['invoice.pdf','scanned.pdf','invoice.jpg','invoice.png','french-screenshot.png'])('analyzes synthetic %s through authenticated server only',async(name)=>{
  const res=await POST(request([file(name)]));expect(res.status).toBe(200)
  const {row}=await res.json();expect(row).toMatchObject({client:'CLIENT TEST',issuer:'VENDEUR TEST',confirmed:false,email:'',due:'',amount:'',total:'1280.00'})
  expect(fetch).toHaveBeenCalledTimes(1)
  const options=vi.mocked(fetch).mock.calls[0][1]!,body=JSON.parse(options.body as string)
  expect(body).toMatchObject({store:false,model:'gpt-4.1-mini-2025-04-14',max_output_tokens:2200,text:{format:{strict:true}}})
  expect(body).not.toHaveProperty('tools');expect(body.input[0].content[0].type).toBe(name.endsWith('.pdf')?'input_file':'input_image')
  expect(m.rpc).toHaveBeenCalledWith('reserve_import_analysis',expect.objectContaining({p_user_id:m.user!.id,p_hash:expect.stringMatching(/^[a-f0-9]{64}$/)}))
  expect(m.from.mock.calls.every(([table])=>table==='import_analyses')).toBe(true)
},15000)
it('recognizes explicitly payable French amounts without assuming TTC equals the balance',async()=>{
  const payable='115.36'
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(reply(extraction({total:'115.36',amount:payable}))))
  const response=await POST(request([file()]))
  expect(response.status).toBe(200)
  expect((await response.json()).row).toMatchObject({amount:payable,total:'115.36',confirmed:false})
  const requestBody=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
  expect(requestBody.instructions).toContain('Net à payer en Euro')
  expect(requestBody.instructions).toContain('Un simple « Total TTC » ne suffit jamais')
})
it('keeps missing email, due and remaining balance empty; never copies TTC',()=>{
  expect(validateExtraction(extraction({paymentTerms:'Paiement à 45 jours'}))).toMatchObject({email:'',due:'',amount:'',total:'1280.00',paymentTerms:'Paiement à 45 jours',confirmed:false})
})
it('drops malformed extracted customer emails',()=>{
  expect(validateExtraction(extraction({email:'client@gmail.c'}))).toMatchObject({email:''})
})
it('strictly rejects extra fields, wrong types, non-invoices, and invalid data formats',()=>{
  for(const v of [extraction({confirmed:true}),extraction({total:1280}),extraction({isInvoice:false})])expect(()=>validateExtraction(v)).toThrow()
  expect(validateExtraction(extraction({due:'2026-02-31',email:'invalid',amount:'invented',currency:'euros'}))).toMatchObject({due:'',email:'',amount:'',currency:''})
})
it('checks origin, login, confirmed email and key before any paid call',async()=>{
  expect((await POST(request([file()],'https://evil.invalid'))).status).toBe(403)
  m.user=null;expect((await POST(request())).status).toBe(401)
  m.user={id:'user'};expect((await POST(request())).status).toBe(403)
  m.user={id:'user',email_confirmed_at:'yes',is_anonymous:true};expect((await POST(request())).status).toBe(401)
  m.user={id:'user',email_confirmed_at:'yes'};vi.stubEnv('OPENAI_API_KEY','')
  expect((await POST(request())).status).toBe(503);expect(fetch).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled()
})
it('rejects batches, oversized uploads, spoofed formats and encrypted/corrupt PDFs',async()=>{
  expect((await POST(request([file(),file()]))).status).toBe(400)
  expect((await POST(request([new File([new Uint8Array(MAX_ANALYSIS_BYTES+1)],'large.pdf')]))).status).toBe(400)
  for(const name of ['fake.pdf','fake.png','fake.jpg'])expect((await POST(request([new File(['not a document'],name)]))).status).toBe(400)
  await expect(inspectDocument(new TextEncoder().encode('%PDF-1.7 invalid'),'broken.pdf')).rejects.toThrow('PDF illisible')
  await expect(inspectDocument(new Uint8Array(readFileSync('tests/fixtures/too-many-pages.pdf')),'too-many-pages.pdf')).rejects.toThrow('3 pages maximum')
  // Use a network-style stream rather than Undici's asynchronous FormData encoder.
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_ANALYSIS_BYTES+70000));c.close()}})
  const oversized=new Request('https://cashlance.fretixo.fr/api/imports/analyze',{method:'POST',headers:{origin:'https://cashlance.fretixo.fr','content-type':'multipart/form-data; boundary=test'},body:stream,duplex:'half'} as RequestInit)
  expect((await POST(oversized)).status).toBe(413)
  expect(fetch).not.toHaveBeenCalled()
})
it('does not call OpenAI for cached documents or unavailable quota protection',async()=>{
  m.rpc.mockResolvedValueOnce({data:{status:'cached',result:extraction()},error:null})
  expect((await (await POST(request())).json()).cached).toBe(true)
  for(const [status,code] of [['busy',409],['limited',429]] as const){m.rpc.mockResolvedValueOnce({data:{status},error:null});expect((await POST(request())).status).toBe(code)}
  m.rpc.mockResolvedValueOnce({error:{message:'database private information'}})
  expect((await POST(request())).status).toBe(503);expect(fetch).not.toHaveBeenCalled()
})
it.each([429,500])('sanitizes provider HTTP %s and does not retry',async(status)=>{
  vi.mocked(fetch).mockResolvedValue(new Response('private invoice and secret',{status}))
  const r=await POST(request());expect(r.status).toBe(status===429?429:502)
  expect(await r.text()).not.toContain('private');expect(fetch).toHaveBeenCalledTimes(1)
  expect(m.update).toHaveBeenCalledWith({status:'failed'})
})
it('handles timeout and refuses incomplete, refused or malformed outputs',async()=>{
  vi.mocked(fetch).mockRejectedValueOnce(new DOMException('private','TimeoutError'))
  expect((await POST(request())).status).toBe(504)
  for(const response of [{status:'incomplete'}, {status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]},reply({foo:'secret'})]) {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(response))
    await expect(analyzeWithOpenAI(new Uint8Array([1]),'image/png')).rejects.toThrow()
  }
})
