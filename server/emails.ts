import { appOrigin, features, HttpError } from './config.ts'
import { service } from './database.ts'
import { euro } from '../src/domain/commercial.ts'
export const emailCopy: Record<string, { subject: string; message: string }> = {
 quote_available: { subject: 'Il tuo preventivo è pronto', message: 'Abbiamo preparato il preventivo dettagliato. Puoi consultarlo, scaricarlo e comunicarci la tua decisione dall’area cliente.' },
 quote_accepted: { subject: 'Preventivo accettato', message: 'La tua accettazione è stata registrata. I servizi e gli importi concordati sono conservati nella versione accettata.' },
 contract_available: { subject: 'Il contratto è disponibile', message: 'Il contratto riporta il preventivo concordato. Leggilo e conferma l’accettazione per procedere con il primo pagamento.' },
 payment_first: { subject: 'Primo pagamento richiesto', message: 'La prima tranche è disponibile nell’area cliente. Il progetto inizierà dopo la conferma del pagamento.' },
 payment_confirmed: { subject: 'Pagamento confermato', message: 'Abbiamo ricevuto la conferma del pagamento. Trovi lo stato aggiornato nell’area cliente.' },
 project_started: { subject: 'Il progetto è in lavorazione', message: 'Il primo pagamento è confermato: il progetto entra in lavorazione secondo le condizioni concordate.' },
 demo_available: { subject: 'La demo è pronta da provare', message: 'Accedi alla demo dalla tua area cliente. Prova le funzionalità e lascia il tuo feedback prima di approvare la milestone.' },
 feedback_requested: { subject: 'Aspettiamo il tuo feedback', message: 'La nuova versione è disponibile. Puoi segnalare osservazioni e seguire le risposte del team nella tua area cliente.' },
 payment_second: { subject: 'Seconda tranche richiesta', message: 'L’approvazione della demo è stata registrata. Puoi procedere con la seconda tranche prevista dal contratto.' },
 project_update: { subject: 'Novità sul tuo progetto', message: 'Il team ha pubblicato un aggiornamento sul tuo progetto.' },
 project_completed: { subject: 'Versione finale da verificare', message: 'Lo sviluppo è completato. Verifica il risultato finale e invia il tuo feedback o approva la milestone.' },
 payment_final: { subject: 'Saldo richiesto', message: 'La versione finale è stata approvata. Il saldo è disponibile nella tua area cliente; la consegna avverrà secondo contratto dopo la conferma.' },
 payment_final_confirmed: { subject: 'Saldo confermato', message: 'Il saldo è stato confermato. Il team può procedere con la consegna definitiva prevista dal contratto.' },
 delivery: { subject: 'Consegna definitiva disponibile', message: 'I materiali della consegna definitiva sono disponibili nella tua area cliente. Grazie per aver scelto Upnology.' },
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export type EmailJob = { id: string; lease_id: string; recipient: string; kind: string; payload: { name: string; title: string; offer_id: string; amount_cents?: number; message?: string } }
export function renderEmail(job: EmailJob, origin: string) {
 const copy = emailCopy[job.kind]
 if (!copy) throw new Error('Unknown email template')
 const p = job.payload, url = `${origin}/account#offer-${p.offer_id}`
 const details = `${copy.message}${p.message ? '\n\n' + p.message : ''}${p.amount_cents ? '\nImporto: ' + euro(p.amount_cents) : ''}`
 return {
  subject: `Upnology · ${copy.subject} · ${p.title}`,
  text: `Ciao ${p.name},\n\n${p.title}\n${details}\n\nApri la tua area cliente: ${url}\n\nUpnology`,
  html: `<!doctype html><html lang="it"><body style="margin:0;background:#f3f4f8;font-family:Arial,sans-serif;color:#101426"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:16px"><tr><td style="padding:32px"><p style="color:#5143d9;font-weight:bold;letter-spacing:3px">UPNOLOGY</p><h1 style="font-size:26px">${escape(copy.subject)}</h1><p>Ciao ${escape(p.name)},</p><h2 style="font-size:18px">${escape(p.title)}</h2><p style="line-height:1.7;white-space:pre-line">${escape(details)}</p><p style="padding:20px 0"><a href="${escape(url)}" style="background:#5143d9;color:#fff;padding:14px 22px;text-decoration:none;border-radius:8px">Apri area cliente</a></p><p style="font-size:12px;color:#626779">Comunicazione relativa al progetto ${escape(p.offer_id)}. I documenti e i dettagli sono disponibili nel tuo account.</p></td></tr></table></td></tr></table></body></html>`,
 }
}
export async function deliverEmails() {
 if (!features().email) throw new HttpError(503, 'Invio email non ancora configurato. La coda è conservata.')
 const origin = appOrigin()
 const jobs = await service<EmailJob[]>('claim_emails', { limit: 3 })
 let sent = 0
 for (const job of jobs) {
  try {
   const content = renderEmail(job, origin)
   const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `upnology-${job.id}` },
    body: JSON.stringify({ from: process.env.RESEND_FROM, to: [job.recipient], ...content }), signal: AbortSignal.timeout(12000),
   })
   if (!response.ok) {
    await service('email_result', { id: job.id, lease_id: job.lease_id, error: `Resend HTTP ${response.status}`, permanent: response.status >= 400 && response.status < 500 && ![429, 408].includes(response.status) })
    continue
   }
   const result = await response.json() as { id?: string }
   if (!result.id) throw new Error('Missing provider receipt')
   await service('email_result', { id: job.id, lease_id: job.lease_id, provider_id: result.id }); sent++
  } catch {
   // If receipt persistence fails, retry with the identical body/key inside the provider's 24h window.
   await service('email_result', { id: job.id, lease_id: job.lease_id, error: 'Delivery or receipt persistence failed; retry with same idempotency key' })
  }
 }
 return { processed: jobs.length, sent }
}
