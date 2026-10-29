import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quoteDraft, quoteAmounts, requestBrief, requestDescription } from '../src/domain/quoteDraft.ts'
const request = {
 id:'request-id',lead_id:'lead-id',customer_user_id:'customer-id',name:'Referente',company:'Azienda',email:'contact@example.com',phone:null,
 services:['website','ai'],budget:'1000-2500',timeline:'one-month',created_at:'2026-10-29',status:'accettato',
 details:{activityDescription:'Descrizione attività raccolta',goal:'Obiettivo raccolto',aiProcesses:'Processi raccolti',aiChannels:'Chat',aiTools:'CRM',notes:'Note del cliente',answers:{hasData:'yes'}},
}
test('request prefill preserves collected context without converting a budget band into a price', () => {
 const draft=quoteDraft(request)
 assert.equal(draft.customer.name,'Azienda')
 assert.deepEqual(draft.items.map(i=>i.description),['Sito web','Upnology AI'])
 assert.ok(draft.items.every(i=>i.amount_cents===0))
 assert.match(draft.description,/Processi raccolti/)
 assert.match(draft.description,/Note del cliente/)
 assert.match(draft.description,/Sì/)
 assert.equal(draft.timeline,'Entro 1 mese')
 assert.deepEqual(draft.percentages,[30,40,30])
 assert.ok(requestBrief(request).some(r=>r.label==='Budget indicativo' && r.value.includes('2.500')))
 const long={...request,details:{notes:'x'.repeat(7000)}}
 assert.equal(quoteDraft(long).description.length,5000)
 assert.ok(requestDescription(long).length>7000)
})
test('switching customer does not retain another billing identity; instalments preserve every cent', () => {
 const customer={user_id:'other',email:'other@example.com',company:'Other',first_name:null,last_name:null}
 const draft=quoteDraft(undefined,customer)
 assert.equal(draft.customer.email,'other@example.com')
 assert.equal(draft.customer.tax_id,'')
 assert.equal(draft.customer.address,'')
 draft.items=[{description:'Servizio',amount_cents:10001}];draft.tax_bps=2200
 const amounts=quoteAmounts(draft)
 assert.equal(amounts.total,12201)
 assert.deepEqual(amounts.instalments,[3660,4880,3661])
 assert.equal(amounts.instalments.reduce((a,b)=>a+b,0),amounts.total)
})
