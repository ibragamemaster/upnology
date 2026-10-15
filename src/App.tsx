import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { activeServices } from './content/services'
import { SiteFooter, SiteHeader } from './components/SiteHeader'
import { AboutPage, ContactsPage, MarketingPage, ProjectsPage, QuotePage, ServicesPage } from './pages/Pages'
import { AccountPage, AuthPage } from './pages/AuthPages'
import { AdminPage } from './pages/AdminPage'
import { PublicMotion } from './components/PublicMotion'
import { EmmaPresence } from './components/EmmaPresence'

const UpnologyScene = lazy(() => import('./scene/UpnologyScene'))
const AiPage = lazy(() => import('./pages/AiPage').then(module => ({ default: module.AiPage })))
const DemoPages = lazy(() => import('./pages/DemoPages'))
const AutomotiveDemo = lazy(() => import('./pages/AutomotiveDemo'))
const ArchitectureDemo = lazy(() => import('./pages/ArchitectureDemo'))

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

function HomePage() {
  const story = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState(0)
  const [webgl, setWebgl] = useState(true)
  const [ready, setReady] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const reduced = useReducedMotion()
  const unavailable = useCallback(() => setWebgl(false), [])
  const sceneLoaded = useCallback(() => setSceneReady(true), [])
  const onServiceKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? (index + 1) % activeServices.length : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? (index - 1 + activeServices.length) % activeServices.length : event.key === 'Home' ? 0 : event.key === 'End' ? activeServices.length - 1 : null
    if (next === null) return
    event.preventDefault()
    setActive(next)
    document.getElementById(`service-tab-${next}`)?.focus()
  }

  useEffect(() => {
    if (reduced) return
    const check = () => {
      const canvas = document.createElement('canvas')
      const possible = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
      setWebgl(possible)
      setReady(true)
    }
    check()
  }, [reduced])

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!story.current) return
        const rect = story.current.getBoundingClientRect()
        const range = Math.max(1, rect.height - window.innerHeight)
        setProgress(Math.max(0, Math.min(1, -rect.top / range)))
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [])

  return <>
    <PublicMotion />
    <SiteHeader />
    <main id="top">
      <section className={`story ${progress > 0.72 ? 'in-services' : ''}`} ref={story} aria-label="Il mondo Upnology">
        {!reduced && ready && webgl && <Suspense fallback={null}><UpnologyScene progress={progress} active={active} onUnavailable={unavailable} onReady={sceneLoaded} /></Suspense>}
        <div className={`scene-fallback ${reduced || !webgl || !sceneReady ? 'is-visible' : ''}`} aria-hidden="true"><span className="fallback-core"/><span className="fallback-orbit orbit-one"/><span className="fallback-orbit orbit-two"/><span className="fallback-orbit orbit-three"/></div>
        <div className="story-content">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-line"/> Digital systems studio <span className="eyebrow-index">/ 001</span></p>
              <h1 id="hero-title">Costruiamo la <em>tecnologia</em> che fa crescere la tua azienda.</h1>
              <p className="hero-description">Web, automazioni e intelligenza artificiale progettati per trasformare aziende reali.</p>
              <div className="hero-actions"><a className="button-primary" href="/preventivo">Inizia il tuo progetto <span aria-hidden="true">↗</span></a><a className="button-text" href="#approccio">Esplora Upnology <span aria-hidden="true">↓</span></a></div>
            </div>
            <div className="hero-coordinate" aria-hidden="true"><span>UP / 01</span><span>TECNOLOGIA<br/>IN MOVIMENTO</span></div>
            <a href="#approccio" className="scroll-cue"><span className="scroll-cue-line"/> Scorri per esplorare</a>
          </section>
          <section id="approccio" className="approach" aria-labelledby="approach-title">
            <div className="section-meta"><span>01 / IL SISTEMA</span><span>IDEA → PRODOTTO → CRESCITA</span></div>
            <div className="system-thread" aria-hidden="true"><span className="thread-node node-one">WEB</span><span className="thread-node node-two">SYSTEMS</span><span className="thread-node node-three">GROWTH</span><span className="thread-carrier">UP</span></div>
            <div className="approach-copy"><p className="eyebrow">Un unico ecosistema</p><h2 id="approach-title">Ogni parte è <em>connessa.</em></h2><p>Progettiamo prodotti digitali, colleghiamo sistemi e automatizziamo processi. Ogni soluzione diventa parte di una tecnologia più grande, costruita intorno alla tua azienda.</p></div>
            <div className="approach-steps" aria-label="Il nostro percorso"><span>01 / Creiamo</span><span>02 / Colleghiamo</span><span>03 / Facciamo crescere</span></div>
          </section>
          <section id="servizi" className="services" aria-labelledby="services-title">
            <div className="section-meta"><span>02 / CAPACITÀ</span><span>SELEZIONA UN NODO</span></div>
            <div className="services-heading"><p className="eyebrow">La tecnologia prende forma</p><h2 id="services-title">Un sistema.<br/><em>Molte possibilità.</em></h2></div>
            <div className="services-interface" style={{ '--active-service': active } as React.CSSProperties}><div className="service-list" role="tablist" aria-label="Servizi Upnology">{activeServices.map((service, index) => <button type="button" role="tab" aria-selected={active === index} aria-controls="service-detail" tabIndex={active === index ? 0 : -1} id={`service-tab-${index}`} key={service.id} className={`service-row ${active === index ? 'active' : ''}`} onClick={() => setActive(index)} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onKeyDown={(event) => onServiceKey(event, index)}><span className="service-number">{service.number}</span><span>{service.title}</span><span className="service-row-arrow" aria-hidden="true">↗</span></button>)}</div><div className="service-detail" role="tabpanel" id="service-detail" aria-labelledby={`service-tab-${active}`}><span className="detail-cross" aria-hidden="true">✳</span><p className="detail-kicker">{activeServices[active].number} / {activeServices[active].label}</p><h3>{activeServices[active].title}</h3><p>{activeServices[active].description}</p><a className="detail-link" href={`/preventivo?servizio=${activeServices[active].id}`}>Richiedi preventivo <span aria-hidden="true">↗</span></a></div></div><div className="services-bottom"><a href="/servizi">Esplora tutti i servizi ↗</a><a href="/ai">Upnology AI · In sviluppo ↗</a></div>
          </section>
        </div>
      </section>
      <section className="home-proof"><div><span className="eyebrow">Perché Upnology</span><h2>Una tecnologia più <em>connessa.</em></h2></div><p>Un sito, una campagna o un’automazione funzionano meglio quando rispondono allo stesso obiettivo. Mettiamo insieme esperienza, dati e processi per costruire strumenti utili alla tua azienda.</p></section>
      <section className="home-ai" aria-labelledby="home-ai-title"><div className="home-ai-copy"><p className="eyebrow">Upnology AI <span className="development-label">In sviluppo</span></p><h2 id="home-ai-title">L’intelligenza <em>della tua azienda.</em></h2><p>Un Core AI configurato sui tuoi servizi, dati, strumenti e processi. Una linea di servizi personalizzati per aiutare clienti e team, con permessi e controllo umano.</p><div className="home-ai-actions"><a className="inline-cta" href="/ai">Scopri Upnology AI ↗</a><a className="inline-cta" href="/preventivo?servizio=ai">Parliamo della tua AI ↗</a></div></div><div className="home-ai-visual" aria-hidden="true"><span>DATI AUTORIZZATI</span><div className="home-ai-link"/><strong>UP / AI CORE</strong><div className="home-ai-link"/><span>RISPOSTE · AZIONI</span></div></section>
      <section className="home-marketing"><span className="eyebrow">Marketing digitale</span><h2>Non basta essere online. <em>Bisogna essere trovati.</em></h2><p>Campagne, SEO, analytics e tracking per trasformare visibilità in opportunità misurabili.</p><a className="inline-cta" href="/preventivo?servizio=marketing">Parliamo della tua crescita ↗</a><a className="home-demo-teaser home-demo-teaser-street" href="/demo/streetwear"><img src="/demos/street-hero.webp" alt="Anteprima del concept ecommerce streetwear S//FORM" loading="lazy" width="1280" height="853"/><span><small>CONCEPT / ECOMMERCE</small><strong>S//FORM</strong><b>Esplora la demo ↗</b></span></a></section>
      <section className="home-projects"><div><span className="eyebrow">Progetti e demo</span><h2>Il lavoro prende <em>forma.</em></h2><p>Quattro concept navigabili per vedere come un’esperienza digitale può diventare concreta, dal catalogo auto allo studio di architettura.</p><a className="inline-cta" href="/progetti">Esplora i progetti ↗</a></div><a className="home-demo-teaser home-demo-teaser-food" href="/demo/ristorante"><img src="/demos/restaurant-hero.webp" alt="Anteprima del concept ristorante Terra / Tavola" loading="lazy" width="1280" height="853"/><span><small>CONCEPT / RISTORAZIONE</small><strong>Terra / Tavola</strong><b>Esplora la demo ↗</b></span></a><div className="project-categories"><a href="/demo/streetwear">Ecommerce ↗</a><a href="/demo/automotive">Automotive ↗</a><a href="/demo/ristorante">Ristorazione ↗</a><a href="/demo/architettura">Business / professionisti ↗</a></div><div className="home-demo-more"><a className="home-demo-teaser" href="/demo/automotive"><img src="/demos/auto-aeron.webp" alt="Coupé rossa del concept automotive Axiom Motors" loading="lazy" width="1200" height="800"/><span><small>CONCEPT / AUTOMOTIVE</small><strong>AXIOM/MOTORS</strong><b>Esplora la demo ↗</b></span></a><a className="home-demo-teaser" href="/demo/architettura"><img src="/demos/arch-casa-serra.webp" alt="Casa in pietra del concept di architettura Atelier Nord" loading="lazy" width="1200" height="800"/><span><small>CONCEPT / ARCHITETTURA</small><strong>Atelier Nord</strong><b>Esplora la demo ↗</b></span></a></div></section>
      <section className="home-process"><span className="eyebrow">Come lavoriamo</span><h2>Dal problema alla <em>soluzione.</em></h2><div><article><span>01</span><h3>Ascoltiamo</h3><p>Raccogliamo obiettivi, contesto e vincoli.</p></article><article><span>02</span><h3>Progettiamo</h3><p>Definiamo la soluzione e le priorità.</p></article><article><span>03</span><h3>Costruiamo</h3><p>Realizziamo, verifichiamo e miglioriamo.</p></article></div></section>
      <section id="contatti" className="contact" aria-labelledby="contact-title"><div className="section-meta"><span>03 / IL PROSSIMO PASSO</span><span>UPNOLOGY © 2026</span></div><p className="eyebrow">Il tuo prossimo progetto</p><h2 id="contact-title">Costruiamo <em>qualcosa</em> insieme.</h2><a href="/preventivo" className="contact-link">Richiedi preventivo <span aria-hidden="true">↗</span></a><a href="/contatti" className="contact-secondary">Hai una domanda? Contattaci ↗</a></section>
    </main>
    <EmmaPresence />
    <SiteFooter />
  </>
}

function App() {
  const route = window.location.pathname.replace(/\/$/, '') || '/'
  if (route === '/demo/ristorante') return <Suspense fallback={<main role="status">Caricamento demo…</main>}><DemoPages type="restaurant" path={route} /></Suspense>
  if (route === '/demo/streetwear' || route === '/demo/streetwear/carrello' || route === '/demo/streetwear/riepilogo' || route.startsWith('/demo/streetwear/prodotto/')) return <Suspense fallback={<main role="status">Caricamento demo…</main>}><DemoPages type="streetwear" path={route} /></Suspense>
  if (route === '/demo/automotive' || route === '/demo/automotive/confronta' || route.startsWith('/demo/automotive/auto/')) return <Suspense fallback={<main role="status">Caricamento demo…</main>}><AutomotiveDemo path={route} /></Suspense>
  if (route === '/demo/architettura' || route === '/demo/architettura/raccontaci' || route.startsWith('/demo/architettura/progetto/')) return <Suspense fallback={<main role="status">Caricamento demo…</main>}><ArchitectureDemo path={route} /></Suspense>
  if (route === '/') return <HomePage />
  const page = route === '/servizi' ? <ServicesPage /> : route === '/preventivo' || route === '/inizia-progetto' ? <QuotePage /> : route === '/marketing' ? <MarketingPage /> : route === '/progetti' ? <ProjectsPage /> : route === '/contatti' ? <ContactsPage /> : route === '/chi-siamo' ? <AboutPage /> : route === '/login' ? <AuthPage mode="login" /> : route === '/signup' ? <AuthPage mode="signup" /> : route === '/forgot-password' ? <AuthPage mode="forgot" /> : route === '/reset-password' ? <AuthPage mode="reset" /> : route === '/account' ? <AccountPage /> : route === '/admin' ? <AdminPage /> : route === '/ai' ? <Suspense fallback={<main className="page-shell" role="status">Caricamento Upnology AI…</main>}><AiPage /></Suspense> : <main className="page-shell not-found"><h1>Pagina non trovata.</h1><a className="button-primary" href="/">Torna alla Home ↗</a></main>
  const showEmma = ['/servizi', '/marketing', '/progetti', '/chi-siamo', '/ai'].includes(route)
  return <>{!['/login', '/signup', '/forgot-password', '/reset-password', '/account', '/admin'].includes(route) && <PublicMotion />}<SiteHeader />{page}{showEmma && <EmmaPresence />}<SiteFooter /></>
}

export default App

