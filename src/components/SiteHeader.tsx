import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

const links = [
  { href: '/', label: 'Home' }, { href: '/servizi', label: 'Servizi' }, { href: '/progetti', label: 'Progetti' },
  { href: '/marketing', label: 'Marketing' }, { href: '/ai', label: 'Upnology AI' }, { href: '/chi-siamo', label: 'Chi siamo' }, { href: '/contatti', label: 'Contatti' },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const { user, loading } = useAuth()
  return <header className="site-header global-header">
    <a className="brand" href="/" aria-label="Upnology, Home"><span className="brand-symbol">U<span>·</span></span><span>UPNOLOGY</span></a>
    <button className="menu-toggle" type="button" aria-expanded={open} aria-controls="main-menu" onClick={() => setOpen(!open)}>{open ? 'Chiudi' : 'Menu'}<span aria-hidden="true">{open ? '×' : '+'}</span></button>
    <nav id="main-menu" className={open ? 'open' : ''} aria-label="Navigazione principale">{links.map((link) => <a key={link.href} href={link.href} aria-current={window.location.pathname === link.href ? 'page' : undefined}>{link.label}</a>)}{!loading && <a href={user ? '/account' : '/login'} aria-current={window.location.pathname === (user ? '/account' : '/login') ? 'page' : undefined}>{user ? 'Account' : 'Login'}</a>}<a className="nav-contact" href="/preventivo">Richiedi preventivo <span aria-hidden="true">↗</span></a></nav>
  </header>
}

export function SiteFooter() {
  return <footer className="global-footer"><a className="footer-brand" href="/">UPNOLOGY</a><div><a href="/servizi">Servizi</a><a href="/progetti">Progetti</a><a href="/contatti">Contatti</a></div><span>© 2026 Upnology</span></footer>
}
