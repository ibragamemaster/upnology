# Attivazione Workspace — riscontro del 30 ottobre 2026

## Evidenza raccolta, senza modifiche remote

- Dominio indicato: https://upnology.agency/admin/workspace.
- `/api/commercial/status`: HTTP 200, backend=true, payments=true, email=true,
  stripeMode=live. Questi flag non attestano l'integrità dello schema.
- Il bundle pubblico `/assets/index-BDzXy-MN.js` non contiene la route
  `/admin/workspace`. La route manca anche da `src/App.tsx` su GitHub main.
- `server/handler.ts` su GitHub main non espone `/api/commercial/workspace`.
- Il progetto Supabase usato dal frontend pubblico corrisponde a quello configurato
  localmente. Le RPC commercial_workspace_v2, customer_payment_attempt,
  commercial_overview e admin_workspace risultano presenti: la chiave pubblica
  riceve 42501 (permesso negato); un nome inesistente riceve invece PGRST202.
- Non è stata eseguita una RPC con sessione admin reale: esistenza della funzione
  non prova che tutte le sue dipendenze siano installate né che la sessione abbia
  il ruolo admin. Nessun record cliente è stato letto.
- `.env.local` ha COMMERCIAL_ENABLED=false; non è prova della configurazione Vercel.
  Il messaggio segnalato non è stato riprodotto in una sessione autenticata.

## Cause dei messaggi nel codice

`server/handler.ts` restituisce “Sistema commerciale non ancora attivato” quando
`features().backend` è false: COMMERCIAL_ENABLED deve essere esattamente true,
SUPABASE_URL e SUPABASE_ANON_KEY devono essere presenti.

Il messaggio precedente “... nel database” era generato da `server/database.ts`
per PGRST202, 42P01 o 42883. La correzione distingue ora lo schema Workspace 2.0,
lo schema di recupero Checkout e i permessi; non espone errori SQL o segreti.

Il difetto di rilascio accertato è la mancanza del frontend/API Workspace su main
e nel frontend pubblico. Il gate di produzione risulta già abilitato: non va forzato.

## Modifiche pronte

- Versione protocollo Workspace 2 sia nello stato API sia nella risposta workspace.
- Frontend rifiuta esplicitamente un backend non aggiornato o disabilitato.
- Tutte le letture dei pannelli Workspace usano `/api/commercial/workspace`,
  inclusi refresh e azioni; l'admin precedente e il cliente mantengono il proprio
  loader. Comandi e tabelle transazionali sono condivisi, non duplicati.
- `supabase/checks/workspace_activation.sql`: controllo READ ONLY di funzioni,
  privilegi, RLS e colonne richieste. Non applica migrazioni.

## Rilascio richiesto

1. Pubblicare insieme i file applicativi locali Workspace e relativi backend,
   inclusi i file nuovi non ancora tracciati. Non distribuire solo App.tsx.
2. Usare le configurazioni Vercel Production esistenti: nessun cambio di flag,
   segreti o Stripe LIVE previsto per risolvere il disallineamento.
3. Verificare con sessione admin che la nuova API restituisca version=2 e dati
   persistiti. Verificare accesso cliente/anon negato al workspace.
4. Se emerge un problema di schema, eseguire il preflight SQL READ ONLY. Applicare
   SOLO le migrazioni mancanti, dopo autorizzazione distinta. Non rieseguire alla
   cieca le migrazioni base che creano tabelle già esistenti.

Migrazioni già preparate: 20261030000000_commercial_workspace_v2.sql e
20261030010000_checkout_recovery.sql. Le RPC corrispondenti sono già esposte nel
progetto remoto; non è dimostrata la necessità di riapplicarle.

Nessun deploy, push, migrazione remota o pagamento eseguito in questa verifica.

## Ripresa locale — 30 ottobre 2026

- Eseguita la suite con Node 22.23.2 già disponibile nell'ambiente: 47 test
  superati, nessun fallimento o test saltato. Incluso il flusso commerciale
  completo su PGlite con Stripe simulato.
- Corretti i tre avvisi React del Workspace: invalidazione delle richieste
  tramite callback stabile e dipendenza esplicita dalla presenza dello snapshot
  per il polling, senza riavviare il timer a ogni aggiornamento dei dati.
- `npm run build` completato: API compilata, controlli TypeScript e bundle Vite.
- `npm run lint` completato senza errori o avvisi; `git diff --check` superato.
- Rimane l'avviso Vite sul bundle principale superiore a 500 kB.
- Restano da effettuare pubblicazione coordinata e collaudo autenticato nel
  browser; i test locali non attestano lo stato corrente della produzione né
  un pagamento reale in Stripe Test. Configurazioni e database remoti invariati.
