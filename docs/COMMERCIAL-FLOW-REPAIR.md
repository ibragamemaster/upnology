# Verifica e riparazione locale del flusso commerciale

Nessun accesso a Stripe LIVE, Vercel Production o database remoto. Nessuna sessione Checkout, pagamento o conferma di incasso generata. L'ambiente Stripe Test con Supabase separato non è disponibile/verificato in questa sessione.

## Tracciamento dei collegamenti

| Passaggio | API / RPC | Tabelle, ID e stati | Permessi e componenti |
| --- | --- | --- | --- |
| Richiesta | RPC `submit_quote_request` (vedere migrazioni di raccolta richieste) | `leads.id` → `quote_requests.lead_id`; proprietà tramite `leads.auth_user_id` oppure `customer_leads(lead_id,user_id)` | `QuoteWizard`, `src/lib/leads.ts`; invio pubblico validato lato SQL |
| Associazione cliente | Trigger `sync_customer_identity` su `auth.users`; nuovo `link_verified_quote_lead` su `leads` | `auth.users.id` verificato, stessa email, nessun proprietario diverso | Migrazioni `20261005010000_customer_auth.sql` e `20261028000000_link_verified_quote_requests.sql`; nessuna offerta o rata creata dai trigger |
| Preparazione offerta | POST `/api/commercial/command`, azione `save` → `commercial_command` / `commercial_command_core` | `offers.customer_user_id`, `request_id` → `quote_requests.id`, `template_id`; stato `BOZZA`; totali e tre importi calcolati sul server | Solo admin; cliente verificato; richiesta appartenente al cliente. `AdminPage` → `CommercialPanel` → `QuoteEditor` |
| Pubblicazione | Stessa API, `send` | `offers.status=INVIATO`; lead `preventivo_inviato`; `email_outbox.offer_id`, tipo `quote_available` | Solo admin; bozza non scaduta e modello approvato. `server/emails.ts` invia tramite Resend e collega `/account#offer-ID`; email accodata non equivale a consegnata |
| Consultazione | GET `/api/commercial/overview` → `commercial_overview` | Offerte con snapshot, contratto, progetto, rate, transazioni, rilasci e storico | `server/database.ts:userClient` verifica sessione ed email. RPC limita il cliente alle proprie offerte non in bozza; admin vede tutte. `AuthPages` / `CommercialPanel` |
| Accettazione offerta | POST command, `accept` | Transazione: `offers.status=ACCETTATO`, `offers.project_id` → `projects.id`; `contracts.offer_id` univoco; 3 `milestones(offer_id,project_id,phase)` in `BLOCCATO` | Solo cliente proprietario, conferma esplicita, offerta inviata non scaduta. Operazione ripetuta non duplica commessa/rate |
| Contratto | POST command, `accept_contract` | `contracts.accepted_at/accepted_by/snapshot_hash`; prima rata `RICHIESTO`, progetto `ATTESA_ACCONTO` | Solo proprietario e hash corrispondente. Nessun incasso implicito |
| Demo e saldo | POST command, `release`, `approve_release` | `project_releases.project_id`, fase 2/3; approvazione porta la relativa rata da `BLOCCATO` a `RICHIESTO` | Admin pubblica; cliente approva l'ultima versione; pagamento precedente necessario, feedback aperti da risolvere |
| Checkout | POST `/api/commercial/checkout` → `commercial_checkout`; `server/payments.ts:createCheckout` | `payment_attempts.milestone_id`, `session_id`, `payment_intent`; metadati Stripe: attempt, installment/milestone, quote, project, customer | Solo proprietario; contratto accettato, precedenti rate pagate, rata richiesta/fallita/in verifica. UI non propone un nuovo pagamento per `IN_ATTESA`; backend riusa tentativi/sessioni. Importi dal DB |
| Esito Stripe | POST `/api/stripe/webhook` → `handleStripeWebhook` → `commercial_service('stripe_event')` | Deduplica `stripe_events.id`; aggiorna `payment_attempts`, `milestones.status/paid_at/refunded_cents`, `projects.status/commercial_stage`, eventi e coda email | Firma sul corpo originale, ambiente, stato canonico Stripe, metadati/importo/valuta verificati. RPC riservata a service role. Migrazione `20261015010000_stripe_checkout_integrity.sql` |
| Rilettura nelle UI | `commercial_overview`, `admin_workspace`, `account_overview` | Stati persistiti; KPI LIVE e TEST separati | Polling limitato a 12 letture periodiche, sospeso durante editing/operazioni e scheda nascosta, più ritorno nella finestra e Aggiorna. Riepilogo account riletto dopo le operazioni. Nessuna scrittura di stato dal redirect Stripe |

Le tabelle commerciali hanno RLS e nessun accesso diretto per anon/authenticated. Le RPC security definer applicano controlli espliciti. I trigger `offers_immutable`, `contracts_immutable`, `templates_immutable` proteggono i documenti emessi; `commercial_project_guard` impedisce all'editor progetti ordinario di aggirare il flusso. `20261026020000_commercial_command_retry.sql` conserva risultati e hash per idempotenza dei comandi.

## Difetti corretti

1. **Richiesta anonima successiva alla verifica account non collegata.** Il trigger precedente copriva solo la sequenza richiesta → verifica utente. Nuova migrazione additiva con trigger sull'inserimento del lead e recupero delle associazioni mancanti, usando le stesse condizioni di proprietà. Preparata e verificata solo in PostgreSQL locale in memoria.
2. **Dalla richiesta mancava una preparazione dell'offerta con ID già selezionati.** Nuova azione nell'admin che precompila cliente e `request_id`, mantenendo editor e RPC esistenti. Offerte collegate consultabili dalla richiesta; prerequisiti mancanti espliciti.
3. **Riepilogo area cliente fermo dopo accettazione.** Collegato `onChanged` a `loadAccount`, senza sovrascrivere il form profilo.
4. **Webhook non riflesso nelle pagine già aperte.** Riletture limitate e aggiornamento al focus anche in Panoramica e scheda cliente admin, che non montano il pannello commerciale; errori di aggiornamento visibili. Il redirect di Checkout mostra un messaggio, mai un esito dedotto dal parametro URL.
5. **Fasi con etichette diverse tra le UI.** Uniformate in Avvio, Demo e Consegna (saldo), senza cambiare fasi o condizioni nel database.
6. **Azioni senza spiegazione dei blocchi.** Invio disabilitato con motivazione per modello non approvato/scadenza; email disabilitata dichiarata; rate con indicazione di contratto, pagamento precedente, approvazione o verifica in attesa.

## Verifiche e limiti

- Aggiornamento 29 ottobre: controlli TypeScript mirati frontend e server superati (componenti del flusso, handler, pagamenti e test mirato), senza build né suite generale. Nessuna modifica alle chiavi o configurazioni remote.
- Il test locale è stato esteso a creazione/invio offerta, visibilità cliente, accettazione ripetuta, contratto, tre rate e riuso della prenotazione Checkout. Questa esecuzione è rimasta senza esito ed è stata interrotta: non viene dichiarata superata. Nessun evento di pagamento confermato è stato generato e nessun provider è stato chiamato. I due controlli più limitati della sessione precedente erano passati; non sostituiscono il collaudo esteso.
- Test mirato `tests/commercial-links.test.ts`: riproduce il collegamento mancante prima della migrazione, controlla recupero e nuovo trigger, utente non verificato, proprietario diverso e assenza di record finanziari dopo il solo stato lead Accettato. Controlla anche i prerequisiti UI del pagamento. Nessuna chiamata a provider.
- La creazione/invio/accettazione commerciale e l'elaborazione webhook sono stati tracciati nel codice SQL/server; nessuna prova remota Stripe/Resend e nessuna certificazione di migrazioni applicate in produzione.
- Il limite esistente di 100 clienti/richieste nell'admin resta: l'azione diretta segnala il cliente fuori dai risultati. Nessun ampliamento generale delle API.
- I tentativi di pagamento preesistenti da riconciliare mantengono il percorso admin già disponibile; nessuna forzatura o ricreazione automatica.

Prossimo passo: predisporre deployment Test, progetto Supabase separato e sandbox Stripe; applicare lì le migrazioni, quindi un solo collaudo con cliente fittizio, accettazione, tre rate e pagamento della rata dovuta. Verificare webhook, DB e visualizzazione delle due UI. Nessuna applicazione remota o pubblicazione eseguita da questo intervento.

## Riparazioni successive nel repository (senza nuove esecuzioni di test/build)

- Login e registrazione conservano la destinazione interna admin/account; link email e richiesta raggiungono il record dopo il caricamento asincrono. Le destinazioni esterne sono rifiutate.
- Route API normalizzate per slash finale e rewrite Vercel; navigazione admin conserva la sezione nell'URL.
- Risposta commerciale condivisa tra riepilogo admin e pannello operativo, anche dopo Aggiorna dati; nell'area personale lo scope customer filtra le offerte sul server. La migrazione locale `20261029000000_account_owner_scope.sql` limita anche account_overview al proprietario, indipendentemente dal ruolo admin.
- Errori di autenticazione e caricamento visibili, retry disponibile; una risposta auth iniziale ritardata non sostituisce login/logout successivi.
- Bozze collegate a clienti o richieste fuori dagli ultimi 100 risultati restano modificabili. Il comando generico Nuovo preventivo non eredita la richiesta selezionata in precedenza.
- Blocco immediato delle operazioni duplicate nel pannello; versioni superate, feedback aperti e pagamento precedente mancante impediscono l'approvazione nella UI, coerentemente con i controlli SQL già presenti.
- La pulizia dello storage dopo l'invio della richiesta non trasforma più un salvataggio confermato in un falso errore.

Nessuna modifica remota. Il test locale avviato prima dell'ultima istruzione è stato interrotto. Le modifiche successive non sono dichiarate collaudate; servono applicazione delle migrazioni in ambiente autorizzato e verifica reale del percorso con i provider.
