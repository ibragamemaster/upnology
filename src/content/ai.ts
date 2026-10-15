export const aiKnowledge = [
  'Servizi', 'Prezzi e listini', 'Cataloghi', 'FAQ', 'Procedure', 'Documenti',
  'Disponibilità', 'Contatti', 'Regole interne', 'Ordini', 'Informazioni cliente', 'Dati autorizzati',
] as const

export const aiCapabilities = [
  { title: 'Parlare con i clienti', detail: 'Risposte sul sito, supporto ai messaggi, informazioni su servizi e prodotti.' },
  { title: 'Preparare il lavoro', detail: 'Qualificazione lead, raccolta richieste, prequalifica appuntamenti e bozze di preventivo.' },
  { title: 'Aiutare il team', detail: 'Ricerca nei documenti, accesso guidato alle procedure e supporto alle attività ripetitive.' },
  { title: 'Collegare le azioni', detail: 'Automazioni operative, handoff a una persona e aggiornamenti nei sistemi autorizzati.' },
] as const

export const aiChannels = ['Sito web', 'WhatsApp', 'Dashboard interna', 'CRM', 'Email', 'Portale cliente', 'Strumenti aziendali', 'App interne'] as const

export const aiVerticals = [
  { sector: 'Ristorante', knows: 'Menu, allergeni, orari e disponibilità', helps: 'Risponde alle domande e raccoglie richieste di prenotazione.' },
  { sector: 'Officina', knows: 'Servizi, veicoli, problemi frequenti e disponibilità', helps: 'Raccoglie il problema, il modello del veicolo e una richiesta di appuntamento.' },
  { sector: 'Immobiliare', knows: 'Immobili, caratteristiche e criteri di ricerca', helps: 'Qualifica i contatti, raccoglie preferenze e propone opzioni compatibili.' },
  { sector: 'Ecommerce', knows: 'Catalogo, disponibilità, spedizioni e resi', helps: 'Aiuta a scegliere prodotti e risponde a domande su ordini e tracking.' },
  { sector: 'Studio professionale', knows: 'FAQ, procedure e documenti autorizzati', helps: 'Raccoglie informazioni iniziali e prepara richieste per il team.' },
] as const

export const aiCustomization = ['Nome', 'Voce e tono', 'Branding', 'Fonti dati', 'Strumenti', 'Permessi', 'Limiti', 'Workflow'] as const
