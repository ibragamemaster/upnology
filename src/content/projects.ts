export type Project = {
  slug: string
  title: string
  sector: 'Ecommerce' | 'Automotive' | 'Ristorazione' | 'Business e professionisti'
  preview?: string
  description: string
  services: string[]
  liveUrl?: string
  status: 'demo' | 'reale'
}

export const projects: Project[] = [
  { slug: 'terra-tavola', title: 'Terra / Tavola', sector: 'Ristorazione', preview: '/demos/restaurant-hero.webp', description: 'Concept di ristorante con menu filtrabile e percorso di prenotazione simulato.', services: ['Sito web', 'Esperienza di prenotazione'], liveUrl: '/demo/ristorante', status: 'demo' },
  { slug: 'sform', title: 'S//FORM', sector: 'Ecommerce', preview: '/demos/street-hero.webp', description: 'Concept streetwear con schede prodotto, varianti, carrello e riepilogo simulato.', services: ['Ecommerce', 'Design editoriale'], liveUrl: '/demo/streetwear', status: 'demo' },
  { slug: 'axiom-motors', title: 'AXIOM/MOTORS', sector: 'Automotive', preview: '/demos/auto-aeron.webp', description: 'Concessionaria immaginaria con sei auto, filtri, confronto e test drive simulato.', services: ['Sito web', 'Catalogo interattivo'], liveUrl: '/demo/automotive', status: 'demo' },
  { slug: 'atelier-nord', title: 'Atelier Nord', sector: 'Business e professionisti', preview: '/demos/arch-casa-serra.webp', description: 'Studio di architettura immaginario con portfolio e percorso progetto simulato.', services: ['Sito professionale', 'Portfolio'], liveUrl: '/demo/architettura', status: 'demo' },
]
