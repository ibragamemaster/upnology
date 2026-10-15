# Upnology — sistema commerciale e primo deploy

## Stato e confini

Implementazione su React/Vite e Supabase esistenti. Nessun passaggio a Prisma/Next.js e nessuna migrazione applicata al database remoto durante questo lavoro. Il sito pubblico può essere pubblicato con `COMMERCIAL_ENABLED=false`, `STRIPE_ENABLED=false`, `RESEND_ENABLED=false`. Non è stato effettuato un deploy.

Il flusso implementato è: richiesta esistente → bozza economica → invio → accettazione cliente → contratto corrispondente → accettazione contratto → acconto → lavoro → demo/feedback/approvazione → seconda tranche → finale/approvazione → saldo → consegna. Le decisioni amministrative e le approvazioni del cliente sono esplicite; gli avanzamenti dipendenti dai pagamenti sono automatici.

### Già presente, riutilizzato

- Wizard richieste e contatti; lead ed eventi nel namespace privato `upnology`.
- Supabase Auth, collegamento delle richieste dopo verifica email, profili e area cliente.
- Ruoli `admin_members`, RPC amministrative, progetti, dashboard e design.
- Migrazioni fino a `20261005040000_ai_commercial_quote.sql`.

### Aggiunto

- Scheda **Commerciale** nell’admin e sezione documenti/pagamenti nell’account.
- Bozze con dati fiscali cliente/fornitore, servizi, prezzi, imposte, scadenza, responsabilità, esclusioni, revisioni e termini. Associazione a una richiesta esistente del medesimo cliente verificato.
- Stati BOZZA, INVIATO, ACCETTATO, RIFIUTATO, SCADUTO. Aggiornamento coerente dello stato del lead originario.
- Modelli contrattuali senza testo legale precompilato. Registrazione esplicita dell’approvazione legale con riferimento; invio bloccato finché il modello non è approvato.
- Snapshot immutabili dal momento dell’invio; contratto generato nella stessa transazione dell’accettazione del preventivo. Snapshot del contratto identico al preventivo, testo legale congelato e impronta SHA-256.
- Accettazione separata del contratto con account, orario server, dichiarazione e impronta. È una registrazione applicativa: non è stata implementata una firma digitale qualificata né un servizio di conservazione a norma.
- PDF generato automaticamente dal server su richiesta, con font Unicode incorporato, paginazione e dati immutabili. I PDF non sono pubblicati in una cartella pubblica: il download richiede autenticazione e proprietà/admin. Non è presente un archivio separato dei file PDF; vengono conservati i dati/versioni che li producono. Per caratteri non supportati dal font, il download segnala l’errore senza sostituire il testo.
- Tre tranche in EUR: arrotondamento delle prime due per difetto, resto assegnato alla terza, somma esatta al totale lordo. Imposta arrotondata al centesimo. Percentuali intere positive con somma 100; scadenze configurabili in giorni per ciascuna fase. Minimo 50 centesimi per tranche, massimo totale 99.999.999 centesimi. Il server ignora i totali e l’email proprietaria inviati dal browser.
- Demo/finale versionati, feedback e risoluzioni, approvazione dell’ultima versione con blocco se esistono feedback aperti. Seconda e terza tranche sbloccate dall’approvazione e dal pagamento precedente.
- Consegna predisponibile prima del saldo: diventa accessibile automaticamente solo con tutte le tranche PAGATO. In alternativa, l’admin pubblica la consegna dopo il saldo. I rimborsi sospendono il progetto e bloccano l’accesso alla consegna.
- Stripe Checkout, firma webhook sul corpo originale, controllo ambiente test/live, rilettura dello stato canonico, deduplicazione evento e notifiche, tentativi riutilizzabili, fallimenti/in sospeso/scadenze/rimborsi parziali e totali. Il ritorno con `?payment=processing` non conferma alcun pagamento.
- Riconciliazione admin con una sessione Stripe esistente: legge il provider e controlla la corrispondenza al tentativo, senza consentire di segnare pagato manualmente.
- 14 template email Upnology con dati cliente/progetto e link all’area autenticata. Coda transazionale, chiave univoca per evento, lease, ricevuta provider, errori, backoff e chiave di idempotenza persistente. “sent” significa accettato dall’API Resend, non consegnato alla casella.
- Elaborazione email in background con `waitUntil` dopo comandi/webhook; cron per recupero ed expiry; pulsante admin per elaborazione manuale. Batch di 3 email per invocazione, massimo 8 tentativi. Tentativi ambigui oltre 23 ore o errori permanenti vanno in `review`, senza reinvio automatico che possa duplicare una mail dopo la finestra Resend.

### Correzioni di sicurezza

I progetti avevano un grant SELECT sull’intera tabella. È stato sostituito con un elenco di colonne pubblicabili: `internal_notes` e `delivery_url` non sono leggibili direttamente dai clienti. Le note restano disponibili all’admin tramite `admin_overview`. Il vecchio editor non può cambiare lo stato/proprietario dei progetti commerciali aggirando i pagamenti.

Una carta rifiutata su una sessione Checkout ancora aperta non autorizza la creazione di una seconda sessione: il tentativo viene riutilizzato. Gli eventi in ritardo non riportano un pagamento riuscito a FALLITO e non annullano un rimborso già registrato.

## Migrazione

Nuovo file: `supabase/migrations/20261015000000_commercial_lifecycle.sql`.

Aggiunge le sole strutture commerciali: `contract_templates`, `offers`, `contracts`, `milestones`, `payment_attempts`, `project_releases`, `project_feedback`, `commercial_events`, `email_outbox`, `stripe_events`. Riutilizza clienti, richieste, lead e progetti, aggiungendo tre campi al progetto. Le nuove tabelle hanno RLS attiva e nessun accesso diretto per `anon`/`authenticated`. Le RPC verificano proprietario/admin; la RPC di servizio è eseguibile soltanto da `service_role` e verifica anche il claim del ruolo.

Prima dell’attivazione:

1. Verificare lo schema remoto e lo storico delle migrazioni; effettuare un backup con gli strumenti Supabase previsti dal progetto.
2. Applicare la nuova migrazione in staging, dopo le migrazioni esistenti, con gli strumenti di migrazione Supabase. Non rieseguire alla cieca i file storici su produzione.
3. Provare i flussi con due account cliente e un admin. Eseguire i test SQL transazionali già presenti (il test admin ora legge le note tramite l’RPC admin).
4. Applicare la migrazione sul progetto di destinazione solo dopo verifica dello schema. Non riaprire grant generici su tutte le tabelle: esporrebbero le nuove colonne riservate.
5. Impostare `COMMERCIAL_ENABLED=true` solo quando database, API e identità sono pronti.

## Variabili Vercel

Copiare i nomi da `.env.example`, non dal contenuto di `.env.local`. Le chiavi private non devono avere il prefisso `VITE_`.

| Variabile | Dove / quando |
| --- | --- |
| `VITE_SUPABASE_URL` | Frontend, progetto Supabase esistente; necessario ad Auth e richieste |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend, chiave pubblicabile esistente |
| `VITE_PUBLIC_EMAIL`, `VITE_PUBLIC_PHONE`, `VITE_PUBLIC_WHATSAPP` | Frontend, recapiti facoltativi già previsti |
| `COMMERCIAL_ENABLED` | Server, `false` al primo deploy; `true` dopo la migrazione |
| `SUPABASE_URL` | Server, stesso progetto del frontend |
| `SUPABASE_ANON_KEY` | Server, chiave pubblicabile/anon del progetto; le richieste utente inoltrano il JWT verificato |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo server; necessaria a webhook e worker, mai al frontend |
| `APP_URL` | Origine HTTPS canonica senza percorso, dopo assegnazione dominio |
| `STRIPE_ENABLED` | Server, `false` fino al collaudo |
| `STRIPE_MODE` | `test` o `live`; deve corrispondere alla chiave e agli eventi |
| `STRIPE_SECRET_KEY` | Solo server, `sk_test_…` / `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | Solo server, segreto dell’endpoint corretto |
| `RESEND_ENABLED` | Server, `false` finché dominio e mittente non sono verificati |
| `RESEND_API_KEY` | Solo server |
| `RESEND_FROM` | Mittente verificato, ad esempio `Upnology <progetti@dominio-verificato>` |
| `CRON_SECRET` | Segreto casuale di almeno 32 caratteri; Vercel lo invia come Bearer |
| `DEMO_ALLOWED_ORIGINS` | Origini HTTPS separate da virgola, con autorizzazione cliente già attiva sul servizio di destinazione |

Node: `22.x` in `package.json`, `.nvmrc` 22.22.0. Build: `npm run build`. Output: `dist`. La funzione Vercel unica è `api/index.ts`, con font PDF incluso nel bundle. Le rewrite separano le API dalle rotte SPA. Le risposte API/documenti sono `private, no-store`.

## Dopo il deploy autorizzato

1. Verificare home e rotte `/account`, `/admin`, `/api/commercial/status`, inclusi refresh su URL profondi. Con flag disabilitati, l’API deve rispondere 503 alle operazioni commerciali e non creare sessioni di pagamento.
2. Configurare `APP_URL` e gli URL Supabase Auth di conferma/reset. Verificare effettivamente invio email Auth: resta gestito da Supabase; se si desidera Resend anche per Auth, configurare il suo SMTP nel pannello Supabase. Il precedente limite email segnalato nel README non è stato risolto né ritestato su remoto.
3. Applicare/verificare la migrazione e impostare le variabili server. Aprire l’admin, inserire dati reali del fornitore e un modello rivisto dal consulente; registrare il riferimento dell’approvazione.
4. Creare l’endpoint Stripe HTTPS `/api/stripe/webhook`. SDK bloccato nel lockfile: Stripe 23.0.0, API `2026-09-30.endive`. Configurare la versione e gli eventi coerenti con l’SDK. Abilitare: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `payment_intent.processing`, `payment_intent.succeeded`, `charge.refunded`, `refund.updated`.
5. Usare prima Stripe test: tre pagamenti, carta rifiutata e retry sulla stessa sessione, autenticazione richiesta, scadenza sessione, replay webhook e rimborsi. Verificare importi nel dashboard Stripe e nel database. Il codice limita Checkout alle carte; gestisce comunque gli stati in sospeso. Nessun endpoint avvia rimborsi: si eseguono nel dashboard Stripe, poi vengono riconciliati dai webhook.
6. Verificare dominio Resend e DNS, impostare mittente/API key, esaminare le notifiche accumulate prima di abilitare l’invio. Provare recapito reale e gestione dei rifiuti. Per il primo deploy il cron è giornaliero alle 08:00 UTC; i nuovi eventi avviano anche un batch immediato in background. Per recuperi frequenti/backlog usare una pianificazione compatibile con il piano Vercel, ad esempio ogni 5 minuti dove consentito. Il cron giornaliero da solo non garantisce retry tempestivi dentro le 23 ore.
7. Proteggere realmente demo e materiali sul loro hosting: autenticazione del cliente e isolamento tra progetti. Solo dopo aggiungere l’origine a `DEMO_ALLOWED_ORIGINS`. Il controllo del link nell’area cliente non rende privato un sito esterno pubblico; l’app non implementa un hosting/proxy delle demo né verifica automaticamente le ACL esterne. Non inserire credenziali/password negli URL o nelle note.
8. Verificare la preparazione della consegna e il suo sblocco solo dopo saldo. Controllare la sospensione dopo rimborso.
9. Passare a chiavi live soltanto dopo collaudo, riconfigurando webhook e ambiente in modo coerente. Le modifiche delle variabili Vercel richiedono un nuovo deploy per essere attive.

## Operazioni e limiti espliciti

- Nuova versione: copia in BOZZA con collegamento all’originale. Se l’originale è già accettato, il nuovo preventivo rappresenta una commessa distinta; non ricalcola/sostituisce le tranche già concordate e non annulla gli obblighi precedenti. Una variazione a saldo differenziale sullo stesso progetto non è implementata. Specificare nel nuovo documento l’ambito aggiuntivo e gli importi dovuti.
- Tentativo Checkout rimasto `creating`: viene riutilizzato con la stessa chiave. Se la sessione è stata creata ma la risposta è andata persa, l’admin può riconciliarla usando l’ID Stripe. Dopo la finestra di creazione, un tentativo senza sessione nota viene bloccato per evitare un possibile doppio addebito; richiede verifica del provider, non un reset automatico.
- Email `review`: controllare nel provider se l’invio sia avvenuto. Non cambiare la chiave e non reinviare alla cieca. Non è implementato un pulsante che forzi il reinvio di esiti ambigui né un webhook per bounce/delivery Resend.
- Nessuna verifica live di Stripe, Resend, SMTP Auth, DNS, ACL demo o routing sul dominio Vercel è stata effettuata. I test provider usano eventi firmati/risposte simulate e i test database usano PostgreSQL locale PGlite con ruoli/claim Auth di test.
- Il deploy pubblico disabilitato è preparato; l’esercizio commerciale reale richiede migrazione, dati/approvazione legale, configurazione e collaudo esterno. Nessuna credenziale privata è richiesta per la build e nessun pagamento fittizio viene mostrato come pagato.

## Verifiche riproducibili

```sh
nvm use
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` esegue TypeScript tramite `tsx` e il test runner Node, senza isolamento a processi per compatibilità con il runtime PostgreSQL WASM. Applica tutte le migrazioni a un database in memoria, esercita privilegi/transazioni e riesegue i test SQL legacy admin/cliente. Non legge le credenziali di produzione.

In locale, usare due terminali con Node 22: `npm run dev:api` (127.0.0.1:3001) e `npm run dev` (5173). Vite inoltra `/api` al server locale. Le variabili sono caricate da `.env.local`; senza flag/segreti, le integrazioni restano disabilitate.

Font incorporato: DejaVu Sans, licenza in `server/assets/DejaVuSans-LICENSE.txt`.

Riferimenti usati per l’integrazione: [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js), [background waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Stripe SDK e firma webhook](https://github.com/stripe/stripe-node), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
