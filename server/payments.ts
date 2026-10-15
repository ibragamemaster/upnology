import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appOrigin, features, HttpError } from './config.ts'
import { rpc, service } from './database.ts'

type Attempt = { id: string; milestone_id: string; offer_id: string; phase: number; amount_cents: number; expires_at: string; session_id: string | null; status: string; title: string; email: string }
export function stripeClient() {
 if (!features().payments) throw new HttpError(503, 'Pagamenti non ancora attivati. Nessun addebito è stato effettuato.')
 const key = process.env.STRIPE_SECRET_KEY!
 const live = process.env.STRIPE_MODE === 'live'
 if (!(live ? /^sk_live_/ : /^sk_test_/).test(key)) throw new HttpError(503, 'Configurazione Stripe incoerente.')
 return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 })
}
export async function createCheckout(client: SupabaseClient, milestone: string) {
 const stripe = stripeClient(), origin = appOrigin()
 let attempt = await rpc<Attempt>(client, 'commercial_checkout', { p_milestone: milestone })
 if (attempt.session_id) {
  const session = await stripe.checkout.sessions.retrieve(attempt.session_id)
  if (session.status === 'open' && session.url) return { url: session.url }
  if (session.status !== 'expired') throw new HttpError(409, 'Pagamento in verifica. Attendi la conferma del server.')
  await service('checkout_expired', { attempt_id: attempt.id, session_id: session.id })
  attempt = await rpc<Attempt>(client, 'commercial_checkout', { p_milestone: milestone })
 }
 const expires = Math.floor(new Date(attempt.expires_at).getTime() / 1000)
 if (expires < Date.now() / 1000 + 1800) throw new HttpError(409, 'Tentativo da riconciliare con Stripe. Contatta l’amministratore prima di riprovare.')
 const session = await stripe.checkout.sessions.create({
  mode: 'payment', allowed_payment_method_types: ['card'], customer_email: attempt.email,
  client_reference_id: attempt.id,
  metadata: { attempt_id: attempt.id, milestone_id: attempt.milestone_id },
  payment_intent_data: { metadata: { attempt_id: attempt.id } },
  line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: attempt.amount_cents, product_data: { name: `Upnology · ${attempt.title.slice(0, 120)} · Fase ${attempt.phase}` } } }],
  success_url: `${origin}/account?payment=processing`, cancel_url: `${origin}/account?payment=cancelled`,
  expires_at: expires,
 }, { idempotencyKey: `upnology-checkout-${attempt.id}` })
 if (!session.url) throw new HttpError(503, 'Sessione di pagamento non disponibile.')
 await service('checkout_bound', { attempt_id: attempt.id, session_id: session.id, url: session.url })
 return { url: session.url }
}

export function normalizedPayment(session: Stripe.Checkout.Session) {
 const intent = typeof session.payment_intent === 'object' ? session.payment_intent : null
 const charge = intent && typeof intent.latest_charge === 'object' ? intent.latest_charge : null
 const state = session.payment_status === 'paid' ? 'paid' : session.status === 'expired' ? 'expired'
  : intent?.status === 'canceled' || (intent?.status === 'requires_payment_method' && intent.last_payment_error) ? 'failed' : 'pending'
 return {
  attempt_id: session.metadata?.attempt_id, session_id: session.id,
  amount_cents: session.amount_total, currency: session.currency,
  payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : intent?.id ?? null,
  refunded_cents: charge?.amount_refunded ?? 0, state, session_status: session.status,
 }
}
export async function handleStripeWebhook(request: Request, dependencies: { stripe?: Stripe; persist?: (action: string, data: Record<string, unknown>) => Promise<unknown> } = {}) {
 const stripe = dependencies.stripe ?? stripeClient()
 const persist = dependencies.persist ?? service
 const signature = request.headers.get('stripe-signature')
 if (!signature) throw new HttpError(400, 'Firma mancante.')
 const raw = await request.text()
 if (raw.length > 1024 * 1024) throw new HttpError(413, 'Evento troppo grande.')
 let event: Stripe.Event
 try { event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!, 300) }
 catch { throw new HttpError(400, 'Firma webhook non valida.') }
 if (event.livemode !== (process.env.STRIPE_MODE === 'live')) throw new HttpError(400, 'Ambiente Stripe non corrispondente.')
 const supported = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'payment_intent.payment_failed', 'payment_intent.processing', 'payment_intent.succeeded', 'charge.refunded', 'refund.updated']
 if (!supported.includes(event.type)) return { received: true, ignored: true }
 let sessionId: string | undefined
 if (event.type.startsWith('checkout.session.')) sessionId = (event.data.object as Stripe.Checkout.Session).id
 else {
  const object = event.data.object as Stripe.PaymentIntent | Stripe.Charge | Stripe.Refund
  const intent = object.object === 'payment_intent' ? object.id : typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id
  if (!intent) return { received: true, ignored: true }
  const sessions = await stripe.checkout.sessions.list({ payment_intent: intent, limit: 1 })
  sessionId = sessions.data[0]?.id
 }
 if (!sessionId) return { received: true, ignored: true }
 // Re-read canonical state: out-of-order events never override newer payment/refund state.
 const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] })
 if (!session.metadata?.attempt_id) return { received: true, ignored: true }
 if (session.livemode !== event.livemode || session.mode !== 'payment') throw new HttpError(400, 'Sessione non valida.')
 await persist('stripe_event', { ...normalizedPayment(session), event_id: event.id, event_type: event.type })
 return { received: true }
}

export async function reconcileCheckout(attemptId: string, sessionId: string) {
 const stripe = stripeClient()
 const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] })
 if (session.metadata?.attempt_id !== attemptId || session.mode !== 'payment' || session.livemode !== (process.env.STRIPE_MODE === 'live')) throw new HttpError(409, 'La sessione Stripe non corrisponde al tentativo.')
 const state = normalizedPayment(session)
 // Open unpaid sessions remain reusable; never mark them pending just because an admin refreshed them.
 if (session.status === 'open' && state.state === 'pending') {
  await service('checkout_bound', { attempt_id: attemptId, session_id: session.id, url: session.url })
 } else {
  await service('stripe_event', { ...state, event_id: `reconcile:${session.id}:${state.state}:${state.refunded_cents}`, event_type: 'admin.reconciliation' })
 }
 return { reconciled: true }
}
