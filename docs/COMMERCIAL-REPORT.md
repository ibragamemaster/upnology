# Rapporto di implementazione — 15 ottobre 2026

## 1. Funzionalità già presenti

React/Vite, sito pubblico e demo portfolio; wizard richieste preventivo e contatti; schema Supabase privato; Auth, profili, claim delle richieste dopo verifica email; account cliente; dashboard admin con membership server-side, lead, clienti e progetti. Tutto riutilizzato. Non è presente Prisma e non è stato introdotto.

## 2. Funzionalità implementate

- Preventivi economici completi con voci, importi in centesimi, imposte, tempi, revisioni, esclusioni, scadenza e dati fiscali; associazione alle richieste esistenti.
- Bozze modificabili, pubblicazione, accettazione/rifiuto/scadenza, versioni collegate e snapshot immutabili dopo l’invio.
- Contratti generati transazionalmente dal preventivo accettato, testo configurabile e approvazione legale obbligatoria, accettazione separata con impronta/account/data.
- PDF autenticati con font incorporato; generazione da dati conservati, senza URL documentali pubblici.
- Tre milestone, percentuali e scadenze configurabili; importi calcolati nel database e arrotondamenti riconciliati sul totale lordo.
- Stripe Checkout, eventi firmati, rilettura dello stato canonico, replay idempotente, fallimenti/retry/sospesi/scaduti, rimborsi, riconciliazione amministrativa.
- Avvio automatico dopo acconto, demo e feedback versionati, approvazione cliente, seconda tranche, verifica finale e saldo. Consegna automatica dopo tutti i pagamenti se predisposta, oppure pubblicazione admin successiva al saldo.
- 14 email Resend, coda transazionale, deduplicazione, ricevute ed errori, lease e retry; dispatch in background e recupero tramite cron.
- Integrazione nelle aree admin/cliente esistenti; configurazione Vercel, Node 22, flag disabilitati per primo deploy.

## 3. Problemi corretti

Il grant preesistente di lettura dell’intera tabella progetti avrebbe esposto note interne e il nuovo URL di consegna anticipatamente: ora si leggono soltanto colonne sicure, con note accessibili dall’RPC admin. Il vecchio editor non può aggirare le milestone sui progetti commerciali. I retry di carte rifiutate riutilizzano una sessione ancora aperta; un evento tardivo non annulla pagamenti o rimborsi già registrati. Totali, percentuali nulle/non valide e scadenze vengono validati sul server. Node 22 è esplicitato per sviluppo e Vercel.

## 4. Funzionalità ancora incomplete o non verificate esternamente

Non sono configurati/collaudati sul dominio reale Stripe, Resend, SMTP Supabase Auth e protezione degli hosting demo/consegna. Non sono stati eseguiti pagamenti, rimborsi o invii email reali né un test browser end-to-end con account remoti. La build e il routing Vercel pubblicato devono ancora essere provati dopo un deploy autorizzato.

Le nuove versioni accettate creano una commessa distinta: non è implementata una variazione differenziale che ricalcoli tranche già pagate sul medesimo progetto. Non sono implementati firma qualificata, archivio separato dei binari PDF, conservazione documentale normativa, invio rimborsi dall’admin o webhook Resend di recapito/bounce. Il download PDF ricostruisce il documento dai dati immutabili conservati. I rimborsi si avviano da Stripe; il sistema ne riceve e gestisce gli esiti. Le email ambigue richiedono riconciliazione, non un reinvio forzato.

## 5. Migrazioni necessarie

`supabase/migrations/20261015000000_commercial_lifecycle.sql`, dopo le migrazioni esistenti. Aggiunge tabelle/RPC commerciali e tre campi a `projects`, restringendo i grant sulle colonne riservate. Testata in PostgreSQL locale PGlite; **non applicata al Supabase remoto**. Verificare prima lo schema/storico remoto e provare in staging.

## 6. Risultati effettivi dei test

- `npm test`: **21 passati, 0 falliti, 0 saltati**. Comprende applicazione di tutte le migrazioni, ruoli anon/admin/due clienti, importi/arrotondamenti, immutabilità, gate legale, accettazioni e tre fasi, feedback, consegna, retry/replay/rimborsi, outbox, PDF, firma Stripe, risposte Resend simulate, regressioni SQL admin/cliente preesistenti.
- `npm run typecheck`: superato, frontend e server.
- `npm run lint`: superato senza errori o warning.
- `npm run build`: superato. Warning Vite sul chunk principale di circa 636 kB minificati, non bloccante; non è stato nascosto aumentando la soglia.
- HTTP locale: home `/`, `/account`, `/admin`, modulo TSX commerciale e `/api/commercial/status` hanno risposto **200**. Checkout senza configurazione: **503**, senza chiamate a provider. Questo non equivale a un collaudo visuale o del login remoto.
- `git diff --check`: nessun errore nell’ultima verifica.

Gli eventi Stripe nei test sono firmati con un segreto di test locale; le risposte provider sono simulate. Il database di test usa funzioni Auth equivalenti per i claim, non il servizio Auth remoto. Le migrazioni sono eseguite realmente dal motore PostgreSQL WASM.

## 7. Variabili ambiente necessarie

Elenco completo con commenti in `.env.example`; spiegazioni in `COMMERCIAL-DEPLOY.md`.

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; recapiti facoltativi `VITE_PUBLIC_EMAIL`, `VITE_PUBLIC_PHONE`, `VITE_PUBLIC_WHATSAPP`.

Server: `COMMERCIAL_ENABLED`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `STRIPE_ENABLED`, `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_ENABLED`, `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`, `DEMO_ALLOWED_ORIGINS`.

Nessuna chiave privata va nelle variabili `VITE_`. I tre flag restano `false` finché l’integrazione corrispondente non è pronta.

## 8. Operazioni da effettuare dopo il deploy

Configurare dominio e redirect Auth; applicare/verificare la migrazione; inserire dati fiscali e modello legalmente approvato; configurare Stripe test e webhook, verificando tre pagamenti/replay/rimborsi; verificare dominio/mittente Resend e recapito reale; verificare cron/queue e pianificazione adeguata al piano Vercel; applicare autorizzazioni reali agli hosting demo e consegna e autorizzarne le origini; collaudare due clienti isolati. Solo dopo il collaudo abilitare i provider live con ambienti e chiavi coerenti. Vedere la procedura dettagliata nel documento di deploy.

## 9. Stato effettivo di preparazione alla produzione

**Codice preparato per il primo deploy pubblico con integrazioni disabilitate. Nessun deploy effettuato.**

Il flusso commerciale è implementato e verificato localmente. **Non è ancora dichiarabile operativo in produzione**: mancano migrazione remota, configurazione, approvazione legale e collaudo esterno. Il sito pubblico e le funzionalità esistenti non dipendono dall’attivazione di Stripe/Resend.
