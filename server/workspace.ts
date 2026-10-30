import type { Offer, CommercialOverview } from '../src/domain/commercial.ts'
import type { PipelineItem, PipelineStage } from '../src/domain/workspace.ts'
type RequestRow = { id: string; customer_user_id: string | null; name: string; company: string | null; services: string[]; status: string }
function progress(offer: Offer, now: number): { stage: PipelineStage; action: string } {
 if (offer.project?.delivered_at) return { stage: 'delivered', action: 'Consulta consegna' }
 if (['RIFIUTATO', 'SCADUTO', 'SUPERATO'].includes(offer.status) || (offer.status === 'INVIATO' && Date.parse(offer.expires_at) <= now)) return { stage: 'closed', action: 'Valuta una nuova versione' }
 if (offer.status === 'BOZZA') return { stage: 'quote', action: 'Verifica e invia preventivo' }
 if (offer.status === 'INVIATO') return { stage: 'quote', action: 'In attesa del cliente' }
 if (!offer.contract?.accepted_at) return { stage: 'signature', action: offer.contract ? 'In attesa della firma cliente' : 'Contratto assente: verificare collegamento' }
 if (offer.milestones.some(m => ['RICHIESTO', 'FALLITO', 'IN_ATTESA'].includes(m.status))) return { stage: 'payment', action: 'Consulta rata ed esito Stripe' }
 return { stage: 'production', action: 'Gestisci avanzamento e consegna' }
}
// Projection only: persistent records determine the lane. Moving a card must never mark a payment paid.
export function buildPipeline(requests: RequestRow[], commercial: CommercialOverview, now = Date.now()): PipelineItem[] {
 const superseded = new Set(commercial.offers.map(o => o.previous_id).filter(Boolean))
 const offers = commercial.offers.filter(o => o.project_id || !superseded.has(o.id))
 const linked = new Set(offers.map(o => o.request_id).filter(Boolean))
 const rows: PipelineItem[] = offers.map(o => ({ id: `offer:${o.id}`, request_id: o.request_id, customer_user_id: o.customer_user_id, offer_id: o.id, project_id: o.project_id, title: o.snapshot.title, customer: o.snapshot.customer.name, amount_cents: o.total_cents, ...progress(o, now), attention: [
  ...(o.status === 'ACCETTATO' && (!o.contract || !o.project_id || o.milestones.length !== 3) ? ['Collegamento contratto / progetto / rate incompleto'] : []),
  ...(o.milestones.some(m => m.refunded_cents > 0) ? ['Rimborso: progetto da verificare'] : []),
  ...(o.milestones.some(m => m.status === 'FALLITO') ? ['Pagamento fallito'] : []),
  ...(o.milestones.some(m => ['RICHIESTO', 'FALLITO'].includes(m.status) && m.due_at && Date.parse(m.due_at) < now) ? ['Rata scaduta'] : []),
  ...(o.emails.some(e => ['review', 'retry'].includes(e.status)) ? ['Invio email non riuscito'] : []),
  ...(o.releases.some(r => r.feedback.some(f => !f.resolved_at)) ? ['Feedback da risolvere'] : []),
 ] }))
 for (const r of requests) if (!linked.has(r.id)) rows.push({ id: `request:${r.id}`, request_id: r.id, customer_user_id: r.customer_user_id, offer_id: null, project_id: null, title: r.services.join(' · '), customer: r.company || r.name, amount_cents: null, stage: ['rifiutato', 'chiuso'].includes(r.status) ? 'closed' : 'request', action: r.customer_user_id ? 'Prepara preventivo' : 'Attendi account cliente verificato', attention: r.customer_user_id ? [] : ['Cliente non ancora collegato'] })
 return rows
}
