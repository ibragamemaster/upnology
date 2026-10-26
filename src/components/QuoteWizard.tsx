import { useEffect, useMemo, useRef, useState } from 'react'
import { budgetLabels, budgets, contactMethods, featureOptions, goalQuestions, quoteSchema, serviceIds, serviceLabels, timelineLabels, timelines, type QuoteRequest, type ServiceChoice } from '../domain/lead'
import { submitQuoteRequest } from '../lib/leads'

type Draft = Omit<QuoteRequest, 'budget' | 'timeline'> & { budget: QuoteRequest['budget'] | ''; timeline: QuoteRequest['timeline'] | '' }
const storageKey = 'upnology-quote-draft-v1'
const initial: Draft = { services: [], company: '', sector: '', existingSite: '', city: '', activityDescription: '', goal: '', answers: {}, features: [], budget: '', timeline: '', name: '', email: '', phone: '', whatsapp: '', preferredContact: 'email', notes: '', aiProcesses: '', aiChannels: '', aiTools: '', website: '' }
const stepNames = ['Servizi', 'Attività', 'Obiettivo', 'Funzioni', 'Budget', 'Tempi', 'Contatti', 'Riepilogo']

function startingDraft(): Draft {
  let saved: Partial<Draft> = {}
  try { saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}') as Partial<Draft> } catch { /* Keep the empty draft. */ }
  const selected = new URLSearchParams(location.search).get('servizio')
  const demoType = new URLSearchParams(location.search).get('tipo')
  const sector = demoType === 'ristorazione' ? 'Ristorazione' : demoType === 'streetwear' ? 'Moda e streetwear' : demoType === 'automotive' ? 'Automotive' : demoType === 'architettura' ? 'Architettura' : ''
  const services = Array.isArray(saved.services) ? saved.services.filter((id): id is ServiceChoice => serviceIds.includes(id as ServiceChoice)) : []
  if (selected && serviceIds.includes(selected as ServiceChoice) && !services.includes(selected as ServiceChoice)) services.push(selected as ServiceChoice)
  return { ...initial, ...saved, sector: sector || saved.sector || '', services, answers: saved.answers && typeof saved.answers === 'object' ? saved.answers : {}, features: Array.isArray(saved.features) ? saved.features : [] }
}

function OptionButton({ selected, children, onClick }: { selected: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={`choice ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onClick}><span className="choice-mark" aria-hidden="true">{selected ? '✓' : '+'}</span>{children}</button>
}

export function QuoteWizard() {
  const submission = useRef<{ payload: string; id: string } | null>(null)
  const inFlight = useRef(false)
  const [draft, setDraft] = useState<Draft>(startingDraft)
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState('')
  const questions = useMemo(() => [...new Map(draft.services.flatMap((id) => goalQuestions[id] || []).map((question) => [question.key, question])).values()], [draft.services])
  const features = useMemo(() => [...new Set(draft.services.flatMap((id) => featureOptions[id]))], [draft.services])
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(draft)) } catch { /* Private browsing can block storage. */ } }, [draft])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setErrors({}) }
  const toggleService = (id: ServiceChoice) => update('services', draft.services.includes(id) ? draft.services.filter((item) => item !== id) : [...draft.services, id])
  const toggleFeature = (feature: string) => update('features', draft.features.includes(feature) ? draft.features.filter((item) => item !== feature) : [...draft.features, feature])
  const setAnswer = (key: string, value: 'yes' | 'no' | 'unsure') => update('answers', { ...draft.answers, [key]: value })
  const next = () => {
    const issues: Record<string, string> = {}
    if (step === 0 && !draft.services.length) issues.services = 'Seleziona almeno un servizio.'
    if (step === 1) {
      if (draft.company.trim().length < 2) issues.company = 'Indica il nome dell’attività.'
      if (draft.sector.trim().length < 2) issues.sector = 'Indica il settore.'
      if (draft.city.trim().length < 2) issues.city = 'Indica la città o area.'
      if (draft.activityDescription.trim().length < 10) issues.activityDescription = 'Descrivi brevemente la tua attività.'
      if (draft.existingSite && !URL.canParse(draft.existingSite)) issues.existingSite = 'Inserisci un URL completo, ad esempio https://...'
    }
    if (step === 2 && draft.goal.trim().length < 10) issues.goal = 'Descrivi cosa vuoi ottenere.'
    if (step === 3 && draft.services.includes('ai')) {
      if (draft.aiProcesses.trim().length < 10) issues.aiProcesses = 'Descrivi i processi da migliorare.'
      if (draft.aiChannels.trim().length < 2) issues.aiChannels = 'Indica i canali desiderati.'
      if (draft.aiTools.trim().length < 2) issues.aiTools = 'Indica gli strumenti usati o scrivi “Nessuno”.'
    }
    if (step === 4 && !draft.budget) issues.budget = 'Seleziona un budget indicativo.'
    if (step === 5 && !draft.timeline) issues.timeline = 'Seleziona una tempistica.'
    if (step === 6) {
      if (draft.name.trim().length < 2) issues.name = 'Indica il tuo nome.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) issues.email = 'Inserisci un’email valida.'
      if (draft.preferredContact === 'phone' && !draft.phone.trim()) issues.phone = 'Inserisci il numero di telefono.'
      if (draft.preferredContact === 'whatsapp' && !draft.whatsapp.trim() && !draft.phone.trim()) issues.whatsapp = 'Inserisci un numero WhatsApp o di telefono.'
    }
    setErrors(issues)
    if (Object.keys(issues).length) return
    setStep((current) => Math.min(7, current + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const submit = async () => {
    if (inFlight.current) return
    const parsed = quoteSchema.safeParse(draft)
    if (!parsed.success) { setSubmitError('Alcuni dati non sono validi. Torna ai passaggi precedenti e controllali.'); return }
    const payload = JSON.stringify(parsed.data)
    if (submission.current?.payload !== payload) submission.current = { payload, id: crypto.randomUUID() }
    inFlight.current = true; setSending(true); setSubmitError('')
    try {
      const reference = await submitQuoteRequest(parsed.data, submission.current.id)
      setSuccess(reference)
      sessionStorage.removeItem(storageKey)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Invio non riuscito. Riprova.') } finally { inFlight.current = false; setSending(false) }
  }

  if (success) return <div className="wizard-success" role="status"><span className="eyebrow">Richiesta inviata</span><h1>Richiesta <em>ricevuta.</em></h1><p>Abbiamo ricevuto i dettagli del tuo progetto. Ti ricontatteremo per approfondire esigenze, tempistiche e soluzione.</p><p className="reference">Riferimento: {success}</p><a className="button-primary" href="/">Torna alla Home <span aria-hidden="true">↗</span></a></div>

  return <div className="wizard">
    <aside className="wizard-sidebar"><p className="eyebrow">Inizia il tuo progetto</p><h1>Il tuo progetto, <em>passo dopo passo.</em></h1><p>Raccontaci cosa vuoi costruire. Le tue risposte ci aiutano a preparare una proposta coerente con esigenze, budget e tempi.</p><ol className="wizard-steps">{stepNames.map((name, index) => <li key={name} className={index === step ? 'current' : index < step ? 'done' : ''}><span>{String(index + 1).padStart(2, '0')}</span>{name}</li>)}</ol></aside>
    <div className="wizard-panel"><div className="wizard-progress"><span>Passaggio {step + 1} di 8</span><span>{Math.round((step + 1) / 8 * 100)}%</span><div className="progress-track"><div style={{ width: `${(step + 1) / 8 * 100}%` }} /></div></div>
      <div className="wizard-step" key={step}>
        {step === 0 && <><p className="step-kicker">01 / Servizi</p><h2>Che cosa ti serve?</h2><p className="step-intro">Puoi scegliere più opzioni.</p><div className="choice-grid">{serviceIds.map((id) => <OptionButton key={id} selected={draft.services.includes(id)} onClick={() => toggleService(id)}>{serviceLabels[id]}</OptionButton>)}</div>{errors.services && <p className="field-error" role="alert">{errors.services}</p>}</>}
        {step === 1 && <><p className="step-kicker">02 / La tua attività</p><h2>Conosciamoci meglio.</h2><div className="form-grid"><Field label="Nome azienda o attività" value={draft.company} onChange={(value) => update('company', value)} error={errors.company} required/><Field label="Settore" value={draft.sector} onChange={(value) => update('sector', value)} error={errors.sector} required/><Field label="Sito attuale (facoltativo)" value={draft.existingSite} onChange={(value) => update('existingSite', value)} error={errors.existingSite} placeholder="https://"/><Field label="Città o area" value={draft.city} onChange={(value) => update('city', value)} error={errors.city} required/><Field label="Descrivi brevemente la tua attività" value={draft.activityDescription} onChange={(value) => update('activityDescription', value)} error={errors.activityDescription} multiline wide required/></div></>}
        {step === 2 && <><p className="step-kicker">03 / Obiettivo</p><h2>Cosa vuoi ottenere?</h2><Field label="Descrivi il risultato che cerchi" value={draft.goal} onChange={(value) => update('goal', value)} error={errors.goal} multiline required/><div className="question-list">{questions.map((question) => <fieldset key={question.key}><legend>{question.label}</legend><div className="inline-choices">{([['yes', 'Sì'], ['no', 'No'], ['unsure', 'Non so']] as const).map(([value, label]) => <OptionButton key={value} selected={draft.answers[question.key] === value} onClick={() => setAnswer(question.key, value)}>{label}</OptionButton>)}</div></fieldset>)}</div></>}
        {step === 3 && <><p className="step-kicker">04 / Funzioni</p><h2>Che cosa deve includere?</h2><p className="step-intro">Seleziona ciò che immagini. Possiamo definire i dettagli insieme.</p><div className="choice-grid">{features.map((feature) => <OptionButton key={feature} selected={draft.features.includes(feature)} onClick={() => toggleFeature(feature)}>{feature}</OptionButton>)}</div><Field label="Altre necessità (facoltativo)" value={draft.notes} onChange={(value) => update('notes', value)} multiline/></>}
        {step === 3 && draft.services.includes('ai') && <div className="ai-quote-fields"><p className="step-kicker">Upnology AI / Contesto</p><h3>Come potrebbe aiutare la tua azienda?</h3><p className="step-intro">Raccontaci processi, canali e strumenti. Definiremo insieme cosa è realistico realizzare.</p><Field label="Processi da migliorare" value={draft.aiProcesses} onChange={(value) => update('aiProcesses', value)} error={errors.aiProcesses} multiline required maxLength={2000}/><Field label="Canali desiderati" value={draft.aiChannels} onChange={(value) => update('aiChannels', value)} error={errors.aiChannels} placeholder="Sito, WhatsApp, CRM..." required maxLength={1000}/><Field label="Strumenti già utilizzati" value={draft.aiTools} onChange={(value) => update('aiTools', value)} error={errors.aiTools} placeholder="CRM, gestionale, email... oppure Nessuno" required maxLength={1000}/></div>}
        {step === 4 && <><p className="step-kicker">05 / Budget</p><h2>Hai un budget indicativo?</h2><p className="step-intro">È una fascia orientativa. Il preventivo finale dipenderà dal progetto.</p><div className="choice-grid">{budgets.map((id) => <OptionButton key={id} selected={draft.budget === id} onClick={() => update('budget', id)}>{budgetLabels[id]}</OptionButton>)}</div>{errors.budget && <p className="field-error" role="alert">{errors.budget}</p>}</>}
        {step === 5 && <><p className="step-kicker">06 / Tempistiche</p><h2>Quando vorresti iniziare?</h2><div className="choice-grid">{timelines.map((id) => <OptionButton key={id} selected={draft.timeline === id} onClick={() => update('timeline', id)}>{timelineLabels[id]}</OptionButton>)}</div>{errors.timeline && <p className="field-error" role="alert">{errors.timeline}</p>}</>}
        {step === 6 && <><p className="step-kicker">07 / Contatti</p><h2>Come possiamo contattarti?</h2><div className="form-grid"><Field label="Nome" value={draft.name} onChange={(value) => update('name', value)} error={errors.name} required/><Field label="Email" value={draft.email} onChange={(value) => update('email', value)} error={errors.email} type="email" required/><Field label="Telefono (facoltativo)" value={draft.phone} onChange={(value) => update('phone', value)} error={errors.phone} type="tel"/><Field label="WhatsApp (facoltativo)" value={draft.whatsapp} onChange={(value) => update('whatsapp', value)} error={errors.whatsapp} type="tel"/></div><fieldset className="contact-preference"><legend>Metodo di contatto preferito</legend><div className="inline-choices">{contactMethods.map((method) => <OptionButton key={method} selected={draft.preferredContact === method} onClick={() => update('preferredContact', method)}>{method === 'email' ? 'Email' : method === 'phone' ? 'Telefono' : 'WhatsApp'}</OptionButton>)}</div></fieldset></>}
        {step === 7 && <><p className="step-kicker">08 / Riepilogo</p><h2>Controlla la tua richiesta.</h2><div className="summary"><Summary title="Servizi" value={draft.services.map((id) => serviceLabels[id]).join(', ')} onEdit={() => setStep(0)}/><Summary title="Attività" value={`${draft.company} · ${draft.sector} · ${draft.city}`} onEdit={() => setStep(1)}/><Summary title="Obiettivo" value={draft.goal} onEdit={() => setStep(2)}/><Summary title="Funzioni" value={draft.features.join(', ') || 'Da definire insieme'} onEdit={() => setStep(3)}/>{draft.services.includes('ai') && <Summary title="Contesto AI" value={`${draft.aiProcesses} · Canali: ${draft.aiChannels} · Strumenti: ${draft.aiTools}`} onEdit={() => setStep(3)}/>}<Summary title="Budget e tempi" value={`${draft.budget ? budgetLabels[draft.budget] : ''} · ${draft.timeline ? timelineLabels[draft.timeline] : ''}`} onEdit={() => setStep(4)}/><Summary title="Contatto" value={`${draft.name} · ${draft.email} · ${draft.preferredContact}`} onEdit={() => setStep(6)}/></div><p className="summary-note">Usiamo i dati inseriti per rispondere alla tua richiesta. Verifica che i contatti siano corretti prima dell’invio.</p>{submitError && <p className="field-error" role="alert">{submitError}</p>}</>}
      </div>
      <div className="wizard-actions">{step > 0 && <button type="button" className="button-back" onClick={() => { setStep(step - 1); setErrors({}); setSubmitError('') }}>← Indietro</button>}<button type="button" className="button-primary" disabled={sending} onClick={step === 7 ? submit : next}>{sending ? 'Invio in corso…' : step === 7 ? 'Invia richiesta' : 'Continua'} <span aria-hidden="true">↗</span></button></div>
    </div>
  </div>
}

function Field({ label, value, onChange, error, multiline, wide, required, placeholder, maxLength, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; error?: string; multiline?: boolean; wide?: boolean; required?: boolean; placeholder?: string; maxLength?: number; type?: string }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]/g, '-')
  return <div className={`field ${wide ? 'wide' : ''}`}><label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>{multiline ? <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} rows={4} required={required} maxLength={maxLength}/> : <input id={id} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} required={required} maxLength={maxLength}/>} {error && <span className="field-error" id={`${id}-error`}>{error}</span>}</div>
}

function Summary({ title, value, onEdit }: { title: string; value: string; onEdit: () => void }) { return <div className="summary-row"><div><span>{title}</span><p>{value}</p></div><button type="button" onClick={onEdit} aria-label={`Modifica ${title}`}>Modifica</button></div> }


