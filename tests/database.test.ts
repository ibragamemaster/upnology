import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import type { CommercialOverview, Offer } from '../src/domain/commercial.ts'
const admin = '11111111-1111-4111-8111-111111111111'
const alice = '22222222-2222-4222-8222-222222222222'
const bob = '33333333-3333-4333-8333-333333333333'
const snapshot = {
 title: 'Sito cliente', description: 'Realizzazione del progetto con area riservata.',
 customer: { name: 'Cliente Verificato', email: 'attacker@example.com', address: 'Via Test 10, Roma', tax_id: 'IT01234567890' },
 supplier: { name: 'Upnology', address: 'Via Fornitore 1, Roma', tax_id: 'IT09876543210' },
 items: [{ description: 'Sito web', amount_cents: 10001 }, { description: 'Integrazione', amount_cents: 1234 }],
 tax_bps: 2200, tax_label: 'IVA', timeline: '30 giorni dal pagamento', payment_terms: 'Tre tranche, 7 giorni per pagamento',
 revisions: 2, responsibilities: 'Responsabilità concordate delle parti', delivery_terms: 'Consegna dopo il saldo',
 exclusions: 'Hosting non compreso', percentages: [30, 40, 30], total_cents: 1,
}

test('PostgreSQL: migrations, commercial lifecycle, security and idempotency', async t => {
 const db = new PGlite()
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,aud text,role text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
 grant usage on schema auth to anon,authenticated,service_role;
 grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;`)
 for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec((await readFile(`supabase/migrations/${file}`, 'utf8')).replace(/^\uFEFF/, '')) }
  catch (error) { console.error('Migration failed', file, error); await db.close(); throw error }
 }
 await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now()),($3,$4,now()),($5,$6,now())', [admin, 'admin@example.com', alice, 'alice@example.com', bob, 'bob@example.com'])
 await db.query('insert into upnology.admin_members(user_id) values ($1)', [admin])
 const leadId=(await db.query<{id:string}>("insert into upnology.leads(auth_user_id,source,name,email) values($1,'preventivo','Alice Cliente','alice@example.com') returning id",[alice])).rows[0].id
 const requestId=(await db.query<{id:string}>("insert into upnology.quote_requests(lead_id,services,budget,timeline,details) values($1,array['website'],'1000-2500','one-month','{}') returning id",[leadId])).rows[0].id

 const role = async (id: string | null, name = 'authenticated') => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id ?? '', name])
  await db.exec(`set role ${name}`)
 }
 const cmd = async (action: string, data: Record<string, unknown> = {}) => (await db.query<{ result: {id?:string} }>('select public.commercial_command($1,$2::jsonb) result', [action, JSON.stringify(data)])).rows[0].result
 const overview = async () => (await db.query<{ result: CommercialOverview }>('select public.commercial_overview() result')).rows[0].result
 const svc = async (action: string, data: Record<string, unknown> = {}) => (await db.query<{result:unknown}>('select public.commercial_service($1,$2::jsonb) result', [action, JSON.stringify(data)])).rows[0].result
 const checkout = async (id: string) => (await db.query<{result:{id:string;amount_cents:number}}>('select public.commercial_checkout($1) result', [id])).rows[0].result
 const find = async (id: string): Promise<Offer> => { const o = (await overview()).offers.find(o => o.id === id); assert.ok(o); return o }
 let template = '', offerId = '', projectId = '', contractHash = ''
 const createOffer = async (extra: Record<string, unknown> = {}) => {
  const result = await cmd('save', { customer_user_id: alice, request_id:requestId, template_id: template, expires_at: '2099-01-01T00:00:00Z', snapshot, ...extra })
  assert.ok(result.id); return result.id
 }
 await t.test('migration privileges deny anonymous and service-only RPC to customer', async () => {
  await role(null, 'anon'); await assert.rejects(overview, /permission denied/)
  await role(alice); await assert.rejects(() => svc('claim_emails'), /permission denied/)
  await assert.rejects(() => db.query('select * from upnology.offers'), /permission denied/)
  await assert.rejects(() => cmd('template', {title:'Unauthorized',body:'Not allowed template text'}), /Admin access required/)
 })
 await t.test('legal gate, server totals and customer ownership', async () => {
  await role(admin)
  template = (await cmd('template', { title: 'Test template', body: 'Testo contrattuale di test. Non utilizzabile in produzione.' })).id!
  offerId = await createOffer()
  const o = await find(offerId)
  assert.equal(o.total_cents, 13707); assert.deepEqual(o.snapshot.instalments, [4112, 5482, 4113])
  assert.equal(o.snapshot.customer.email, 'alice@example.com')
  await assert.rejects(() => cmd('send', {offer_id:offerId}), /Legal approval/)
  await role(alice); assert.equal((await overview()).offers.length, 0)
  await assert.rejects(() => cmd('accept', {offer_id:offerId,confirmed:true}), /unavailable/)
  await role(admin)
  await assert.rejects(()=>cmd('approve_template',{id:template,legal_reference:'Test missing confirmation'}),/Legal approval/)
  await cmd('approve_template', {id:template,confirmed:true,legal_reference:'Test counsel approval 2026-10-15'})
  await cmd('send', {offer_id:offerId})
  await assert.rejects(() => cmd('save', {id:offerId,customer_user_id:alice,template_id:template,expires_at:'2099-01-01',snapshot}), /Only drafts/)
  await role(bob); assert.equal((await overview()).offers.length,0)
  await assert.rejects(() => cmd('accept', {offer_id:offerId,confirmed:true}), /unavailable/)
 })
 await t.test('malformed amounts, percentages, missing parties and forged request rejected', async () => {
  await role(admin)
  for (const invalid of [
   {...snapshot,percentages:[30,40,40]}, {...snapshot,percentages:[null,40,60]}, {...snapshot,payment_due_days:[null,7,7]}, {...snapshot,items:[{description:'Negative',amount_cents:-100}]},
   {...snapshot,items:[{description:'Fraction',amount_cents:100.4}]}, {...snapshot,tax_bps:-1},
   {...snapshot,customer:{name:'No address'}}, {...snapshot,revisions:1.4},
  ]) await assert.rejects(() => createOffer({snapshot:invalid}))
  await assert.rejects(() => createOffer({request_id:'44444444-4444-4444-8444-444444444444'}), /Request does not belong/)
 })
 await t.test('acceptance creates exact immutable contract and three instalments once', async () => {
  await role(alice); await cmd('accept',{offer_id:offerId,confirmed:true}); await cmd('accept',{offer_id:offerId,confirmed:true})
  const o=await find(offerId); projectId=o.project_id!; contractHash=o.contract!.snapshot_hash
  const source=(await db.query<{status:string}>('select status from upnology.leads where id=$1',[leadId])).rows[0];assert.equal(source.status,'accettato')
  assert.equal(o.status,'ACCETTATO'); assert.deepEqual(o.contract!.snapshot,o.snapshot); assert.equal(o.milestones.length,3)
  assert.equal(o.milestones.reduce((sum,m)=>sum+Number(m.amount_cents),0),o.total_cents)
  await assert.rejects(()=>checkout(o.milestones[0].id),/not payable/)
  await assert.rejects(()=>cmd('accept_contract',{offer_id:offerId,confirmed:true,snapshot_hash:'wrong'}),/confirmation required/)
  await cmd('accept_contract',{offer_id:offerId,confirmed:true,snapshot_hash:contractHash})
  await cmd('accept_contract',{offer_id:offerId,confirmed:true,snapshot_hash:contractHash})
  await db.exec('reset role')
  await assert.rejects(()=>db.query("update upnology.offers set snapshot='{}' where id=$1",[offerId]),/immutable/)
  await assert.rejects(()=>db.query("update upnology.contracts set body='Changed' where offer_id=$1",[offerId]),/immutable/)
  await role(admin)
  await assert.rejects(()=>db.query("update upnology.projects set status='completato' where id=$1",[projectId]),/commercial workflow/)
  const next=(await cmd('version',{offer_id:offerId})).id!
  const version=await find(next);assert.equal(version.previous_id,offerId);assert.equal(version.status,'BOZZA');assert.equal(version.version,2)
  assert.equal((await find(offerId)).snapshot.total_cents,13707)
 })
 const attempts: {id:string;amount_cents:number}[]=[]
 const pay = async (phase:number, eventId:string, overrides:Record<string,unknown>={}) => {
  await role(alice);const o=await find(offerId), m=o.milestones[phase-1]
  const attempt=attempts[phase-1]??await checkout(m.id); attempts[phase-1]=attempt
  await role(null,'service_role')
  return svc('stripe_event',{attempt_id:attempt.id,session_id:`cs_test_${phase}`,event_id:eventId,event_type:'checkout.session.completed',state:'paid',amount_cents:attempt.amount_cents,currency:'eur',payment_intent:`pi_test_${phase}`,refunded_cents:0,...overrides})
 }
 await t.test('checkout reuse, mismatch rollback, pending, failure, retries and verified first payment', async () => {
  await role(alice);const o=await find(offerId)
  const a=await checkout(o.milestones[0].id);assert.equal((await checkout(o.milestones[0].id)).id,a.id);attempts[0]=a
  await role(bob);await assert.rejects(()=>checkout(o.milestones[0].id),/Owner required/)
  await role(alice);await assert.rejects(()=>checkout(o.milestones[1].id),/not payable/)
  await assert.rejects(()=>pay(1,'evt_bad',{amount_cents:1}),/mismatch/)
  await pay(1,'evt_pending',{state:'pending'});await role(alice);assert.equal((await find(offerId)).milestones[0].status,'IN_ATTESA')
  await pay(1,'evt_failed',{state:'failed',session_status:'open'});await role(alice);assert.equal((await find(offerId)).milestones[0].status,'FALLITO');assert.equal((await checkout(o.milestones[0].id)).id,a.id)
  await pay(1,'evt_paid_1'); await pay(1,'evt_paid_1');await pay(1,'evt_late_failure',{state:'failed'})
  await role(alice);const paid=await find(offerId);assert.equal(paid.milestones[0].status,'PAGATO');assert.equal(paid.project!.commercial_stage,'IN_LAVORAZIONE')
  await assert.rejects(()=>checkout(paid.milestones[0].id),/not payable/)
 })
 let release=''
 await t.test('demo feedback resolution and explicit approval gate second payment', async () => {
  await role(admin)
  await assert.rejects(()=>cmd('release',{offer_id:offerId,phase:3,url:'https://demo.example.com',notes:'Finale test',protection_note:'Protected by login'}),/Previous payment/)
  await cmd('release',{offer_id:offerId,phase:2,url:'https://demo.example.com/demo',notes:'Demo funzionante',protection_note:'Access restricted to Alice'})
  release=(await find(offerId)).releases[0].id
  await role(alice);await cmd('feedback',{offer_id:offerId,release_id:release,body:'Correggere il titolo'})
  await assert.rejects(()=>cmd('approve_release',{offer_id:offerId,release_id:release,confirmed:true}),/Open feedback/)
  await role(admin);const feedback=(await find(offerId)).releases[0].feedback[0].id
  await cmd('resolve_feedback',{offer_id:offerId,feedback_id:feedback,resolution:'Titolo corretto'})
  await role(alice);await cmd('approve_release',{offer_id:offerId,release_id:release,confirmed:true})
  assert.equal((await find(offerId)).milestones[1].status,'RICHIESTO')
  await pay(2,'evt_paid_2')
 })
 await t.test('final approval and balance gate delivery; links stay owner-only', async () => {
  await role(admin);await assert.rejects(()=>cmd('delivery',{offer_id:offerId,url:'https://demo.example.com/final'}),/All payments/)
  await cmd('release',{offer_id:offerId,phase:3,url:'https://demo.example.com/final',notes:'Versione finale',protection_note:'Protected access for Alice'})
  await cmd('prepare_delivery',{offer_id:offerId,url:'https://demo.example.com/delivery'})
  const r=(await find(offerId)).releases.find(r=>r.phase===3)!.id
  await role(alice);await cmd('approve_release',{offer_id:offerId,release_id:r,confirmed:true});await pay(3,'evt_paid_3')
  await role(alice);assert.equal((await find(offerId)).project!.commercial_stage,'CONSEGNATO')
  await role(admin);await cmd('delivery',{offer_id:offerId,url:'https://demo.example.com/delivery'})
  await cmd('delivery',{offer_id:offerId,url:'https://demo.example.com/delivery'})
  assert.equal((await find(offerId)).project!.commercial_stage,'CONSEGNATO')
  await role(bob);await assert.rejects(()=>db.query('select public.commercial_link($1,$2)',[offerId,r]),/Owner required/)
  await role(alice);await assert.rejects(()=>db.query('select delivery_url from upnology.projects'),/permission denied/)
  await assert.rejects(()=>db.query('select internal_notes from upnology.projects'),/permission denied/)
  const account=await db.query<{result:{projects:{id:string}[]}}>('select public.account_overview() result');assert.ok(account.rows[0].result.projects.some(p=>p.id===projectId))
  const link=await db.query<{url:string}>('select public.commercial_link($1,null) url',[offerId]);assert.equal(link.rows[0].url,'https://demo.example.com/delivery')
 })
 await t.test('refunds are monotonic, stop delivery access and cannot be undone by delayed success', async () => {
  await pay(3,'evt_partial',{refunded_cents:100})
  await pay(3,'evt_old_success',{refunded_cents:0})
  await role(alice);let o=await find(offerId);assert.equal(o.milestones[2].status,'RIMBORSO_PARZIALE');assert.equal(o.project!.commercial_stage,'VERIFICA_RIMBORSO')
  await assert.rejects(()=>db.query('select public.commercial_link($1,null)',[offerId]),/unavailable/)
  await pay(3,'evt_full_refund',{refunded_cents:attempts[2].amount_cents})
  await role(alice);o=await find(offerId);assert.equal(o.milestones[2].status,'RIMBORSATO')
 })
 await t.test('outbox deduplication, leases, retry persistence and ambiguity quarantine', async () => {
  await role(admin);const o=await find(offerId)
  assert.equal(o.emails.filter(e=>e.kind==='payment_final_confirmed').length,1)
  assert.equal(o.emails.filter(e=>e.kind==='delivery').length,1)
  await role(null,'service_role')
  const jobs=await svc('claim_emails',{limit:10}) as {id:string;lease_id:string}[];assert.equal(jobs.length,10)
  const again=await svc('claim_emails') as {id:string}[];assert.equal(again.some(j=>jobs.some(k=>k.id===j.id)),false)
  await svc('email_result',{id:jobs[0].id,lease_id:jobs[0].lease_id,provider_id:'resend_1'})
  await svc('email_result',{id:jobs[0].id,lease_id:jobs[0].lease_id,error:'late error'})
  await svc('email_result',{id:jobs[1].id,lease_id:jobs[1].lease_id,error:'HTTP 429'})
  await db.exec('reset role');await db.query("update upnology.email_outbox set first_attempt_at=now()-interval '25 hours' where id=$1",[jobs[1].id])
  await role(null,'service_role');await svc('claim_emails')
  await role(admin);const updated=await find(offerId);assert.equal(updated.emails.find(e=>e.id===jobs[0].id)!.status,'sent');assert.equal(updated.emails.find(e=>e.id===jobs[1].id)!.status,'review')
 })
 await t.test('expired quote cannot be accepted and expiry worker persists the state', async () => {
  await role(admin);const id=await createOffer();await cmd('send',{offer_id:id})
  await db.exec('reset role');await db.exec('alter table upnology.offers disable trigger offers_immutable')
  await db.query("update upnology.offers set expires_at=now()-interval '1 second' where id=$1",[id]);await db.exec('alter table upnology.offers enable trigger offers_immutable')
  await role(alice);assert.equal((await find(id)).status,'SCADUTO');await assert.rejects(()=>cmd('accept',{offer_id:id,confirmed:true}),/expired/)
  await role(null,'service_role');await svc('expire_offers')
  await role(admin);assert.equal((await find(id)).status,'SCADUTO')
 })
 await t.test('legacy admin and customer SQL regressions remain valid', async () => {
  await db.exec('reset role')
  for (const file of ['admin_base_transaction.sql','rls_customer_auth.sql']) {
   await db.exec((await readFile(`supabase/tests/${file}`,'utf8')).replace(/^\uFEFF/,''))
  }
 })
 await db.close()
})
