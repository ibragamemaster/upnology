import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { loginHref } from '../lib/authNavigation'
import { commercialFetch, type CommercialFeatures } from '../lib/commercial'
import type { AdminWorkspace } from '../lib/admin'
import { euro, type CommercialOverview } from '../domain/commercial'
import { pipelineStages, stageLabels, type PipelineItem } from '../domain/workspace'
import { CommercialPanel, type CommercialView } from '../components/CommercialPanel'
import { BusinessSettingsEditor, CustomerEditor } from '../components/AdminTools'
import '../workspace.css'
type Snapshot = { version: 2; workspace: AdminWorkspace; commercial: CommercialOverview; pipeline: PipelineItem[]; generated_at: string }
const sections = ['overview', 'pipeline', 'customers', 'quotes', 'contracts', 'projects', 'payments', 'communications', 'settings'] as const
type Section = typeof sections[number]
const labels: Record<Section, string> = { overview: 'Panoramica', pipeline: 'Pipeline', customers: 'Clienti', quotes: 'Preventivi', contracts: 'Contratti', projects: 'Progetti', payments: 'Finanze', communications: 'Notifiche', settings: 'Impostazioni' }
function sectionFromUrl(): Section { const value = new URLSearchParams(location.search).get('section'); return sections.includes(value as Section) ? value as Section : 'overview' }
export function WorkspacePage() {
 const { user, loading, error: authError } = useAuth()
 const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [error, setError] = useState('')
 const [section, setSection] = useState<Section>(sectionFromUrl), [search, setSearch] = useState('')
 const [selected, setSelected] = useState<string | null>(null)
 const mounted = useRef(false), sequence = useRef(0)
 const invalidateRequests = useCallback(() => { sequence.current++ }, [])
 const hasSnapshot = snapshot !== null
 const drawer = useRef<HTMLDialogElement>(null)
 const fetchAndUpdate = useCallback(async () => {
  const request = ++sequence.current
  try {
   const status = await commercialFetch<CommercialFeatures>('status')
   if (!status.backend) throw new Error('Backend disabilitato in questo ambiente: verificare COMMERCIAL_ENABLED, SUPABASE_URL e SUPABASE_ANON_KEY sul server. Nessun flag è stato modificato.')
   if (status.workspaceVersion !== 2) throw new Error('Frontend e API non allineati: questo server non pubblica Workspace 2.0. Occorre distribuire frontend e API della stessa versione.')
   const value = await commercialFetch<Snapshot>('workspace')
   if (value.version !== 2) throw new Error('Risposta API incompatibile con Workspace 2.0. Verificare il deploy del backend.')
   if (mounted.current && request === sequence.current) { setSnapshot(value); setError('') }
   return value
  }
  catch (reason) { if (mounted.current && request === sequence.current) setError(reason instanceof Error ? reason.message : 'Workspace non disponibile.'); throw reason }
 }, [])
 const refresh = useCallback(async () => { await fetchAndUpdate() }, [fetchAndUpdate])
 const loadOverview = useCallback(async () => (await fetchAndUpdate()).commercial, [fetchAndUpdate])
 useEffect(() => {
  mounted.current = true; setSnapshot(null); setError('')
  if (user && !loading && !authError) void refresh().catch(() => {})
  return () => { mounted.current = false; invalidateRequests() }
 }, [user, loading, authError, refresh, invalidateRequests])
 useEffect(() => {
  if (!hasSnapshot || selected || !['overview', 'pipeline', 'customers'].includes(section)) return
  let running = false
  const poll = async () => { if (running || document.visibilityState !== 'visible') return; running = true; try { await refresh() } catch { /* visible error retained */ } finally { running = false } }
  const timer = window.setInterval(() => void poll(), 15000)
  window.addEventListener('focus', poll)
  return () => { clearInterval(timer); window.removeEventListener('focus', poll) }
 }, [hasSnapshot, selected, section, refresh])
 useEffect(() => { const pop = () => { setSection(sectionFromUrl()); setSelected(null) }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop) }, [])
 const syncOverview = useCallback((value: CommercialOverview | null) => { if (value) setSnapshot(current => current ? { ...current, commercial: value } : current) }, [])
 useEffect(() => { if (selected && section !== 'quotes') drawer.current?.showModal() }, [selected, section])
 const navigate = (next: Section) => { history.pushState(null, '', `/admin/workspace?section=${next}`); setSection(next); setSelected(null); setSearch('') }
 if (loading) return <main className="workspace-gate" role="status">Verifica sessione…</main>
 if (authError) return <main className="workspace-gate" role="alert">{authError}</main>
 if (!user) return <main className="workspace-gate"><h1>Upnology Workspace</h1><a href={loginHref(location.pathname + location.search)}>Accedi</a></main>
 const data = snapshot?.workspace
 const rows = snapshot?.pipeline.filter(row => `${row.title} ${row.customer} ${row.attention.join(' ')}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))) ?? []
 const active = snapshot?.pipeline.find(row => row.id === selected)
 const request = data?.quotes.find(q => q.id === active?.request_id)
 const counts = data?.commercial_counts
 const openEditor = (row: PipelineItem) => { setSelected(null); navigate('quotes'); if (row.offer_id) location.hash = `offer-${row.offer_id}`; else setSelected(row.id) }
 const panel = (view: CommercialView, initial = false) => snapshot && data && <CommercialPanel key={initial ? selected : section} admin view={view} customers={data.customers} requests={data.quotes} defaults={data.settings} overview={snapshot.commercial} loadOverview={loadOverview} onOverview={syncOverview} onChanged={refresh} initialRequest={initial ? request : undefined}/>
 return <main className="workspace-v2">
  <aside className="workspace-sidebar"><a className="workspace-brand" href="/admin/workspace">UP<span>NOLOGY</span><small>WORKSPACE / 02</small></a><nav aria-label="Gestionale">{sections.map((key, i) => <button key={key} aria-current={section === key ? 'page' : undefined} onClick={() => navigate(key)}><span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{labels[key]}</button>)}</nav><div className="workspace-sidebar-footer"><a href="/account">Area cliente ↗</a><a href="/admin">Admin precedente ↗</a></div></aside>
  <div className="workspace-main"><header className="workspace-topbar"><span>Business operations <b>/ {labels[section]}</b></span><button onClick={() => void refresh().catch(() => {})}>Aggiorna</button></header>
   <section className="workspace-heading"><div><p>UPNOLOGY / CONTROL CENTER</p><h1>{labels[section]}</h1></div><span>{snapshot ? `Dati aggiornati alle ${new Date(snapshot.generated_at).toLocaleTimeString('it-IT')}` : 'Connessione al gestionale'}</span></section>
   {error && <div className="workspace-error" role="alert">{error} {snapshot && 'I dati visualizzati potrebbero non essere aggiornati.'}</div>}
   {!snapshot && !error && <p role="status">Caricamento dati autorizzati…</p>}
   {snapshot && data && <>
    {section === 'overview' && <><div className="workspace-kpis">{[['Clienti', data.counts.customers], ['Offerte in attesa', counts?.pending_quotes], ['Da incassare', counts ? euro(counts.pending_cents) : '—'], ['Incassi LIVE netti', counts ? euro(counts.live_received_cents) : '—']].map(([name, value]) => <article key={name}><span>{name}</span><strong>{value}</strong></article>)}</div><div className="workspace-section-title"><h2>Azioni da gestire</h2><button onClick={() => navigate('pipeline')}>Apri pipeline ↗</button></div><div className="workspace-task-list">{snapshot.pipeline.filter(row => row.attention.length || ['request', 'signature', 'payment'].includes(row.stage)).map(row => <button key={row.id} onClick={() => setSelected(row.id)}><span><strong>{row.customer}</strong><small>{row.title}</small></span><span>{row.attention[0] || row.action} ↗</span></button>)}{!snapshot.pipeline.length && <p>Nessuna richiesta o offerta registrata.</p>}</div></>}
    {['pipeline', 'customers'].includes(section) && <label className="workspace-search">Cerca<input type="search" value={search} placeholder="Cliente, progetto o problema…" onChange={e => setSearch(e.target.value)}/></label>}
    {section === 'pipeline' && <div className="workspace-kanban">{pipelineStages.map(stage => <section className="workspace-lane" key={stage}><h2>{stageLabels[stage]} <span>{rows.filter(row => row.stage === stage).length}</span></h2>{rows.filter(row => row.stage === stage).map(row => <button className="workspace-card" key={row.id} onClick={() => setSelected(row.id)}><small>{row.customer}</small><strong>{row.title}</strong><span>{row.amount_cents === null ? 'Importo da definire' : euro(row.amount_cents)}</span>{row.attention.map(note => <em key={note}>{note}</em>)}<footer>{row.action} ↗</footer></button>)}</section>)}</div>}
    {section === 'customers' && <div className="workspace-customer-list">{data.customers.filter(c => `${c.company} ${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(search.toLowerCase())).map(customer => <details key={customer.user_id}><summary><strong>{customer.company || [customer.first_name, customer.last_name].join(' ')}</strong><span>{customer.email}</span></summary><CustomerEditor customer={customer} refresh={refresh}/>{snapshot.pipeline.filter(row => row.customer_user_id === customer.user_id).map(row => <button key={row.id} onClick={() => setSelected(row.id)}>{row.title} · {stageLabels[row.stage]} ↗</button>)}</details>)}{data.counts.customers > data.customers.length && <p>Visualizzati i {data.customers.length} clienti più recenti; la ricerca riguarda questo elenco.</p>}</div>}
    {!['overview', 'pipeline', 'customers'].includes(section) && <>{section === 'settings' && <BusinessSettingsEditor data={data} refresh={refresh} currentUser={user.id}/>} {panel(section as CommercialView, section === 'quotes' && !!selected)}</>}
    {active && section !== 'quotes' && <dialog ref={drawer} className="workspace-drawer" aria-label="Dettaglio commerciale" onCancel={() => setSelected(null)}><button autoFocus onClick={() => setSelected(null)}>Chiudi ×</button><p>{stageLabels[active.stage]}</p><h2>{active.title}</h2><h3>{active.customer}</h3><p>{active.action}</p>{active.attention.map(note => <p key={note} className="workspace-error">{note}</p>)}<dl>{[['Richiesta', active.request_id], ['Cliente', active.customer_user_id], ['Preventivo', active.offer_id], ['Progetto', active.project_id]].map(([label, id]) => <div key={label}><dt>{label}</dt><dd>{id || 'Non ancora collegato'}</dd></div>)}</dl><button disabled={!active.customer_user_id} onClick={() => openEditor(active)}>Apri documenti e azioni ↗</button>{request && <p>{request.services.join(', ')} · {request.budget} · {request.timeline}</p>}</dialog>}
   </>}
  </div>
 </main>
}
