import { getSupabaseClient } from './supabase'

export type CustomerProfile = {
  user_id: string; display_name: string | null; last_name: string | null;
  phone: string | null; company: string | null; sector: string | null; city: string | null;
  created_at: string; updated_at: string;
}
export type CustomerRequest = {
  id: string; created_at: string; services: string[]; budget: string; timeline: string; status: string;
}
export type CustomerProject = { id: string; title: string; status: string; updated_at: string }
export type AccountOverview = { profile: CustomerProfile | null; requests: CustomerRequest[]; projects: CustomerProject[] }

export async function loadAccount(): Promise<AccountOverview> {
  const { data, error } = await getSupabaseClient().rpc('account_overview')
  if (error) throw new Error('Non riusciamo a caricare i dati del tuo account. Riprova.')
  if (!data || typeof data !== 'object') throw new Error('I dati del tuo account non sono disponibili.')
  return data as AccountOverview
}

export async function saveProfile(value: { first_name: string; last_name: string; phone: string; company: string; sector: string; city: string }): Promise<CustomerProfile> {
  const { data, error } = await getSupabaseClient().rpc('update_customer_profile', { p_profile: value })
  if (error) throw new Error('Non riusciamo a salvare il profilo. Controlla i dati e riprova.')
  if (!data || typeof data !== 'object') throw new Error('Il profilo non è stato confermato.')
  return data as CustomerProfile
}
