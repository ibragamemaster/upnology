# Supabase Secret API Keys — Upnology

Il backend usa `SUPABASE_SECRET_KEY` come prima scelta. Se assente o vuota (anche solo spazi), usa `SUPABASE_SERVICE_ROLE_KEY` per retrocompatibilità. Nessun fallback viene tentato dopo un errore di autenticazione della nuova chiave: correggere la configurazione invece di nascondere l'errore con una credenziale precedente.

L'SDK @supabase/supabase-js già installato supporta le chiavi sb_secret_. Il client privilegiato rimane separato da quello utente, senza persistenza o rinnovo sessione. Solo webhook verificati, riconciliazione amministrativa autorizzata e job protetti possono raggiungere le operazioni service-side esistenti. I controlli di configurazione Stripe/Resend accettano entrambe le variabili. Il client utente mantiene SUPABASE_ANON_KEY (che può contenere la publishable key) e il JWT dell'utente.

La chiave segreta è letta esclusivamente sotto server/. Il frontend usa solo VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY. Non inserire mai sb_secret_ in variabili VITE_, documenti, sorgenti o chat. `.env.example` contiene soltanto segnaposto vuoti; `.env.local` resta ignorato, conserva i valori esistenti e aggiunge SUPABASE_SECRET_KEY vuota.

Fonte ufficiale: [API keys Supabase](https://supabase.com/docs/guides/getting-started/api-keys). Le nuove secret key sono associate al ruolo PostgreSQL service_role. Non vanno sostituiti i grant SQL o il controllo auth.role()='service_role' con il nome della chiave.

## Database

La migrazione `20261015010000_stripe_checkout_integrity.sql` non richiede modifiche per questo cambio di credenziali. Usa RPC con privilegi service_role e controlli proprietario/admin coerenti con le nuove chiavi. La sequenza delle migrazioni viene verificata su PostgreSQL/PGlite nei test, senza operare sui dati remoti.

La migrazione aggiunge tre colonne e aggiorna due RPC: va applicata una sola volta, dopo le migrazioni precedenti. Lo stato effettivo sul remoto non è verificato; manca una credenziale amministrativa configurata. Non è stata applicata né sono stati modificati dati esistenti. Le query di verifica read-only sono in STRIPE-LIVE-ENV.md.

## Operazioni manuali

1. Supabase, progetto Upnology → Settings → API Keys: recuperare o creare una Secret API Key dedicata al backend. Conservare la chiave fuori dal repository.
2. Vercel, progetto Upnology → Settings → Environment Variables → Production: impostare SUPABASE_SECRET_KEY come segreto; verificare SUPABASE_URL e SUPABASE_ANON_KEY dello stesso progetto. SUPABASE_SERVICE_ROLE_KEY non è più obbligatoria quando la nuova chiave è presente.
3. Mantenere STRIPE_ENABLED=false, STRIPE_SANDBOX_INVOICES=false e STRIPE_TAX_ENABLED=false. Per ora non eseguire deploy.
4. Controllare lo storico migrazioni e lo schema remoto nel SQL Editor; applicare la migrazione Stripe solo dopo conferma e verifica delle dipendenze.
5. Collaudare le RPC e il flusso Stripe su un ambiente di test separato con una secret key del relativo progetto e una chiave Stripe sandbox. I test locali con fetch simulato non verificano l'autenticazione al gateway Supabase remoto.
6. Dopo un deployment autorizzato e verifica effettiva di tutti i consumatori, valutare la dismissione delle vecchie chiavi. Non revocarle automaticamente: potrebbero essere ancora usate da altre integrazioni.

Restano da configurare la secret key Supabase effettiva e le credenziali Stripe ruotate, da verificare lo schema remoto e da completare il collaudo sandbox. Nessun deploy, push o attivazione Stripe è stato eseguito.

Verifiche locali concluse: 25 test superati; TypeScript e build riusciti. Il bundle frontend non contiene riferimenti alle variabili segrete server. Rimane il warning preesistente sul bundle principale oltre 500 kB. Il nuovo test verifica precedenza, fallback legacy, richieste RPC con la chiave scelta, separazione dal token utente e disabilitazione dei servizi senza credenziali.
