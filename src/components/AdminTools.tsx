import { useState, type FormEvent } from 'react'
import { workspaceCommand, type AdminCustomer, type AdminWorkspace, type BusinessSettings } from '../lib/admin'

export function LeadNotes({ leadId, data, refresh }: { leadId: string; data: AdminWorkspace; refresh: () => Promise<void> }) {
 const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
 const submit = async (e: FormEvent) => {
  e.preventDefault(); if (busy) return; setBusy(true); setError('')
  try { await workspaceCommand('note', { lead_id: leadId, note }); setNote(''); await refresh() }
  catch (e) { setError(e instanceof Error ? e.message : 'Aggiornamento non riuscito.') }
  finally { setBusy(false) }
 }
 return <details className="admin-notes"><summary>Note interne e storico</summary>{data.lead_history.filter(e => e.lead_id === leadId).map(e => <p key={e.id}>{new Date(e.created_at).toLocaleString('it-IT')} · {e.event_type}<br/>{e.note}</p>)}<form className="admin-project-form" onSubmit={submit}><label>Nota interna<textarea required minLength={2} maxLength={5000} value={note} onChange={e => setNote(e.target.value)}/></label><button className="admin-action" disabled={busy}>Aggiungi nota</button>{error && <p role="alert">{error}</p>}</form></details>
}

export function CustomerEditor({ customer: c, refresh }: { customer: AdminCustomer; refresh: () => Promise<void> }) {
 const [form, setForm] = useState({ display_name: c.first_name ?? '', last_name: c.last_name ?? '', phone: c.phone ?? '', company: c.company ?? '', sector: c.sector ?? '', city: c.city ?? '' })
 const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
 return <details><summary>Modifica anagrafica</summary><form className="admin-project-form" onSubmit={async e => {
  e.preventDefault(); if (busy) return; setBusy(true); setMessage('')
  try { await workspaceCommand('customer', { user_id: c.user_id, ...form }); setMessage('Anagrafica salvata.'); await refresh() }
  catch (e) { setMessage(e instanceof Error ? e.message : 'Salvataggio non riuscito.') }
  finally { setBusy(false) }
 }}><p>L’email di accesso resta gestita dall’account verificato. I documenti già emessi conservano i dati originali.</p><div className="admin-form-grid">{(Object.entries({ display_name: 'Nome', last_name: 'Cognome', phone: 'Telefono', company: 'Azienda', sector: 'Settore', city: 'Città' }) as [keyof typeof form, string][]).map(([key, label]) => <label key={key}>{label}<input maxLength={200} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}/></label>)}</div><button className="admin-action" disabled={busy}>Salva anagrafica</button>{message && <p role="status">{message}</p>}</form></details>
}

export function BusinessSettingsEditor({ data, refresh, currentUser }: { data: AdminWorkspace; refresh: () => Promise<void>; currentUser: string }) {
 const [form, setForm] = useState<BusinessSettings>({ company_name: 'Upnology', address: '', tax_id: '', timeline: '', payment_terms: '', responsibilities: '', delivery_terms: '', exclusions: '', ...data.settings })
 const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
 const run = async (action: string, payload: Record<string, unknown>) => {
  if (busy) return; setBusy(true); setMessage('')
  try { await workspaceCommand(action, payload); setMessage('Modifica registrata.'); await refresh() }
  catch (e) { setMessage(e instanceof Error ? e.message : 'Modifica non riuscita.') }
  finally { setBusy(false) }
 }
 return <section className="admin-section"><h2>Profilo aziendale e documenti</h2><p>I valori precompilano soltanto i nuovi preventivi. Contratti e preventivi già salvati restano invariati. Inserisci condizioni approvate dal tuo consulente.</p><form className="admin-project-form" onSubmit={e => { e.preventDefault(); void run('settings', form) }}><div className="admin-form-grid">{(Object.entries({ company_name: 'Ragione sociale', address: 'Indirizzo', tax_id: 'P. IVA / codice fiscale', timeline: 'Tempistiche predefinite', payment_terms: 'Condizioni di pagamento', responsibilities: 'Responsabilità', delivery_terms: 'Condizioni di consegna', exclusions: 'Esclusioni' }) as [keyof BusinessSettings, string][]).map(([key, label]) => <label key={key}>{label}<textarea required={key === 'company_name'} maxLength={5000} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}/></label>)}</div><button className="admin-action" disabled={busy}>Salva impostazioni</button></form>
 <h3>Amministratori autorizzati</h3>{data.admins.map(a => <div className="admin-record" key={a.user_id}>{a.email}{a.user_id !== currentUser && <button className="admin-text-button" disabled={busy} onClick={() => { if (window.confirm(`Revocare l’accesso amministratore a ${a.email}?`)) void run('revoke_admin', { email: a.email, confirmed: true }) }}>Revoca accesso</button>}</div>)}<form className="admin-project-form" onSubmit={e => { e.preventDefault(); if (window.confirm(`Concedere a ${email} accesso a tutti i clienti, documenti e pagamenti?`)) void run('grant_admin', { email, confirmed: true }) }}><label>Email di un account già verificato<input type="email" required value={email} onChange={e => setEmail(e.target.value)}/></label><button className="admin-action" disabled={busy}>Autorizza amministratore</button></form>
 {message && <p role="status">{message}</p>}<details><summary>Storico amministrativo (ultimi 100)</summary>{data.history.map(e => <p key={e.id}>{new Date(e.created_at).toLocaleString('it-IT')} · {e.kind}</p>)}</details></section>
}
