# Audit ENV Upnology — 21 ottobre 2026

Ricerca nelle sorgenti frontend/backend/API, configurazioni Vite/Vercel/npm, migrazioni/test SQL e test TypeScript; confronto con i file ENV senza copiarne i valori. Esclusi dipendenze, output di build e metadati privati. Rilevate **22 variabili applicative**, nessuna lettura dinamica aggiuntiva nella logica di produzione. I test assegnano credenziali sintetiche, non aggiungono variabili operative. Vercel Production non è stato letto o modificato: lo stato locale non prova la configurazione remota.

Il blocco completo è nel file root `.env.production.example`. Non viene caricato automaticamente: compilare i valori direttamente nell'interfaccia Vercel, ambiente Production. Le variabili vuote opzionali possono essere omesse. I flag false permettono una preparazione senza attivare i servizi.

## Inventario completo

“Obbligatoria” significa necessaria per la funzionalità indicata, non per compilare il sito vetrina. Le variabili server di URL/flag o chiave pubblica non sono segreti, ma non devono essere rinominate con prefisso VITE_.

| Nome esatto | Utilizzo / sorgente | Dove recuperare | Obbligo in Production | Visibilità | Stato locale |
| --- | --- | --- | --- | --- | --- |
| VITE_SUPABASE_URL | Client Supabase, src/lib/supabase.ts | Supabase progetto Upnology → Connect | Sì per auth, admin, contatti/preventivi e area cliente | Pubblica | Presente |
| VITE_SUPABASE_PUBLISHABLE_KEY | Chiave pubblica client, src/lib/supabase.ts | Supabase → Settings → API Keys → publishable | Sì per le stesse funzioni | Pubblica | Presente |
| VITE_PUBLIC_EMAIL | Link mailto contatti, src/pages/Pages.tsx | Email commerciale scelta da Upnology | Opzionale | Pubblica | Assente |
| VITE_PUBLIC_PHONE | Link tel contatti, src/pages/Pages.tsx | Telefono commerciale Upnology | Opzionale | Pubblica | Assente |
| VITE_PUBLIC_WHATSAPP | Link wa.me, src/pages/Pages.tsx | Numero WhatsApp con prefisso paese | Opzionale | Pubblica | Assente |
| COMMERCIAL_ENABLED | Abilita /api/commercial, webhook e job; server/config.ts | Scelta operativa: false ora | Sì, true solo per attivare il backend commerciale verificato | Server, non segreta | false |
| SUPABASE_URL | Client backend, server/database.ts | Stesso URL Supabase del frontend | Sì per backend commerciale | Server, non segreta | Presente |
| SUPABASE_ANON_KEY | Client backend con JWT utente, server/database.ts | Stessa publishable key del frontend; accetta anche anon legacy | Sì per backend commerciale; nome ancora attivo | Server, valore pubblico | Presente |
| SUPABASE_SECRET_KEY | Client privilegiato, precedenza in server/config.ts | Supabase → API Keys → Secret key | Una chiave privilegiata serve per Stripe, Resend e cron | Server, segreta | Vuota; fallback presente |
| SUPABASE_SERVICE_ROLE_KEY | Fallback se SUPABASE_SECRET_KEY vuota | Vecchia service_role oppure secret key già configurata | Opzionale/legacy; non necessaria con SUPABASE_SECRET_KEY | Server, segreta | Presente, formato sb_secret_ |
| APP_URL | Link email e ritorno Checkout, server/config.ts | Origine canonica https://upnology.agency | Sì per Stripe/Resend; HTTPS senza path | Server, non segreta | Presente |
| STRIPE_ENABLED | Abilitazione pagamenti/webhook, server/config.ts | Scelta operativa: false ora | Inserire false; true solo con autorizzazione successiva | Server, non segreta | false |
| STRIPE_MODE | Coerenza chiave/eventi, server/config.ts e payments.ts | live per Production; test per sandbox separata | Sì quando Stripe attivo; live da solo non lo attiva | Server, non segreta | Presente |
| STRIPE_SECRET_KEY | SDK Stripe Checkout e letture canoniche, server/payments.ts | Stripe Upnology → API keys; rk_live_ o sk_live_ | Sì solo quando Stripe attivo | Server, segreta | Presente, non validata |
| STRIPE_WEBHOOK_SECRET | Firma webhook, server/payments.ts | Stripe → endpoint LIVE → signing secret | Sì solo quando Stripe attivo | Server, segreta | Presente, non validata |
| STRIPE_SANDBOX_INVOICES | Fatture sperimentali Checkout, server/payments.ts | Flag applicativo | Non serve attivarlo in Production: false; true in live blocca Checkout | Server, non segreta | false |
| STRIPE_TAX_ENABLED | Blocco preventivo finché Tax non integrato, server/payments.ts | Flag applicativo | false; true blocca Checkout, NON abilita Tax | Server, non segreta | false |
| RESEND_ENABLED | Worker email, server/config.ts | Scelta operativa: false ora | true solo dopo configurazione email verificata | Server, non segreta | false |
| RESEND_API_KEY | REST invio email, server/emails.ts | Resend → API Keys; accesso invio sul dominio scelto | Sì quando Resend attivo | Server, segreta | Vuota/mancante |
| RESEND_FROM | Mittente invii, server/emails.ts | Indirizzo del dominio verificato Resend; formato Nome <email> | Sì quando Resend attivo | Server, non segreta | Vuota/mancante |
| CRON_SECRET | Autorizzazione job, server/handler.ts | Generare segreto casuale, almeno 32 caratteri | Sì per cron commerciale (scadenze/retry email) | Server, segreta | Vuota/mancante |
| DEMO_ALLOWED_ORIGINS | Allowlist link demo/consegna, server/config.ts | Origini HTTPS dei siti demo protetti, separate da virgole | Sì se si usano demo/consegne; altrimenti opzionale | Server, non segreta | Vuota/mancante |

Non esistono ulteriori variabili AI, OAuth, admin, SMTP, database Prisma o URL backend nell'app. In particolare OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_*, VITE_SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY, STRIPE_PUBLISHABLE_KEY e RESEND_WEBHOOK_SECRET non sono lette dal codice: non aggiungerle per tentare di attivare funzionalità assenti. SUPABASE_ANON_KEY NON è obsoleta come nome applicativo; solo il formato anon JWT è legacy. SUPABASE_SERVICE_ROLE_KEY resta un fallback supportato.

## Compatibilità e autenticazione

- Vite espone VITE_* nel bundle a build time. La configurazione non personalizza envPrefix e non esporta process.env al frontend. Non inserire segreti in questi cinque campi. Un cambio richiede una nuova build autorizzata.
- Backend Vercel: api/index.ts esporta fetch; rewrites /api mantengono il backend separato dal fallback SPA. Preset Vite, root repository, output dist, build npm run build, Node 22.x. Le credenziali server vengono lette da process.env nelle Functions; il proxy localhost:3001 serve solo allo sviluppo.
- VITE_SUPABASE_PUBLISHABLE_KEY e SUPABASE_ANON_KEY possono contenere la STESSA sb_publishable_ del progetto. La seconda serve al client server che passa il JWT utente; non deve contenere sb_secret_. Non rinominarla in SUPABASE_PUBLISHABLE_KEY, che non è letta.
- SUPABASE_SECRET_KEY ha precedenza sul fallback SUPABASE_SERVICE_ROLE_KEY. Il fallback presente localmente contiene già una sb_secret_: è compatibile anche sotto il vecchio nome; non occorre una seconda chiave. Preferire il nome nuovo in Vercel. Non spostati né stampati valori locali.
- Le secret key mantengono il ruolo SQL service_role; i grant/RPC non vanno rinominati. Il client privilegiato è separato dalla sessione utente e non sostituisce le verifiche admin.
- Auth: login email/password, conferma registrazione su /account, recupero su /reset-password. Le destinazioni derivano da window.location.origin, non da APP_URL. Impostare Site URL e redirect consentiti in Supabase Auth.
- Admin: account Auth verificato e record upnology.admin_members; nessuna variabile ADMIN_EMAIL o ADMIN_PASSWORD. Stato remoto dell'admin non verificato in questo audit.
- Email Auth e email commerciali sono flussi distinti. RESEND_* nelle Functions non configura automaticamente l'SMTP di Supabase Auth: configurarlo nel Dashboard Supabase se necessario per il recapito di produzione.
- AI: /ai è una pagina commerciale “in sviluppo”; la migrazione AI estende la raccolta preventivi, non integra un LLM.

## Checklist Production e webhook

- [ ] Verificare progetto/account Upnology in Vercel, Supabase, Stripe e Resend; evitare credenziali di altri progetti.
- [ ] In Vercel → Settings → Environment Variables selezionare solo Production. Compilare ogni variabile obbligatoria per le funzioni da usare; mantenere i flag del template false. Impostare i segreti come Sensitive, senza prefisso VITE_. Non sostituire valori validi con i campi vuoti dell'esempio.
- [ ] Confermare URL Supabase e progetto comune delle chiavi; usare SUPABASE_SECRET_KEY oppure il fallback, senza necessità di entrambi.
- [ ] Supabase Auth: Site URL https://upnology.agency; consentire https://upnology.agency/account e https://upnology.agency/reset-password. Se si usa www, scegliere redirect canonico o autorizzare esplicitamente le origini effettive. Verificare conferma email e reset password, mittente/SMTP e limiti di invio.
- [ ] Verificare account admin e grant/RLS/RPC. Confrontare storico migrazioni remoto con repository, in particolare 20261015000000 e 20261015010000; non riapplicare migrazioni già presenti. Nessuna applicazione è autorizzata da questo audit.
- [ ] Approvare il template contrattuale tramite il processo previsto: le sole ENV non rendono inviabile un preventivo senza template approvato.
- [ ] Stripe: ruotare le credenziali precedentemente condivise in chat se non già fatto; non riutilizzarle sulla base della sola presenza locale. Verificare permessi della nuova chiave limitata in sandbox equivalente.
- [ ] Endpoint previsto https://upnology.agency/api/stripe/webhook, eventi: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, payment_intent.payment_failed, payment_intent.processing, payment_intent.succeeded, charge.refunded, refund.updated. Usare signing secret dell'endpoint e ambiente corrispondenti. Finché COMMERCIAL_ENABLED o STRIPE_ENABLED sono false, restituisce 503: non dichiararlo operativo.
- [ ] Resend: verificare dominio e record DNS indicati dal Dashboard, scegliere mittente coerente e chiave con accesso invio. Non esiste webhook Resend nel codice: nessun endpoint/secret da inventare; tracking consegna/bounce non implementato.
- [ ] Cron: /api/jobs/commercial, schedule 0 8 * * * in vercel.json (08:00 UTC, 10:00 Roma in ora legale, 09:00 in ora solare). Vercel invia Authorization Bearer con CRON_SECRET. Senza secret valido dà 401 quando backend abilitato, oppure 503 quando disabilitato. Verificare invocazioni nel Dashboard.
- [ ] Il worker invia fino a tre email per chiamata. Il cron giornaliero da solo non garantisce retry entro 24 ore; l'outbox può passare in review per tentativi ambigui. Monitorare la coda e usare il comando admin esistente; valutare frequenza/worker prima di promettere invii tempestivi su volumi maggiori.
- [ ] Demo: inserire origini HTTPS esatte, senza path. L'allowlist non autentica il sito esterno: configurare protezione cliente anche sul sito demo/consegna.
- [ ] Prima del futuro deploy autorizzato eseguire npm test, npm run lint e npm run build con Node 22. Non sono stati rieseguiti in questo audit documentale: i 25 test precedenti non sono una nuova verifica del repository odierno.
- [ ] Pubblicare il codice corretto solo dopo autorizzazione, poi verificare /api/commercial/status, login, area cliente/admin, flusso preventivi e webhook in sandbox separata. Testare accessi negati e assenza di segreti nel bundle/log. Le modifiche ENV diventano operative con un deployment successivo.
- [ ] Attivare COMMERCIAL_ENABLED e RESEND_ENABLED solo dopo verifica delle rispettive funzioni; STRIPE_ENABLED resta false fino ad autorizzazione esplicita. Tax e fatture sandbox restano false in Production.

## Blocchi reali e limiti dell'audit

Vercel Production non verificato. Credenziali locali presenti non equivalgono a credenziali valide sul remoto. Mancano localmente Resend, cron e origini demo; contatti diretti opzionali assenti. SUPABASE_SECRET_KEY vuota non è un blocco locale da sola perché il fallback è valorizzato. Tutti i servizi opzionali sono disabilitati. Schema/migrazioni remote, webhook, DNS Resend, SMTP Auth e permessi Stripe restano da verificare; nessuna chiamata remota autenticata effettuata. Fatturazione italiana/SdI e Tax non sono implementate per l'uso reale. La vetrina può essere pubblicata con servizi disabilitati, ma ciò non dimostra che il ciclo commerciale sia operativo.

Sono presenti modifiche locali precedenti all'audit; non sono state eliminate né pubblicate. Modificati in questo task solo il template Production, questo report e l'eccezione .gitignore per il template senza segreti. Nessun database, deploy, push o pagamento è stato toccato.

Fonti ufficiali: [Vite ENV](https://vite.dev/guide/env-and-mode), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Vercel Node Functions](https://vercel.com/docs/functions/runtimes/node-js), [Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction).
