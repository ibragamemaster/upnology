# Upnology 2.0 — rollout locale

## Implementato in questo incremento

Nuovo workspace `/admin/workspace`, con shell dark responsive, KPI persistiti,
pipeline calcolata dal backend, ricerca, dettaglio accessibile, collegamenti a
cliente/richiesta/offerta/progetto e accesso alle operazioni commerciali esistenti.
La route `/admin` resta disponibile: il workspace non sostituisce ancora tutti gli editor.

`GET /api/commercial/workspace` usa una RPC riservata agli amministratori. La
pipeline include anche le richieste oltre la finestra delle ultime 100 del vecchio
admin. Non introduce nuove copie di clienti, offerte o pagamenti. Una richiesta
accettata internamente rimane da qualificare finché non esiste un'offerta.
Le offerte che hanno già un progetto non scompaiono se si crea una nuova versione.

## Pagamenti

- Accettazione offerta: RPC esistente crea progetto, contratto immutabile e tre rate.
- Accettazione contratto: prima rata dovuta; il cliente vede “Paga acconto”.
- Checkout: sessione reale creata dal server, importo dal database, metadati ID,
  chiave idempotente per tentativo. Nessun importo inviato dal browser è autorevole.
- Nuovi tentativi: metodi compatibili configurati nel Dashboard Stripe. Tentativi
  preesistenti: payload originale preservato, incluse restrizioni e URL, per non
  rompere i retry idempotenti di sessioni già create.
- Annullamento: riapertura della medesima sessione aperta, senza una nuova rata.
- Errore: “Riprova pagamento”; una sessione ancora aperta viene riutilizzata.
- Ritorno da Stripe: attempt ID nell'URL identifica solo cosa verificare, mai l'esito.
- `POST /api/commercial/payment-status`: autenticazione obbligatoria, RPC owner-only,
  rilettura Stripe e verifica modalità/importo/valuta/tutti gli ID. Usa il servizio
  transazionale esistente per riconciliare lo stato; nessuna conferma manuale.
- Webhook: firma sul raw body, ambiente verificato, stato riletto da Stripe,
  evento persistito e deduplicato. Il primo pagamento confermato attiva il progetto.
- Rate 2 e 3 già persistite ma bloccate: l'approvazione cliente della relativa release
  le rende dovute, fissando la scadenza contrattuale. Non vengono create altre rate.
- L'admin vede importi, scadenze, esiti e collegamento alla sessione Stripe.

## Migrazioni da applicare solo in ambiente autorizzato

1. `20261030000000_commercial_workspace_v2.sql`
2. `20261030010000_checkout_recovery.sql`

Richiedono le migrazioni precedenti. Entrambe additive: nessuna cancellazione di
record o alterazione di importi, account o segreti. Non applicate a database remoti.
Senza migrazione il nuovo workspace espone un errore esplicito e l'admin precedente
resta disponibile. Distribuire database prima del codice per il recupero Checkout.

## Verifica e limiti

Test locale unico su PGlite: ruoli admin/cliente, approvazione template, offerta,
contratto, 30/40/30, creazione/riuso Checkout, fallimento e ripresa, webhook firmato
e duplicato, tre pagamenti, stato identico nei due overview, attivazione e consegna.
Stripe è sostituito solo nel test tramite dipendenze iniettate; nessuna chiamata
al provider o modifica remota. Questo non è un pagamento Stripe Test realmente eseguito.

Restano da verificare in ambiente isolato: browser desktop/mobile, Stripe Test con
metodi effettivamente abilitati, callback pubblica `/api/stripe/webhook`, Resend,
ritorni da Checkout e aggiornamento delle pagine aperte. In produzione servono
le configurazioni server già esistenti; nessuna nuova credenziale introdotta.
Un tentativo vecchio non collegato a una sessione, oltre la finestra sicura di
creazione, resta deliberatamente bloccato e richiede riconciliazione: crearne uno
nuovo alla cieca potrebbe consentire due pagamenti.

La ricostruzione totale non è conclusa: pricing automatico versionato e assistente
IA con orchestrazione persistente non sono implementati da questo incremento.
Il brief IA già raccolto viene riutilizzato; nessun prezzo o risultato IA è inventato.
CRM mantiene per ora l'elenco dei 100 clienti recenti della RPC preesistente,
con limite esplicito nell'interfaccia. Gli editor commerciali validi sono riutilizzati.
