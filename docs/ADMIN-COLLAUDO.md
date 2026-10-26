# Collaudo del gestionale Upnology

Le modifiche sono locali. Non è stato effettuato un deploy, applicata una migrazione remota, inviato un messaggio reale o eseguito un pagamento reale.

## Prerequisiti per un ambiente di collaudo isolato

1. Usare un database Supabase di test e un account amministratore già autorizzato. Non copiare dati personali dalla produzione.
2. Applicare le migrazioni presenti in ordine, inclusa `20261015010000_stripe_checkout_integrity.sql`, quindi:
   - `20261026000000_admin_workspace.sql`: unica nuova tabella `business_settings`, RPC admin, statistiche, anagrafica, note, autorizzazioni e richieste di rimborso. Riutilizza `lead_events` e `commercial_events` per lo storico.
   - `20261026010000_quote_submission_retry.sql`: riusa i dettagli delle richieste per i retry idempotenti, senza nuove tabelle.
   - `20261026020000_commercial_command_retry.sql`: riusa gli eventi per memorizzare i risultati dei comandi. La funzione interna non è eseguibile direttamente dai client.
3. Configurare Vercel sul progetto esistente, Node 22, preset Vite, build `npm run build`, output `dist`. Le Functions restano in `api/index.ts` con le riscritture di `vercel.json`. Non usare un server localhost in produzione.
4. In collaudo servono `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (chiave pubblica/publishable), `SUPABASE_SECRET_KEY` (oppure il fallback `SUPABASE_SERVICE_ROLE_KEY`), `APP_URL` come origine HTTPS del collaudo, `COMMERCIAL_ENABLED=true`.
5. Per Stripe esclusivamente sandbox: `STRIPE_ENABLED=true`, `STRIPE_MODE=test`, `STRIPE_SECRET_KEY` nuova di test, `STRIPE_WEBHOOK_SECRET` dell’endpoint di test. Non riutilizzare le chiavi LIVE precedentemente esposte. Lasciare `STRIPE_TAX_ENABLED=false` e `STRIPE_SANDBOX_INVOICES=false`, salvo collaudo fiscale separato.
6. Webhook: `/api/stripe/webhook`, eventi `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `payment_intent.processing`, `payment_intent.succeeded`, `charge.refunded`, `refund.updated`. La firma viene verificata sul corpo originale; importi, valuta, modalità e riferimenti sono controllati prima di registrare il pagamento.
7. La chiave limitata necessita delle operazioni effettivamente chiamate: Checkout Sessions creazione/lettura/elenco, Payment Intents lettura, Charges lettura, Refunds scrittura per il rimborso autorizzato. Verificare questi permessi in Stripe: non sono stati interrogati con credenziali reali.
8. Per le email lasciare `RESEND_ENABLED=false` finché non si usa un ambiente isolato contenente soltanto destinatari di test autorizzati. Per abilitarle servono `RESEND_API_KEY`, `RESEND_FROM` verificato, `RESEND_ENABLED=true`, `CRON_SECRET` di almeno 32 caratteri per il job `/api/jobs/commercial`. Il pulsante di elaborazione tratta la coda: non usarlo su una coda contenente clienti reali durante il test.
9. Configurare `DEMO_ALLOWED_ORIGINS` con le sole origini HTTPS autorizzate. La protezione effettiva delle demo esterne deve essere attiva presso il servizio che le ospita; l’allowlist e il controllo proprietario sul link non sostituiscono tale protezione.

Nessuna di queste impostazioni remote è stata modificata o verificata. Le flag del rilascio Production restano disabilitate finché non viene autorizzata la configurazione finale.

## Percorso di prova manuale

- Aprire `/admin` e `/account` con due sessioni separate (amministratore e cliente fittizio verificato).
- Inviare una richiesta dal sito; verificare comparsa nell’admin, brief, stato e note interne. Un secondo invio con lo stesso identificativo e contenuto restituisce la richiesta originale.
- In Impostazioni compilare i dati aziendali. Usare un modello contrattuale espressamente destinato al collaudo; per l’uso reale occorre approvazione legale effettiva.
- Creare preventivo da 1.000 €, imposta zero solo per il caso fittizio e percentuali 30/40/30. Verificare PDF e importi 300/400/300. Pubblicare e controllare la coda email.
- Dal cliente accettare il preventivo, leggere il contratto e accettarlo separatamente. Verificare identità di dati/importi e impronta. Non è una firma elettronica qualificata.
- Creare Checkout TEST e pagare con gli strumenti di test Stripe. La pagina di ritorno non conferma il pagamento: attendere il webhook e verificare l’avvio del progetto.
- Pubblicare demo protetta, inviare feedback dal cliente, risolverlo dall’admin, approvare la demo e pagare la seconda rata TEST.
- Pubblicare il finale, predisporre il link di consegna, approvare dal cliente e pagare il saldo TEST. Verificare consegna, storico ed email uniche.
- Controllare che un altro cliente non possa accedere a documenti, demo o pagamenti. Verificare ritardo/duplicazione dei webhook e un pagamento fallito.
- Dall’admin provare un rimborso TEST con conferma esplicita: l’importo residuo viene calcolato sul server. Lo stato cambia soltanto dopo il webhook. I retry hanno la stessa chiave; dopo 23 ore la richiesta richiede verifica manuale per evitare un secondo rimborso.
- Provare navigazione admin e tabelle su telefono reale, apertura diretta delle rotte e refresh. Questo controllo visivo non è stato eseguito automaticamente.

## Verifiche locali e limiti

I test PostgreSQL/PGlite eseguono le migrazioni, controllano le autorizzazioni e percorrono il ciclo completo con un cliente fittizio. Il test integrato chiama il codice Checkout e verifica firme webhook reali generate localmente, usando un trasporto Stripe simulato. Nessun addebito sandbox remoto è stato eseguito.

Le ricevute sono quelle rese disponibili da Stripe; il riferimento fattura viene mostrato solo se esistente. Non viene introdotta fatturazione elettronica italiana né attivato Stripe Tax. Gli invii Resend ambigui restano in revisione: non vengono reinviati alla cieca.

Le liste CRM mantengono il limite preesistente degli ultimi 100 record (note: ultimi 500 eventi); ricerca e filtri sono su questi risultati. I contatori includono tutti i record. I preventivi commerciali sono consultabili separatamente.

L’errore nativo Node `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` è stato riprodotto e corretto. La Function locale risponde via HTTP. La corrispondenza con il 500 remoto richiede i log Vercel o la verifica dopo un deploy autorizzato: non è stata data per certa.

## Risultati e file di questa modifica

- Suite completa: **41 test superati, 0 falliti**. Include il flusso integrato isolato, autorizzazioni, importi, immutabilità, retry, rimborsi, email e regressioni recupero password.
- Backend Node 22 senza loader di sviluppo: HTTP reale locale `200` JSON per lo stato e `503` per le operazioni disabilitate, con `Cache-Control: no-store`.
- Build TypeScript/Vite completata; avviso preesistente sui bundle oltre 500 kB.
- Verifica mirata: nessun pattern di chiave segreta nel bundle, nessun ENV sensibile tracciato, nessuna importazione del server dal frontend.
- Endpoint pubblicato verificato durante il lavoro: **HTTP 500**, prima di qualsiasi deploy delle modifiche locali. Log runtime Vercel e variabili remote non accessibili.

File interessati:

- `server/config.ts`, `server/handler.ts`, `server/paymentOperations.ts`.
- `src/pages/AdminPage.tsx`, `src/components/AdminTools.tsx`, `src/components/CommercialPanel.tsx`, `src/admin.css`.
- `src/domain/commercial.ts`, `src/lib/admin.ts`, `src/lib/commercial.ts`.
- `src/components/QuoteWizard.tsx`, `src/lib/leads.ts`: solo identificazione e protezione dei retry, senza cambiare il design pubblico.
- Le tre nuove migrazioni elencate sopra.
- `tests/database.test.ts`, `tests/server.test.ts`, `tests/payment-operations.test.ts`.
- Questo documento.

Le modifiche ENV, `.gitignore` e documentazione di audit già presenti nel working tree prima del task sono state preservate.

La gestione dei rimborsi usa le [API ufficiali Stripe](https://docs.stripe.com/api/refunds/create) e una finestra di retry inferiore alla durata minima di conservazione delle [chiavi di idempotenza](https://docs.stripe.com/api/idempotent_requests).
