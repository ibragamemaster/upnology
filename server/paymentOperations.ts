import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { rpc } from './database.ts'
import { HttpError } from './config.ts'
import { stripeClient } from './payments.ts'
import type { CommercialOverview } from '../src/domain/commercial.ts'

type RefundReservation = { attempt_id: string; session_id: string; payment_intent: string; amount_cents: number; original_cents: number; livemode: boolean; created_at: string; offer_id: string; milestone_id: string; project_id: string; customer_id: string }
export async function requestRefund(client: SupabaseClient, attemptId: string, dependencies: { stripe?: Stripe; reserve?: () => Promise<RefundReservation> } = {}) {
 const stripe = dependencies.stripe ?? stripeClient()
 const r = await (dependencies.reserve ? dependencies.reserve() : rpc<RefundReservation>(client, 'admin_workspace_command', { p_action: 'refund_request', p_data: { attempt_id: attemptId, confirmed: true } }))
 if (Date.now() - Date.parse(r.created_at) >= 23 * 3600000) throw new HttpError(409, 'Richiesta da verificare con Stripe: finestra sicura di retry terminata. Nessun nuovo rimborso inviato.')
 const session = await stripe.checkout.sessions.retrieve(r.session_id)
 const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
 const expected = { application: 'upnology', attempt_id: r.attempt_id, milestone_id: r.milestone_id, installment_id: r.milestone_id, quote_id: r.offer_id, project_id: r.project_id, customer_id: r.customer_id }
 if (session.mode !== 'payment' || session.payment_status !== 'paid' || session.currency !== 'eur' || session.amount_total !== r.original_cents || intent !== r.payment_intent || session.livemode !== r.livemode || session.livemode !== (process.env.STRIPE_MODE === 'live') || Object.entries(expected).some(([k,v]) => session.metadata?.[k] !== v)) throw new HttpError(409, 'Pagamento non corrispondente al rimborso autorizzato.')
 const result = await stripe.refunds.create({ payment_intent: r.payment_intent, amount: r.amount_cents, metadata: { application: 'upnology', attempt_id: r.attempt_id, quote_id: r.offer_id } }, { idempotencyKey: `upnology-refund-${r.attempt_id}` })
 return { requested: true, refund_id: result.id, status: result.status }
}
export async function paymentReceipt(client: SupabaseClient, attemptId: string) {
 const stripe = stripeClient()
 const overview = await rpc<CommercialOverview>(client, 'commercial_overview')
 const offer = overview.offers.find(o => o.payments.some(p => p.id === attemptId))
 const attempt = offer?.payments.find(p => p.id === attemptId)
 if (!attempt?.session_id || !['paid','refunded','partial_refund'].includes(attempt.status)) throw new HttpError(404, 'Ricevuta non disponibile.')
 const session = await stripe.checkout.sessions.retrieve(attempt.session_id, { expand: ['payment_intent.latest_charge'] })
 if (session.metadata?.application !== 'upnology' || session.metadata?.attempt_id !== attempt.id || session.metadata?.quote_id !== offer!.id || session.amount_total !== attempt.amount_cents || session.currency !== 'eur' || session.livemode !== (process.env.STRIPE_MODE === 'live')) throw new HttpError(409, 'Riferimenti del pagamento non corrispondenti.')
 const intent = typeof session.payment_intent === 'object' ? session.payment_intent : null
 const charge = intent && typeof intent.latest_charge === 'object' ? intent.latest_charge : null
 if (!charge?.receipt_url) throw new HttpError(404, 'Stripe non ha ancora reso disponibile la ricevuta.')
 const url = new URL(charge.receipt_url)
 if (url.protocol !== 'https:' || !url.hostname.endsWith('.stripe.com') || url.username || url.password) throw new HttpError(503, 'Ricevuta non disponibile.')
 return { url: url.href }
}
