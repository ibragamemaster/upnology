import type { SupabaseClient } from '@supabase/supabase-js'

export const recoveryStorageKey = 'upnology-password-recovery'
export function passwordResetRedirect(origin: string) {
 const url = new URL(origin)
 return `${['upnology.agency', 'www.upnology.agency'].includes(url.hostname) ? 'https://upnology.agency' : url.origin}/reset-password`
}
export function recoveryCallback(href: string) {
 const url = new URL(href), hash = new URLSearchParams(url.hash.slice(1))
 return {
  requested: url.pathname.replace(/\/$/, '') === '/reset-password' || hash.get('type') === 'recovery' || url.searchParams.get('type') === 'recovery' || hash.get('error_code') === 'otp_expired' || url.searchParams.get('error_code') === 'otp_expired',
  error: ['error', 'error_code', 'error_description'].some(k => hash.has(k) || url.searchParams.has(k)),
  implicit: hash.get('type') === 'recovery' && hash.has('access_token') && hash.has('refresh_token'),
  tokenHash: url.searchParams.get('type') === 'recovery' ? url.searchParams.get('token_hash') : null,
 }
}
export function rememberRecovery(storage: Storage, userId: string) {
 try { storage.setItem(recoveryStorageKey, JSON.stringify({ userId, expires: Date.now() + 30 * 60 * 1000 })) } catch { /* Recovery remains unavailable if storage cannot retain its marker. */ }
}
export function hasRecovery(storage: Storage, userId: string) {
 try {
  const value = JSON.parse(storage.getItem(recoveryStorageKey) ?? 'null')
  return value?.userId === userId && value.expires > Date.now()
 } catch { return false }
}
export function clearRecovery(storage: Storage) {
 try { storage.removeItem(recoveryStorageKey) } catch { /* No token is stored here. */ }
}
// One exchange per client/page, including React StrictMode's repeated effects.
const callbacks = new WeakMap<SupabaseClient, Promise<boolean>>()
export function resolveRecovery(client: SupabaseClient, href: string, storage: Storage): Promise<boolean> {
 const existing = callbacks.get(client)
 if (existing) return existing
 const pending = (async () => {
  const callback = recoveryCallback(href)
  if (callback.error) { clearRecovery(storage); return false }
  const { error } = await client.auth.initialize()
  if (error) { clearRecovery(storage); return false }
  if (callback.tokenHash) {
   const result = await client.auth.verifyOtp({ token_hash: callback.tokenHash, type: 'recovery' })
   if (result.error || !result.data.session) { clearRecovery(storage); return false }
   rememberRecovery(storage, result.data.session.user.id)
  }
  const result = await client.auth.getUser()
  if (!result.error && result.data.user && callback.implicit) rememberRecovery(storage, result.data.user.id)
  return !result.error && !!result.data.user && hasRecovery(storage, result.data.user.id)
 })().catch(() => false)
 callbacks.set(client, pending)
 return pending
}
export async function completePasswordRecovery(client: SupabaseClient, password: string, storage: Storage) {
 if (password.length < 8) throw new Error('Inserisci una password di almeno 8 caratteri.')
 const { error } = await client.auth.updateUser({ password })
 if (error) {
  if (error.code === 'same_password') throw new Error('Scegli una password diversa da quella precedente.')
  if (/password|weak/i.test(error.code ?? '')) throw new Error('La password non soddisfa i requisiti di sicurezza. Scegline una più robusta.')
  throw new Error('Impossibile aggiornare la password. Riprova oppure richiedi un nuovo link.')
 }
 clearRecovery(storage)
 // Sign out only this browser so the confirmation can lead to a real login.
 try {
  const result = await client.auth.signOut({ scope: 'local' })
  return { signedOut: !result.error }
 } catch { return { signedOut: false } }
}
