import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'

type AuthState = { user: User | null; loading: boolean }
const AuthContext = createContext<AuthState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })
  useEffect(() => {
    let active = true
    let client: ReturnType<typeof getSupabaseClient>
    try { client = getSupabaseClient() }
    catch { setState({ user: null, loading: false }); return }
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ user: session?.user ?? null, loading: false })
    })
    client.auth.getUser().then(({ data }) => {
      if (active) setState({ user: data.user, loading: false })
    }).catch(() => { if (active) setState({ user: null, loading: false }) })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { return useContext(AuthContext) }
