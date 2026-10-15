import { getSupabaseClient } from './supabase'
import type { CommercialOverview } from '../domain/commercial'
export type CommercialFeatures = { backend: boolean; payments: boolean; email: boolean; stripeMode: string | null }
export async function commercialFetch<T>(path: string, data?: unknown): Promise<T> {
 const { data: { session } } = await getSupabaseClient().auth.getSession()
 const response = await fetch(`/api/commercial/${path}`, {
  method: data === undefined ? 'GET' : 'POST',
  headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
  ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
 })
 if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Il servizio commerciale non è disponibile. In locale avvia anche npm run dev:api.')
 const result = await response.json()
 if (!response.ok) throw new Error(result.error ?? 'Operazione non riuscita.')
 return result as T
}
export const loadCommercial = () => commercialFetch<CommercialOverview>('overview')
export const commercialCommand = (action: string, data: Record<string, unknown>) => commercialFetch<{ id?: string }>('command', { action, data })
export async function downloadCommercialDocument(offerId: string, kind: 'quote' | 'contract') {
 const { data: { session } } = await getSupabaseClient().auth.getSession()
 if (!session) throw new Error('Accedi per scaricare il documento.')
 const response = await fetch(`/api/commercial/document?offer_id=${encodeURIComponent(offerId)}&kind=${kind}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
 if (!response.ok) {
  const result = await response.json().catch(() => ({}))
  throw new Error(result.error ?? 'Documento non disponibile.')
 }
 if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Il servizio documenti non è disponibile.')
 const url = URL.createObjectURL(await response.blob()), anchor = document.createElement('a')
 anchor.href = url; anchor.download = `upnology-${kind}-${offerId}.pdf`; anchor.click()
 setTimeout(() => URL.revokeObjectURL(url), 10000)
}
