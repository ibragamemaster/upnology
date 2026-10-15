import { getSupabaseClient } from './supabase'

export const leadStatuses = [
  ['nuovo', 'Nuovo'], ['da_contattare', 'Da contattare'], ['contattato', 'Contattato'],
  ['preventivo_inviato', 'Preventivo inviato'], ['trattativa', 'Trattativa'],
  ['accettato', 'Accettato'], ['rifiutato', 'Rifiutato'], ['chiuso', 'Chiuso'],
] as const
export const projectStatuses = [
  ['pianificato', 'Pianificato'], ['in_lavorazione', 'In lavorazione'],
  ['in_revisione', 'In revisione'], ['completato', 'Completato'], ['sospeso', 'Sospeso'],
  ['attivo', 'Attivo (precedente)'], ['archiviato', 'Archiviato (precedente)'],
] as const

export type AdminQuote = { id: string; lead_id: string; customer_user_id: string | null; name: string; email: string; phone: string | null; company: string | null; services: string[]; budget: string; timeline: string; created_at: string; status: string }
export type AdminContact = { id: string; lead_id: string; name: string; email: string; phone: string | null; company: string | null; message: string; created_at: string; status: string }
export type AdminCustomer = { user_id: string; first_name: string | null; last_name: string | null; email: string; phone: string | null; company: string | null; sector: string | null; city: string | null; created_at: string; quotes: number; projects: number }
export type AdminProject = { id: string; title: string; customer_user_id: string | null; customer_name: string | null; customer_email: string | null; status: string; service: string | null; description: string | null; start_date: string | null; due_date: string | null; internal_notes: string | null; created_at: string; updated_at: string }
export type AdminOverview = { counts: { new_leads: number; quotes: number; contacts: number; customers: number; projects: number }; quotes: AdminQuote[]; contacts: AdminContact[]; customers: AdminCustomer[]; projects: AdminProject[] }
export type ProjectInput = { id?: string; title: string; customer_user_id: string; status: string; service: string; description: string; start_date: string; due_date: string; internal_notes: string }

export async function hasAdminAccess(): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc('admin_access')
  if (error) throw new Error('Impossibile verificare i permessi admin. Riprova.')
  return data === true
}

export async function loadAdmin(): Promise<AdminOverview> {
  const { data, error } = await getSupabaseClient().rpc('admin_overview')
  if (error || !data || typeof data !== 'object') throw new Error('Impossibile caricare la dashboard admin. Riprova.')
  return data as AdminOverview
}

export async function setLeadStatus(leadId: string, status: string) {
  const { data, error } = await getSupabaseClient().rpc('admin_set_lead_status', { p_lead_id: leadId, p_status: status })
  if (error || data !== status) throw new Error('Stato non aggiornato. Riprova.')
}

export async function saveAdminProject(project: ProjectInput): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('admin_save_project', { p_project: project })
  if (error || typeof data !== 'string') throw new Error('Progetto non salvato. Controlla i dati e riprova.')
  return data
}
