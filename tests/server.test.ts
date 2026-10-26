import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import { PDFDocument } from 'pdf-lib'
import { handleRequest } from '../server/handler.ts'
import { features, protectedLink } from '../server/config.ts'
import { renderEmail, emailCopy, deliverEmails } from '../server/emails.ts'
import { handleStripeWebhook, normalizedPayment } from '../server/payments.ts'
import { renderDocument } from '../server/documents.ts'
import type { Offer, OfferSnapshot } from '../src/domain/commercial.ts'
const env = (enabled = false) => {
 process.env.COMMERCIAL_ENABLED = enabled ? 'true' : 'false'
 process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_ANON_KEY = 'test-anon'
 process.env.STRIPE_ENABLED = 'false'; process.env.RESEND_ENABLED = 'false'
}
const sample: OfferSnapshot = {
 title: 'Progetto è già pronto', description: 'Descrizione àèìòù — verifica completa',
 customer: { name: 'François Müller', address: 'Via Roma 10', tax_id: 'IT01234567890', email: 'alice@example.com' },
 supplier: { name: 'Upnology', address: 'Via Test 1', tax_id: 'IT09876543210' },
 items: [{ description: 'Sito web', amount_cents: 10001 }], subtotal_cents: 10001, tax_bps: 2200, tax_cents: 2200,
 total_cents: 12201, tax_label: 'IVA', currency: 'EUR', timeline: '30 giorni', payment_terms: 'Tranche a 7 giorni',
 revisions: 2, responsibilities: 'Responsabilità concordate', delivery_terms: 'Consegna dopo saldo', exclusions: 'Hosting escluso',
 percentages: [30,40,30], payment_due_days: [7,7,7], instalments: [3660,4880,3661],
}
const offer: Offer = {
 id: '22222222-2222-4222-8222-222222222222', customer_user_id: '33333333-3333-4333-8333-333333333333',
 request_id:null,previous_id:null,version:1,status:'ACCETTATO',snapshot:sample,template_id:'11111111-1111-4111-8111-111111111111',
 total_cents:12201,expires_at:'2099-01-01T00:00:00Z',created_at:'2026-10-15T10:00:00Z',accepted_at:'2026-10-15T10:01:00Z',project_id:null,
 project:null,milestones:[],releases:[],payments:[],events:[],emails:[],
 contract:{id:'44444444-4444-4444-8444-444444444444',snapshot:sample,body:'Condizioni approvate dal consulente. '.repeat(300),snapshot_hash:'a'.repeat(64),accepted_at:null,accepted_by:null,acceptance_text:null,created_at:'2026-10-15T10:01:00Z'},
}

test('API is fail-closed without integrations, including forged success URLs', async () => {
 env(false)
 const status=await handleRequest(new Request('https://example.com/api/commercial/status'))
 assert.equal(status.status,200);assert.equal((await status.json()).backend,false)
 assert.equal((await handleRequest(new Request('https://example.com/api?route=commercial/status'))).status,200)
 for(const [url,method] of [['/api/commercial/checkout','POST'],['/api/stripe/webhook','POST'],['/api/commercial/overview?payment=success','GET']]) {
  const r=await handleRequest(new Request(`https://example.com${url}`,{method}));assert.equal(r.status,503)
  assert.match(r.headers.get('Cache-Control')!,/no-store/)
 }
 assert.equal(features().payments,false)
})
test('HTTP authentication, cron authorization and protected origins', async () => {
 env(true)
 assert.equal((await handleRequest(new Request('https://example.com/api/commercial/overview'))).status,401)
 assert.equal((await handleRequest(new Request('https://example.com/api/jobs/commercial'))).status,401)
 process.env.DEMO_ALLOWED_ORIGINS='https://demo.example.com'
 assert.equal(protectedLink('https://demo.example.com/customer'), 'https://demo.example.com/customer')
 for(const url of ['javascript:alert(1)','http://demo.example.com','https://demo.example.com.attacker.test','https://user:pass@demo.example.com/','https://127.0.0.1']) assert.throws(()=>protectedLink(url))
})
test('document endpoint never returns another customer document', async () => {
 env(true)
 const f=mock.method(globalThis,'fetch',async (url: string | URL | Request) => {
  if(String(url).includes('/auth/v1/user')) return Response.json({id:'33333333-3333-4333-8333-333333333333',email:'bob@example.com',email_confirmed_at:'2026-10-01T00:00:00Z'})
  return Response.json({offers:[],templates:[]})
 })
 try {
  const response=await handleRequest(new Request(`https://example.com/api/commercial/document?offer_id=${offer.id}&kind=contract`,{headers:{Authorization:'Bearer test-token'}}))
  assert.equal(response.status,404);assert.equal(response.headers.get('Content-Type'),'application/json')
 } finally { f.mock.restore() }
})
test('Stripe SDK verifies raw signature, timestamp, mode and rejects tampering before DB access', async () => {
 env(true);process.env.STRIPE_ENABLED='true';process.env.STRIPE_MODE='test';process.env.STRIPE_SECRET_KEY='sk_test_not_real';process.env.STRIPE_WEBHOOK_SECRET='whsec_unit_test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';process.env.APP_URL='https://example.com'
 const stripe=new Stripe('sk_test_not_real')
 const payload=JSON.stringify({id:'evt_ignored',type:'customer.created',livemode:false,data:{object:{id:'cus_example'}}})
 const signature=stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_unit_test'})
 const request=(body:string,header:string)=>new Request('https://example.com/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':header},body})
 assert.deepEqual(await handleStripeWebhook(request(payload,signature)),{received:true,ignored:true})
 await assert.rejects(()=>handleStripeWebhook(request(payload+' ',signature)),/Firma webhook non valida/)
 const old=stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_unit_test',timestamp:Math.floor(Date.now()/1000)-600})
 await assert.rejects(()=>handleStripeWebhook(request(payload,old)),/Firma webhook non valida/)
 const live=payload.replace('"livemode":false','"livemode":true'), liveSig=stripe.webhooks.generateTestHeaderString({payload:live,secret:'whsec_unit_test'})
 await assert.rejects(()=>handleStripeWebhook(request(live,liveSig)),/Ambiente Stripe/)
})
test('canonical Stripe state distinguishes pending, failure, success and refunds', () => {
 const session={id:'cs_example',metadata:{attempt_id:offer.id},amount_total:12201,currency:'eur',status:'complete',payment_status:'unpaid',payment_intent:{id:'pi_example',status:'processing',latest_charge:null}} as unknown as Stripe.Checkout.Session
 assert.equal(normalizedPayment(session).state,'pending')
 const paid={...session,payment_status:'paid',payment_intent:{id:'pi_example',status:'succeeded',latest_charge:{amount_refunded:100}}} as unknown as Stripe.Checkout.Session
 assert.equal(normalizedPayment(paid).state,'paid');assert.equal(normalizedPayment(paid).refunded_cents,100)
 const failure={...session,status:'open',payment_intent:{id:'pi_example',status:'requires_payment_method',last_payment_error:{code:'card_declined'}}} as unknown as Stripe.Checkout.Session
 assert.equal(normalizedPayment(failure).state,'failed');assert.equal(normalizedPayment(failure).session_status,'open')
})
test('all 14 branded email templates escape untrusted fields and link to authenticated area', () => {
 assert.equal(Object.keys(emailCopy).length,14)
 for(const kind of Object.keys(emailCopy)) {
  const email=renderEmail({id:'job',lease_id:'lease',recipient:'alice@example.com',kind,payload:{name:'<script>alert(1)</script>',title:'A & B',offer_id:offer.id,message:'<img src=x onerror=alert(1)>'}},'https://example.com')
  assert.ok(email.subject.includes('Upnology'));assert.ok(email.html.includes('https://example.com/account#offer-'))
  assert.ok(!email.html.includes('<script>'));assert.ok(!email.html.includes('<img src=x'));assert.ok(email.html.includes('&lt;script&gt;'))
  assert.ok(!email.html.includes('sk_test'));assert.ok(email.text.includes('A & B'))
 }
})
test('PDF generation embeds Unicode, paginates long contracts and preserves accepted content', async () => {
 const quote=await renderDocument(offer,'quote'), contract=await renderDocument(offer,'contract')
 assert.equal(Buffer.from(quote).subarray(0,5).toString(),'%PDF-')
 const parsed=await PDFDocument.load(contract);assert.ok(parsed.getPageCount()>1)
 assert.equal(parsed.getAuthor(),'Upnology')
 assert.deepEqual(contract,await renderDocument(offer,'contract'))
 assert.deepEqual(offer.contract!.snapshot,offer.snapshot)
})

test('signed Stripe event re-reads canonical state before persisting any payment', async () => {
 env(true);process.env.STRIPE_ENABLED='true';process.env.STRIPE_MODE='test';process.env.STRIPE_SECRET_KEY='sk_test_not_real';process.env.STRIPE_WEBHOOK_SECRET='whsec_unit_test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';process.env.APP_URL='https://example.com'
 const stripe=new Stripe('sk_test_not_real')
 const canonical={id:'cs_test_example',mode:'payment',livemode:false,metadata:{attempt_id:offer.id},amount_total:12201,currency:'eur',status:'complete',payment_status:'paid',payment_intent:{id:'pi_example',status:'succeeded',latest_charge:{amount_refunded:0}}} as unknown as Stripe.Checkout.Session
 const retrieve=mock.method(stripe.checkout.sessions,'retrieve',async ()=>canonical)
 const payload=JSON.stringify({id:'evt_verified',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_example',amount_total:1}}})
 const signature=stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_unit_test'})
 const captured:Record<string,unknown>[]=[]
 const response=await handleStripeWebhook(new Request('https://example.com/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':signature},body:payload}),{stripe,persist:async (_action,data)=>{captured.push(data)}})
 assert.deepEqual(response,{received:true});assert.equal(retrieve.mock.callCount(),1)
 assert.equal(captured[0].amount_cents,12201);assert.equal(captured[0].state,'paid');assert.equal(captured[0].event_id,'evt_verified')
 retrieve.mock.restore()
})
test('Resend worker persists receipts and retries with identical payload and idempotency key', async () => {
 env(true);process.env.RESEND_ENABLED='true';process.env.RESEND_API_KEY='re_test_only';process.env.RESEND_FROM='Upnology <test@example.com>';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';process.env.APP_URL='https://example.com'
 const job={id:offer.id,lease_id:'lease-test',recipient:'alice@example.com',kind:'quote_available',payload:{name:'Alice',title:'Test project',offer_id:offer.id}}
 const sent:{key:string|null;body:string}[]=[],results:Record<string,unknown>[]=[]
 let failure=true
 const mocked=mock.method(globalThis,'fetch',async (url: string | URL | Request, init?: RequestInit)=>{
  const body=JSON.parse(String(init?.body))
  if(String(url).includes('/rest/v1/rpc/commercial_service')) {
   if(body.p_action==='claim_emails') return Response.json([job])
   results.push(body.p_data);return Response.json({})
  }
  assert.equal(String(url),'https://api.resend.com/emails')
  sent.push({key:new Headers(init?.headers).get('Idempotency-Key'),body:String(init?.body)})
  return failure ? Response.json({error:'rate_limit_exceeded'},{status:429}) : Response.json({id:'resend_accepted'})
 })
 try {
  assert.deepEqual(await deliverEmails(),{processed:1,sent:0});assert.equal(results[0].error,'Resend HTTP 429')
  failure=false;assert.deepEqual(await deliverEmails(),{processed:1,sent:1})
  assert.equal(results[1].provider_id,'resend_accepted');assert.deepEqual(sent[0],sent[1])
  process.env.RESEND_ENABLED='false';await assert.rejects(deliverEmails,/non ancora configurato/)
 } finally {mocked.mock.restore();process.env.RESEND_ENABLED='false'}
})

test('management endpoints reject anonymous and non-admin requests before privileged Stripe or email operations', async () => {
 env(true)
 for(const path of ['refund','receipt','email-templates']) {
  assert.equal((await handleRequest(new Request(`https://example.com/api/commercial/${path}`,{method:path==='email-templates'?'GET':'POST'}))).status,401)
 }
 const fetchMock=mock.method(globalThis,'fetch',async(url:string|URL|Request)=>{
  const target=String(url)
  if(target.includes('/auth/v1/user'))return Response.json({id:'33333333-3333-4333-8333-333333333333',email:'bob@example.com',email_confirmed_at:'2026-10-01T00:00:00Z'})
  if(target.includes('/rpc/admin_access'))return Response.json(false)
  throw new Error('Unexpected privileged request')
 })
 try {
  for(const path of ['refund','email-templates']){
   const response=await handleRequest(new Request(`https://example.com/api/commercial/${path}`,{method:path==='refund'?'POST':'GET',headers:{Authorization:'Bearer test-customer','Content-Type':'application/json'},...(path==='refund'?{body:JSON.stringify({attempt_id:'44444444-4444-4444-8444-444444444444',confirmed:true})}:{})}))
   assert.equal(response.status,403)
  }
 }finally{fetchMock.mock.restore()}
})
