import { test, mock } from 'node:test'
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createCheckout, handleStripeWebhook, syncPaymentAttempt, type Attempt } from '../server/payments.ts'
import { buildPipeline } from '../server/workspace.ts'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { milestoneAction } from '../src/domain/commercialFlow.ts'
import type { Offer, Milestone } from '../src/domain/commercial.ts'

test('isolated flow: request, quote, contract, three Checkouts, signed webhooks, shared panels and delivery', async () => {
 const db = new PGlite()
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,aud text,role text,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
   grant usage on schema auth to anon,authenticated,service_role;
   grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;`)
  const files = (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()
  const repair = '20261028000000_link_verified_quote_requests.sql'
  for (const file of files.filter(f => f !== repair)) await db.exec((await readFile(`supabase/migrations/${file}`, 'utf8')).replace(/^\uFEFF/, ''))
  const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222'
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'alice@example.com',now()),($2,'bob@example.com',null)", [alice,bob])
  const lead = async (email: string, owner: string | null = null) => (await db.query<{id:string}>("insert into upnology.leads(source,name,email,auth_user_id) values('preventivo','Local fixture',$1,$2) returning id", [email,owner])).rows[0].id
  const count = async (id: string) => Number((await db.query<{n:number}>('select count(*) n from upnology.customer_leads where lead_id=$1',[id])).rows[0].n)
  const before = await lead('alice@example.com')
  assert.equal(await count(before),0) // Reproduce the missing link before the migration.
  await db.exec(await readFile(`supabase/migrations/${repair}`, 'utf8'))
  assert.equal(await count(before),1)
  const after = await lead('ALICE@example.com')
  assert.equal(await count(after),1)
  assert.equal(await count(await lead('alice@example.com',bob)),0)
  const unverified = await lead('bob@example.com')
  assert.equal(await count(unverified),0)
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[bob])
  assert.equal(await count(unverified),1)
  await db.query('insert into upnology.admin_members(user_id) values($1)',[alice])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice])
  await db.query("select public.admin_set_lead_status($1,'accettato')",[after])
  for (const table of ['offers','contracts','projects','milestones','payment_attempts']) {
   assert.equal(Number((await db.query<{n:number}>(`select count(*) n from upnology.${table}`)).rows[0].n),0)
  }

  // Continue once through the real SQL commands, with no provider calls or paid events.
  const requestId = (await db.query<{id:string}>("insert into upnology.quote_requests(lead_id,services,budget,timeline,details) values($1,array['website'],'1000-2500','one-month','{}') returning id",[unverified])).rows[0].id
  const cmd = async (action: string, payload: Record<string, unknown>) => (await db.query<{value:{id:string}}>('select public.commercial_command($1,$2::jsonb) value',[action,JSON.stringify(payload)])).rows[0].value
  const read = async () => (await db.query<{value:{offers:Offer[]}}>('select public.commercial_overview() value')).rows[0].value.offers
  const role = async (id: string) => {
   await db.exec('reset role')
   await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[id])
   await db.exec('set role authenticated')
  }
  await role(alice)
  const template = await cmd('template',{title:'Local fixture',body:'Local verification contract only, not for production use.'})
  await cmd('approve_template',{id:template.id,confirmed:true,legal_reference:'Local fixture approval reference'})
  const snapshot = {
   title:'Local project',description:'Local flow verification',
   customer:{name:'Local Customer',address:'Local address',tax_id:'LOCAL123'},supplier:{name:'Local Supplier',address:'Local address',tax_id:'LOCAL456'},
   items:[{description:'Local service',amount_cents:100000}],tax_bps:0,tax_label:'Local tax fixture',
   timeline:'Local timeline',payment_terms:'Three phases',revisions:2,responsibilities:'Local responsibilities',delivery_terms:'Local delivery',exclusions:'Local exclusions',percentages:[30,40,30],payment_due_days:[7,7,7],
  }
  const saved = await cmd('save',{customer_user_id:bob,request_id:requestId,template_id:template.id,snapshot,expires_at:'2099-01-01T00:00:00Z'})
  await role(bob)
  assert.equal((await read()).length,0)
  await assert.rejects(() => cmd('send',{offer_id:saved.id}),/Admin access required/)
  await role(alice)
  await cmd('send',{offer_id:saved.id})
  await role(bob)
  assert.equal((await read())[0].status,'INVIATO')
  await cmd('accept',{offer_id:saved.id,confirmed:true})
  await cmd('accept',{offer_id:saved.id,confirmed:true})
  let offer = (await read())[0]
  assert.equal(offer.request_id,requestId)
  assert.equal(offer.customer_user_id,bob)
  assert.equal(offer.project_id,offer.project?.id)
  assert.ok(offer.contract)
  assert.deepEqual(offer.milestones.map(m => [m.phase,m.amount_cents,m.status]),[[1,30000,'BLOCCATO'],[2,40000,'BLOCCATO'],[3,30000,'BLOCCATO']])
  const reserve = async (id:string) => (await db.query<{value:{id:string;offer_id:string;project_id:string;customer_user_id:string}}>('select public.commercial_checkout($1) value',[id])).rows[0].value
  await assert.rejects(() => reserve(offer.milestones[0].id),/not payable/)
  await cmd('accept_contract',{offer_id:saved.id,confirmed:true,snapshot_hash:offer.contract.snapshot_hash})
  offer = (await read())[0]
  assert.equal(offer.milestones[0].status,'RICHIESTO')
  const attempt = await reserve(offer.milestones[0].id)
  assert.equal((await reserve(offer.milestones[0].id)).id,attempt.id)
  assert.equal(attempt.offer_id,saved.id)
  assert.equal(attempt.project_id,offer.project_id)
  assert.equal(attempt.customer_user_id,bob)
  await assert.rejects(() => reserve(offer.milestones[1].id),/not payable/)
  await role(alice)
  const adminOffer = (await read()).find(o => o.id === saved.id)!
  assert.deepEqual(adminOffer.milestones,offer.milestones)
  assert.equal(adminOffer.payments.length,1)
  assert.equal(adminOffer.payments[0].status,'creating')
  assert.ok(adminOffer.milestones.every(m => !m.paid_at))
  const workspace = (await db.query<{value:{workspace:{quotes:Parameters<typeof buildPipeline>[0]};commercial:{offers:Offer[];templates:[]}}}>('select public.commercial_workspace_v2() value')).rows[0].value
  assert.equal(buildPipeline(workspace.workspace.quotes,workspace.commercial).find(row => row.offer_id === saved.id)?.stage,'payment')
  await assert.rejects(() => db.query('select public.customer_payment_attempt($1)',[attempt.id]),/Payment unavailable/)
  await role(bob)
  await assert.rejects(() => db.query('select public.commercial_workspace_v2()'),/Admin access required/)
  assert.equal((await db.query<{value:Attempt}>('select public.customer_payment_attempt($1) value',[attempt.id])).rows[0].value.checkout_revision,2)

  // One isolated end-to-end SQL path; Stripe transport is mocked, signatures are verified.
  const previous = {...process.env}
  const stripe = new Stripe('sk_test_local_fixture')
  let canonical: Stripe.Checkout.Session
  const create = mock.method(stripe.checkout.sessions,'create',async (params:Stripe.Checkout.SessionCreateParams) => {
   assert.equal(params.allowed_payment_method_types,undefined)
   assert.match(params.success_url!,/attempt=/)
   canonical = {id:`cs_test_${params.metadata!.attempt_id}`,mode:'payment',livemode:false,status:'open',url:'https://checkout.stripe.com/local-fixture',metadata:params.metadata,amount_total:params.line_items![0].price_data!.unit_amount,currency:'eur',payment_status:'unpaid'} as Stripe.Checkout.Session
   return canonical
  })
  const retrieve = mock.method(stripe.checkout.sessions,'retrieve',async () => canonical)
  const persist = async (action:string,data:Record<string,unknown>) => {
   await db.exec('reset role')
   await db.query("select set_config('request.jwt.claim.role','service_role',false)")
   await db.exec('set role service_role')
   try { return await db.query('select public.commercial_service($1,$2::jsonb)',[action,JSON.stringify(data)]) }
   finally { await role(bob) }
  }
  try {
   Object.assign(process.env,{APP_URL:'https://upnology.example',STRIPE_MODE:'test',STRIPE_WEBHOOK_SECRET:'whsec_local_fixture'})
   delete process.env.STRIPE_TAX_ENABLED; delete process.env.STRIPE_SANDBOX_INVOICES
   for (const phase of [1,2,3]) {
    offer = (await read())[0]
    const milestone = offer.milestones.find(m => m.phase === phase)!
    const reserveAttempt = async () => (await db.query<{value:Attempt}>('select public.commercial_checkout($1) value',[milestone.id])).rows[0].value
    const dependencies = {stripe,persist,reserve:reserveAttempt}
    await createCheckout({} as SupabaseClient,milestone.id,dependencies)
    await createCheckout({} as SupabaseClient,milestone.id,dependencies) // Reuses open Checkout after cancellation.
    assert.equal(create.mock.callCount(),phase)
    assert.equal((await read())[0].milestones.find(m => m.id===milestone.id)!.paid_at,null)
    if (phase===1) {
     canonical!.payment_intent={id:'pi_local_failure',object:'payment_intent',status:'requires_payment_method',last_payment_error:{message:'Local declined fixture'}} as Stripe.PaymentIntent
     await syncPaymentAttempt(await reserveAttemptForRead(milestone.id),{stripe,persist})
     assert.equal((await read())[0].milestones.find(m=>m.id===milestone.id)!.status,'FALLITO')
     await createCheckout({} as SupabaseClient,milestone.id,dependencies)
     assert.equal(create.mock.callCount(),1)
     canonical!.payment_intent=null
    }
    canonical!.status='complete';canonical!.payment_status='paid'
    const event = JSON.stringify({id:`evt_local_${phase}`,type:'checkout.session.completed',livemode:false,data:{object:canonical!}})
    const signature = stripe.webhooks.generateTestHeaderString({payload:event,secret:'whsec_local_fixture'})
    const webhook = () => new Request('https://upnology.example/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':signature},body:event})
    await handleStripeWebhook(webhook(),{stripe,persist}); await handleStripeWebhook(webhook(),{stripe,persist})
    await syncPaymentAttempt(await reserveAttemptForRead(milestone.id),{stripe,persist})
    offer = (await read())[0]
    assert.equal(offer.milestones.find(m => m.id===milestone.id)!.status,'PAGATO')
    assert.equal(offer.payments.filter(p => p.milestone_id===milestone.id).length,1)
    if (phase===1) assert.equal(offer.project!.status,'in_lavorazione')
    await role(alice)
    assert.deepEqual((await read()).find(o=>o.id===saved.id)!.milestones,offer.milestones)
    if (phase<3) {
     await cmd('release',{offer_id:saved.id,phase:phase+1,url:'https://delivery.example/protected',notes:'Local release for verification',protection_note:'Authenticated local fixture'})
     await role(bob)
     const released=(await read())[0]
     await cmd('approve_release',{offer_id:saved.id,release_id:released.releases.find(r=>r.phase===phase+1)!.id,confirmed:true})
     assert.equal((await read())[0].milestones.find(m=>m.phase===phase+1)!.status,'RICHIESTO')
    } else {
     await cmd('delivery',{offer_id:saved.id,url:'https://delivery.example/protected'})
     await role(bob)
     assert.ok((await read())[0].project!.delivered_at)
    }
   }
  } finally {
   create.mock.restore();retrieve.mock.restore()
   for(const key of Object.keys(process.env)) if(!(key in previous)) delete process.env[key]
   Object.assign(process.env,previous)
  }
  async function reserveAttemptForRead(milestoneId:string) {
   const current=(await read())[0].payments.find(p=>p.milestone_id===milestoneId)!
   return (await db.query<{value:Attempt}>('select public.customer_payment_attempt($1) value',[current.id])).rows[0].value
  }

 } finally { await db.close() }
})

test('payment UI requires accepted contract and previous paid phases; pending never offers a new payment', () => {
 const m = {id:'phase-1',phase:1,status:'RICHIESTO'} as Milestone
 const offer = {contract:null,milestones:[m]} as Offer
 assert.equal(milestoneAction(offer,m).payable,false)
 offer.contract = {accepted_at:'2026-01-01'} as Offer['contract']
 assert.equal(milestoneAction(offer,m).payable,true)
 const next = {id:'phase-2',phase:2,status:'RICHIESTO'} as Milestone
 offer.milestones.push(next)
 assert.equal(milestoneAction(offer,next).payable,false)
 m.status='IN_ATTESA'
 assert.equal(milestoneAction(offer,m).payable,false)
})
