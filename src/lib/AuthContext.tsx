import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'
import { clearRecovery, recoveryCallback, rememberRecovery, resolveRecovery } from './passwordRecovery'

type AuthState = { user: User | null; loading: boolean; recovery: boolean }
const AuthContext = createContext<AuthState>({ user: null, loading: true, recovery: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, recovery: false })
  useEffect(() => {
    let active = true
    const href = window.location.href
    const callback = recoveryCallback(href)
    let client: ReturnType<typeof getSupabaseClient>
    try { client = getSupabaseClient() }
    catch { setState({ user: null, loading: false, recovery: false }); return }
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
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
    } else client.auth.getUser().then(({ data }) => {
      if (active) setState({ user: data.user, loading: false, recovery: false })
    }).catch(() => { if (active) setState({ user: null, loading: false, recovery: false }) })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { return useContext(AuthContext) }
