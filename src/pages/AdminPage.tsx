import { CommercialPanel } from '../components/CommercialPanel'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { hasAdminAccess, leadStatuses, loadAdmin, projectStatuses, saveAdminProject, setLeadStatus, type AdminCustomer, type AdminOverview, type AdminProject, type ProjectInput } from '../lib/admin'
import { budgetLabels, serviceLabels, timelineLabels } from '../domain/lead'

type Tab = 'overview' | 'quotes' | 'contacts' | 'customers' | 'projects' | 'commercial'
const tabLabels: Record<Tab, string> = { overview: 'Panoramica', quotes: 'Preventivi', contacts: 'Contatti', customers: 'Clienti', projects: 'Progetti', commercial: 'Commerciale' }
const emptyProject: ProjectInput = { title: '', customer_user_id: '', status: 'pianificato', service: '', description: '', start_date: '', due_date: '', internal_notes: '' }
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('it-IT') : '—'
const label = (value: string, options: readonly (readonly [string, string])[]) => options.find(([key]) => key === value)?.[1] ?? value.replaceAll('_', ' ')
const serviceName = (value: string) => serviceLabels[value as keyof typeof serviceLabels] ?? value

function StatusSelect({ value, leadId, onChange, disabled }: { value: string; leadId: string; onChange: (leadId: string, status: string) => void; disabled: boolean }) {
  return <select aria-label="Stato della richiesta" value={value} disabled={disabled} onChange={event => onChange(leadId, event.target.value)}>{leadStatuses.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
}

function CustomerDetail({ customer, data }: { customer: AdminCustomer; data: AdminOverview }) {
  const quotes = data.quotes.filter(item => item.customer_user_id === customer.user_id)
  const projects = data.projects.filter(item => item.customer_user_id === customer.user_id)
  return <div className="admin-customer-detail">
    <p><strong>Email:</strong> {customer.email} · <strong>Telefono:</strong> {customer.phone || '—'}</p>
    <p><strong>Azienda:</strong> {customer.company || '—'} · <strong>Settore:</strong> {customer.sector || '—'} · <strong>Città:</strong> {customer.city || '—'}</p>
    <p><strong>Creato:</strong> {date(customer.created_at)} · <strong>Preventivi:</strong> {customer.quotes} · <strong>Progetti:</strong> {customer.projects}</p>
    <div className="admin-customer-related"><div><h4>Preventivi recenti</h4>{quotes.length ? <ul>{quotes.map(item => <li key={item.id}>{item.services.map(serviceName).join(', ')} · {label(item.status, leadStatuses)} · {date(item.created_at)}</li>)}</ul> : <p>Nessuno nei risultati recenti.</p>}</div><div><h4>Progetti recenti</h4>{projects.length ? <ul>{projects.map(item => <li key={item.id}>{item.title} · {label(item.status, projectStatuses)}</li>)}</ul> : <p>Nessuno nei risultati recenti.</p>}</div></div>
  </div>
}

export function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied' | 'error'>('checking')
  const [data, setData] = useState<AdminOverview | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [project, setProject] = useState<ProjectInput>(emptyProject)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (authLoading || !user) return
    let active = true
    hasAdminAccess().then(allowed => {
      if (!active) return
      setAccess(allowed ? 'allowed' : 'denied')
      if (allowed) loadAdmin().then(value => { if (active) setData(value) }).catch(() => { if (active) setError('Non riusciamo a caricare i dati admin.') })
    }).catch(() => { if (active) setAccess('error') })
    return () => { active = false }
  }, [authLoading, user])

  const refresh = async () => { const value = await loadAdmin(); setData(value) }
  const changeStatus = async (leadId: string, status: string) => {
    setBusy(true); setError(''); setNotice('')
    try { await setLeadStatus(leadId, status); setData(current => current ? { ...current, quotes: current.quotes.map(item => item.lead_id === leadId ? { ...item, status } : item), contacts: current.contacts.map(item => item.lead_id === leadId ? { ...item, status } : item) } : current); setNotice('Stato aggiornato.'); try { await refresh() } catch { setError('Stato salvato, ma la lista non si è aggiornata. Ricarica la pagina.') } }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Aggiornamento non riuscito.') }
    finally { setBusy(false) }
  }
  const editProject = (value?: AdminProject) => {
    setProject(value ? { id: value.id, title: value.title, customer_user_id: value.customer_user_id ?? '', status: value.status, service: value.service ?? '', description: value.description ?? '', start_date: value.start_date ?? '', due_date: value.due_date ?? '', internal_notes: value.internal_notes ?? '' } : emptyProject)
    setEditing(true); setError(''); setNotice('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const submitProject = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { await saveAdminProject(project); setEditing(false); setProject(emptyProject); setNotice('Progetto salvato.'); try { await refresh() } catch { setError('Progetto salvato, ma la lista non si è aggiornata. Ricarica la pagina.') } }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Salvataggio non riuscito.') }
    finally { setBusy(false) }
  }

  if (authLoading || (user && access === 'checking')) return <main className="admin-shell"><p role="status">Verifica dell’accesso admin…</p></main>
  if (!user) return <main className="admin-shell"><div className="admin-gate"><h1>Accesso riservato.</h1><p>Accedi con un account amministratore Upnology.</p><a className="button-primary" href="/login">Accedi</a></div></main>
  if (access === 'denied') return <main className="admin-shell"><div className="admin-gate"><h1>Accesso non autorizzato.</h1><p>Il tuo account non ha il ruolo amministratore.</p><a href="/account">Torna all’area cliente</a></div></main>
  if (access === 'error') return <main className="admin-shell"><div className="admin-gate"><h1>Verifica non riuscita.</h1><p>Non possiamo verificare i permessi in questo momento. Ricarica la pagina.</p></div></main>
  return <main className="admin-shell"><div className="admin-heading"><div><p className="eyebrow">Upnology / Operazioni</p><h1>Admin</h1><p>Lead, clienti e progetti in un unico spazio.</p></div><a href="/account">Area cliente ↗</a></div>
    {error && <p className="admin-alert" role="alert">{error}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}
    {!data ? error ? <button className="admin-action" type="button" onClick={() => { setError(''); refresh().catch(() => setError('Non riusciamo a caricare i dati admin.')) }}>Riprova</button> : <p role="status">Caricamento dashboard…</p> : <>
      <div className="admin-metrics" aria-label="Riepilogo"><div><span>Nuovi lead</span><strong>{data.counts.new_leads}</strong></div><div><span>Preventivi</span><strong>{data.counts.quotes}</strong></div><div><span>Contatti</span><strong>{data.counts.contacts}</strong></div><div><span>Clienti</span><strong>{data.counts.customers}</strong></div><div><span>Progetti</span><strong>{data.counts.projects}</strong></div></div>
      <nav className="admin-tabs" aria-label="Sezioni admin">{(Object.keys(tabLabels) as Tab[]).map(key => <button type="button" key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setEditing(false); setError(''); setNotice('') }}>{tabLabels[key]}</button>)}</nav>
      {tab === 'commercial' && <CommercialPanel admin customers={data.customers} requests={data.quotes}/>}
      {tab === 'overview' && <div className="admin-overview"><section className="admin-section"><h2>Nuovi lead</h2>{[...data.quotes.map(q => ({ id: q.id, name: q.name, email: q.email, source: 'Preventivo', created_at: q.created_at, status: q.status })), ...data.contacts.map(c => ({ id: c.id, name: c.name, email: c.email, source: 'Contatto', created_at: c.created_at, status: c.status }))].filter(item => item.status === 'nuovo').sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,10).map(item => <div className="admin-compact-row" key={item.id}><strong>{item.name}</strong><span>{item.source}</span><span>{item.email}</span><time>{date(item.created_at)}</time></div>)}{data.counts.new_leads === 0 && <p>Nessun nuovo lead.</p>}</section><section className="admin-section"><h2>Attività recente</h2><p>Apri Preventivi e Contatti per aggiornare gli stati. Le liste mostrano gli ultimi 100 elementi per categoria; i numeri sopra includono tutti i record.</p><button type="button" className="admin-text-button" onClick={() => setTab('quotes')}>Vai ai preventivi ↗</button></section></div>}
      {tab === 'quotes' && <section className="admin-section"><div className="admin-section-heading"><h2>Preventivi</h2><span>Ultimi 100</span></div>{data.quotes.length ? <div className="admin-list">{data.quotes.map(item => <article className="admin-record" key={item.id}><div className="admin-record-main"><div><span className="admin-kicker">{date(item.created_at)}</span><h3>{item.name}</h3><p><a href={`mailto:${item.email}`}>{item.email}</a> · {item.phone || 'Telefono non indicato'}</p><p>{item.company || 'Azienda non indicata'}</p></div><div className="admin-record-meta"><p><strong>Servizi:</strong> {item.services.map(serviceName).join(', ')}</p><p><strong>Budget:</strong> {budgetLabels[item.budget as keyof typeof budgetLabels] ?? item.budget}</p><p><strong>Tempi:</strong> {timelineLabels[item.timeline as keyof typeof timelineLabels] ?? item.timeline}</p></div></div><div className="admin-record-actions"><label>Stato <StatusSelect value={item.status} leadId={item.lead_id} onChange={changeStatus} disabled={busy}/></label></div></article>)}</div> : <p>Nessun preventivo.</p>}</section>}
      {tab === 'contacts' && <section className="admin-section"><div className="admin-section-heading"><h2>Contatti</h2><span>Ultimi 100</span></div>{data.contacts.length ? <div className="admin-list">{data.contacts.map(item => <article className="admin-record" key={item.id}><div className="admin-record-main"><div><span className="admin-kicker">{date(item.created_at)}</span><h3>{item.name}</h3><p><a href={`mailto:${item.email}`}>{item.email}</a> · {item.phone || 'Telefono non indicato'}</p><p>{item.company || 'Azienda non indicata'}</p></div><p className="admin-message">{item.message}</p></div><div className="admin-record-actions"><label>Stato <StatusSelect value={item.status} leadId={item.lead_id} onChange={changeStatus} disabled={busy}/></label></div></article>)}</div> : <p>Nessun contatto.</p>}</section>}
      {tab === 'customers' && <section className="admin-section"><div className="admin-section-heading"><h2>Clienti</h2><span>Ultimi 100</span></div>{data.customers.length ? <div className="admin-list">{data.customers.map(customer => <details className="admin-customer" key={customer.user_id}><summary><strong>{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email}</strong><span>{customer.company || customer.email}</span><span>{customer.quotes} preventivi · {customer.projects} progetti</span></summary><CustomerDetail customer={customer} data={data}/></details>)}</div> : <p>Nessun cliente registrato.</p>}</section>}
      {tab === 'projects' && <section className="admin-section"><div className="admin-section-heading"><h2>Progetti</h2><button type="button" className="admin-action" onClick={() => editProject()}>Nuovo progetto</button></div>{editing && <form className="admin-project-form" onSubmit={submitProject}><div className="admin-form-heading"><h3>{project.id ? 'Modifica progetto' : 'Nuovo progetto'}</h3><button type="button" onClick={() => setEditing(false)}>Chiudi</button></div><div className="admin-form-grid"><label>Nome progetto<input value={project.title} onChange={e => setProject(current => ({ ...current, title: e.target.value }))} required minLength={2} maxLength={160}/></label><label>Cliente<select value={project.customer_user_id} onChange={e => setProject(current => ({ ...current, customer_user_id: e.target.value }))} required><option value="">Seleziona cliente</option>{data.customers.map(customer => <option key={customer.user_id} value={customer.user_id}>{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email} · {customer.email}</option>)}</select></label><label>Servizio<input value={project.service} onChange={e => setProject(current => ({ ...current, service: e.target.value }))} required minLength={2} maxLength={120}/></label><label>Stato<select value={project.status} onChange={e => setProject(current => ({ ...current, status: e.target.value }))}>{projectStatuses.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>Data inizio<input type="date" value={project.start_date} onChange={e => setProject(current => ({ ...current, start_date: e.target.value }))}/></label><label>Data prevista<input type="date" min={project.start_date || undefined} value={project.due_date} onChange={e => setProject(current => ({ ...current, due_date: e.target.value }))}/></label><label className="wide">Descrizione<textarea rows={3} maxLength={3000} value={project.description} onChange={e => setProject(current => ({ ...current, description: e.target.value }))}/></label><label className="wide">Note interne<textarea rows={3} maxLength={5000} value={project.internal_notes} onChange={e => setProject(current => ({ ...current, internal_notes: e.target.value }))}/></label></div><button className="admin-action" type="submit" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva progetto'}</button></form>}
        {data.projects.length ? <div className="admin-list">{data.projects.map(item => <article className="admin-record" key={item.id}><div className="admin-record-main"><div><span className="admin-kicker">{item.service || 'Servizio non indicato'}</span><h3>{item.title}</h3><p>{item.customer_name || item.customer_email || 'Cliente non associato'}</p><p>Inizio: {date(item.start_date)} · Prevista: {date(item.due_date)}</p></div><div className="admin-record-meta"><p><strong>Stato:</strong> {label(item.status, projectStatuses)}</p><p>{item.description || 'Nessuna descrizione.'}</p>{item.internal_notes && <p><strong>Note interne:</strong> {item.internal_notes}</p>}</div></div><div className="admin-record-actions"><button type="button" className="admin-text-button" onClick={() => editProject(item)}>Modifica ↗</button></div></article>)}</div> : <p>Nessun progetto.</p>}</section>}
    </>}
  </main>
}
