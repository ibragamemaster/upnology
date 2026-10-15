export type DemoVehicle = {
  slug: string
  brand: 'Aeron' | 'Vantor' | 'Elvora'
  model: string
  trim: string
  body: string
  fuel: 'Benzina' | 'Ibrida' | 'Elettrica'
  price: number
  year: number
  km: number
  power: number
  range: string
  seats: number
  transmission: string
  image: string
  description: string
}

// All brands, models, prices and specifications below belong to a fictional concept.
export const demoVehicles: DemoVehicle[] = [
  { slug: 'aeron-a1-gt', brand: 'Aeron', model: 'A1', trim: 'GT', body: 'Coupé', fuel: 'Benzina', price: 36900, year: 2024, km: 9000, power: 245, range: '—', seats: 4, transmission: 'Automatica', image: '/demos/auto-aeron.webp', description: 'Una coupé compatta pensata per chi cerca una guida precisa e una linea essenziale.' },
  { slug: 'aeron-a1-gt-s', brand: 'Aeron', model: 'A1', trim: 'GT-S', body: 'Coupé', fuel: 'Benzina', price: 49900, year: 2025, km: 1800, power: 320, range: '—', seats: 4, transmission: 'Automatica', image: '/demos/auto-aeron.webp', description: 'L’allestimento più dinamico della A1, con una risposta più pronta e dettagli dedicati.' },
  { slug: 'vantor-v4-touring', brand: 'Vantor', model: 'V4', trim: 'Touring', body: 'SUV', fuel: 'Ibrida', price: 42900, year: 2024, km: 12000, power: 218, range: '—', seats: 5, transmission: 'Automatica', image: '/demos/auto-vantor.webp', description: 'Spazio, comfort e carattere sportivo in una configurazione per ogni giorno.' },
  { slug: 'vantor-v4-touring-plus', brand: 'Vantor', model: 'V4', trim: 'Touring Plus', body: 'SUV', fuel: 'Ibrida', price: 52900, year: 2025, km: 4500, power: 265, range: '—', seats: 5, transmission: 'Automatica', image: '/demos/auto-vantor.webp', description: 'Più dotazione e maggiore potenza per viaggiare con libertà e controllo.' },
  { slug: 'elvora-e6-pure', brand: 'Elvora', model: 'E6', trim: 'Pure', body: 'Berlina', fuel: 'Elettrica', price: 44900, year: 2024, km: 9500, power: 220, range: '410 km', seats: 5, transmission: 'Elettrica monomarcia', image: '/demos/auto-elvora.webp', description: 'Una berlina elettrica dalle linee pulite e dall’approccio intuitivo.' },
  { slug: 'elvora-e6-performance', brand: 'Elvora', model: 'E6', trim: 'Performance', body: 'Berlina', fuel: 'Elettrica', price: 61900, year: 2025, km: 2200, power: 360, range: '520 km', seats: 5, transmission: 'Elettrica monomarcia', image: '/demos/auto-elvora.webp', description: 'L’interpretazione più energica della E6, con autonomia e risposta superiori.' },
]

export const demoEuro = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
export const demoKm = (value: number) => new Intl.NumberFormat('it-IT').format(value) + ' km'
