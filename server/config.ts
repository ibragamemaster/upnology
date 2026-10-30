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
 const payments = backend && stripeConfigurationChecks().every(check => check.ok)
 const email = backend && process.env.RESEND_ENABLED === 'true' && !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM && !!process.env.APP_URL && !!supabaseSecretKey()
 return { backend, payments, email, stripeMode: payments ? process.env.STRIPE_MODE : null, workspaceVersion: 2 }
}
// Fixed messages only: never serialize environment values or URL parsing errors.
export function stripeConfigurationChecks() {
 const mode = process.env.STRIPE_MODE
 const validMode = mode === 'live' || mode === 'test'
 const matchingKey = mode === 'live' ? /^(?:sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? '') : mode === 'test' && /^(?:sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? '')
 let validOrigin = false
 try { appOrigin(); validOrigin = true } catch { /* Do not expose the supplied URL. */ }
 const enabled = process.env.STRIPE_ENABLED === 'true'
 const webhook = !!process.env.STRIPE_WEBHOOK_SECRET?.trim()
 const primary = !!process.env.SUPABASE_SECRET_KEY?.trim()
 const privileged = !!supabaseSecretKey()
 return [
  { name: 'STRIPE_ENABLED', ok: enabled, reason: enabled ? 'Flag di abilitazione attivo.' : 'Variabile assente o non uguale esattamente a true.' },
  { name: 'STRIPE_MODE / STRIPE_SECRET_KEY', ok: matchingKey, reason: !validMode ? 'Modalità assente o diversa da live/test.' : matchingKey ? 'Prefisso della chiave coerente con la modalità. Validità e permessi non verificati.' : 'Chiave assente o prefisso incompatibile con la modalità configurata.' },
  { name: 'STRIPE_WEBHOOK_SECRET', ok: webhook, reason: webhook ? 'Segreto presente. Firma e associazione all’endpoint non verificate.' : 'Segreto assente o vuoto.' },
  { name: 'SUPABASE_SECRET_KEY', ok: privileged, reason: primary ? 'Chiave server primaria presente. Validità non verificata.' : privileged ? 'Chiave primaria assente; fallback SUPABASE_SERVICE_ROLE_KEY presente e utilizzato.' : 'Chiave primaria e fallback SUPABASE_SERVICE_ROLE_KEY assenti o vuoti.' },
  { name: 'APP_URL', ok: validOrigin, reason: validOrigin ? 'URL conforme al controllo di origine HTTPS del server.' : 'URL assente, non valido, non HTTPS, con credenziali o percorso non consentito.' },
 ]
}
export function protectedLink(raw: string) {
 let url: URL
 try { url = new URL(raw) } catch { throw new HttpError(400, 'URL non valido.') }
 const allowed = (process.env.DEMO_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
 if (url.protocol !== 'https:' || url.username || url.password || !allowed.includes(url.origin)) throw new HttpError(400, 'Il dominio deve essere autorizzato e protetto prima della pubblicazione.')
 return url.href
}
