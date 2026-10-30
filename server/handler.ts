import { buildPipeline } from './workspace.ts'
import { waitUntil } from '@vercel/functions'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { features, HttpError, protectedLink, stripeConfigurationChecks } from './config.ts'
import { rpc, service, userClient } from './database.ts'
import { createCheckout, handleStripeWebhook, reconcileCheckout, syncPaymentAttempt, type Attempt } from './payments.ts'
import { deliverEmails, emailCopy } from './emails.ts'
import { paymentReceipt, requestRefund } from './paymentOperations.ts'
import { renderDocument } from './documents.ts'
import type { CommercialOverview } from '../src/domain/commercial.ts'
const uuid = z.string().uuid()
const command = z.object({ action: z.enum(['template','approve_template','save','version','send','accept','reject','accept_contract','release','approve_release','feedback','resolve_feedback','update','prepare_delivery','delivery','request_payment']), data: z.record(z.string(), z.unknown()) })
function isCron(request: Request) {
 const secret = process.env.CRON_SECRET
 if (!secret || secret.length < 32) return false
 const supplied = Buffer.from(request.headers.get('authorization') ?? '')
 const expected = Buffer.from(`Bearer ${secret}`)
 return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
async function jsonBody(request: Request) {
 if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Richiesto JSON.')
 const body = await request.text()
 if (body.length > 70000) throw new HttpError(413, 'Richiesta troppo grande.')
 try { return JSON.parse(body) as unknown } catch { throw new HttpError(400, 'JSON non valido.') }
}
async function route(request: Request): Promise<Response> {
 const requestUrl = new URL(request.url)
 const pathname = requestUrl.pathname.replace(/\/+$/, '') || '/'
 const path = pathname === '/api' && requestUrl.searchParams.has('route') ? `/api/${requestUrl.searchParams.get('route')!.replace(/^\/+|\/+$/g, '')}` : pathname
 const f = features()
 if (path === '/api/commercial/status' && request.method === 'GET') return Response.json(f)
 if (!f.backend) throw new HttpError(503, 'Sistema commerciale non ancora attivato.')
 if (path === '/api/stripe/webhook' && request.method === 'POST') {
  const result = await handleStripeWebhook(request)
  if (f.email) waitUntil(deliverEmails().catch(() => { console.warn('Commercial email worker deferred; jobs remain in outbox') }))
  return Response.json(result)
 }
 if (path === '/api/jobs/commercial' && request.method === 'GET') {
  if (!isCron(request)) throw new HttpError(401, 'Accesso non autorizzato.')
  const expired = await service('expire_offers')
  return Response.json({ expired, email: f.email ? await deliverEmails() : { disabled: true } })
 }
 const client = await userClient(request)
 if (path === '/api/commercial/workspace' && request.method === 'GET') {
  const snapshot = await rpc<{ workspace: { quotes: Parameters<typeof buildPipeline>[0] }; commercial: CommercialOverview; generated_at: string }>(client, 'commercial_workspace_v2')
  return Response.json({ ...snapshot, version: 2, pipeline: buildPipeline(snapshot.workspace.quotes, snapshot.commercial, Date.parse(snapshot.generated_at)) })
 }
 if (path === '/api/commercial/stripe-diagnostics' && request.method === 'GET') {
  if (await rpc<boolean>(client, 'admin_access') !== true) throw new HttpError(403, 'Accesso admin richiesto.')
  return Response.json({ payments: f.payments, checks: stripeConfigurationChecks() })
 }
 if (path === '/api/commercial/overview' && request.method === 'GET') {
  const overview = await rpc<CommercialOverview>(client, 'commercial_overview')
  if (requestUrl.searchParams.get('scope') === 'customer') {
   const { data, error } = await client.auth.getUser(request.headers.get('authorization')!.slice(7))
   if (error || !data.user) throw new HttpError(401, 'Sessione non valida.')
   return Response.json({ offers: overview.offers.filter(offer => offer.customer_user_id === data.user.id), templates: [] })
  }
  return Response.json(overview)
 }
 if (path === '/api/commercial/command' && request.method === 'POST') {
  const { action, data } = command.parse(await jsonBody(request))
  if (['release', 'prepare_delivery', 'delivery'].includes(action)) data.url = protectedLink(z.string().parse(data.url))
  const result = await rpc(client, 'commercial_command', { p_action: action, p_data: data })
  if (f.email) waitUntil(deliverEmails().catch(() => { console.warn('Commercial email worker deferred; jobs remain in outbox') }))
  return Response.json(result)
 }
 if (path === '/api/commercial/payment-status' && request.method === 'POST') {
  const { attempt_id } = z.object({ attempt_id: uuid }).parse(await jsonBody(request))
  const attempt = await rpc<Attempt>(client, 'customer_payment_attempt', { p_attempt: attempt_id })
  const result = await syncPaymentAttempt(attempt)
  if (f.email) waitUntil(deliverEmails().catch(() => { console.warn('Commercial email worker deferred; jobs remain in outbox') }))
  return Response.json(result)
 }
 if (path === '/api/commercial/checkout' && request.method === 'POST') {
  const { milestone_id } = z.object({ milestone_id: uuid }).parse(await jsonBody(request))
  return Response.json(await createCheckout(client, milestone_id))
 }
 if (path === '/api/commercial/document' && request.method === 'GET') {
  const params = new URL(request.url).searchParams
  const id = uuid.parse(params.get('offer_id')), kind = z.enum(['quote', 'contract']).parse(params.get('kind'))
  const overview = await rpc<CommercialOverview>(client, 'commercial_overview')
  const offer = overview.offers.find(o => o.id === id)
  if (!offer || (kind === 'contract' && !offer.contract)) throw new HttpError(404, 'Documento non disponibile.')
  const pdf = await renderDocument(offer, kind)
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="upnology-${kind}-${id}.pdf"` } })
 }
 if (path === '/api/commercial/link' && request.method === 'POST') {
  const data = z.object({ offer_id: uuid, release_id: uuid.optional() }).parse(await jsonBody(request))
  const url = await rpc<string>(client, 'commercial_link', { p_offer: data.offer_id, p_release: data.release_id ?? null })
  return Response.json({ url: protectedLink(url) })
 }
 if (path === '/api/commercial/reconcile' && request.method === 'POST') {
  if (!(await rpc<boolean>(client, 'admin_access'))) throw new HttpError(403, 'Accesso admin richiesto.')
  const { attempt_id, session_id } = z.object({ attempt_id: uuid, session_id: z.string().regex(/^cs_(test_|live_)?[a-zA-Z0-9_]+$/) }).parse(await jsonBody(request))
  const result = await reconcileCheckout(attempt_id, session_id)
  if (f.email) waitUntil(deliverEmails().catch(() => { console.warn('Commercial email worker deferred; jobs remain in outbox') }))
  return Response.json(result)
 }
 if (path === '/api/commercial/email-templates' && request.method === 'GET') {
  if (!(await rpc<boolean>(client, 'admin_access'))) throw new HttpError(403, 'Accesso admin richiesto.')
  return Response.json(emailCopy)
 }
 if (path === '/api/commercial/refund' && request.method === 'POST') {
  if (!(await rpc<boolean>(client, 'admin_access'))) throw new HttpError(403, 'Accesso admin richiesto.')
  const { attempt_id } = z.object({ attempt_id: uuid, confirmed: z.literal(true) }).parse(await jsonBody(request))
  return Response.json(await requestRefund(client, attempt_id))
 }
 if (path === '/api/commercial/receipt' && request.method === 'POST') {
  const { attempt_id } = z.object({ attempt_id: uuid }).parse(await jsonBody(request))
  return Response.json(await paymentReceipt(client, attempt_id))
 }
 if (path === '/api/commercial/emails' && request.method === 'POST') {
  if (!(await rpc<boolean>(client, 'admin_access'))) throw new HttpError(403, 'Accesso admin richiesto.')
  return Response.json(await deliverEmails())
 }
 throw new HttpError(404, 'Endpoint non disponibile.')
}
export async function handleRequest(request: Request) {
 let response: Response
 try { response = await route(request) }
 catch (error) {
  const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 503
  response = Response.json({ error: error instanceof HttpError ? error.message : status === 400 ? 'Dati non validi.' : 'Servizio temporaneamente non disponibile.' }, { status })
 }
 response.headers.set('Cache-Control', 'private, no-store, max-age=0')
 response.headers.set('X-Content-Type-Options', 'nosniff')
 response.headers.set('Referrer-Policy', 'no-referrer')
 return response
}
