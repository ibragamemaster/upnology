import { useEffect, useState, type FormEvent } from 'react'

type Product = { slug: string; name: string; category: string; price: number; image: string; description: string; sizes: string[]; colors: { name: string; value: string }[] }
type CartItem = { key: string; slug: string; size: string; color: string; quantity: number }

const products: Product[] = [
  { slug: 'bomber-forma', name: 'Bomber Forma', category: 'Outerwear', price: 119, image: '/demos/street-bomber.webp', description: 'Volume morbido, nylon compatto e dettagli ridotti all’essenziale. Un layer per tutti i giorni.', sizes: ['S', 'M', 'L', 'XL'], colors: [{ name: 'Ink', value: '#26282b' }, { name: 'Stone', value: '#9b9b91' }] },
  { slug: 'cargo-01', name: 'Cargo 01', category: 'Bottoms', price: 89, image: '/demos/street-cargo.webp', description: 'Taglio rilassato, tasche funzionali e una linea pensata per muoversi.', sizes: ['S', 'M', 'L', 'XL'], colors: [{ name: 'Slate', value: '#777b7b' }, { name: 'Ink', value: '#26282b' }] },
  { slug: 'hoodie-offgrid', name: 'Hoodie Offgrid', category: 'Layers', price: 79, image: '/demos/street-hoodie.webp', description: 'Cotone corposo e proporzioni ampie. La base su cui costruire il resto.', sizes: ['S', 'M', 'L', 'XL'], colors: [{ name: 'Bone', value: '#d9d6c9' }, { name: 'Slate', value: '#777b7b' }] },
]
const euro = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
const cartKey = 'upnology-demo-street-cart-v1'
function readCart(): CartItem[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(cartKey) || '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is CartItem => typeof item === 'object' && item !== null && typeof item.slug === 'string' && products.some(product => product.slug === item.slug) && typeof item.key === 'string' && typeof item.size === 'string' && typeof item.color === 'string' && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20)
  } catch { return [] }
}
function useDemoCart() {
  const [cart, setCart] = useState<CartItem[]>(readCart)
  useEffect(() => { try { sessionStorage.setItem(cartKey, JSON.stringify(cart)) } catch { /* Demo still works for this page. */ } }, [cart])
  const add = (slug: string, size: string, color: string) => {
    const key = `${slug}:${size}:${color}`
    setCart(current => current.some(item => item.key === key) ? current.map(item => item.key === key ? { ...item, quantity: Math.min(20, item.quantity + 1) } : item) : [...current, { key, slug, size, color, quantity: 1 }])
  }
  const change = (key: string, quantity: number) => setCart(current => current.map(item => item.key === key ? { ...item, quantity: Math.max(0, Math.min(20, quantity)) } : item).filter(item => item.quantity > 0))
  return { cart, add, change, clear: () => setCart([]) }
}

function DemoTopbar({ title, className, children }: { title: string; className: string; children: React.ReactNode }) {
  return <header className={`demo-topbar ${className}`}><a className="demo-return" href="/progetti">← Torna a Upnology</a><a className="demo-brand" href={className === 'restaurant' ? '/demo/ristorante' : '/demo/streetwear'}>{title}</a><nav aria-label="Navigazione della demo">{children}</nav></header>
}

const menu = [
  { category: 'Antipasti', name: 'Burrata & pomodori', note: 'Pomodori arrosto, basilico, pane croccante', price: 14 },
  { category: 'Antipasti', name: 'Carciofo alla brace', note: 'Crema di pecorino, limone, menta', price: 13 },
  { category: 'Primi', name: 'Rigatoni della casa', note: 'Pomodoro lento, basilico, Parmigiano', price: 18 },
  { category: 'Primi', name: 'Ravioli di ricotta', note: 'Burro nocciola, salvia, scorza di limone', price: 21 },
  { category: 'Secondi', name: 'Pollo al forno', note: 'Patate novelle, rosmarino, fondo leggero', price: 24 },
  { category: 'Secondi', name: 'Melanzana glassata', note: 'Yogurt alle erbe, pomodoro confit', price: 20 },
  { category: 'Dolci', name: 'Tiramisù di casa', note: 'Crema al mascarpone, caffè espresso', price: 9 },
  { category: 'Dolci', name: 'Panna cotta', note: 'Vaniglia, frutti rossi di stagione', price: 9 },
] as const
const categories = ['Tutto', 'Antipasti', 'Primi', 'Secondi', 'Dolci'] as const

export function RestaurantDemo() {
  const [category, setCategory] = useState<(typeof categories)[number]>('Tutto')
  const [booking, setBooking] = useState<{ date: string; time: string; people: string } | null>(null)
  const submitBooking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const date = String(data.get('date') || '')
    const time = String(data.get('time') || '')
    const people = String(data.get('people') || '')
    if (!date || !time || !people || date < new Date().toLocaleDateString('en-CA')) return
    setBooking({ date, time, people })
  }
  const today = new Date().toLocaleDateString('en-CA')
  return <div className="demo restaurant-demo" id="top">
    <DemoTopbar title="TERRA / TAVOLA" className="restaurant"><a href="#storia">La storia</a><a href="#menu">Menu</a><a href="#prenota">Prenota</a></DemoTopbar>
    <main>
      <section className="restaurant-hero"><img src="/demos/restaurant-hero.webp" alt="Tavola apparecchiata con pasta e calici in un ristorante dalle luci calde" width="1280" height="853" fetchPriority="high"/><div className="restaurant-hero-shade"/><div className="restaurant-hero-copy"><span>CONCEPT DIMOSTRATIVO · RISTORANTE IMMAGINARIO</span><h1>Il tempo<br/><em>di stare insieme.</em></h1><p>Una cucina di gesti semplici, ingredienti sinceri e tavole da condividere.</p><a href="#prenota" className="restaurant-button">Trova il tuo tavolo <span>↗</span></a><a className="demo-hero-ask" href="/preventivo?servizio=website&tipo=ristorazione">Voglio un sito così ↗</a></div><div className="restaurant-hero-side">CUCINA ITALIANA / FATTA CON CALMA</div></section>
      <section className="restaurant-story" id="storia"><div><span className="restaurant-kicker">01 / LA NOSTRA IDEA</span><h2>Una tavola che sa <em>di casa.</em></h2></div><div><p>Terra / Tavola è un ristorante immaginario nato per mostrare come atmosfera, menu e prenotazione possano diventare un’esperienza digitale unica.</p><p>Qui il tempo rallenta: piatti di stagione, conversazioni lunghe e il piacere di ritrovarsi.</p><a href="#menu">Scopri il menu ↓</a></div></section>
      <section className="restaurant-menu" id="menu"><div className="restaurant-menu-heading"><div><span className="restaurant-kicker">02 / IN CUCINA</span><h2>Il nostro <em>menu.</em></h2><p>Una selezione dimostrativa, pensata per raccontare sapori familiari.</p></div><img src="/demos/restaurant-food.webp" alt="Rigatoni al pomodoro e burrata su una tavola calda" loading="lazy" width="900" height="900"/></div><div className="restaurant-filters" aria-label="Filtra il menu">{categories.map(item => <button type="button" key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="restaurant-menu-list">{menu.filter(item => category === 'Tutto' || item.category === category).map(item => <article key={item.name}><div><small>{item.category}</small><h3>{item.name}</h3><p>{item.note}</p></div><strong>{euro(item.price)}</strong></article>)}</div></section>
      <section className="restaurant-book" id="prenota"><div><span className="restaurant-kicker">03 / IL TUO MOMENTO</span><h2>Ci vediamo <em>a tavola.</em></h2><p>Scegli una data e immagina la tua serata. Questa demo non invia prenotazioni al ristorante.</p></div><div className="restaurant-book-panel">{booking ? <div role="status" className="restaurant-confirm"><span>SIMULAZIONE COMPLETATA</span><h3>Il tavolo è solo un’anteprima.</h3><p>Hai scelto {booking.people} {booking.people === '1' ? 'persona' : 'persone'} per il {new Date(`${booking.date}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })} alle {booking.time}.</p><strong>Nessuna prenotazione è stata inviata.</strong><button type="button" onClick={() => setBooking(null)}>Scegli un’altra data ↗</button></div> : <form onSubmit={submitBooking}><label>Data<input name="date" type="date" min={today} required/></label><label>Orario<select name="time" defaultValue="" required><option value="" disabled>Seleziona un orario</option>{['12:30', '13:00', '13:30', '19:30', '20:00', '20:30', '21:00'].map(time => <option key={time} value={time}>{time}</option>)}</select></label><label>Persone<select name="people" defaultValue="2" required>{[1, 2, 3, 4, 5, 6, 7, 8].map(count => <option key={count} value={count}>{count}</option>)}</select></label><button className="restaurant-button" type="submit">Simula prenotazione <span>↗</span></button><small>Solo dimostrazione. Nessun dato viene inviato o salvato.</small></form>}</div></section>
    </main><footer className="restaurant-footer"><span>TERRA / TAVOLA <small>Concept dimostrativo Upnology</small></span><a href="/preventivo?servizio=website&tipo=ristorazione">Voglio un sito così ↗</a><a href="#top">Torna su ↑</a></footer>
  </div>
}

function ShopHeader({ count }: { count: number }) {
  return <DemoTopbar title="S//FORM" className="street"><a href="/demo/streetwear">Shop</a><a href="/demo/streetwear#editoriale">Visione</a><a href="/demo/streetwear/carrello">Carrello <span aria-label={`${count} articoli`}>({count})</span></a></DemoTopbar>
}
function ShopFooter() { return <footer className="shop-footer"><span>S//FORM <small>Concept dimostrativo · nessun acquisto reale</small></span><a href="/preventivo?servizio=ecommerce&tipo=streetwear">Voglio un sito così ↗</a><a href="/progetti">Torna a Upnology ↗</a></footer> }
function ProductCard({ product }: { product: Product }) { return <a className="shop-product-card" href={`/demo/streetwear/prodotto/${product.slug}`}><div><img src={product.image} alt={product.name} loading="lazy" width="720" height="720"/><span>Esplora ↗</span></div><small>{product.category} / S//FORM</small><h3>{product.name}</h3><p>{euro(product.price)}</p></a> }

export function StreetwearDemo({ path }: { path: string }) {
  const { cart, add, change, clear } = useDemoCart()
  const [added, setAdded] = useState(false)
  const [ordered, setOrdered] = useState(false)
  const [size, setSize] = useState('')
  const [color, setColor] = useState('')
  const count = cart.reduce((sum, item) => sum + item.quantity, 0)
  const total = cart.reduce((sum, item) => sum + (products.find(product => product.slug === item.slug)?.price || 0) * item.quantity, 0)
  const slug = path.startsWith('/demo/streetwear/prodotto/') ? path.split('/').at(-1) : ''
  const product = products.find(item => item.slug === slug)
  const isCart = path === '/demo/streetwear/carrello'
  const isSummary = path === '/demo/streetwear/riepilogo'
  const isProduct = path.startsWith('/demo/streetwear/prodotto/')
  const buy = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!product || !size || !color) return; add(product.slug, size, color); setAdded(true) }
  return <div className="demo street-demo" id="top"><ShopHeader count={count}/><main>
    {isProduct && !product && <section className="shop-empty"><h1>Prodotto non trovato.</h1><a href="/demo/streetwear">Torna al catalogo ↗</a></section>}
    {product && <section className="shop-detail"><div className="shop-detail-image"><img src={product.image} alt={product.name} width="720" height="720"/></div><div className="shop-detail-copy"><a href="/demo/streetwear">← Catalogo</a><span className="shop-index">{product.category} / DROP 001</span><h1>{product.name}</h1><strong>{euro(product.price)}</strong><p>{product.description}</p><form onSubmit={buy}><fieldset><legend>Taglia</legend><div className="shop-options">{product.sizes.map(value => <button key={value} type="button" className={size === value ? 'selected' : ''} aria-pressed={size === value} onClick={() => { setSize(value); setAdded(false) }}>{value}</button>)}</div></fieldset><fieldset><legend>Colore: {color || 'scegli'}</legend><div className="shop-options shop-colors">{product.colors.map(item => <button key={item.name} type="button" className={color === item.name ? 'selected' : ''} aria-pressed={color === item.name} onClick={() => { setColor(item.name); setAdded(false) }}><i style={{ background: item.value }}/>{item.name}</button>)}</div></fieldset><button className="shop-action" type="submit" disabled={!size || !color}>Aggiungi al carrello ↗</button>{added && <p role="status" className="shop-added">Aggiunto. <a href="/demo/streetwear/carrello">Vai al carrello ↗</a></p>}</form><small>Immagine illustrativa: le varianti colore sono indicative. Nessun acquisto reale.</small></div></section>}
    {isCart && <section className="shop-cart"><span className="shop-index">S//FORM / 02</span><h1>Il tuo carrello<span>.</span></h1>{cart.length ? <><div className="shop-cart-list">{cart.map(item => { const found = products.find(product => product.slug === item.slug)!; return <article key={item.key}><img src={found.image} alt="" width="120" height="120"/><div><h2>{found.name}</h2><p>{item.color} / {item.size}</p><button type="button" onClick={() => change(item.key, 0)}>Rimuovi</button></div><div className="shop-quantity"><button type="button" onClick={() => change(item.key, item.quantity - 1)} aria-label={`Riduci quantità ${found.name}`}>−</button><span>{item.quantity}</span><button type="button" onClick={() => change(item.key, item.quantity + 1)} disabled={item.quantity >= 20} aria-label={`Aumenta quantità ${found.name}`}>+</button></div><strong>{euro(found.price * item.quantity)}</strong></article> })}</div><div className="shop-cart-total"><span>Totale dimostrativo</span><strong>{euro(total)}</strong></div><p>Spedizione e pagamento non sono disponibili in questa demo.</p><a className="shop-action" href="/demo/streetwear/riepilogo">Vai al riepilogo ↗</a></> : <div className="shop-empty"><p>Il carrello è vuoto.</p><a href="/demo/streetwear">Esplora il catalogo ↗</a></div>}</section>}
    {isSummary && <section className="shop-cart shop-summary"><span className="shop-index">S//FORM / 03</span>{ordered ? <div role="status" className="shop-empty"><h1>Simulazione conclusa.</h1><p>Nessun ordine è stato inviato e nessun pagamento è stato effettuato.</p><a href="/demo/streetwear">Torna allo shop ↗</a></div> : cart.length ? <><h1>Riepilogo<span>.</span></h1><p>Controlla i capi scelti. Questo passaggio è solo una simulazione.</p><div className="shop-summary-list">{cart.map(item => { const found = products.find(product => product.slug === item.slug)!; return <div key={item.key}><span>{found.name} · {item.color} / {item.size} × {item.quantity}</span><strong>{euro(found.price * item.quantity)}</strong></div> })}</div><div className="shop-cart-total"><span>Totale dimostrativo</span><strong>{euro(total)}</strong></div><button className="shop-action" type="button" onClick={() => { setOrdered(true); clear() }}>Concludi simulazione ↗</button><small>Nessun ordine viene inviato. Nessun pagamento viene richiesto.</small></> : <div className="shop-empty"><h1>Il carrello è vuoto.</h1><a href="/demo/streetwear">Esplora il catalogo ↗</a></div>}</section>}
    {!isProduct && !isCart && !isSummary && <><section className="shop-hero"><img src="/demos/street-hero.webp" alt="Due modelli indossano streetwear scuro in un ambiente urbano" width="1280" height="853" fetchPriority="high"/><div className="shop-hero-copy"><span>CONCEPT DEMO / DROP 001</span><h1>Wear your<br/><em>own direction.</em></h1><a href="#catalogo">Scopri il drop ↓</a><a className="demo-hero-ask" href="/preventivo?servizio=ecommerce&tipo=streetwear">Voglio un sito così ↗</a></div><span className="shop-hero-vertical">S//FORM · EVERYDAY UNIFORM</span></section><section className="shop-editorial" id="editoriale"><span>01 / MANIFESTO</span><h2>Forme libere.<br/>Scelte tue.</h2><p>S//FORM è un negozio streetwear immaginario. Un guardaroba essenziale, proporzioni rilassate e dettagli che contano. Questo concept mostra un’esperienza ecommerce completa senza vendite reali.</p></section><section className="shop-catalog" id="catalogo"><div><span>02 / SHOP THE DROP</span><h2>Pezzi da vivere.</h2><p>Tre capi, molte combinazioni. Scegli quello da cui partire.</p></div><div className="shop-product-grid">{products.map(product => <ProductCard product={product} key={product.slug}/>)}</div></section></>}
  </main><ShopFooter/></div>
}

export default function DemoPages({ type, path }: { type: 'restaurant' | 'streetwear'; path: string }) {
  return type === 'restaurant' ? <RestaurantDemo /> : <StreetwearDemo path={path} />
}

