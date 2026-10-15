import { CommercialPanel } from '../components/CommercialPanel'
import { useEffect, useState, type FormEvent } from 'react'
import { signIn, signOut, signUp, sendPasswordReset, updatePassword } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'
import { loadAccount, saveProfile, type AccountOverview } from '../lib/account'
import { hasAdminAccess } from '../lib/admin'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

export function AuthPage({ mode }: { mode: Mode }) {
  const { user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const title = { login: 'Accedi al tuo account.', signup: 'Crea il tuo account.', forgot: 'Recupera la password.', reset: 'Scegli una nuova password.' }[mode]
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true)
    try {
      if (mode === 'login') { await signIn(email, password); window.location.assign('/account') }
      if (mode === 'signup') {
        if (name.trim().length < 2) throw new Error('Inserisci il tuo nome.')
        const result = await signUp(email, password, name.trim())
        if (result.session) window.location.assign('/account')
        else setNotice('Controlla la tua email per confermare l’account. Dopo la verifica potrai accedere.')
      }
      if (mode === 'forgot') { await sendPasswordReset(email); setNotice('Se esiste un account con questa email, riceverai un link per reimpostare la password.') }
      if (mode === 'reset') { await updatePassword(password); setNotice('Password aggiornata. Ora puoi accedere al tuo account.') }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operazione non riuscita.') }
    finally { setBusy(false) }
  }
  if (mode === 'reset' && loading) return <main className="auth-shell"><p role="status">Verifica del link…</p></main>
  if (mode === 'reset' && !user) return <main className="auth-shell"><div className="auth-card"><p className="eyebrow">Recupero password</p><h1>Link non valido o scaduto.</h1><p>Richiedi un nuovo link per reimpostare la password.</p><a className="button-primary" href="/forgot-password">Richiedi un nuovo link</a></div></main>
  if (user && mode !== 'reset') return <main className="auth-shell"><div className="auth-card"><p className="eyebrow">Area cliente</p><h1>Hai già effettuato l’accesso.</h1><a className="button-primary" href="/account">Vai al tuo account</a></div></main>
  return <main className="auth-shell"><div className="auth-card"><p className="eyebrow">Upnology / Area cliente</p><h1>{title}</h1><p className="auth-intro">{mode === 'signup' ? 'Le richieste preventivo restano accessibili anche senza account. Registrati per seguirne lo stato.' : mode === 'forgot' ? 'Ti invieremo un link per scegliere una nuova password.' : mode === 'reset' ? 'Inserisci una password nuova di almeno 8 caratteri.' : 'Visualizza le tue richieste e i progetti collegati.'}</p>
    {notice ? <div className="auth-notice" role="status">{notice}<p><a href="/login">Vai al login</a></p></div> : <form onSubmit={submit} className="auth-form">
      {mode === 'signup' && <label>Nome<input autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={120}/></label>}
      {mode !== 'reset' && <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254}/></label>}
      {(mode === 'login' || mode === 'signup' || mode === 'reset') && <label>{mode === 'reset' ? 'Nuova password' : 'Password'}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8}/></label>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="button-primary" type="submit" disabled={busy}>{busy ? 'Attendi…' : { login: 'Accedi', signup: 'Crea account', forgot: 'Invia link', reset: 'Aggiorna password' }[mode]}</button>
    </form>}
    <div className="auth-links">{mode === 'login' ? <><a href="/forgot-password">Password dimenticata?</a><a href="/signup">Crea un account</a></> : <a href="/login">Torna al login</a>}</div>
  </div></main>
}

export function AccountPage() {
  const { user, loading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [data, setData] = useState<AccountOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', company: '', sector: '', city: '' })
  useEffect(() => {
    if (!user) return
    let active = true
    hasAdminAccess().then(value => { if (active) setIsAdmin(value) }).catch(() => {})
    loadAccount().then(value => {
      if (!active) return
      setData(value)
      if (value.profile) setForm({ first_name: value.profile.display_name ?? '', last_name: value.profile.last_name ?? '', phone: value.profile.phone ?? '', company: value.profile.company ?? '', sector: value.profile.sector ?? '', city: value.profile.city ?? '' })
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Caricamento non riuscito.') })
    return () => { active = false }
  }, [user])
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { const profile = await saveProfile(form); setData(current => current ? { ...current, profile } : current); setNotice('Profilo aggiornato.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Salvataggio non riuscito.') }
    finally { setBusy(false) }
  }
  const logout = async () => {
    setBusy(true); setError('')
    try { await signOut(); window.location.assign('/') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Logout non riuscito.'); setBusy(false) }
  }
  if (loading) return <main className="auth-shell"><p role="status">Verifica della sessione…</p></main>
  if (!user) return <main className="auth-shell"><div className="auth-card"><p className="eyebrow">Area cliente</p><h1>Accedi per continuare.</h1><p>Il preventivo e i contatti restano disponibili senza account.</p><a className="button-primary" href="/login">Accedi</a></div></main>
  return <main className="account-shell"><div className="account-heading"><div><p className="eyebrow">Area cliente</p><h1>Il tuo account.</h1><p>{user.email}</p>{isAdmin && <a className="account-admin-link" href="/admin">Apri area admin ↗</a>}</div><button type="button" className="account-logout" onClick={logout} disabled={busy}>Esci</button></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {!data ? !error && <p role="status">Caricamento dei tuoi dati…</p> : <div className="account-grid"><section className="account-panel"><h2>Profilo</h2><form onSubmit={save} className="account-form">{([
      ['first_name', 'Nome'], ['last_name', 'Cognome'], ['phone', 'Telefono'], ['company', 'Azienda'], ['sector', 'Settore'], ['city', 'Città'],
    ] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} required={key === 'first_name'} maxLength={key === 'phone' ? 40 : 120} autoComplete={key === 'first_name' ? 'given-name' : key === 'last_name' ? 'family-name' : key === 'phone' ? 'tel' : key === 'company' ? 'organization' : 'off'}/></label>)}<label>Email<input value={user.email ?? ''} readOnly/></label>{notice && <p role="status" className="auth-notice">{notice}</p>}<button className="button-primary" type="submit" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva profilo'}</button></form></section>
    <div className="account-records"><section className="account-panel"><h2>Richieste preventivo</h2>{data.requests.length ? <ul>{data.requests.map(request => <li key={request.id}><div><strong>{request.services.join(', ')}</strong><span>{new Date(request.created_at).toLocaleDateString('it-IT')}</span></div><span className="account-status">{request.status.replaceAll('_', ' ')}</span></li>)}</ul> : <p>Nessuna richiesta collegata. Una richiesta inviata senza account comparirà qui dopo la verifica della tua email.</p>}</section>
    <section className="account-panel"><h2>Progetti</h2>{data.projects.length ? <ul>{data.projects.map(project => <li key={project.id}><strong>{project.title}</strong><span className="account-status">{project.status.replaceAll('_', ' ')}</span></li>)}</ul> : <p>Nessun progetto associato per ora.</p>}</section></div></div>}
    <CommercialPanel key={user.id}/>
  </main>
}
