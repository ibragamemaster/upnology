export class HttpError extends Error {
 readonly status: number
 constructor(status: number, message: string) { super(message); this.status = status }
}
export function appOrigin() {
 const raw = process.env.APP_URL
 if (!raw) throw new HttpError(503, 'Dominio applicazione non configurato.')
 const url = new URL(raw)
 if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new HttpError(503, 'APP_URL deve essere un’origine HTTPS.')
 return url.origin
}
// Server-only: prefer the new secret key, with legacy deployments supported.
export function supabaseSecretKey() {
 return process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined
}
export function features() {
 const backend = process.env.COMMERCIAL_ENABLED === 'true' && !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY
 const payments = backend && process.env.STRIPE_ENABLED === 'true' && !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET && !!supabaseSecretKey() && !!process.env.APP_URL && ['test', 'live'].includes(process.env.STRIPE_MODE ?? '')
 const email = backend && process.env.RESEND_ENABLED === 'true' && !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM && !!process.env.APP_URL && !!supabaseSecretKey()
 return { backend, payments, email, stripeMode: payments ? process.env.STRIPE_MODE : null }
}
export function protectedLink(raw: string) {
 let url: URL
 try { url = new URL(raw) } catch { throw new HttpError(400, 'URL non valido.') }
 const allowed = (process.env.DEMO_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
 if (url.protocol !== 'https:' || url.username || url.password || !allowed.includes(url.origin)) throw new HttpError(400, 'Il dominio deve essere autorizzato e protetto prima della pubblicazione.')
 return url.href
}
