import { useState, type FormEvent } from 'react'
import { services } from '../content/services'
import { projects } from '../content/projects'
import { contactSchema } from '../domain/lead'
import { submitContactMessage } from '../lib/leads'
import { QuoteWizard } from '../components/QuoteWizard'

function PageIntro({ index, eyebrow, title, description }: { index: string; eyebrow: string; title: React.ReactNode; description: string }) {
  return <div className="page-intro"><p className="eyebrow"><span className="eyebrow-line"/> {eyebrow} <span className="eyebrow-index">/ {index}</span></p><h1>{title}</h1><p>{description}</p></div>
}

export function ServicesPage() {
  const [selected, setSelected] = useState(0)
  return <main className="page-shell services-page"><PageIntro index="01" eyebrow="Cosa costruiamo" title={<>Tecnologia che risolve <em>problemi reali.</em></>} description="Dalla presenza online ai processi interni: scegli ciò che serve alla tua azienda, poi definiamo insieme la soluzione."/><div className="service-page-list">{services.map((service, index) => <article className={`service-block ${selected === index ? 'is-selected' : ''}`} id={service.id} key={service.id}><div className="service-block-title"><button className="service-block-trigger" type="button" aria-expanded={selected === index} aria-controls={`service-content-${service.id}`} onClick={() => setSelected(index)}><span className="eyebrow">{service.number} / {service.label}</span><span className="service-block-trigger-title">{service.title}</span><span className="service-block-trigger-icon" aria-hidden="true">{selected === index ? '−' : '+'}</span></button><p>{service.description}</p></div><div className="service-block-details" id={`service-content-${service.id}`} hidden={selected !== index}><div><h3>Il problema</h3><p>{service.problem}</p></div><div><h3>Cosa può includere</h3><ul>{service.includes.map((item) => <li key={item}>{item}</li>)}</ul></div><a className="inline-cta" href={service.id === 'ai' ? '/ai' : `/preventivo?servizio=${service.id}`}>{service.cta} <span aria-hidden="true">↗</span></a></div></article>)}</div><section className="page-cta"><span className="eyebrow">Da dove iniziamo?</span><h2>Raccontaci cosa vuoi <em>migliorare.</em></h2><a className="button-primary" href="/preventivo">Richiedi preventivo <span aria-hidden="true">↗</span></a></section></main>
}

export function MarketingPage() {
  return <main className="page-shell"><PageIntro index="02" eyebrow="Marketing digitale" title={<>Non basta essere online. <em>Bisogna essere trovati.</em></>} description="Costruiamo percorsi di crescita misurabili: dalla domanda alle conversioni, con dati che aiutano a decidere cosa migliorare."/><div className="marketing-grid">{[
    ['Acquisizione', 'Google Ads e Meta Ads per intercettare la domanda e raggiungere nuovi clienti.'],
    ['Visibilità', 'SEO e social strategy per costruire una presenza riconoscibile nel tempo.'],
    ['Misurazione', 'Analytics, tracking conversioni e funnel per capire cosa funziona.'],
    ['Ecommerce growth', 'Analisi e ottimizzazione del percorso di acquisto per sostenere le vendite.'],
  ].map(([title, description], index) => <article key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{description}</p></article>)}</div><section className="page-cta"><span className="eyebrow">Crescita, con metodo</span><h2>Parliamo della tua <em>crescita.</em></h2><a className="button-primary" href="/preventivo?servizio=marketing">Parliamo della tua crescita <span aria-hidden="true">↗</span></a></section></main>
}

export function ProjectsPage() {
  return <main className="page-shell projects-page"><PageIntro index="03" eyebrow="Progetti e demo" title={<>Idee da <em>esplorare.</em></>} description="Quattro concept dimostrativi navigabili, creati per mostrare approcci possibili. Non sono lavori realizzati per clienti."/><div className="projects-grid">{projects.map(project => <article key={project.slug} className="project-card"><a className="project-preview" href={project.liveUrl}><img src={project.preview} alt={`Anteprima della demo ${project.title}`} loading="lazy" width="1280" height="853"/></a><span>{project.sector} · Demo / concept</span><h2>{project.title}</h2><p>{project.description}</p><p>Servizi: {project.services.join(', ')}</p><a className="inline-cta" href={project.liveUrl}>Esplora la demo ↗</a></article>)}</div><section className="page-cta"><h2>Hai un progetto da <em>costruire?</em></h2><a className="button-primary" href="/preventivo">Inizia il tuo progetto <span aria-hidden="true">↗</span></a></section></main>
}

export function AboutPage() {
  return <main className="page-shell"><PageIntro index="04" eyebrow="Chi siamo" title={<>Pensiamo in sistemi. <em>Costruiamo soluzioni.</em></>} description="Upnology progetta esperienze web, connessioni tra strumenti e processi digitali per aziende che vogliono crescere con una base tecnologica solida."/><div className="about-grid"><article><span>01</span><h2>Capire prima di costruire</h2><p>Partiamo dagli obiettivi e dal lavoro quotidiano della tua attività. La tecnologia deve risolvere un’esigenza chiara.</p></article><article><span>02</span><h2>Unire le parti</h2><p>Sito, dati, marketing e strumenti interni funzionano meglio quando sono progettati come un unico sistema.</p></article><article><span>03</span><h2>Migliorare nel tempo</h2><p>Un prodotto digitale continua a evolvere. Misuriamo, correggiamo e sviluppiamo ciò che porta valore.</p></article></div><section className="page-cta"><h2>Parliamo della tua <em>azienda.</em></h2><a className="button-primary" href="/preventivo">Inizia il tuo progetto <span aria-hidden="true">↗</span></a></section></main>
}

export function ContactsPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')
  const publicEmail = import.meta.env.VITE_PUBLIC_EMAIL as string | undefined
  const publicPhone = import.meta.env.VITE_PUBLIC_PHONE as string | undefined
  const publicWhatsapp = import.meta.env.VITE_PUBLIC_WHATSAPP as string | undefined
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const parsed = contactSchema.safeParse({ name, email, message, website: '' })
    if (!parsed.success) { setError('Controlla nome, email e messaggio.'); return }
    setStatus('sending')
    try {
      await submitContactMessage(parsed.data)
      setStatus('sent')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invio non riuscito.'); setStatus('idle') }
  }
  return <main className="page-shell"><PageIntro index="05" eyebrow="Contatti" title={<>Iniziamo una <em>conversazione.</em></>} description="Per un nuovo progetto, il percorso migliore è la richiesta preventivo. Per domande generiche, scrivici qui."/><div className="contact-page-grid"><div className="contact-options"><h2>Hai un progetto in mente?</h2><p>Raccontaci servizi, obiettivi, budget e tempi in pochi passaggi guidati.</p><a className="button-primary" href="/preventivo">Richiedi preventivo <span aria-hidden="true">↗</span></a>{(publicEmail || publicPhone || publicWhatsapp) && <div className="contact-direct"><h3>Contatti diretti</h3>{publicEmail && <a href={`mailto:${publicEmail}`}>{publicEmail}</a>}{publicPhone && <a href={`tel:${publicPhone}`}>{publicPhone}</a>}{publicWhatsapp && <a href={`https://wa.me/${publicWhatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp ↗</a>}</div>}</div><div className="contact-form"><h2>Una domanda generale?</h2>{status === 'sent' ? <div role="status" className="sent-message"><h3>Messaggio ricevuto.</h3><p>Grazie per averci scritto. Ti risponderemo usando l’indirizzo email indicato.</p></div> : <form onSubmit={submit}><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2}/></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required/></label><label>Messaggio<textarea value={message} onChange={(event) => setMessage(event.target.value)} required minLength={10} rows={5}/></label>{error && <p className="field-error" role="alert">{error}</p>}<button className="button-primary" type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Invio in corso…' : 'Invia messaggio'} <span aria-hidden="true">↗</span></button></form>}</div></div></main>
}

export function QuotePage() { return <main className="quote-page"><QuoteWizard/></main> }

