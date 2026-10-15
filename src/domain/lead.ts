import { z } from 'zod'

export const serviceIds = ['website', 'ecommerce', 'marketing', 'automation', 'maintenance', 'integration', 'ai', 'other'] as const
export const serviceLabels: Record<(typeof serviceIds)[number], string> = {
  website: 'Sito web', ecommerce: 'Ecommerce', marketing: 'Marketing', automation: 'Automazioni', maintenance: 'Manutenzione', integration: 'Integrazione', ai: 'Upnology AI', other: 'Altro',
}
export const budgets = ['under-500', '500-1000', '1000-2500', '2500-5000', 'over-5000', 'discuss'] as const
export const budgetLabels: Record<(typeof budgets)[number], string> = {
  'under-500': 'Meno di 500 €', '500-1000': '500–1.000 €', '1000-2500': '1.000–2.500 €', '2500-5000': '2.500–5.000 €', 'over-5000': 'Oltre 5.000 €', discuss: 'Da definire insieme',
}
export const timelines = ['urgent', 'one-month', 'one-to-three', 'flexible'] as const
export const timelineLabels: Record<(typeof timelines)[number], string> = {
  urgent: 'Urgente', 'one-month': 'Entro 1 mese', 'one-to-three': '1–3 mesi', flexible: 'Nessuna scadenza precisa',
}
export const contactMethods = ['email', 'phone', 'whatsapp'] as const

export const featureOptions: Record<(typeof serviceIds)[number], string[]> = {
  website: ['Modulo contatti', 'WhatsApp', 'Prenotazioni', 'Gallery', 'Multilingua', 'Blog', 'Area riservata'],
  ecommerce: ['Pagamenti', 'Spedizioni', 'Catalogo', 'Varianti prodotto', 'Coupon', 'Tracking'],
  marketing: ['Google Ads', 'Meta Ads', 'SEO', 'Analytics', 'Social strategy', 'Funnel'],
  automation: ['CRM', 'Email', 'WhatsApp', 'Database', 'API', 'Flussi automatici'],
  maintenance: ['Aggiornamenti', 'Correzione errori', 'Performance', 'Sicurezza', 'Modifiche', 'UI/UX'],
  integration: ['API', 'CRM', 'Pagamenti', 'Analytics', 'Email', 'WhatsApp'],
  ai: ['Assistenza clienti', 'Qualificazione lead', 'Ricerca documenti', 'Supporto al team', 'Automazioni operative', 'Handoff umano'],
  other: [],
}

export const goalQuestions: Partial<Record<(typeof serviceIds)[number], { key: string; label: string }[]>> = {
  website: [{ key: 'hasWebsite', label: 'Hai già un sito?' }, { key: 'wantsLeads', label: 'Vuoi acquisire più clienti?' }],
  ecommerce: [{ key: 'sellsOnline', label: 'Vendi già online?' }, { key: 'hasCatalog', label: 'Hai già un catalogo prodotti?' }],
  marketing: [{ key: 'hasCampaigns', label: 'Hai già campagne marketing attive?' }, { key: 'hasTracking', label: 'Misuri già le conversioni?' }],
  automation: [{ key: 'hasManualWorkflows', label: 'Ci sono attività ripetitive da automatizzare?' }],
  maintenance: [{ key: 'hasWebsite', label: 'Hai già un sito?' }, { key: 'hasAccess', label: 'Hai accesso alla gestione del sito?' }],
  integration: [{ key: 'hasTools', label: 'Gli strumenti da collegare sono già in uso?' }],
  ai: [{ key: 'hasData', label: 'Hai già documenti, FAQ o dati da mettere a disposizione?' }, { key: 'needsHumanHandoff', label: 'Serve il passaggio a un operatore umano?' }],
}

export const quoteSchema = z.object({
  services: z.array(z.enum(serviceIds)).min(1, 'Seleziona almeno un servizio.'),
  company: z.string().trim().min(2, 'Indica il nome dell’attività.').max(120),
  sector: z.string().trim().min(2, 'Indica il settore.').max(100),
  existingSite: z.union([z.literal(''), z.url('Inserisci un URL valido, completo di https://.')]),
  city: z.string().trim().min(2, 'Indica la città o area.').max(100),
  activityDescription: z.string().trim().min(10, 'Descrivi brevemente la tua attività.').max(1500),
  goal: z.string().trim().min(10, 'Descrivi il risultato che vuoi ottenere.').max(2000),
  answers: z.record(z.string(), z.enum(['yes', 'no', 'unsure'])),
  features: z.array(z.string().trim().min(1).max(100)).max(30),
  budget: z.enum(budgets, { error: 'Seleziona un budget indicativo.' }),
  timeline: z.enum(timelines, { error: 'Seleziona una tempistica.' }),
  name: z.string().trim().min(2, 'Indica il tuo nome.').max(120),
  email: z.email('Inserisci un indirizzo email valido.').max(254),
  phone: z.string().trim().max(40),
  whatsapp: z.string().trim().max(40),
  preferredContact: z.enum(contactMethods),
  notes: z.string().trim().max(2000),
  aiProcesses: z.string().trim().max(2000),
  aiChannels: z.string().trim().max(1000),
  aiTools: z.string().trim().max(1000),
  website: z.string().max(0).optional(),
}).superRefine((value, context) => {
  if (value.preferredContact === 'phone' && !value.phone) context.addIssue({ code: 'custom', path: ['phone'], message: 'Inserisci un numero di telefono.' })
  if (value.preferredContact === 'whatsapp' && !value.whatsapp && !value.phone) context.addIssue({ code: 'custom', path: ['whatsapp'], message: 'Inserisci un numero WhatsApp o di telefono.' })
  if (value.services.includes('ai')) {
    if (value.aiProcesses.length < 10) context.addIssue({ code: 'custom', path: ['aiProcesses'], message: 'Descrivi i processi da migliorare.' })
    if (value.aiChannels.length < 2) context.addIssue({ code: 'custom', path: ['aiChannels'], message: 'Indica i canali desiderati.' })
    if (value.aiTools.length < 2) context.addIssue({ code: 'custom', path: ['aiTools'], message: 'Indica gli strumenti usati o scrivi “Nessuno”.' })
  }
})

export type QuoteRequest = z.infer<typeof quoteSchema>
export type ServiceChoice = (typeof serviceIds)[number]

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  message: z.string().trim().min(10).max(3000),
  website: z.string().max(0).optional(),
})
export type ContactRequest = z.infer<typeof contactSchema>
