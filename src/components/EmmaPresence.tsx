import { useEffect, useRef, useState } from 'react'

type EmmaPose = 'idle' | 'attentive' | 'wave'

const paths = [
  { href: '/servizi', label: 'Quale servizio fa per me?', number: '01' },
  { href: '/preventivo', label: 'Richiedi preventivo', number: '02' },
  { href: '/ai', label: 'Scopri Upnology AI', number: '03' },
  { href: '/contatti', label: 'Contattaci', number: '04' },
] as const

function EmmaFigure({ pose, onReady, onError }: {
  pose: EmmaPose
  onReady: (pose: EmmaPose) => void
  onError: (pose: EmmaPose) => void
}) {
  // Keep every image mounted. A failed optional pose leaves idle visible.
  return <span className="emma-presence-figure" aria-hidden="true">
    {(['idle', 'attentive', 'wave'] as const).map((item) =>
      <img
        key={item}
        className={`emma-pose emma-pose-${item}${pose === item ? ' is-active' : ''}`}
        src={`/emma-${item}.webp`}
        alt=""
        width="640"
        height="960"
        decoding="async"
        loading="eager"
        onLoad={() => onReady(item)}
        onError={() => onError(item)}
      />,
    )}
  </span>
}

function EmmaActions({ closeRef, onClose }: { closeRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  return <section className="emma-presence-panel" id="emma-actions" role="dialog" aria-label="Emma, guida Upnology" aria-modal="false">
    <div className="emma-presence-panel-head"><div><span>EMMA / GUIDA UPNOLOGY</span><h2>Da dove iniziamo?</h2></div><button ref={closeRef} type="button" className="emma-presence-close" aria-label="Chiudi le opzioni di Emma" onClick={onClose}>×</button></div>
    <p>Ti accompagno al percorso giusto.</p>
    <nav aria-label="Percorsi consigliati da Emma">{paths.map((path) => <a key={path.href} href={path.href}><small>{path.number}</small><span>{path.label}</span><span aria-hidden="true">↗</span></a>)}</nav>
  </section>
}

export function EmmaPresence() {
  const [open, setOpen] = useState(false)
  const [greeting, setGreeting] = useState(false)
  const [nearFooter, setNearFooter] = useState(false)
  const [pose, setPose] = useState<EmmaPose>('idle')
  const available = useRef<Record<EmmaPose, boolean>>({ idle: false, attentive: false, wave: false })
  const rootRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const showPose = (next: EmmaPose) => {
    setPose(next === 'idle' || available.current[next] ? next : 'idle')
  }

  useEffect(() => {
    const footer = document.querySelector('.global-footer')
    if (!footer) return
    const observer = new IntersectionObserver(([entry]) => setNearFooter(entry.isIntersecting), { threshold: 0.05 })
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (open || window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(max-width: 700px)').matches) return
    let greeted = false
    try { greeted = sessionStorage.getItem('upnology-emma-greeted') === '1' } catch { /* Storage may be unavailable. */ }
    if (greeted) return
    const show = window.setTimeout(() => {
      setGreeting(true)
      if (available.current.wave) setPose('wave')
      try { sessionStorage.setItem('upnology-emma-greeted', '1') } catch { /* Storage may be unavailable. */ }
    }, 1200)
    const settle = window.setTimeout(() => setPose('idle'), 3400)
    const hide = window.setTimeout(() => setGreeting(false), 5200)
    return () => { clearTimeout(show); clearTimeout(settle); clearTimeout(hide) }
  }, [open])

  useEffect(() => {
    if (!greeting) return
    const hideOutsideHero = () => {
      if (window.scrollY > window.innerHeight * 0.6) setGreeting(false)
    }
    window.addEventListener('scroll', hideOutsideHero, { passive: true })
    hideOutsideHero()
    return () => window.removeEventListener('scroll', hideOutsideHero)
  }, [greeting])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      setPose('idle')
      triggerRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setPose('idle')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('pointerdown', onPointerDown) }
  }, [open])

  const close = () => { setOpen(false); setPose('idle'); triggerRef.current?.focus() }

  return <aside ref={rootRef} className={`emma-presence${open ? ' is-open' : ''}${nearFooter && !open ? ' is-near-footer' : ''}`} aria-label="Emma, guida Upnology">
    <span className="emma-presence-orbit" aria-hidden="true" />
    <span className="emma-presence-platform" aria-hidden="true" />
    <button
      ref={triggerRef}
      type="button"
      className="emma-presence-stage"
      aria-label={open ? 'Chiudi le opzioni di Emma' : 'Apri le opzioni di Emma'}
      aria-expanded={open}
      aria-controls={open ? 'emma-actions' : undefined}
      onPointerEnter={() => { if (!open && pose !== 'wave') showPose('attentive') }}
      onPointerLeave={() => { if (!open && pose !== 'wave') setPose('idle') }}
      onFocus={() => { if (!open && pose !== 'wave') showPose('attentive') }}
      onBlur={() => { if (!open && pose !== 'wave') setPose('idle') }}
      onClick={() => { setGreeting(false); setOpen((current) => !current); showPose(open ? 'idle' : 'attentive') }}
    >
      <span className="emma-presence-travel"><EmmaFigure pose={pose} onReady={(item) => { available.current[item] = true }} onError={(item) => { available.current[item] = false; if (item === pose) setPose('idle') }} /></span>
      <span className="emma-presence-name" aria-hidden="true">EMMA <i>↗</i></span>
    </button>
    {greeting && !open && !nearFooter && <span className="emma-presence-greeting" aria-hidden="true">Ciao, serve aiuto?</span>}
    {open && <EmmaActions closeRef={closeRef} onClose={close} />}
  </aside>
}
