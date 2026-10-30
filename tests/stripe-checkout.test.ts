import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createCheckout, fiscalOptions, stripeClient, type Attempt } from '../server/payments.ts'
import { features } from '../server/config.ts'

test('Checkout SDK request uses persisted 300 EUR, linkage, stable idempotency and safe fiscal defaults', async () => {
 process.env.APP_URL='https://upnology.agency';process.env.STRIPE_MODE='test'
 delete process.env.STRIPE_SANDBOX_INVOICES;delete process.env.STRIPE_TAX_ENABLED
 const stripe=new Stripe('sk_test_fixture')
 const attempt:Attempt={id:'attempt',milestone_id:'milestone',offer_id:'quote',project_id:'project',customer_user_id:'customer',integration_version:2,phase:1,amount_cents:30000,expires_at:new Date(Date.now()+3600000).toISOString(),session_id:null,status:'creating',title:'Sito',email:'alice@example.com'}
 const requests:Stripe.Checkout.SessionCreateParams[]=[],keys:string[]=[]
 let canonical:Stripe.Checkout.Session
 const create=mock.method(stripe.checkout.sessions,'create',async (params:Stripe.Checkout.SessionCreateParams,opts:Stripe.RequestOptions)=>{
  requests.push(params);keys.push(opts.idempotencyKey!)
  canonical={id:'cs_test_fixture',mode:'payment',livemode:false,status:'open',url:'https://checkout.stripe.com/test',metadata:params.metadata,amount_total:30000,currency:'eur',payment_status:'unpaid'} as Stripe.Checkout.Session
  return canonical
 })
 const retrieve=mock.method(stripe.checkout.sessions,'retrieve',async()=>canonical)
 const persisted:Record<string,unknown>[]=[]
 const dependencies={stripe,reserve:async()=>attempt,persist:async(_action:string,data:Record<string,unknown>)=>{persisted.push(data)}}
 try {
  const client={} as SupabaseClient
  await createCheckout(client,'milestone',dependencies);await createCheckout(client,'milestone',dependencies)
  assert.equal(requests[0].line_items![0].price_data!.unit_amount,30000)
  assert.equal(requests[0].metadata!.project_id,'project');assert.equal(requests[0].metadata!.customer_id,'customer')
  assert.equal(requests[0].metadata!.quote_id,'quote');assert.equal(requests[0].metadata!.installment_id,'milestone')
  assert.deepEqual(requests[0].payment_intent_data!.metadata,requests[0].metadata)
  assert.deepEqual(keys,['upnology-checkout-attempt','upnology-checkout-attempt'])
  assert.deepEqual(requests[0].automatic_tax,{enabled:false});assert.deepEqual(requests[0].invoice_creation,{enabled:false})
  assert.equal(persisted[0].amount_cents,30000)
  attempt.session_id=canonical!.id
  await createCheckout(client,'milestone',dependencies);assert.equal(create.mock.callCount(),2)
  canonical!.amount_total=1
  await assert.rejects(()=>createCheckout(client,'milestone',dependencies),/non corrispondente/)
  canonical!.amount_total=30000;canonical!.metadata!.project_id='other'
  await assert.rejects(()=>createCheckout(client,'milestone',dependencies),/Riferimenti/)
  attempt.session_id=null;process.env.STRIPE_SANDBOX_INVOICES='true'
  await createCheckout(client,'milestone',dependencies)
  assert.equal(requests[2].invoice_creation!.enabled,true)
  assert.equal(requests[2].invoice_creation!.invoice_data!.metadata!.quote_id,'quote')
  process.env.STRIPE_MODE='live';assert.throws(fiscalOptions,/solo in sandbox/)
  process.env.STRIPE_MODE='test';process.env.STRIPE_TAX_ENABLED='true';assert.throws(fiscalOptions,/configurazione fiscale/)
 } finally {
  create.mock.restore();retrieve.mock.restore()
  delete process.env.STRIPE_SANDBOX_INVOICES;delete process.env.STRIPE_TAX_ENABLED
  process.env.STRIPE_MODE='test'
 }
})

test('restricted keys support both modes, reject mismatches, and remain disabled without activation', async () => {
 const previous={...process.env}
 try {
  Object.assign(process.env,{COMMERCIAL_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',APP_URL:'https://upnology.agency',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ENABLED:'true'})
  for(const mode of ['live','test']) {
   process.env.STRIPE_MODE=mode
   for(const kind of ['rk','sk']) {
    process.env.STRIPE_SECRET_KEY=`${kind}_${mode}_fixture`
    assert.equal(typeof stripeClient().checkout.sessions.create, 'function') // SDK factory construction only; no network requests.
    assert.equal(features().payments,true)
   }
   process.env.STRIPE_SECRET_KEY=`rk_${mode==='live'?'test':'live'}_fixture`
   assert.throws(stripeClient,/incoerente/)
   assert.equal(features().payments,false)
  }
  process.env.STRIPE_MODE='live';process.env.STRIPE_SECRET_KEY='rk_live_fixture';process.env.STRIPE_ENABLED='false'
  assert.throws(stripeClient,/non ancora attivati/)
  assert.equal(features().payments,false)
  process.env.STRIPE_ENABLED='true'
  for (const origin of ['http://localhost:5173','https://example.com/path','invalid']) {
   process.env.APP_URL=origin
   assert.equal(features().payments,false)
   assert.throws(stripeClient,/non ancora attivati/)
  }
  process.env.APP_URL='https://upnology.agency';process.env.STRIPE_WEBHOOK_SECRET='   '
  assert.equal(features().payments,false)
 } finally {
  for(const key of Object.keys(process.env)) if(!(key in previous)) delete process.env[key]
  Object.assign(process.env,previous)
 }
})
