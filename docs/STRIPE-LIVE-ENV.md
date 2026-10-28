# Preparazione Stripe LIVE — 16 ottobre 2026

Stripe resta disabilitato. Nessun push, deploy, pagamento o migrazione remota eseguito.
Le credenziali condivise in chat non sono state salvate o utilizzate: ruotare la chiave limitata e il signing secret prima dell'attivazione e inserirne i sostituti direttamente nelle variabili protette Vercel.

## Variabili esatte per Vercel Production

In Project Settings → Environment Variables selezionare **Production**, non tutti gli ambienti. Inserire i segreti come variabili sensibili, senza prefisso VITE_.

| Nome | Valore/configurazione |
| --- | --- |
| VITE_SUPABASE_URL | URL del progetto Supabase Upnology |
| VITE_SUPABASE_PUBLISHABLE_KEY | Chiave pubblica dello stesso progetto |
| SUPABASE_URL | Stesso URL Supabase |
| SUPABASE_ANON_KEY | Chiave pubblica Supabase; il nome è quello effettivamente letto dal backend, accetta anche la publishable key |
| SUPABASE_SECRET_KEY | Chiave server sb_secret_ dello stesso progetto, mai pubblica; ha precedenza |
| SUPABASE_SERVICE_ROLE_KEY | Fallback legacy, facoltativo se SUPABASE_SECRET_KEY è configurata |
| COMMERCIAL_ENABLED | false durante la preparazione; true solo dopo verifica schema e configurazione commerciale |
| APP_URL | https://upnology.agency |
| STRIPE_ENABLED | false, fino ad autorizzazione dell'attivazione |
| STRIPE_MODE | live |
| STRIPE_SECRET_KEY | Nuova chiave limitata LIVE Upnology dopo rotazione |
| STRIPE_WEBHOOK_SECRET | Nuovo signing secret dell'endpoint LIVE Upnology dopo rotazione |
| STRIPE_SANDBOX_INVOICES | false |
| STRIPE_TAX_ENABLED | false |
| RESEND_ENABLED | false finché non configurato |
| RESEND_API_KEY | Necessaria solo per email attive |
| RESEND_FROM | Mittente verificato, necessario solo per email attive |
| CRON_SECRET | Segreto casuale di almeno 32 caratteri per il job commerciale |
| DEMO_ALLOWED_ORIGINS | Origini HTTPS autorizzate delle demo/consegne, con protezione accessi indipendente |

VITE_PUBLIC_EMAIL, VITE_PUBLIC_PHONE e VITE_PUBLIC_WHATSAPP sono opzionali per il sito pubblico; non sono segreti.
Non serve una publishable key Stripe nel frontend: il server restituisce l'URL Checkout ospitato.

`.env.local` è ignorato e non tracciato. Sono stati conservati tutti i valori preesistenti; URL e chiave pubblica Supabase sono stati riutilizzati per i corrispondenti nomi server. Le credenziali server assenti restano vuote. APP_URL è l'origine canonica richiesta; per un futuro collaudo sandbox usare un'origine HTTPS di test e chiavi/database separati.

Mancanti localmente: SUPABASE_SECRET_KEY (oppure fallback SUPABASE_SERVICE_ROLE_KEY), STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET. Per funzionalità accessorie: RESEND_API_KEY, RESEND_FROM, CRON_SECRET e DEMO_ALLOWED_ORIGINS. I valori effettivi configurati in Vercel non sono stati letti né modificati.

## Compatibilità chiave limitata

Corretto il controllo che accettava solo sk_: ora accetta rk_live_/sk_live_ in live e rk_test_/sk_test_ in test, mantenendo il blocco quando STRIPE_ENABLED=false.

Audit delle chiamate SDK:

| Chiamata | Permesso da verificare |
| --- | --- |
| checkout.sessions.create | Checkout Sessions: Write (include Read) |
| checkout.sessions.retrieve/list | Checkout Sessions: Read, incluso in Write |
| retrieve con expand payment_intent.latest_charge | Payment Intents e Charges: Read |
| Creazione pagamento tramite Checkout | Verificare Payment Intents: Write nella chiave destinata al flusso di pagamento |
| Eventi charge.refunded/refund.updated | Lettura dello stato canonico del pagamento/charge; il backend non crea rimborsi |
| webhooks.constructEvent | Nessun permesso API Webhooks: verifica crittografica locale con signing secret |

Customers non viene chiamato direttamente. La creazione Customer opzionale riguarda le fatture sandbox, disabilitate in live. Non ci sono chiamate dirette a Products, Prices, Invoices o Tax nel flusso live: non abilitarne indiscriminatamente la scrittura. Il Checkout usa price_data/product_data inline: eventuali autorizzazioni dipendenti vanno verificate eseguendo la stessa richiesta con una rk_test_ equivalente e consultando gli errori di permesso nei log Stripe.

I nomi delle risorse forniti dall'utente non indicano i livelli Read/Write. Non è quindi verificato che la chiave abbia tutti i permessi: controllare soprattutto Checkout Sessions Write e lettura delle risorse espanse. Non sono state effettuate richieste Stripe LIVE per provare le autorizzazioni. La verifica definitiva deve avvenire in sandbox con gli stessi permessi prima del live.

Riferimenti ufficiali: https://docs.stripe.com/keys/restricted-api-keys e https://docs.stripe.com/api/checkout/sessions/create.

## Migrazione e stato remoto

La migrazione `20261015010000_stripe_checkout_integrity.sql` è compatibile con la sequenza delle migrazioni del repository, verificata dal test PostgreSQL/PGlite. Aggiunge integration_version, stripe_livemode e invoice_id (integration_version cambia anche default) e aggiorna commercial_checkout/commercial_service. Non è idempotente: non rilanciarla se già applicata.

Nota: sono **tre colonne**, non quattro come indicato nel precedente resoconto.

Il tentativo di ispezione read-only OpenAPI remoto non ha fornito lo schema (errore HTTP). Non sono disponibili credenziali amministrative database per verificare lo storico delle migrazioni, le colonne private o eventuali divergenze: compatibilità e applicazione sul remoto NON confermate.

Prima di applicare, eseguire nel SQL Editor Supabase autorizzato queste sole letture:

```sql
select version from supabase_migrations.schema_migrations
where version in ('20261015000000', '20261015010000');

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'upnology' and table_name = 'payment_attempts'
order by ordinal_position;

select pg_get_functiondef('public.commercial_checkout(uuid)'::regprocedure);
select pg_get_functiondef('public.commercial_service(text,jsonb)'::regprocedure);
```

Se lo schema diverge, riconciliare prima lo storico. Applicare solo con conferma, dopo le migrazioni precedenti e prima del nuovo codice. Non usare un database con tentativi sandbox come database commerciale live senza una verifica dei dati.

## Verifica e attivazione successiva

Il backend mantiene firma sul corpo originale, verifica stato canonico Stripe, importi/riferimenti persistiti, deduplica eventi e aggiornamenti transazionali Supabase. Test coprono rate, contratti, tentativi ripetuti, stati pending/failed/paid, rimborsi e accessi non autorizzati. Il ritorno dal Checkout non conferma un pagamento.

1. Ruotare le credenziali esposte dalla Dashboard Stripe dell'account Upnology, senza condividerle in chat.
2. Verificare/applicare la migrazione solo dopo autorizzazione e completare il collaudo sandbox con chiave limitata equivalente.
3. Compilare Vercel Production secondo la tabella, mantenendo STRIPE_ENABLED=false e i due flag fiscali false.
4. Configurare l'endpoint LIVE `https://upnology.agency/api/stripe/webhook`, gli eventi elencati in STRIPE-INTEGRATION.md e il relativo signing secret. Non confondere secret sandbox, CLI e live.
5. Finché Stripe è disabilitato, il webhook restituisce 503: non dichiararlo verificato o operativo. Il codice nuovo e le variabili Vercel richiederanno un deployment successivo autorizzato; non è stato eseguito ora.
6. Attivare COMMERCIAL_ENABLED quando backend/database sono verificati. Attivare STRIPE_ENABLED solo dopo verifica finale e autorizzazione separata.

Fatturazione fiscale italiana, SdI e Tax restano fuori dall'attivazione di questo task e non sono pronti per il live.

## Risultati effettivi dei controlli

- TypeScript frontend/server: superato (`npm run build` include `npm run typecheck`).
- ESLint: superato.
- Test: 24 superati, zero fallimenti; il conteggio include il contenitore PostgreSQL. Nuovo test su rk/sk, live/test, ambiente errato e blocco disabilitato, senza richieste remote.
- Build Vite: riuscita; warning preesistente per bundle principale di 635,79 kB oltre soglia 500 kB.
- git diff --check: superato. `.env.local` ignorato e non tracciato; Stripe disabilitato e segreti Stripe vuoti verificati con asserzioni locali.
- Nessun test pagamento LIVE o sandbox remoto effettuato.
