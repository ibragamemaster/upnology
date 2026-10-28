# Stripe Upnology — stato locale e configurazione

## Componenti già presenti

React + Vite, API `api/index.ts` con Web Request/Response per Vercel Functions, Supabase Auth e RPC PostgreSQL. Il ciclo esistente comprende preventivi con prezzi server-side, versioni immutabili, contratti/PDF, accettazione separata del contratto, tre milestone configurabili, demo/feedback, consegna subordinata al saldo e notifiche Resend. Le autorizzazioni cliente/admin sono applicate nelle RPC; le scritture dei pagamenti richiedono service role.

## Modifiche di questa integrazione

- Sessione Checkout e PaymentIntent contengono application, attempt_id, installment_id, milestone_id, quote_id, project_id e customer_id (UUID del cliente Supabase, non un identificativo Stripe `cus_`).
- Creazione e riapertura verificano importo, EUR, ambiente, identità del tentativo e riferimenti al progetto.
- Il database ricontrolla i riferimenti delle nuove sessioni e fissa il loro ambiente al primo collegamento verificato. Conserva anche l'eventuale invoice_id.
- I tentativi preesistenti mantengono il protocollo precedente per poter essere riconciliati. I vecchi tentativi senza sessione devono essere esaminati dall'admin, non vengono ricreati automaticamente con parametri diversi.
- Invoicing post-pagamento è predisposto con `invoice_creation`, esclusivamente per test opzionali. È disabilitato per default e la sua attivazione in modalità live viene rifiutata.
- `automatic_tax` è esplicitamente disabilitato. Impostare `STRIPE_TAX_ENABLED=true` blocca la creazione Checkout, anziché aggiungere imposte a importi già approvati.
- Nessuna nuova dipendenza; nessuna modifica al design.

## Limiti effettivi

Nessuna credenziale Stripe disponibile nei file ambiente locali. Non sono stati creati Checkout remoti, effettuati pagamenti sandbox o verificati webhook sul dominio pubblico. Non è stato collegato un account Stripe, né modificato un account o dato Plugroom.

Non è disponibile un connettore MCP Stripe autenticato in questa sessione; il planner non è stato eseguito. Consultata la documentazione ufficiale https://docs.stripe.com/mcp e utilizzati i tipi dell'SDK Stripe installato (23.0.0).

Le fatture sandbox sono aggregate per rata, non documenti fiscali italiani pronti all'uso. Non sono implementati invio SdI, note di credito fiscali, raccolta PEC/codice destinatario, riuso di un unico Stripe Customer tra rate o una dashboard dedicata alle fatture. L'invoice_id viene acquisito leggendo la sessione canonica durante webhook/riconciliazione; se Stripe lo assegna successivamente, usare la riconciliazione admin. Non è presente un worker dedicato al ciclo delle fatture.

## Variabili Vercel

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

Server: `COMMERCIAL_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (chiave pubblica Supabase), `SUPABASE_SECRET_KEY` (fallback legacy `SUPABASE_SERVICE_ROLE_KEY`), `APP_URL` (origine HTTPS del deployment).

Stripe: `STRIPE_ENABLED=true`, `STRIPE_MODE=test`, `STRIPE_SECRET_KEY` della sandbox Upnology, `STRIPE_WEBHOOK_SECRET` dell'endpoint corrispondente. Nessuna chiave Stripe deve avere prefisso VITE_.

Default fiscali: `STRIPE_SANDBOX_INVOICES=false`, `STRIPE_TAX_ENABLED=false`. Abilitare le fatture sandbox solo deliberatamente e prima di creare tentativi. Non cambiare questa configurazione mentre esistono tentativi aperti: Stripe protegge gli stessi tentativi con chiavi di idempotenza e rifiuta parametri differenti.

Usare ambienti/database separati per sandbox e live: una conferma sandbox aggiorna davvero il database configurato. Non collegare la sandbox al database operativo dei clienti reali.

## Webhook

Endpoint previsto sul dominio indicato dall'utente:
`https://upnology.agency/api/stripe/webhook`.
Per il collaudo su preview usare invece il dominio della preview con accesso consentito a Stripe.

Eventi supportati:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `payment_intent.payment_failed`
- `payment_intent.processing`
- `payment_intent.succeeded`
- `charge.refunded`
- `refund.updated`

Configurare la versione webhook coerente con l'SDK installato (`2026-09-30.endive`), verificandone la disponibilità nella Dashboard. La firma è verificata sul corpo originale con tolleranza 300 secondi. Il server rilegge la sessione Stripe, verifica importo/valuta/riferimenti e persiste l'evento in una transazione. Eventi duplicati e fuori ordine non devono riavviare progetti né duplicare notifiche. Il ritorno su `?payment=processing` non conferma nulla.

## Migrazione

Applicare, dopo le migrazioni esistenti, `supabase/migrations/20261015010000_stripe_checkout_integrity.sql`.
Aggiunge tre colonne a payment_attempts e sostituisce le due RPC senza cancellare dati o alterare gli originali approvati. Applicare prima del codice nuovo. Non è stata applicata a Supabase remoto; è stata eseguita sul PostgreSQL locale PGlite durante i test.

## Test effettuati

`npm test`: 23 test superati (il conteggio del runner include il contenitore PostgreSQL).
Coperti: 1.000 EUR -> 300/400/300; arrotondamento con IVA; contratto identico e accettazione separata; richiesta SDK Checkout con importi persistiti; idempotency key stabile; sessione riutilizzata; importo/progetto/ambiente errati; firme/timestamp; fallimento/pending/successo; duplicati; aggiornamento progetto; demo/feedback; saldo/consegna; rimborsi; autorizzazioni; PDF e outbox email.
Le chiamate Stripe sono simulate e le firme sono generate dall'SDK: non costituiscono prova di pagamento sandbox reale.

`npm run build`: riuscito, include TypeScript frontend/server. Rimane l'avviso preesistente sul bundle principale oltre 500 kB. `npm run lint`: riuscito.
Compatibilità strutturale Vercel mantenuta: preset Vite, root repository, build `npm run build`, output `dist`, API Node con body originale. Nessun deploy Vercel eseguito o verificato da questa sessione.

## Passaggi manuali e configurazione fiscale

1. Selezionare esclusivamente la sandbox dell'account Upnology nella Dashboard Stripe; configurare le chiavi nelle variabili protette dell'ambiente di test Vercel.
2. Applicare le migrazioni al database di test autorizzato e configurare il webhook sopra indicato, copiando il relativo signing secret nell'ambiente server.
3. Creare un cliente di test, approvare il template contrattuale di test, creare il preventivo da 1.000 EUR, accettare preventivo e contratto separatamente.
4. Pagare 300 EUR nel Checkout sandbox con carta di test Stripe; verificare evento 2xx, milestone PAGATO e progetto IN_LAVORAZIONE. Pubblicare/approvare demo e risultato finale, quindi testare 400 e 300 EUR.
5. Ripetere con rifiuto carta, invio duplicato del webhook, tentativo da altro cliente e rimborso sandbox. Verificare che la semplice pagina di ritorno non cambi lo stato.
6. Solo in sandbox, abilitare le fatture opzionali e controllarne emissione e associazione. Non attivare Tax o fatturazione reale.
7. Prima del live, definire con il consulente regime fiscale, territorialità, esenzioni/reverse charge, classificazione dei servizi, dati fiscali cliente e canale di fatturazione elettronica. Implementare il calcolo fiscale **prima dell'approvazione del preventivo**, conservarne gli esiti nella versione approvata e ripartire gli importi lordi; non ricalcolare le imposte al pagamento delle rate.
8. Integrare e verificare il fornitore SdI, note di credito e conservazione richiesti dalla configurazione scelta; autorizzare separatamente attivazione live e deploy.

Fonti ufficiali: [Checkout API](https://docs.stripe.com/api/checkout/sessions/create), [ricevute e fatture](https://docs.stripe.com/receipts), [Tax con Checkout](https://docs.stripe.com/tax/checkout), [fatturazione elettronica tramite partner](https://stripe.com/guides/send-e-invoices-on-stripe-billing-through-app-marketplace-partners). Una fattura PDF Stripe non verifica da sola il flusso italiano di fatturazione elettronica.
