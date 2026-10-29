import type { Offer, OfferSnapshot } from './commercial.ts'
import { budgetLabels, goalQuestions, serviceLabels, timelineLabels } from './lead.ts'

type QuoteSource = { id: string; customer_user_id: string | null; name: string; company: string | null; email: string; services: string[]; budget: string; timeline: string; details?: Record<string, unknown> }
type QuoteCustomer = { user_id: string; company: string | null; first_name: string | null; last_name: string | null; email: string }
type QuoteDefaults = Partial<Pick<OfferSnapshot, 'timeline' | 'payment_terms' | 'responsibilities' | 'delivery_terms' | 'exclusions'>> & { company_name?: string; address?: string; tax_id?: string }
const service = (id: string) => serviceLabels[id as keyof typeof serviceLabels] ?? id
const labels: Record<string, string> = {
 activityDescription: 'Attività', goal: 'Obiettivo', sector: 'Settore', city: 'Città', existingSite: 'Sito attuale',
 features: 'Funzionalità', notes: 'Note del cliente', aiProcesses: 'Processi AI', aiChannels: 'Canali AI', aiTools: 'Strumenti AI',
 answers: 'Esigenze raccolte', preferredContact: 'Contatto preferito', name: 'Referente', email: 'Email', phone: 'Telefono', whatsapp: 'WhatsApp', company: 'Azienda',
}
const questions = Object.fromEntries(Object.values(goalQuestions).flatMap(items => (items ?? []).map(q => [q.key, q.label])))
function format(value: unknown): string {
 if (typeof value === 'string') return ({ yes: 'Sì', no: 'No', unsure: 'Da valutare' } as Record<string, string>)[value] ?? value
 if (Array.isArray(value)) return value.map(format).filter(Boolean).join(', ')
 if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${questions[key] ?? key}: ${format(item)}`).join('\n')
 return value === null || value === undefined ? '' : String(value)
}
export function requestBrief(request: QuoteSource) {
 return [
  { label: 'Servizi', value: request.services.map(service).join(', ') },
  { label: 'Budget indicativo', value: budgetLabels[request.budget as keyof typeof budgetLabels] ?? request.budget },
  { label: 'Tempistiche richieste', value: timelineLabels[request.timeline as keyof typeof timelineLabels] ?? request.timeline },
  ...Object.entries(request.details ?? {}).filter(([key]) => !['website', 'submission_id', 'services', 'budget', 'timeline'].includes(key))
   .map(([key, value]) => ({ label: labels[key] ?? key, value: format(value) })).filter(row => row.value.trim()),
 ]
}
export function requestDescription(request: QuoteSource): string {
 return requestBrief(request).filter(row => !['Budget indicativo', 'Tempistiche richieste', 'Referente', 'Email', 'Telefono', 'WhatsApp', 'Contatto preferito'].includes(row.label))
  .map(row => `${row.label}: ${row.value}`).join('\n\n')
}
export function quoteDraft(request?: QuoteSource, customer?: QuoteCustomer, defaults?: QuoteDefaults, offers: Offer[] = []): OfferSnapshot {
 const previous = customer || request?.customer_user_id ? offers.filter(o => o.customer_user_id === (customer?.user_id ?? request?.customer_user_id)).sort((a,b) => b.created_at.localeCompare(a.created_at))[0] : undefined
 const name = customer?.company || request?.company || [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || request?.name || ''
 return {
  title: request ? `${request.services.map(service).join(' / ')}${name ? ` · ${name}` : ''}`.slice(0,160) : '',
  description: request ? requestDescription(request).slice(0,5000) : '',
  customer: { name, email: customer?.email || request?.email, address: previous?.snapshot.customer.address ?? '', tax_id: previous?.snapshot.customer.tax_id ?? '' },
  supplier: { name: defaults?.company_name || 'Upnology', address: defaults?.address || '', tax_id: defaults?.tax_id || '' },
  items: request?.services.length ? request.services.map(id => ({ description: service(id), amount_cents: 0 })) : [{ description: '', amount_cents: 0 }],
  subtotal_cents: 0, tax_bps: 0, tax_cents: 0, tax_label: '', total_cents: 0, currency: 'EUR',
  timeline: defaults?.timeline || (request ? timelineLabels[request.timeline as keyof typeof timelineLabels] ?? request.timeline : ''),
  payment_terms: defaults?.payment_terms || '', revisions: 2, responsibilities: defaults?.responsibilities || '',
  delivery_terms: defaults?.delivery_terms || '', exclusions: defaults?.exclusions || '', percentages: [30,40,30], payment_due_days: [7,7,7], instalments: [],
 }
}
export function quoteAmounts(snapshot: OfferSnapshot) {
 const subtotal = snapshot.items.reduce((sum, item) => sum + item.amount_cents, 0)
 const tax = Math.floor((subtotal * snapshot.tax_bps + 5000) / 10000)
 const total = subtotal + tax
 const first = Math.floor(total * snapshot.percentages[0] / 100)
 const second = Math.floor(total * snapshot.percentages[1] / 100)
 return { subtotal, tax, total, instalments: [first, second, total - first - second] }
}
