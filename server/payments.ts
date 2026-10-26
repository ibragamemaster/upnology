import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appOrigin, features, HttpError } from './config.ts'
import { rpc, service } from './database.ts'

export type Attempt = { project_id: string; customer_user_id: string; integration_version: number; id: string; milestone_id: string; offer_id: string; phase: number; amount_cents: number; expires_at: string; session_id: string | null; status: string; title: string; email: string }
export function stripeClient() {
 if (!features().payments) throw new HttpError(503, 'Pagamenti non ancora attivati. Nessun addebito è stato effettuato.')
 const key = process.env.STRIPE_SECRET_KEY!
 const live = process.env.STRIPE_MODE === 'live'
 if (!(live ? /^(?:sk|rk)_live_/ : /^(?:sk|rk)_test_/).test(key)) throw new HttpError(503, 'Configurazione Stripe incoerente.')
 return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 })
}
type PaymentDependencies = {
 stripe?: Stripe
 reserve?: (client: SupabaseClient, milestone: string) => Promise<Attempt>
 persist?: (action: string, data: Record<string, unknown>) => Promise<unknown>
}
function metadataFor(attempt: Attempt) {
 return { application: 'upnology', integration_version: '2', attempt_id: attempt.id,
  installment_id: attempt.milestone_id, milestone_id: attempt.milestone_id,
  quote_id: attempt.offer_id, project_id: attempt.project_id, customer_id: attempt.customer_user_id }
}
export function fiscalOptions(): Pick<Stripe.Checkout.SessionCreateParams, 'invoice_creation' | 'automatic_tax'> {
 // Tax must be settled in the immutable quote, never added at payment time.
 if (process.env.STRIPE_TAX_ENABLED === 'true') throw new HttpError(503, 'Stripe Tax richiede prima la configurazione fiscale del preventivo.')
 const invoice = process.env.STRIPE_SANDBOX_INVOICES === 'true'
 if (invoice && process.env.STRIPE_MODE !== 'test') throw new HttpError(503, 'Fatturazione sperimentale disponibile solo in sandbox.')
 return { automatic_tax: { enabled: false }, invoice_creation: { enabled: invoice } }
}
function validateSession(session: Stripe.Checkout.Session, attempt: Attempt) {
 if (session.mode !== 'payment' || session.livemode !== (process.env.STRIPE_MODE === 'live') ||
  session.metadata?.attempt_id !== attempt.id || session.amount_total !== attempt.amount_cents || session.currency !== 'eur')
  throw new HttpError(409, 'Sessione Stripe non corrispondente al pagamento.')
 if (attempt.integration_version >= 2 && Object.entries(metadataFor(attempt)).some(([key,value]) => session.metadata?.[key] !== value))
  throw new HttpError(409, 'Riferimenti Stripe non corrispondenti al progetto.')
}
export async function createCheckout(client: SupabaseClient, milestone: string, dependencies: PaymentDependencies = {}) {
 const stripe = dependencies.stripe ?? stripeClient(), origin = appOrigin()
 const fiscal = fiscalOptions()
 const reserve = dependencies.reserve ?? ((c: SupabaseClient, id: string) => rpc<Attempt>(c, 'commercial_checkout', { p_milestone: id }))
 const persist = dependencies.persist ?? service
 let attempt = await reserve(client, milestone)
 if (attempt.session_id) {
  const session = await stripe.checkout.sessions.retrieve(attempt.session_id)
  validateSession(session, attempt)
  if (session.status === 'open' && session.url) return { url: session.url }
  if (session.status !== 'expired') throw new HttpError(409, 'Pagamento in verifica. Attendi la conferma del server.')
  await persist('checkout_expired', { attempt_id: attempt.id, session_id: session.id })
  attempt = await reserve(client, milestone)
 }
 const expires = Math.floor(new Date(attempt.expires_at).getTime() / 1000)
 if (expires < Date.now() / 1000 + 1800) throw new HttpError(409, 'Tentativo da riconciliare con Stripe. Contatta l’amministratore prima di riprovare.')
 if (!(attempt.integration_version >= 2)) throw new HttpError(409, 'Tentativo precedente da riconciliare prima di creare un nuovo Checkout.')
 const metadata = metadataFor(attempt)
 const session = await stripe.checkout.sessions.create({
  ...fiscal,
  ...(fiscal.invoice_creation?.enabled ? { customer_creation: 'always' as const, invoice_creation: { enabled: true, invoice_data: { metadata } } } : {}),
  mode: 'payment', allowed_payment_method_types: ['card'], customer_email: attempt.email,
  client_reference_id: attempt.id,
  metadata,
  payment_intent_data: { metadata },
  line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: attempt.amount_cents, product_data: { name: `Upnology · ${attempt.title.slice(0, 120)} · Fase ${attempt.phase}` } } }],
  success_url: `${origin}/account?payment=processing`, cancel_url: `${origin}/account?payment=cancelled`,
  expires_at: expires,
 }, { idempotencyKey: `upnology-checkout-${attempt.id}` })
 validateSession(session, attempt)
 if (!session.url) throw new HttpError(503, 'Sessione di pagamento non disponibile.')
 await persist('checkout_bound', { ...normalizedPayment(session), attempt_id: attempt.id, session_id: session.id, url: session.url })
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
  metadata: session.metadata, livemode: session.livemode,
  invoice_id: typeof session.invoice === 'string' ? session.invoice : session.invoice?.id ?? null,
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
 if (session.metadata?.application && session.metadata.application !== 'upnology') return { received: true, ignored: true }
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
  await service('checkout_bound', { ...state, attempt_id: attemptId, session_id: session.id, url: session.url })
 } else {
  await service('stripe_event', { ...state, event_id: `reconcile:${session.id}:${state.state}:${state.refunded_cents}`, event_type: 'admin.reconciliation' })
 }
 return { reconciled: true }
}
