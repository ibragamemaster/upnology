import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'
import { clearRecovery, recoveryCallback, rememberRecovery, resolveRecovery } from './passwordRecovery'

type AuthState = { user: User | null; loading: boolean; recovery: boolean; error?: string }
const AuthContext = createContext<AuthState>({ user: null, loading: true, recovery: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, recovery: false })
  useEffect(() => {
    let active = true
    let authRevision = 0
    const href = window.location.href
    const callback = recoveryCallback(href)
    let client: ReturnType<typeof getSupabaseClient>
    try { client = getSupabaseClient() }
    catch { setState({ user: null, loading: false, recovery: false, error: 'Autenticazione non configurata: impossibile caricare il tuo account.' }); return }
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION') authRevision += 1
      if (event === 'PASSWORD_RECOVERY' && session && !callback.error) {
        rememberRecovery(window.sessionStorage, session.user.id)
        if (window.location.pathname.replace(/\/$/, '') !== '/reset-password') {
          window.location.replace('/reset-password')
          return
        }
      }
      if (event === 'SIGNED_OUT') clearRecovery(window.sessionStorage)
      if (active) setState(current => ({ user: session?.user ?? null, loading: callback.requested ? current.loading : false, recovery: event === 'PASSWORD_RECOVERY' && !callback.error ? true : session ? current.recovery : false }))
    })
    if (callback.requested) {
      resolveRecovery(client, href, window.sessionStorage).then(valid => {
        if (!active) return
        if (window.location.pathname.replace(/\/$/, '') !== '/reset-password') {
          window.location.replace(valid ? '/reset-password' : '/reset-password?error=invalid_link')
          return
        }
        // Remove callback credentials only after the SDK has consumed them.
        window.history.replaceState(null, '', '/reset-password')
        setState(current => ({ ...current, loading: false, recovery: valid }))
      })
    } else {
      const revision = authRevision
      client.auth.getUser().then(({ data, error }) => {
      if (active && revision === authRevision) setState({ user: data.user, loading: false, recovery: false, ...(error && error.name !== 'AuthSessionMissingError' ? { error: 'Verifica della sessione non riuscita. Riprova.' } : {}) })
    }).catch(() => { if (active && revision === authRevision) setState({ user: null, loading: false, recovery: false, error: 'Connessione al servizio di autenticazione non riuscita.' }) })
    }
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { return useContext(AuthContext) }
