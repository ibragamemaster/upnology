import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HttpError, supabaseSecretKey } from './config.ts'
export async function rpc<T>(client: SupabaseClient, name: string, args: Record<string, unknown> = {}): Promise<T> {
 const { data, error } = await client.rpc(name, args)
 if (error) {
  // Never expose SQL, credentials, or provider response bodies to the browser.
  if (error.code === '42501') throw new HttpError(403, 'Operazione non autorizzata.')
  if (error.code === 'P0001' || error.code === '22023') throw new HttpError(409, error.message)
  if (['PGRST202', '42P01', '42883', '42703'].includes(error.code)) {
   if (name === 'commercial_workspace_v2') throw new HttpError(503, 'Schema Workspace 2.0 incompleto: verificare la migrazione 20261030000000_commercial_workspace_v2 e le sue dipendenze nel progetto Supabase configurato.')
   if (name === 'customer_payment_attempt') throw new HttpError(503, 'Recupero pagamenti non disponibile: verificare la migrazione 20261030010000_checkout_recovery nel progetto Supabase configurato.')
   throw new HttpError(503, 'Schema commerciale incompleto: verificare le migrazioni nel progetto Supabase configurato.')
  }
  throw new HttpError(503, 'Operazione non riuscita. Riprova o contatta l’amministratore.')
 }
 return data as T
}
export function serviceClient() {
 const url = process.env.SUPABASE_URL, key = supabaseSecretKey()
 if (!url || !key) throw new HttpError(503, 'Servizio non configurato.')
 return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
export function service<T = unknown>(action: string, data: Record<string, unknown> = {}) {
 return rpc<T>(serviceClient(), 'commercial_service', { p_action: action, p_data: data })
}
export async function userClient(request: Request) {
 const token = request.headers.get('authorization')
 if (!token?.startsWith('Bearer ') || token.length > 12000) throw new HttpError(401, 'Accedi per continuare.')
 const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
  global: { headers: { Authorization: token } }, auth: { persistSession: false, autoRefreshToken: false },
 })
 const { data, error } = await client.auth.getUser(token.slice(7))
 if (error || !data.user || !data.user.email_confirmed_at) throw new HttpError(401, 'Sessione non valida o email non verificata.')
 return client
}
