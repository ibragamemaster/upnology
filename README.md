# Upnology

Sito aziendale con Home 3D, servizi, preventivi, contatti e una prima area cliente basata su Supabase Auth.

## Avvio locale

Richiede Node.js 22.x e npm. Esegui `npm install` e `npm run dev`, poi apri `http://127.0.0.1:5173/`.

Configura `.env.local` copiando `.env.example` e compilando `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` del progetto Supabase Upnology esistente. Non inserire una service role key nel frontend. `VITE_PUBLIC_EMAIL`, `VITE_PUBLIC_PHONE` e `VITE_PUBLIC_WHATSAPP` sono facoltative.

## Supabase

Le migrazioni in `supabase/migrations/` sono applicate al progetto esistente, inclusa `20261005040000_ai_commercial_quote.sql` per la richiesta commerciale Upnology AI. Le tabelle commerciali rimangono nello schema privato `upnology` con RLS attiva. I visitatori anonimi inviano preventivi e contatti tramite le RPC pubbliche dedicate, senza account.

L'identità è in `auth.users`. Il trigger `upnology.sync_customer_identity` crea il profilo e, solo dopo la conferma dell'email, collega al cliente i preventivi precedenti con lo stesso indirizzo. La lettura e la modifica dei dati cliente passano per `public.account_overview` e `public.update_customer_profile`, eseguite con i permessi dell'utente e le policy RLS. L'email mostrata nel profilo proviene da Supabase Auth e non viene duplicata.

Per i link di conferma e recupero password, configura nel dashboard Supabase **Authentication → URL Configuration** gli URL consentiti `http://127.0.0.1:5173/account` e `http://127.0.0.1:5173/reset-password`, oltre agli equivalenti dell'URL di produzione. Verifica anche il `Site URL` e i template email. Il progetto reale ha restituito `email rate limit exceeded` durante i test di signup: per esercitare i flussi email serve verificare il limite e la configurazione SMTP nel dashboard.

## Route

Le pagine pubbliche restano accessibili senza login. `/ai` presenta il servizio commerciale Upnology AI, ancora in sviluppo. La CTA apre `/preventivo?servizio=ai` e raccoglie processi, canali e strumenti oltre ai campi commerciali generali. `/login`, `/signup`, `/forgot-password` e `/reset-password` gestiscono Supabase Auth; `/account` mostra profilo, preventivi e progetti dell'utente autenticato. `/admin` richiede una sessione Supabase Auth e un record in `upnology.admin_members` per lo stesso `auth.users.id`. Le RPC admin controllano questo ruolo lato database.

Il primo admin è stato assegnato nel progetto Supabase esistente tramite `upnology.admin_members`. Per assegnarne altri, un operatore del database deve usare l'ID di un account Auth già esistente e verificato. Non usare email hardcoded nel frontend o chiavi service role nel browser.

La dashboard mostra numeri globali e gli ultimi 100 preventivi, contatti, clienti e progetti per categoria. Le operazioni disponibili sono modifica dello stato lead e creazione/modifica dei progetti.

## Verifiche

- `npm run build`, `npm run typecheck`, `npm run lint`
- `supabase/tests/audit_customer_auth.sql`: struttura, RLS, grant e RPC.
- `supabase/tests/rls_customer_auth.sql`: prova transazionale con due identità e rollback, senza record permanenti.
- `supabase/tests/admin_base_transaction.sql`: prova admin/cliente, aggiornamento stato, progetto e rollback.

L'invio di email di conferma e recupero non è stato verificato end-to-end a causa del limite email del progetto reale.

## Evoluzione Upnology AI

Questa fase definisce solo il posizionamento commerciale e la raccolta delle richieste. Il Core AI, i provider LLM, la knowledge base, i tools, i permessi applicativi, le integrazioni live e la configurazione per cliente sono lavori futuri; la pagina non presenta questi elementi come già operativi.

## Sistema commerciale e primo deploy Vercel

La nuova scheda **Commerciale** integra preventivi economici, contratti versionati, tre milestone, demo/feedback, Stripe Checkout e coda email Resend. L’area cliente mostra documenti e avanzamento. Le integrazioni sono disabilitate per impostazione predefinita, così il primo deploy non richiede subito dominio, webhook o credenziali di pagamento.

Usare Node.js **22.x** (`nvm use`). Per lo sviluppo completo avviare `npm run dev:api` e `npm run dev` in due terminali. Verifiche: `npm test`, `npm run lint`, `npm run build` (comprende TypeScript frontend e server).

Prima di abilitare il sistema applicare la nuova migrazione `20261015000000_commercial_lifecycle.sql` e seguire [configurazione, limiti e collaudo post-deploy](docs/COMMERCIAL-DEPLOY.md). I modelli contrattuali richiedono approvazione legale registrata. Non impostare chiavi private come variabili `VITE_`.
