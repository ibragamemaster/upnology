import { getSupabaseClient } from './supabase'
import { passwordResetRedirect, completePasswordRecovery } from './passwordRecovery'

export function authError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Email o password non corretti.'
  if (/email not confirmed/i.test(message)) return 'Verifica la tua email prima di accedere.'
  if (/user already registered/i.test(message)) return 'Questa email è già registrata. Prova ad accedere.'
  if (/password should be|weak password/i.test(message)) return 'Scegli una password più sicura.'
  if (/rate limit|too many requests/i.test(message)) return 'Troppi tentativi. Attendi qualche minuto e riprova.'
  if (/network|fetch/i.test(message)) return 'Connessione non disponibile. Riprova.'
  return 'Operazione non riuscita. Riprova tra poco.'
}

export async function signUp(email: string, password: string, firstName: string) {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email, password, options: { data: { first_name: firstName }, emailRedirectTo: `${window.location.origin}/account` },
  })
  if (error) throw new Error(authError(error.message))
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
  if (error) throw new Error(authError(error.message))
  return data.user
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut()
  if (error) throw new Error(authError(error.message))
}

export async function sendPasswordReset(email: string) {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
    redirectTo: passwordResetRedirect(window.location.origin),
  })
  if (error) throw new Error(authError(error.message))
}

export async function updatePassword(password: string) {
  return completePasswordRecovery(getSupabaseClient(), password, window.sessionStorage)
}
