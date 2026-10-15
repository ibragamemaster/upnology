import { contactSchema, quoteSchema, type ContactRequest, type QuoteRequest } from '../domain/lead'
import { getSupabaseClient } from './supabase'

function submissionError(message: string) {
  if (/network|fetch/i.test(message)) return 'Connessione non disponibile. Controlla la rete e riprova.'
  return 'Non siamo riusciti a ricevere la richiesta. Riprova tra poco.'
}

export async function submitQuoteRequest(value: QuoteRequest): Promise<string> {
  const payload = quoteSchema.parse(value)
  const { data, error } = await getSupabaseClient().rpc('submit_quote_request', { p_payload: payload })
  if (error) throw new Error(submissionError(error.message))
  if (typeof data !== 'string') throw new Error('La richiesta non è stata confermata. Riprova.')
  return data
}

export async function submitContactMessage(value: ContactRequest): Promise<string> {
  const payload = contactSchema.parse(value)
  const { data, error } = await getSupabaseClient().rpc('submit_contact_message', { p_payload: payload })
  if (error) throw new Error(submissionError(error.message))
  if (typeof data !== 'string') throw new Error('Il messaggio non è stato confermato. Riprova.')
  return data
}
