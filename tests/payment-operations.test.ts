import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requestRefund } from '../server/paymentOperations.ts'

test('refund uses persisted remaining amount and stable idempotency; mismatches and unsafe retries cannot call Stripe', async () => {
 process.env.STRIPE_MODE='test'
 const stripe=new Stripe('sk_test_fixture_only')
 const r={attempt_id:'attempt',session_id:'cs_test_fixture',payment_intent:'pi_fixture',amount_cents:30000,original_cents:30000,livemode:false,created_at:new Date().toISOString(),offer_id:'offer',milestone_id:'milestone',project_id:'project',customer_id:'customer'}
 const session={mode:'payment',payment_status:'paid',currency:'eur',amount_total:30000,payment_intent:r.payment_intent,livemode:false,metadata:{application:'upnology',attempt_id:r.attempt_id,milestone_id:r.milestone_id,installment_id:r.milestone_id,quote_id:r.offer_id,project_id:r.project_id,customer_id:r.customer_id}}
 mock.method(stripe.checkout.sessions,'retrieve',async()=>session)
 const calls: {amount:number;key:string}[]=[]
 mock.method(stripe.refunds,'create',async(p: Stripe.RefundCreateParams, options: Stripe.RequestOptions)=>{calls.push({amount:p.amount!,key:options.idempotencyKey!});return {id:'re_fixture',status:'pending'}})
 try {
  const dependencies={stripe,reserve:async()=>r}
  for(let i=0;i<2;i++) assert.equal((await requestRefund({} as SupabaseClient,r.attempt_id,dependencies)).status,'pending')
  assert.deepEqual(calls,[{amount:30000,key:'upnology-refund-attempt'},{amount:30000,key:'upnology-refund-attempt'}])
  await assert.rejects(()=>requestRefund({} as SupabaseClient,r.attempt_id,{stripe,reserve:async()=>({...r,created_at:new Date(Date.now()-24*3600000).toISOString()})}),/finestra sicura/)
  session.metadata.project_id='foreign-project'
  await assert.rejects(()=>requestRefund({} as SupabaseClient,r.attempt_id,dependencies),/non corrispondente/)
  assert.equal(calls.length,2)
 } finally { mock.restoreAll() }
})
