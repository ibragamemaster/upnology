import { loginHref } from '../lib/authNavigation'
import { CustomerCommercial, DashboardActivity, FinanceSummary } from '../components/AdminControlCenter'
import { loadCommercial } from '../lib/commercial'
import type { CommercialOverview } from '../domain/commercial'
import { BusinessSettingsEditor, CustomerEditor, LeadNotes } from '../components/AdminTools'
import { euro } from '../domain/commercial'
import { CommercialPanel, type CommercialView } from '../components/CommercialPanel'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { hasAdminAccess, leadStatuses, loadAdmin, projectStatuses, saveAdminProject, setLeadStatus, type AdminQuote, type AdminCustomer, type AdminWorkspace, type AdminProject, type ProjectInput } from '../lib/admin'
import { budgetLabels, serviceLabels, timelineLabels } from '../domain/lead'

type Tab = 'overview' | 'quotes' | 'contacts' | 'customers' | 'projects' | 'contracts' | 'payments' | 'communications' | 'settings'
const tabLabels: Record<Tab, string> = { overview: 'Panoramica', quotes: 'Preventivi', contacts: 'Lead e contatti', customers: 'CRM clienti', projects: 'Progetti', contracts: 'Contratti', payments: 'Pagamenti', communications: 'Comunicazioni', settings: 'Impostazioni' }
const navigation = [{ label: 'Panoramica', tab: 'overview', tabs: ['overview'] }, { label: 'Pipeline commerciale', tab: 'quotes', tabs: ['quotes', 'contacts', 'contracts', 'communications'] }, { label: 'Clienti', tab: 'customers', tabs: ['customers'] }, { label: 'Progetti', tab: 'projects', tabs: ['projects'] }, { label: 'Finanze', tab: 'payments', tabs: ['payments'] }, { label: 'Impostazioni', tab: 'settings', tabs: ['settings'] }] as const
const emptyProject: ProjectInput = { title: '', customer_user_id: '', status: 'pianificato', service: '', description: '', start_date: '', due_date: '', internal_notes: '' }
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('it-IT') : '—'
const label = (value: string, options: readonly (readonly [string, string])[]) => options.find(([key]) => key === value)?.[1] ?? value.replaceAll('_', ' ')
const serviceName = (value: string) => serviceLabels[value as keyof typeof serviceLabels] ?? value

function StatusSelect({ value, leadId, onChange, disabled }: { value: string; leadId: string; onChange: (leadId: string, status: string) => void; disabled: boolean }) {
  return <select aria-label="Stato della richiesta" value={value} disabled={disabled} onChange={event => onChange(leadId, event.target.value)}>{leadStatuses.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
}

function CustomerDetail({ customer, data }: { customer: AdminCustomer; data: AdminWorkspace }) {
  const quotes = data.quotes.filter(item => item.customer_user_id === customer.user_id)
  const projects = data.projects.filter(item => item.customer_user_id === customer.user_id)
  return <div className="admin-customer-detail">
    <p><strong>Email:</strong> {customer.email} · <strong>Telefono:</strong> {customer.phone || '—'}</p>
    <p><strong>Azienda:</strong> {customer.company || '—'} · <strong>Settore:</strong> {customer.sector || '—'} · <strong>Città:</strong> {customer.city || '—'}</p>
    <p><strong>Creato:</strong> {date(customer.created_at)} · <strong>Preventivi:</strong> {customer.quotes} · <strong>Progetti:</strong> {customer.projects}</p>
    <div className="admin-customer-related"><div><h4>Preventivi recenti</h4>{quotes.length ? <ul>{quotes.map(item => <li key={item.id}>{item.services.map(serviceName).join(', ')} · {label(item.status, leadStatuses)} · {date(item.created_at)}</li>)}</ul> : <p>Nessuno nei risultati recenti.</p>}</div><div><h4>Progetti recenti</h4>{projects.length ? <ul>{projects.map(item => <li key={item.id}>{item.title} · {label(item.status, projectStatuses)}</li>)}</ul> : <p>Nessuno nei risultati recenti.</p>}</div></div>
  </div>
}


function QuoteBrief({ details }: { details?: Record<string, unknown> }) {
 if (!details) return null
 return <details><summary>Brief completo della richiesta</summary>{Object.entries(details).filter(([key]) => !['website','email','phone','whatsapp','name','submission_id'].includes(key)).map(([key,value]) => <p className="admin-message" key={key}><strong>{({ activityDescription:'Attività',goal:'Obiettivo',sector:'Settore',city:'Città',existingSite:'Sito attuale',features:'Funzionalità',notes:'Note',aiProcesses:'Processi AI',aiChannels:'Canali AI',aiTools:'Strumenti AI',preferredContact:'Contatto preferito',company:'Azienda',services:'Servizi',budget:'Budget',timeline:'Tempistiche',answers:'Esigenze' } as Record<string,string>)[key] ?? key}:</strong> {typeof value === 'string' ? value : JSON.stringify(value)}</p>)}</details>
}

export function AdminPage() {
  const { user, loading: authLoading, error: authError } = useAuth()
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied' | 'error'>('checking')
  const [data, setData] = useState<AdminWorkspace | null>(null)
  const [commercial, setCommercial] = useState<CommercialOverview | null>(null)
  const [commercialError, setCommercialError] = useState('')
  const [draftRevision, setDraftRevision] = useState(0)
  const [draftRequest, setDraftRequest] = useState<AdminQuote | undefined>()
  const [tab, setTab] = useState<Tab>(() => { const requested = new URLSearchParams(window.location.search).get('section'); return requested && Object.prototype.hasOwnProperty.call(tabLabels, requested) ? requested as Tab : 'overview' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [project, setProject] = useState<ProjectInput>(emptyProject)
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('')
  const matches = (values: unknown[]) => values.filter(Boolean).join(' ').toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))

  useEffect(() => {
    setData(null); setCommercial(null); setCommercialError(''); setAccess('checking'); setError('')
    if (authError || authLoading || !user) return
    let active = true
    hasAdminAccess().then(allowed => {
      if (!active) return
      setAccess(allowed ? 'allowed' : 'denied')
      if (allowed) loadCommercial().then(value => { if (active) setCommercial(value) }).catch(reason => { if (active) setCommercialError(reason instanceof Error ? reason.message : 'Dati commerciali non disponibili.') })
      if (allowed) loadAdmin().then(value => { if (active) setData(value) }).catch(() => { if (active) setError('Non riusciamo a caricare i dati admin.') })
    }).catch(() => { if (active) setAccess('error') })
    return () => { active = false }
  }, [authError, authLoading, user])

  useEffect(() => {
    if (access !== 'allowed' || !user || !['overview', 'customers'].includes(tab) || busy) return
    let active = true, running = false
    const reload = async () => {
      if (running || document.visibilityState !== 'visible') return
      running = true
      try {
        const [workspace, overview] = await Promise.all([loadAdmin(), loadCommercial()])
        if (active) { setData(workspace); setCommercial(overview); setCommercialError('') }
      } catch { if (active) setCommercialError('Aggiornamento automatico non riuscito. Usa Aggiorna dati.') }
      finally { running = false }
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void reload()
    }, 15000)
    const focus = () => { void reload() }
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus) }
  }, [access, user, tab, busy])

  const refresh = async () => { const value = await loadAdmin(); setData(value); try { setCommercial(await loadCommercial()); setCommercialError('') } catch (reason) { setCommercial(null); setCommercialError(reason instanceof Error ? reason.message : 'Dati commerciali non disponibili.') } }
  const navigate = (key: Tab) => { const url = new URL(window.location.href); url.searchParams.set('section', key); url.hash = ''; window.history.replaceState(null, '', url.pathname + url.search); setTab(key); setDraftRequest(undefined); setSearch(''); setFilter(''); setEditing(false); setNotice('') }
  const changeStatus = async (leadId: string, status: string) => {
    setBusy(true); setError(''); setNotice('')
    try { await setLeadStatus(leadId, status); setData(current => current ? { ...current, quotes: current.quotes.map(item => item.lead_id === leadId ? { ...item, status } : item), contacts: current.contacts.map(item => item.lead_id === leadId ? { ...item, status } : item) } : current); setNotice('Stato aggiornato.'); try { await refresh() } catch { setError('Stato salvato, ma la lista non si è aggiornata. Ricarica la pagina.') } }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Aggiornamento non riuscito.') }
    finally { setBusy(false) }
  }
  const editProject = (value?: AdminProject) => {
    if (value && data?.commercial_projects.some(p => p.project_id === value.id)) { document.getElementById('commercial-projects')?.scrollIntoView({ behavior: 'smooth' }); return }
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

  if (authError) return <main className="admin-shell"><p role="alert">{authError}</p><button onClick={() => window.location.reload()}>Riprova</button></main>
  if (authLoading || (user && access === 'checking')) return <main className="admin-shell"><p role="status">Verifica dell’accesso admin…</p></main>
  if (!user) return <main className="admin-shell"><div className="admin-gate"><h1>Accesso riservato.</h1><p>Accedi con un account amministratore Upnology.</p><a className="button-primary" href={loginHref(window.location.pathname + window.location.search + window.location.hash)}>Accedi</a></div></main>
  if (access === 'denied') return <main className="admin-shell"><div className="admin-gate"><h1>Accesso non autorizzato.</h1><p>Il tuo account non ha il ruolo amministratore.</p><a href="/account">Torna all’area cliente</a></div></main>
  if (access === 'error') return <main className="admin-shell"><div className="admin-gate"><h1>Verifica non riuscita.</h1><p>Non possiamo verificare i permessi in questo momento. Ricarica la pagina.</p></div></main>
  return <main className="admin-shell"><div className="admin-heading"><div><p className="eyebrow">Upnology / Operazioni</p><h1>Business Control Center</h1><p>Clienti, vendite e avanzamento del lavoro.</p></div><a href="/account">Area cliente ↗</a></div>
    {error && <p className="admin-alert" role="alert">{error}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}
    {!data ? error ? <button className="admin-action" type="button" onClick={() => { setError(''); refresh().catch(() => setError('Non riusciamo a caricare i dati admin.')) }}>Riprova</button> : <p role="status">Caricamento dashboard…</p> : <>
      <div className="admin-workspace"><nav className="admin-tabs" aria-label="Sezioni admin">{navigation.map(item => <button type="button" key={item.tab} className={(item.tabs as readonly string[]).includes(tab) ? 'active' : ''} aria-current={(item.tabs as readonly string[]).includes(tab) ? 'page' : undefined} onClick={() => navigate(item.tab)}>{item.label}</button>)}</nav><div className="admin-content"><div className="admin-section-heading"><h2>{navigation.find(item => (item.tabs as readonly string[]).includes(tab))?.label}</h2><button className="admin-text-button" disabled={busy} onClick={async () => { setBusy(true); try { await refresh(); setError('') } catch { setError('Aggiornamento non riuscito.') } finally { setBusy(false) } }}>Aggiorna dati</button></div>
      {['quotes','contacts','contracts','communications'].includes(tab) && <nav className="admin-subnav" aria-label="Pipeline commerciale">{(['quotes','contacts','contracts','communications'] as Tab[]).map(key => <button key={key} aria-current={key === tab ? 'page' : undefined} onClick={() => navigate(key)}>{tabLabels[key]}</button>)}</nav>}
      {commercialError && <p className="admin-alert" role="alert">Dati commerciali non disponibili: {commercialError}</p>}
      <p className="admin-data-note">Richieste, contatti, clienti e progetti: ultimi 100 per categoria. KPI su tutti i record; storico lead limitato agli ultimi 500 eventi.</p>
      {['overview','payments'].includes(tab) && <div className="admin-metrics admin-business-metrics">{([
        ['Preventivi in attesa', data.commercial_counts.pending_quotes], ['Contratti da accettare', data.commercial_counts.pending_contracts],
        ['Nuovi lead', data.counts.new_leads], ['Progetti in lavorazione', data.commercial_counts.working_projects],
        ['Incassi LIVE netti', euro(data.commercial_counts.live_received_cents)], ['Pagamenti TEST netti', euro(data.commercial_counts.test_received_cents)],
        ['Rate richieste / in verifica', euro(data.commercial_counts.pending_cents)],
       ] as const).map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>}
      {tab === 'payments' && commercial && <FinanceSummary data={data} commercial={commercial}/>}

      {['quotes','contracts','payments','communications','settings'].includes(tab) && <div id="admin-commercial"><CommercialPanel key={`${tab}-${draftRequest?.id ?? ''}-${draftRevision}`} initialRequest={tab === 'quotes' ? draftRequest : undefined} admin overview={commercial} onOverview={setCommercial} view={tab as CommercialView} customers={data.customers} requests={data.quotes} defaults={data.settings} onChanged={refresh}/></div>}
      {tab === 'settings' && <BusinessSettingsEditor data={data} refresh={refresh} currentUser={user.id}/>}
      {['customers','contacts','quotes','projects'].includes(tab) && <div className="admin-filters"><label>Cerca nei risultati recenti<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, email, azienda o progetto"/></label>{['quotes','contacts'].includes(tab) && <label>Stato richiesta<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Tutti</option>{leadStatuses.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}</div>}

      {tab === 'overview' && <DashboardActivity data={data} commercial={commercial} navigate={navigate}/>}
      {['quotes','contacts','customers','projects'].includes(tab) && (search || filter) && <p role="status">{(tab === 'quotes' ? data.quotes.filter(q => matches([q.name,q.email,q.company,...q.services]) && (!filter || q.status === filter)) : tab === 'contacts' ? data.contacts.filter(c => matches([c.name,c.email,c.company,c.message]) && (!filter || c.status === filter)) : tab === 'customers' ? data.customers.filter(c => matches([c.first_name,c.last_name,c.email,c.company,c.phone])) : data.projects.filter(p => matches([p.title,p.customer_name,p.customer_email,p.service]))).length} risultati nel registro per i filtri selezionati.</p>}
      {tab === 'quotes' && <section className="admin-section"><div className="admin-section-heading"><h2>Richieste di preventivo</h2><span>Ultime 100</span></div>{data.quotes.length ? <div className="admin-list">{data.quotes.filter(item => matches([item.name,item.email,item.company,...item.services]) && (!filter || item.status === filter)).map(item => <article className="admin-record" key={item.id}><div className="admin-record-main"><div><span className="admin-kicker">{date(item.created_at)}</span><h3>{item.name}</h3><p><a href={`mailto:${item.email}`}>{item.email}</a> · {item.phone || 'Telefono non indicato'}</p><p>{item.company || 'Azienda non indicata'}</p></div><div className="admin-record-meta"><p><strong>Servizi:</strong> {item.services.map(serviceName).join(', ')}</p><p><strong>Budget:</strong> {budgetLabels[item.budget as keyof typeof budgetLabels] ?? item.budget}</p><p><strong>Tempi:</strong> {timelineLabels[item.timeline as keyof typeof timelineLabels] ?? item.timeline}</p></div></div><div className="admin-record-actions"><label>Stato richiesta <StatusSelect value={item.status} leadId={item.lead_id} onChange={changeStatus} disabled={busy}/></label></div><p className="admin-data-note">Lo stato della richiesta è interno: “Accettato” non genera contratto o rate.</p><div className="commercial-actions">{commercial?.offers.filter(o => o.request_id === item.id).map(o => <a key={o.id} href={`#admin-offer-${o.id}`}>{o.snapshot.title} · {o.status} · v{o.version}</a>)}{!item.customer_user_id ? <p>Richiesta non associata: serve un account con la stessa email verificata. Se esiste già, verificare la migrazione di collegamento delle richieste.</p> : commercial?.offers.some(o => o.request_id === item.id) && !commercial.offers.some(o => o.request_id === item.id && o.status === 'BOZZA') ? <p>Preventivo già collegato. Per modificarlo apri il documento qui sopra e usa Crea nuova versione.</p> : <button type="button" className="admin-action" disabled={busy || !commercial} onClick={() => { setDraftRequest(item); setDraftRevision(value => value + 1); document.getElementById('admin-commercial')?.scrollIntoView({ behavior: 'smooth' }) }}>{commercial?.offers.some(o => o.request_id === item.id && o.status === 'BOZZA') ? 'Apri bozza collegata' : 'Prepara offerta collegata'}</button>}</div><QuoteBrief details={item.details}/><LeadNotes leadId={item.lead_id} data={data} refresh={refresh}/></article>)}</div> : <p>Nessun preventivo.</p>}</section>}
      {tab === 'contacts' && <section className="admin-section"><div className="admin-section-heading"><h2>Contatti</h2><span>Ultimi 100</span></div>{data.contacts.length ? <div className="admin-list">{data.contacts.filter(item => matches([item.name,item.email,item.company,item.message]) && (!filter || item.status === filter)).map(item => <article className="admin-record" key={item.id}><div className="admin-record-main"><div><span className="admin-kicker">{date(item.created_at)}</span><h3>{item.name}</h3><p><a href={`mailto:${item.email}`}>{item.email}</a> · {item.phone || 'Telefono non indicato'}</p><p>{item.company || 'Azienda non indicata'}</p></div><p className="admin-message">{item.message}</p></div><div className="admin-record-actions"><label>Stato richiesta <StatusSelect value={item.status} leadId={item.lead_id} onChange={changeStatus} disabled={busy}/></label></div><LeadNotes leadId={item.lead_id} data={data} refresh={refresh}/></article>)}</div> : <p>Nessun contatto.</p>}</section>}
      {tab === 'customers' && <section className="admin-section"><div className="admin-section-heading"><h2>Clienti</h2><span>Ultimi 100</span></div>{data.customers.length ? <div className="admin-list">{data.customers.filter(c => matches([c.first_name,c.last_name,c.email,c.company,c.phone])).map(customer => <details className="admin-customer" key={customer.user_id}><summary><strong>{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email}</strong><span>{customer.company || customer.email}</span><span>{customer.quotes} preventivi · {customer.projects} progetti</span></summary><CustomerDetail customer={customer} data={data}/>{commercial ? <CustomerCommercial customerId={customer.user_id} commercial={commercial}/> : <p>Dati commerciali {commercialError ? 'non disponibili' : 'in caricamento'}.</p>}<h4>Richieste e storico</h4>{data.quotes.filter(q => q.customer_user_id === customer.user_id).map(q => <div key={q.id}><p>{q.services.map(serviceName).join(', ')} · {label(q.status, leadStatuses)}</p><QuoteBrief details={q.details}/><LeadNotes leadId={q.lead_id} data={data} refresh={refresh}/></div>)}<h4>Contatti con la stessa email</h4>{data.contacts.filter(c => c.email.toLowerCase() === customer.email.toLowerCase()).map(c => <div key={c.id}><p>{c.message}</p><LeadNotes leadId={c.lead_id} data={data} refresh={refresh}/></div>)}<CustomerEditor customer={customer} refresh={refresh}/></details>)}</div> : <p>Nessun cliente registrato.</p>}</section>}
      {tab === 'projects' && <div id="commercial-projects"><CommercialPanel admin overview={commercial} onOverview={setCommercial} view="projects" customers={data.customers} requests={data.quotes} onChanged={refresh}/></div>}
      {tab === 'projects' && <section className="admin-section"><div className="admin-section-heading"><h2>Registro progetti</h2><button type="button" className="admin-action" onClick={() => editProject()}>Nuovo progetto</button></div>{editing && <form className="admin-project-form" onSubmit={submitProject}><div className="admin-form-heading"><h3>{project.id ? 'Modifica progetto' : 'Nuovo progetto'}</h3><button type="button" onClick={() => setEditing(false)}>Chiudi</button></div><div className="admin-form-grid"><label>Nome progetto<input value={project.title} onChange={e => setProject(current => ({ ...current, title: e.target.value }))} required minLength={2} maxLength={160}/></label><label>Cliente<select value={project.customer_user_id} onChange={e => setProject(current => ({ ...current, customer_user_id: e.target.value }))} required><option value="">Seleziona cliente</option>{data.customers.map(customer => <option key={customer.user_id} value={customer.user_id}>{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email} · {customer.email}</option>)}</select></label><label>Servizio<input value={project.service} onChange={e => setProject(current => ({ ...current, service: e.target.value }))} required minLength={2} maxLength={120}/></label><label>Stato<select value={project.status} onChange={e => setProject(current => ({ ...current, status: e.target.value }))}>{projectStatuses.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>Data inizio<input type="date" value={project.start_date} onChange={e => setProject(current => ({ ...current, start_date: e.target.value }))}/></label><label>Data prevista<input type="date" min={project.start_date || undefined} value={project.due_date} onChange={e => setProject(current => ({ ...current, due_date: e.target.value }))}/></label><label className="wide">Descrizione<textarea rows={3} maxLength={3000} value={project.description} onChange={e => setProject(current => ({ ...current, description: e.target.value }))}/></label><label className="wide">Note interne<textarea rows={3} maxLength={5000} value={project.internal_notes} onChange={e => setProject(current => ({ ...current, internal_notes: e.target.value }))}/></label></div><button className="admin-action" type="submit" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva progetto'}</button></form>}
        {data.projects.length ? <div className="admin-list">{data.projects.filter(item => matches([item.title,item.customer_name,item.customer_email,item.service])).map(item => <article className="admin-record" key={item.id}><div className="admin-record-main"><div><span className="admin-kicker">{item.service || 'Servizio non indicato'}</span><h3>{item.title}</h3><p>{item.customer_name || item.customer_email || 'Cliente non associato'}</p><p>Inizio: {date(item.start_date)} · Prevista: {date(item.due_date)}</p></div><div className="admin-record-meta"><p><strong>Stato:</strong> {label(item.status, projectStatuses)}</p><p>{item.description || 'Nessuna descrizione.'}</p>{item.internal_notes && <p><strong>Note interne:</strong> {item.internal_notes}</p>}</div></div><div className="admin-record-actions"><button type="button" className="admin-text-button" onClick={() => editProject(item)}>{data.commercial_projects.some(p => p.project_id === item.id) ? 'Gestisci nelle commesse commerciali ↑' : 'Modifica ↗'}</button></div></article>)}</div> : <p>Nessun progetto.</p>}</section>}
    </div></div></>}
  </main>
}
