import { quoteDraft, quoteAmounts, requestBrief, requestDescription } from '../domain/quoteDraft'
import { milestoneAction, releaseApprovalBlock } from '../domain/commercialFlow'
import { StripeDiagnostics } from './StripeDiagnostics'
import { PaymentPhases } from './AdminControlCenter'
import { paymentDiagnosis, readable } from '../lib/adminPresentation'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { AdminCustomer, AdminQuote, BusinessSettings } from '../lib/admin'
import { commercialCommand, commercialFetch, downloadCommercialDocument, loadCommercial, type CommercialFeatures } from '../lib/commercial'
import { euro, type CommercialOverview, type ContractTemplate, type Offer, type OfferSnapshot } from '../domain/commercial'
import '../commercial.css'
const date = (value: string | null) => value ? new Date(value).toLocaleString('it-IT') : '—'
type Run = (operation: () => Promise<unknown>, success?: string) => Promise<void>

function QuoteEditor({ offer, templates, customers, requests, busy, run, done, defaults, initialRequest, offers }: { offers: Offer[]; initialRequest?: AdminQuote; defaults?: Partial<BusinessSettings>; offer?: Offer; templates: ContractTemplate[]; customers: AdminCustomer[]; requests: AdminQuote[]; busy: boolean; run: Run; done: () => void }) {
 const [s, setSnapshot] = useState<OfferSnapshot>(() => offer?.snapshot ?? quoteDraft(initialRequest, customers.find(c => c.user_id === initialRequest?.customer_user_id), defaults, offers))
 const [customer, setCustomer] = useState(offer?.customer_user_id ?? initialRequest?.customer_user_id ?? '')
 const [request, setRequest] = useState(offer?.request_id ?? initialRequest?.id ?? '')
 const [template, setTemplate] = useState(offer?.template_id ?? (templates.filter(t => t.approved_at).length === 1 ? templates.find(t => t.approved_at)!.id : ''))
 const [expiry, setExpiry] = useState((offer ? new Date(offer.expires_at) : new Date(Date.now() + 30 * 86400000)).toISOString().slice(0, 10))
 const set = <K extends keyof OfferSnapshot>(key: K, value: OfferSnapshot[K]) => setSnapshot(current => ({ ...current, [key]: value }))
 const source = requests.find(q => q.id === request) ?? (initialRequest?.id === request ? initialRequest : undefined)
 const amounts = quoteAmounts(s)
 const selectRequest = (id: string) => {
  if (id === request) return
  const selected = requests.find(q => q.id === id)
  if (!selected) { setRequest(id); return }
  if ((s.description || s.items.some(item => item.amount_cents > 0)) && !window.confirm('Caricare i dati della richiesta selezionata? Titolo, descrizione, servizi e prezzi della bozza verranno sostituiti; le condizioni già inserite restano.')) return
  const next = quoteDraft(selected, customers.find(c => c.user_id === customer), defaults, offers)
  setRequest(id)
  setSnapshot(current => ({ ...current, title: next.title, description: next.description, items: next.items, customer: next.customer, timeline: next.timeline }))
 }
 const submit = (event: FormEvent) => {
  event.preventDefault()
  void run(async () => {
   await commercialCommand('save', { id: offer?.id, customer_user_id: customer, request_id: request, template_id: template, snapshot: s, expires_at: new Date(`${expiry}T23:59:59`).toISOString() }); done()
  }, 'Bozza salvata. Gli importi definitivi sono stati calcolati dal server.')
 }
 return <form className="commercial-form" onSubmit={submit}>
  <div className="commercial-heading"><h3>{offer ? 'Modifica bozza' : 'Nuovo preventivo'}</h3><button type="button" onClick={done}>Chiudi</button></div>
  {customers.length === 0 && !customer && <p role="status">Prima di creare un’offerta serve un cliente con account verificato.</p>}
  {!templates.some(t => t.approved_at) && <p role="status">Nessun modello contrattuale approvato: puoi preparare una bozza, ma l’invio richiede l’approvazione del modello in Impostazioni.</p>}
  <div className="commercial-grid">
   <label>Cliente verificato<select required value={customer} onChange={e => {
    const c = customers.find(x => x.user_id === e.target.value)
    setCustomer(e.target.value); setRequest(''); set('customer', quoteDraft(undefined, c, defaults, offers).customer)
   }}><option value="">Seleziona cliente</option>{customer && !customers.some(c => c.user_id === customer) && <option value={customer}>{offer?.snapshot.customer.name || initialRequest?.name || 'Cliente già collegato'} · {offer?.snapshot.customer.email || initialRequest?.email}</option>}{customers.map(c => <option key={c.user_id} value={c.user_id}>{c.company || [c.first_name, c.last_name].join(' ')} · {c.email}</option>)}</select></label>
   <label>Richiesta di origine<select value={request} onChange={e => selectRequest(e.target.value)}><option value="">Nessuna richiesta associata</option>{request && !requests.some(q => q.id === request && q.customer_user_id === customer) && <option value={request}>Richiesta già collegata · {request}</option>}{requests.filter(q => q.customer_user_id === customer).map(q => <option key={q.id} value={q.id}>{date(q.created_at)} · {q.services.join(', ')}</option>)}</select></label>
   <label>Titolo progetto<input required maxLength={160} value={s.title} onChange={e => set('title', e.target.value)}/></label>
   <label>Scadenza preventivo<input type="date" required value={expiry} onChange={e => setExpiry(e.target.value)}/></label>
   <label>Modello contrattuale<select required value={template} onChange={e => setTemplate(e.target.value)}><option value="">Seleziona modello</option>{templates.map(t => <option key={t.id} value={t.id}>{t.title} · {t.approved_at ? 'Approvato' : 'Da approvare'}</option>)}</select></label>
  </div>
  {source && <details className="commercial-card" open><summary>Dati già raccolti · richiesta {source.id}</summary><p>Il budget è indicativo: i prezzi dell’offerta devono essere confermati dall’admin. I dati fiscali non raccolti restano da completare; quelli recuperati da offerte precedenti vanno verificati.</p>{requestBrief(source).map((row,i) => <p className="commercial-pre" key={`${row.label}-${i}`}><strong>{row.label}:</strong> {row.value}</p>)}{requestDescription(source).length > 5000 && <p role="status">La descrizione precompilata è limitata a 5.000 caratteri. Il brief completo è conservato nella richiesta e mostrato qui sopra; verifica il testo destinato al cliente.</p>}</details>}
  {(['customer', 'supplier'] as const).map(party => <fieldset key={party}><legend>{party === 'customer' ? 'Dati di fatturazione cliente' : 'Dati del fornitore'}</legend><div className="commercial-grid">{([['name', 'Nome / ragione sociale'], ['address', 'Indirizzo completo'], ['tax_id', 'Codice fiscale / P. IVA']] as const).map(([key, label]) => <label key={key}>{label}<input required value={s[party][key]} maxLength={500} onChange={e => set(party, { ...s[party], [key]: e.target.value })}/></label>)}</div></fieldset>)}
  <fieldset><legend>Servizi e prezzi</legend>{s.items.map((item, i) => <div className="commercial-line" key={i}><label>Servizio / descrizione<input required minLength={2} maxLength={1000} value={item.description} onChange={e => set('items', s.items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}/></label><label>Prezzo EUR<input type="number" min="0.01" step="0.01" required value={item.amount_cents ? item.amount_cents / 100 : ''} onChange={e => set('items', s.items.map((x, j) => j === i ? { ...x, amount_cents: Math.round(Number(e.target.value) * 100) } : x))}/></label><button type="button" disabled={s.items.length === 1} onClick={() => set('items', s.items.filter((_, j) => j !== i))}>Rimuovi</button></div>)}<button type="button" disabled={s.items.length >= 40} onClick={() => set('items', [...s.items, { description: '', amount_cents: 0 }])}>Aggiungi servizio</button></fieldset>
  <div className="commercial-grid"><label>Imposta (%)<input type="number" min="0" max="100" step="0.01" required value={s.tax_bps / 100} onChange={e => set('tax_bps', Math.round(Number(e.target.value) * 100))}/></label><label>Descrizione imposta / regime<input required maxLength={500} placeholder="Indicare il regime applicabile" value={s.tax_label} onChange={e => set('tax_label', e.target.value)}/></label><label>Revisioni incluse<input type="number" min="0" max="100" required value={s.revisions} onChange={e => set('revisions', Number(e.target.value))}/></label>{s.percentages.map((part, i) => <label key={i}>Fase {i + 1} (%)<input type="number" min="1" max="98" required value={part} onChange={e => set('percentages', s.percentages.map((p, j) => j === i ? Number(e.target.value) : p))}/></label>)}</div>
  <div className="commercial-grid">{s.payment_due_days.map((days, i) => <label key={i}>Giorni per pagare la fase {i + 1}<input type="number" required min="1" max="365" value={days} onChange={e => set('payment_due_days', s.payment_due_days.map((d, j) => j === i ? Number(e.target.value) : d))}/></label>)}</div>
  <p>Anteprima: imponibile {euro(amounts.subtotal)} · imposte {euro(amounts.tax)} · totale {euro(amounts.total)}. {amounts.instalments.map((amount,i) => `${['Avvio','Demo','Consegna'][i]} ${s.percentages[i]}%: ${euro(amount)}`).join(' · ')}. Importi definitivi ricalcolati dal server al salvataggio.</p>
  <p>Totale percentuali: {s.percentages.reduce((a, b) => a + b, 0)}%. Il server calcola imposte e tranche in centesimi e assegna alla terza tranche l’eventuale resto.</p>
  <div className="commercial-grid">{([['description', 'Descrizione dettagliata del progetto'], ['timeline', 'Tempistiche e decorrenza'], ['payment_terms', 'Condizioni e scadenze di pagamento'], ['responsibilities', 'Responsabilità delle parti'], ['delivery_terms', 'Condizioni di consegna'], ['exclusions', 'Esclusioni']] as const).map(([key, label]) => <label key={key}>{label}<textarea required minLength={2} maxLength={5000} rows={3} value={s[key]} onChange={e => set(key, e.target.value)}/></label>)}</div>
  <button type="submit" disabled={busy || s.percentages.reduce((a,b) => a+b,0) !== 100}>Salva bozza</button>
 </form>
}

function TemplateApproval({ template, run, busy }: { template: ContractTemplate; run: Run; busy: boolean }) {
 const [reference, setReference] = useState(''), [confirmed, setConfirmed] = useState(false)
 return <form className="commercial-form" onSubmit={e => { e.preventDefault(); void run(() => commercialCommand('approve_template', { id: template.id, confirmed, legal_reference: reference }), 'Approvazione registrata per questo modello.') }}>
  <label>Riferimento alla revisione legale<input required minLength={6} maxLength={500} value={reference} onChange={e => setReference(e.target.value)} placeholder="Consulente, data e riferimento del documento"/></label>
  <label className="commercial-check"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>Confermo che questo modello è stato approvato dal consulente legale per l’utilizzo reale.</label>
  <button disabled={busy || !confirmed}>Registra approvazione</button>
 </form>
}

function TemplateEditor({ templates, run, busy }: { templates: ContractTemplate[]; run: Run; busy: boolean }) {
 const [title, setTitle] = useState(''), [body, setBody] = useState('')
 return <details className="commercial-card"><summary>Modelli contrattuali e approvazione legale</summary>
  <p>Inserisci il testo verificato dal tuo consulente. Dopo l’approvazione il modello è immutabile; per cambiare il testo crea un nuovo modello. I dati commerciali saranno allegati automaticamente.</p>
  <form className="commercial-form" onSubmit={e => { e.preventDefault(); void run(async () => { await commercialCommand('template', { title, body }); setTitle(''); setBody('') }, 'Modello creato, in attesa di approvazione legale.') }}>
   <label>Nome e versione<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)}/></label><label>Testo contrattuale<textarea required minLength={20} maxLength={30000} rows={8} value={body} onChange={e => setBody(e.target.value)}/></label><button disabled={busy}>Crea modello</button>
  </form>
  {templates.map(t => <details key={t.id}><summary>{t.title} · {t.approved_at ? `Approvato ${date(t.approved_at)}` : 'Da approvare'}</summary><p className="commercial-pre">{t.body}</p>{t.approved_at ? <p>Riferimento: {t.legal_reference}</p> : <TemplateApproval template={t} run={run} busy={busy}/>}</details>)}
 </details>
}

function OfferCard({ offer: o, admin, features, run, busy, edit, templates, onVersionCreated }: { onVersionCreated: (id: string) => void; templates: ContractTemplate[]; offer: Offer; admin: boolean; features: CommercialFeatures; run: Run; busy: boolean; edit: (offer: Offer) => void }) {
 const [confirmed, setConfirmed] = useState(false), [contractConfirmed, setContractConfirmed] = useState(false)
 const [releaseId, setReleaseId] = useState(''), [message, setMessage] = useState(''), [url, setUrl] = useState(''), [protection, setProtection] = useState('')
 const [action, setAction] = useState('update'), [phase, setPhase] = useState(2), [resolution, setResolution] = useState('')
 const [due, setDue] = useState(''), [milestoneId, setMilestoneId] = useState('')
 const [attemptId, setAttemptId] = useState(''), [stripeSession, setStripeSession] = useState('')
 const send = (name: string, data: Record<string, unknown> = {}, success = 'Operazione registrata.') => {
  if (admin && ['send','delivery','prepare_delivery'].includes(name) && !window.confirm('Confermi questa operazione e i dati del cliente? Verrà registrata nello storico.')) return Promise.resolve()
  return run(() => commercialCommand(name, { offer_id: o.id, ...data }), success)
 }
 const openLink = (release?: string) => run(async () => { const result = await commercialFetch<{ url: string }>('link', { offer_id: o.id, ...(release ? { release_id: release } : {}) }); window.location.assign(result.url) })
 return <article className="commercial-card" id={`offer-${o.id}`}>
  <div className="commercial-heading"><div><p className="eyebrow">Preventivo v{o.version} · {o.status}</p><h3>{o.snapshot.title}</h3><p>{o.snapshot.customer.name} · {o.snapshot.customer.email}</p></div><strong>{euro(o.total_cents)}</strong></div>
  <p>Scadenza: {date(o.expires_at)} · Revisioni: {o.snapshot.revisions}</p>
  {o.previous_id && <p>Deriva dal preventivo {o.previous_id}. Le versioni precedenti restano conservate. L’accettazione di questa versione crea una commessa distinta, senza annullare gli obblighi già accettati.</p>}
  <details><summary>Servizi, importi e condizioni</summary><p className="commercial-pre">{o.snapshot.description}</p><div className="commercial-table-wrap"><table><thead><tr><th>Servizio</th><th>Prezzo</th></tr></thead><tbody>{o.snapshot.items.map((item, i) => <tr key={i}><td>{item.description}</td><td>{euro(item.amount_cents)}</td></tr>)}</tbody><tfoot><tr><th>Imponibile</th><td>{euro(o.snapshot.subtotal_cents)}</td></tr><tr><th>{o.snapshot.tax_label} ({o.snapshot.tax_bps / 100}%)</th><td>{euro(o.snapshot.tax_cents)}</td></tr><tr><th>Totale</th><td>{euro(o.total_cents)}</td></tr></tfoot></table></div>
   <p>Cliente: {o.snapshot.customer.name} · {o.snapshot.customer.address} · {o.snapshot.customer.tax_id}</p><p>Fornitore: {o.snapshot.supplier.name} · {o.snapshot.supplier.address} · {o.snapshot.supplier.tax_id}</p>
   {([['timeline','Tempistiche'],['payment_terms','Pagamenti'],['responsibilities','Responsabilità'],['delivery_terms','Consegna'],['exclusions','Esclusioni']] as const).map(([key,label]) => <p className="commercial-pre" key={key}><strong>{label}:</strong> {o.snapshot[key]}</p>)}
   <p>{o.snapshot.instalments.map((amount, i) => `Fase ${i + 1}: ${o.snapshot.percentages[i]}% (${euro(amount)}), scadenza ${o.snapshot.payment_due_days[i]} giorni dalla richiesta`).join(' · ')}</p>
  </details>
  <div className="commercial-actions"><button disabled={busy} onClick={() => void run(() => downloadCommercialDocument(o.id, 'quote'))}>Scarica preventivo PDF</button>{admin && o.status === 'BOZZA' && <><button disabled={busy} onClick={() => edit(o)}>Modifica bozza</button><button disabled={busy || !templates.some(t => t.id === o.template_id && t.approved_at) || new Date(o.expires_at).getTime() <= Date.now()} onClick={() => void send('send', {}, 'Preventivo pubblicato. Notifica inserita nella coda email.')}>Pubblica e invia preventivo</button></>}{admin && o.status !== 'BOZZA' && <button disabled={busy} onClick={() => void run(async () => { const result = await commercialCommand('version', { offer_id: o.id }); if (result.id) onVersionCreated(result.id) }, 'Nuova versione creata. Gli originali restano invariati.')}>Crea nuova versione</button>}</div>
  {admin && o.status !== 'BOZZA' && <p>Notifica preventivo: {o.emails.find(e => e.kind === 'quote_available')?.status ?? 'nessun invio registrato'}. Il preventivo pubblicato è disponibile nell’area cliente anche se la notifica è in attesa.</p>}
  {admin && o.status === 'BOZZA' && <p>{!templates.some(t => t.id === o.template_id && t.approved_at) ? 'Invio bloccato: approva il modello contrattuale in Impostazioni.' : new Date(o.expires_at).getTime() <= Date.now() ? 'Invio bloccato: aggiorna la scadenza della bozza.' : 'La pubblicazione rende l’offerta visibile al cliente e accoda la notifica email.'}{!features.email && ' Invio email disabilitato: il cliente può consultare l’offerta pubblicata nella propria area.'}</p>}
  {!admin && o.status === 'INVIATO' && <div className="commercial-form"><label className="commercial-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>Ho letto il preventivo e accetto servizi, prezzi e condizioni indicati.</label><div className="commercial-actions"><button disabled={busy || !confirmed} onClick={() => void send('accept', { confirmed }, 'Preventivo accettato. Leggi e accetta il contratto generato.')}>Accetta preventivo</button><button disabled={busy} onClick={() => void send('reject')}>Rifiuta preventivo</button></div></div>}
  {o.contract && <section><p>Accettazione tracciata tramite account autenticato, data e impronta dei termini; non è una firma elettronica qualificata.</p><h4>Contratto · {o.contract.accepted_at ? `Accettato ${date(o.contract.accepted_at)}` : 'Da accettare'}</h4><details><summary>Leggi il contratto</summary><p>I servizi, importi e condizioni del preventivo qui sopra sono parte integrante di questo contratto.</p><p className="commercial-pre">{o.contract.body}</p><p className="commercial-hash">Impronta dei termini: {o.contract.snapshot_hash}</p></details><button disabled={busy} onClick={() => void run(() => downloadCommercialDocument(o.id, 'contract'))}>Scarica contratto PDF</button>{!admin && !o.contract.accepted_at && <div className="commercial-form"><label className="commercial-check"><input type="checkbox" checked={contractConfirmed} onChange={e => setContractConfirmed(e.target.checked)}/>Ho letto e accetto il contratto e il preventivo allegato, identificati dall’impronta indicata.</label><button disabled={busy || !contractConfirmed} onClick={() => void send('accept_contract', { confirmed: contractConfirmed, snapshot_hash: o.contract!.snapshot_hash })}>Accetta contratto e procedi</button></div>}</section>}
  {!admin && o.status === 'ACCETTATO' && (!o.project || !o.contract || o.milestones.length !== 3) && <p role="alert">Il preventivo è accettato, ma il progetto, il contratto o il piano delle tre rate è incompleto. Contatta Upnology: non è possibile avviare un nuovo pagamento da questa schermata.</p>}
  {o.project && <section><h4>Progetto · {o.project.commercial_stage.replaceAll('_', ' ')}</h4>{o.milestones.map(m => <div key={m.id} className="commercial-milestone"><div><strong>Fase {m.phase} · {['Avvio', 'Demo', 'Consegna (saldo)'][m.phase - 1]}</strong><p>{euro(m.amount_cents)} · {m.status.replaceAll('_',' ')}<br/>Scadenza: {date(m.due_at)} · Pagato: {date(m.paid_at)}{m.refunded_cents > 0 && ` · Rimborsato: ${euro(m.refunded_cents)}`}</p></div>{!admin && <p>{milestoneAction(o, m).reason}</p>}{!admin && m.status === 'IN_ATTESA' && o.payments.filter(p => p.milestone_id === m.id && p.status === 'pending' && p.session_id).map(p => <button key={p.id} disabled={busy || !features.payments} onClick={() => void run(() => commercialFetch('payment-status', { attempt_id: p.id }), 'Esito verificato con Stripe. Consulta lo stato aggiornato della rata.')}>Verifica esito pagamento</button>)}{!admin && milestoneAction(o, m).payable && <button disabled={busy || !features.payments} onClick={() => void run(async () => { const result = await commercialFetch<{url:string}>('checkout', { milestone_id: m.id }); window.location.assign(result.url) })}>{features.payments ? (m.status === 'FALLITO' ? 'Riprova pagamento' : m.phase === 1 ? 'Paga acconto' : m.phase === 2 ? 'Paga tranche demo' : 'Paga saldo') : 'Pagamenti in attivazione'}</button>}</div>)}{!features.payments && <p>I pagamenti online non sono ancora attivi. Nessun pagamento viene simulato.</p>}{o.project.delivered_at && <button disabled={busy} onClick={() => void openLink()}>Apri consegna definitiva</button>}</section>}
  {o.releases.length > 0 && <section><h4>Versioni da provare e feedback</h4>{o.releases.map(r => <div className="commercial-release" key={r.id}><strong>{r.phase === 2 ? 'Demo' : 'Versione finale'} · {date(r.created_at)}</strong><p className="commercial-pre">{r.notes}</p><div className="commercial-actions"><button disabled={busy} onClick={() => void openLink(r.id)}>Apri versione protetta ↗</button>{!admin && !r.approved_at && releaseApprovalBlock(o, r) && <p>{releaseApprovalBlock(o, r)}</p>}{!admin && !r.approved_at && <label className="commercial-check"><input type="checkbox" disabled={!!releaseApprovalBlock(o, r)} checked={releaseId === r.id} onChange={e => setReleaseId(e.target.checked ? r.id : '')}/>Ho verificato e approvo questa versione.</label>}{!admin && !r.approved_at && <button disabled={busy || releaseId !== r.id || !!releaseApprovalBlock(o, r)} onClick={() => void send('approve_release', { release_id: r.id, confirmed: true })}>Approva milestone</button>}{r.approved_at && <span>Approvata {date(r.approved_at)}</span>}</div>{r.feedback.map(f => <div key={f.id} className="commercial-feedback"><p className="commercial-pre">{f.body}</p><p>{f.resolved_at ? `Risolto: ${f.resolution}` : 'Da gestire'}</p>{admin && !f.resolved_at && <form onSubmit={e => { e.preventDefault(); void send('resolve_feedback', { feedback_id: f.id, resolution }) }}><label>Risposta / revisione effettuata<input required minLength={2} maxLength={5000} value={resolution} onChange={e => setResolution(e.target.value)}/></label><button disabled={busy}>Segna risolto</button></form>}</div>)}{!admin && <form className="commercial-form" onSubmit={e => { e.preventDefault(); void run(async () => { await commercialCommand('feedback', { offer_id: o.id, release_id: r.id, body: message }); setMessage('') }, 'Feedback inviato.') }}><label>Il tuo feedback<textarea required maxLength={5000} value={message} onChange={e => setMessage(e.target.value)}/></label><button disabled={busy}>Invia feedback</button></form>}</div>)}</section>}
  {admin && o.project && <details><summary>Gestisci avanzamento e consegna</summary><form className="commercial-form" onSubmit={e => { e.preventDefault(); void send(action, { message, url, notes: message, phase, protection_note: protection, milestone_id: milestoneId, due_at: due ? new Date(`${due}T12:00:00`).toISOString() : null }) }}><label>Operazione<select value={action} onChange={e => setAction(e.target.value)}><option value="update">Pubblica aggiornamento</option><option value="release">Pubblica demo / finale</option><option value="request_payment">Richiedi pagamento / aggiorna scadenza</option><option value="prepare_delivery">Predisponi consegna automatica dopo il saldo</option><option value="delivery">Consegna definitiva (saldo già pagato)</option></select></label>{action === 'release' && <><label>Milestone<select value={phase} onChange={e => setPhase(Number(e.target.value))}><option value={2}>Demo</option><option value={3}>Finale</option></select></label><label>Protezione di accesso attiva<input required minLength={10} value={protection} onChange={e => setProtection(e.target.value)} placeholder="Come il servizio esterno limita l’accesso al cliente"/></label></>}{['release','prepare_delivery','delivery'].includes(action) && <label>URL HTTPS protetto<input type="url" required value={url} onChange={e => setUrl(e.target.value)}/></label>}{['release','update'].includes(action) && <label>Messaggio / note<textarea required minLength={2} maxLength={5000} value={message} onChange={e => setMessage(e.target.value)}/></label>}{action === 'request_payment' && <><label>Tranche<select required value={milestoneId} onChange={e => setMilestoneId(e.target.value)}><option value="">Seleziona</option>{o.milestones.filter(m => ['RICHIESTO','FALLITO'].includes(m.status)).map(m => <option key={m.id} value={m.id}>Fase {m.phase} · {euro(m.amount_cents)}</option>)}</select></label><label>Scadenza<input required type="date" value={due} onChange={e => setDue(e.target.value)}/></label></>}<button disabled={busy}>Conferma operazione</button></form></details>}
  {o.payments.length > 0 && <details><summary>Transazioni</summary>{o.payments.map(p => <div key={p.id}><p className="commercial-hash">{date(p.created_at)} · {euro(p.amount_cents)} · {p.status} · {p.stripe_livemode === true ? 'LIVE' : p.stripe_livemode === false ? 'TEST' : 'Ambiente non ancora verificato'} · Stripe: {p.payment_intent || p.session_id || 'Sessione da creare'}{p.invoice_id && ` · Documento Stripe: ${p.invoice_id}`}</p>{admin && p.session_id && p.stripe_livemode != null && <a href={`https://dashboard.stripe.com/${p.stripe_livemode ? '' : 'test/'}checkout/sessions/${encodeURIComponent(p.session_id)}`} target="_blank" rel="noreferrer">Apri sessione Stripe ↗</a>}{['paid','partial_refund','refunded'].includes(p.status) && <button disabled={busy || !features.payments} onClick={() => void run(async () => { const result = await commercialFetch<{url:string}>('receipt', { attempt_id: p.id }); window.location.assign(result.url) })}>Ricevuta Stripe</button>}{admin && ['paid','partial_refund'].includes(p.status) && <button disabled={busy || !features.payments} onClick={() => { if (window.confirm(`Richiedere a Stripe il rimborso dell’intero importo residuo di questa transazione (${p.stripe_livemode ? 'LIVE' : 'TEST'})? Il progetto sarà sospeso dopo la conferma del webhook.`)) void run(() => commercialFetch('refund', { attempt_id: p.id, confirmed: true }), 'Richiesta di rimborso inoltrata. Lo stato sarà confermato dal webhook Stripe.') }}>Rimborsa residuo</button>}</div>)}{admin && <form className="commercial-form" onSubmit={e => { e.preventDefault(); void run(() => commercialFetch('reconcile', { attempt_id: attemptId, session_id: stripeSession }), 'Stato riconciliato con Stripe.') }}><p>Per un tentativo rimasto in verifica, recupera la sessione dal dashboard Stripe. Lo stato sarà letto da Stripe, senza inserire conferme manuali.</p><label>Tentativo<select required value={attemptId} onChange={e => { setAttemptId(e.target.value); setStripeSession(o.payments.find(p => p.id === e.target.value)?.session_id ?? '') }}><option value="">Seleziona tentativo</option>{o.payments.map(p => <option value={p.id} key={p.id}>{date(p.created_at)} · {euro(p.amount_cents)} · {p.status}</option>)}</select></label><label>Sessione Stripe<input required value={stripeSession} onChange={e => setStripeSession(e.target.value)} placeholder="cs_test_… / cs_live_…"/></label><button disabled={busy || !features.payments}>Riconcilia con Stripe</button></form>}</details>}
  {admin && <details><summary>Email e storico</summary>{o.emails.map(e => <p key={e.id}>{e.kind} · {e.status} · {e.recipient} · Tentativi: {e.attempts}{e.last_error ? ` · ${e.last_error}` : ''}</p>)}</details>}
  <details><summary>Storico progetto</summary>{o.events.map(e => <p className="commercial-pre" key={e.id}>{date(e.created_at)} · {e.kind}{typeof e.detail.message === 'string' ? `\n${e.detail.message}` : ''}</p>)}</details>
 </article>
}

export type CommercialView = 'all' | 'quotes' | 'contracts' | 'payments' | 'projects' | 'communications' | 'settings'
export function CommercialPanel({ admin = false, customers = [], requests = [], view = 'all', defaults, onChanged, initialRequest, overview, onOverview, loadOverview }: { loadOverview?: () => Promise<CommercialOverview>; overview?: CommercialOverview | null; onOverview?: (value: CommercialOverview | null) => void; initialRequest?: AdminQuote; admin?: boolean; customers?: AdminCustomer[]; requests?: AdminQuote[]; view?: CommercialView; defaults?: Partial<BusinessSettings>; onChanged?: () => Promise<void> }) {
 const [features, setFeatures] = useState<CommercialFeatures | null>(null), [localData, setLocalData] = useState<CommercialOverview | null>(null)
 const fetchOverview = useCallback(() => loadOverview ? loadOverview() : loadCommercial(admin ? 'admin' : 'customer'), [loadOverview, admin])
 const data = overview === undefined ? localData : overview
 const setData = useCallback((value: CommercialOverview | null) => { setLocalData(value); onOverview?.(value) }, [onOverview])
 const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
 const [emailTemplates, setEmailTemplates] = useState<Record<string, {subject:string;message:string}>>({})
 const [search, setSearch] = useState(''), [statusFilter, setStatusFilter] = useState('')
 const [requestDraft, setRequestDraft] = useState(initialRequest)
 const [editor, setEditor] = useState<Offer | 'new' | null>(() => initialRequest ? overview?.offers.find(o => o.request_id === initialRequest.id && o.status === 'BOZZA') ?? 'new' : null)
 useEffect(() => {
  let active = true
  commercialFetch<CommercialFeatures>('status').then(async f => {
   if (!active) return
   setFeatures(f)
   if (f.backend) { const result = await fetchOverview(); if (active) setData(result) }
   if (f.backend && admin && view === 'communications') { const templates = await commercialFetch<Record<string, {subject:string;message:string}>>('email-templates'); if (active) setEmailTemplates(templates) }
  }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Caricamento non riuscito.') })
  return () => { active = false }
 }, [admin, view, setData, fetchOverview])
 const returnAttempt = useRef('')
 useEffect(() => {
  const attempt = new URLSearchParams(window.location.search).get('attempt')
  if (admin || !features?.payments || !attempt || !/^[a-f0-9-]{36}$/.test(attempt) || returnAttempt.current === attempt) return
  returnAttempt.current = attempt
  let active = true
  commercialFetch('payment-status', { attempt_id: attempt }).then(() => fetchOverview()).then(value => { if (active) setData(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Verifica pagamento non disponibile.') })
  return () => { active = false }
 }, [admin, features?.payments, setData, fetchOverview])
 const openedAnchor = useRef('')
 useEffect(() => {
  const anchor = window.location.hash.slice(1)
  if (!data || !/^offer-[a-f0-9-]{36}$/.test(anchor) || openedAnchor.current === anchor) return
  const target = document.getElementById(anchor)
  if (target) { const details = target.closest('details'); if (details) details.open = true; target.scrollIntoView({ block: 'start' }); openedAnchor.current = anchor }
 }, [data])
 const onChangedRef = useRef(onChanged)
 const backgroundBusy = useRef(false)
 const operationLock = useRef(false)
 const versionDraftId = useRef<string | null>(null)
 const [syncNotice, setSyncNotice] = useState('')
 useEffect(() => { onChangedRef.current = onChanged }, [onChanged])
 useEffect(() => {
  if (!features?.backend || busy || editor) return
  let active = true
  const refreshReadOnly = async () => {
   if (document.visibilityState !== 'visible' || backgroundBusy.current) return
   backgroundBusy.current = true
   try {
    const result = await fetchOverview()
    if (active && !operationLock.current) { setData(result); setSyncNotice(''); await onChangedRef.current?.() }
   } catch { if (active) setSyncNotice('Aggiornamento automatico non riuscito. Usa Aggiorna per verificare lo stato corrente.') }
   finally { backgroundBusy.current = false }
  }
  const timer = window.setInterval(() => {
   if (document.visibilityState !== 'visible') return
   void refreshReadOnly()
  }, 15000)
  const onFocus = () => { void refreshReadOnly() }
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onFocus)
  return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
 }, [features?.backend, busy, editor, admin, setData, fetchOverview])
 const run: Run = async (operation, success) => {
  if (operationLock.current) return
  operationLock.current = true
  setBusy(true); setError(''); setNotice('')
  try {
   await operation()
   if (success) setNotice(success)
   try { const status = await commercialFetch<CommercialFeatures>('status'); setFeatures(status); const next = status.backend ? await fetchOverview() : null; setData(next); if (versionDraftId.current && next) { const draft = next.offers.find(o => o.id === versionDraftId.current); if (draft) { setEditor(draft); versionDraftId.current = null } } await onChanged?.() } catch { setError('Operazione eseguita, ma i dati non si sono aggiornati. Ricarica la pagina prima di riprovare.') }
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operazione non riuscita.') }
  finally { operationLock.current = false; setBusy(false) }
 }
 const visible = data?.offers.filter(o => (view !== 'contracts' || o.contract) && (view !== 'payments' || o.milestones.length || (admin && o.status === 'ACCETTATO')) && (view !== 'projects' || o.project) && (!statusFilter || o.status === statusFilter) && `${o.snapshot.title} ${o.snapshot.customer.name} ${o.snapshot.customer.email}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))) ?? []
 return <section className="commercial-panel" aria-label="Gestione commerciale"><div className="commercial-heading"><h2>{admin ? ({ all: 'Gestione commerciale', quotes: 'Preventivi', contracts: 'Contratti', payments: 'Pagamenti', projects: 'Progetti commerciali', communications: 'Comunicazioni', settings: 'Integrazioni e modelli' }[view]) : 'Preventivi, contratti e pagamenti'}</h2><button disabled={busy} onClick={() => void run(async () => {})}>Aggiorna</button></div>
  {syncNotice && <p role="status">{syncNotice}</p>}
  {!admin && new URLSearchParams(window.location.search).get('payment') === 'processing' && <p className="auth-notice" role="status">Ritorno da Stripe: consulta lo stato delle rate qui sotto. L’esito è confermato dal server, non dal reindirizzamento.</p>}
  {!admin && new URLSearchParams(window.location.search).get('payment') === 'cancelled' && <p className="auth-notice">Checkout interrotto. Consulta la rata: se ancora dovuta puoi riprendere il pagamento.</p>}
  {features?.backend && <p>Gli stati si aggiornano ogni 15 secondi mentre la pagina è visibile e al ritorno nella finestra. Puoi sempre usare Aggiorna.</p>}
  {error && <p className="field-error" role="alert">{error}</p>}{notice && <p className="auth-notice" role="status">{notice}</p>}
  {features && !features.backend && <p>La gestione di preventivi, contratti e pagamenti sarà disponibile dopo l’attivazione del servizio. Le tue richieste e i progetti esistenti restano consultabili.</p>}
  {!features && !error && <p role="status">Caricamento…</p>}
  {features?.stripeMode === 'test' && <p className="auth-notice">Ambiente Stripe di test: non utilizzare dati di carte reali.</p>}
  {features?.backend && !data && !error && <p role="status">Caricamento documenti…</p>}
  {features && admin && view === 'settings' && <div className="commercial-card"><p>Backend: {features.backend ? 'attivo' : 'disabilitato o configurazione mancante'} · Stripe: {features.payments ? features.stripeMode : 'disabilitato'} · Resend: {features.email ? 'attivo' : 'disabilitato'}</p><p>Le credenziali si configurano esclusivamente su Vercel. Lo stato delle flag non certifica credenziali, webhook o migrazioni.</p></div>}
  {admin && view === 'settings' && <StripeDiagnostics/>}
  {admin && view === 'communications' && Object.keys(emailTemplates).length > 0 && <details className="commercial-card"><summary>Template automatici in uso</summary>{Object.entries(emailTemplates).map(([kind, copy]) => <div key={kind}><h3>{copy.subject}</h3><p>{copy.message}</p></div>)}<p>Ogni invio include cliente, progetto e collegamento alla sua area riservata. Gli importi e gli aggiornamenti derivano dall’operazione registrata.</p></details>}
  {data && features && <>{admin && <><div className="commercial-actions">{['all','quotes'].includes(view) && <button disabled={busy} onClick={() => { setRequestDraft(undefined); setEditor('new') }}>Nuovo preventivo</button>}{['all','communications'].includes(view) && <button disabled={busy || !features.email} onClick={() => void run(() => commercialFetch('emails', {}), 'Elaborazione della coda completata. Verifica gli esiti nello storico email.')}>{features.email ? 'Elabora coda email' : 'Email in attivazione'}</button>}</div>{['all','settings'].includes(view) && <TemplateEditor templates={data.templates} run={run} busy={busy}/>} {editor && <QuoteEditor key={editor === 'new' ? 'new' : editor.id} offer={editor === 'new' ? undefined : editor} templates={data.templates} customers={customers} requests={requests} offers={data.offers} defaults={defaults} initialRequest={editor === 'new' ? requestDraft : undefined} run={run} busy={busy} done={() => setEditor(null)}/>}</>}
  {admin && view !== 'settings' && <div className="commercial-grid commercial-form"><label>Cerca cliente o progetto<input value={search} onChange={e => setSearch(e.target.value)}/></label><label>Stato preventivo<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Tutti</option>{['BOZZA','INVIATO','ACCETTATO','RIFIUTATO','SCADUTO'].map(s => <option key={s}>{s}</option>)}</select></label></div>}
  {view !== 'settings' && visible.length === 0 && <p>Nessun risultato.</p>}
  {admin && view === 'communications' ? visible.map(o => <article className="commercial-card" key={o.id}><h3>{o.snapshot.title} · {o.snapshot.customer.name}</h3>{o.emails.length === 0 && <p>Nessun invio.</p>}{o.emails.map(e => <p key={e.id}>{e.kind} · {e.status} · {e.recipient} · Tentativi: {e.attempts} · Inviata: {date(e.sent_at)}{e.last_error && ` · ${e.last_error}`}</p>)}<p>Gli invii in revisione richiedono la verifica dell’esito presso Resend prima di un nuovo invio, per evitare duplicati.</p></article>) : view !== 'settings' && visible.map(o => admin ? <article className="admin-offer-summary" id={`admin-offer-${o.id}`} key={o.id}><div className="admin-section-heading"><div><span className="admin-badge">{readable(o.status)} · v{o.version}</span><h3>{o.snapshot.title}</h3><p>{o.snapshot.customer.name} · {o.snapshot.customer.email}</p></div><strong>{euro(o.total_cents)}</strong></div>{view === 'payments' && <><PaymentPhases offer={o}/><p>{paymentDiagnosis(o)}</p><p>{o.payments.length} transazioni registrate · Gli importi delle rate non equivalgono a incassi.</p></>}<details><summary>Apri dettagli e operazioni {view === 'payments' ? 'di pagamento' : ''}</summary><OfferCard offer={o} admin={admin} features={features} run={run} busy={busy} edit={setEditor} onVersionCreated={id => { versionDraftId.current = id }} templates={data.templates}/></details></article> : <OfferCard key={o.id} offer={o} admin={admin} features={features} run={run} busy={busy} edit={setEditor} onVersionCreated={id => { versionDraftId.current = id }} templates={data.templates}/>)}
  </>}
 </section>
}
