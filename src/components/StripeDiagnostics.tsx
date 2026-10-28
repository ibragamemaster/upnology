import { useEffect, useState } from 'react'
import { commercialFetch } from '../lib/commercial'

type Diagnostics = { payments: boolean; checks: { name: string; ok: boolean; reason: string }[] }
export function StripeDiagnostics() {
 const [data, setData] = useState<Diagnostics | null>(null)
 const [error, setError] = useState('')
 const [loading, setLoading] = useState(true)
 const [revision, setRevision] = useState(0)
 useEffect(() => {
  let active = true
  commercialFetch<Diagnostics>('stripe-diagnostics').then(result => {
   if (active) setData(result)
  }).catch(() => {
   if (active) setError('Diagnostica non disponibile. Verifica sessione admin e disponibilità del backend.')
  }).finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [revision])
 return <section className="commercial-card" aria-label="Diagnostica Stripe riservata agli amministratori">
  <div className="commercial-heading"><h3>Diagnostica Stripe</h3><button type="button" disabled={loading} onClick={() => { setData(null); setError(''); setLoading(true); setRevision(value => value + 1) }}>Ricontrolla configurazione</button></div>
  <p>Controlli sulla configurazione runtime del server. Nessuna chiamata a Stripe, nessun pagamento. OK indica il superamento della condizione locale, non la validità delle credenziali presso il provider.</p>
  {loading && <p role="status">Verifica in corso…</p>}
  {error && <p role="alert">{error}</p>}
  {data && <><p role="status">Stripe: {data.payments ? 'abilitato dalla configurazione' : 'disabilitato dalla configurazione'}</p>{data.checks.map(check => <div className="admin-record" key={check.name}><strong>{check.ok ? 'OK' : 'ERRORE'} · {check.name}</strong><p>{check.reason}</p></div>)}</>}
 </section>
}
