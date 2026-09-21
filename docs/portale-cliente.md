# Portale cliente — primo incremento

19 settembre 2026 · branch `feat/portale-cliente` · sviluppo sul PC locale.
Specifica: `docs/brief-portale-cliente.md`, confrontata con il PDF v1.0.

## Accessi dalla scheda cliente — rilascio del 21 settembre 2026

Su richiesta del committente, nella scheda condivisa admin/workspace compare
**Portale cliente** (`?tab=10`), dopo Tracking, Report, Chiavi e Accessi. È
presente per i clienti effettivi, anche preesistenti: creazione manuale e
«Lead convertito» dal commerciale usano entrambi `NewClientModal` e la stessa
scheda. Non serve un secondo record da generare o un trigger di provisioning.
I lead non ancora acquisiti non aprono accessi al portale.

Manager e amministrativi attivi possono:

- copiare il link stabile `/portale?client=<id>` e aprire l'anteprima;
- invitare una persona, anche precompilando nome/email dai contatti;
- scegliere referente/collaboratore/lettore e tutti i progetti condivisi
  (anche futuri) oppure soltanto quelli selezionati;
- modificare permessi, revocare e riattivare l'accesso a quella sola azienda;
- rigenerare l'invito oppure generare il link **Reimposta password**.

La tab non crea automaticamente account per ogni contatto. L'abilitazione è
esplicita e personale. `canManageClientPortal()` è condiviso fra UI e guard;
il manager gestisce soltanto le aziende visibili in `clients_workspace`.
Le action verificano sessione, profilo attivo, azienda, account e membership;
il service role arriva dopo la lettura autorizzata del cliente. Le RPC 245
rifanno i controlli per la scrittura atomica di permessi e progetti e usano
revisioni per non riattivare un accesso revocato con un form obsoleto.

**Invito e password:** `generateLink(type: invite)` di Supabase Auth crea
l'account nuovo con il profilo guest/guest previsto dal trigger 224. L'accesso
cliente viene dalla membership 244, non dai metadati dell'invito. Un account
cliente già attivo viene riutilizzato, senza cambiarne password o ruolo; un
account staff non può essere gestito con queste action. Il link personale si
copia e si condivide con il referente: **nessuna email automatica** è dichiarata
o inviata. I segreti restano nel frammento URL, vengono rimossi dalla barra
all'apertura e non sono registrati nell'elenco accessi o nella cronologia.
Il token viene verificato al salvataggio della password, non alla semplice
apertura della pagina. Scadenza e utilizzo singolo sono quelli di Supabase Auth.
Una pagina aperta con un invito scaduto non aggiorna la password.

Il reset genera un token recovery soltanto per un account cliente attivo con
membership non revocata; non cambia subito la password e non la rende mai
leggibile al team. Il cliente imposta la nuova password e torna al portale
dell'azienda indicata, dove i permessi vengono riletti. La revoca della membership
toglie l'accesso ai dati aziendali; non elimina l'account personale né gli
eventuali accessi ad altre aziende.

**Correzione del flusso legacy:** la rotta `/ticket-portal/[token]` era stata
eliminata dal reset del 23 luglio (`57708d1`), ma il generatore era rimasto.
Customer Care → Ticket & Supporto → Portale cliente ora rimanda alla tab della
scheda. `getOrCreatePortal` non distribuisce più token; i vecchi URL mostrano
una pagina esplicativa e il collegamento all'accesso con account.

**Attivazione autorizzata e database aggiornato il 21 settembre:** **244 e 245
applicate in produzione**, versioni `20260921133528` e `20260921133529`.
Distribuzione applicativa tramite push su main e deploy automatico Coolify.
Senza schema/chiave di servizio la tab resta visibile e dichiara la dipendenza,
senza creare account parziali. Servono
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_APP_URL` (oppure
`NEXT_PUBLIC_SITE_URL`): tutte presenti nel container di produzione.
Verificata la configurazione Auth: site URL `https://os.twobee.it`, redirect
`https://os.twobee.it/**` già autorizzato (include `/reset-password`), scadenza
OTP **3600 secondi**. Nessun invito spedito né account di prova creato in
produzione; il flusso completo di autenticazione è stato collaudato con mock.

I prerequisiti sono stati riletti sul database reale: mancava
`documents.project_id`, ora aggiunta nullable dalla 244 senza backfill. Le
verifiche post-migration in sola lettura confermano RLS su 11 tabelle, RPC di
gestione riservate al service role, scope dell'anteprima manager e nessun
accesso senza membership. Conteggi aziendali e ruoli invariati; nessuna
pubblicazione o associazione implicita. Dettagli in `docs/migrations.md`.

TypeScript senza errori e tutti i **79 check** di dominio superati
(`TZ=Europe/Rome`). Suite Next del portale: **221 richieste al mock, zero
scritture**, inclusi il vecchio URL e il passaggio Customer Care → scheda cliente
con la tab corretta già aperta. Verifiche dedicate:

```bash
npx tsx lib/portal/access.check.ts
npx tsx scripts/check-portal-access-actions.ts
node scripts/check-portal-sql.mjs
NODE_PATH=/tmp/opencode/node_modules PLAYWRIGHT_BROWSERS_PATH=/tmp/opencode/browsers node scripts/check-portal-access-browser.mjs
NODE_PATH=/tmp/opencode/node_modules PLAYWRIGHT_BROWSERS_PATH=/tmp/opencode/browsers node scripts/check-portal-browser.mjs
```

Le action sono provate con Auth/database simulati, inclusi ruoli negati,
aziende nascoste, schema assente prima di ogni effetto Auth, account staff,
progetti estranei, retry, revoca concorrente, reset e payload senza segreti.
Il browser usa i componenti reali con i confini simulati: invito, errore e
conservazione del form, selezione progetti, copia, modifica/revoca/riattivazione,
primo accesso, reset, token scaduto, 390/1440 px, due temi e tastiera. Il runner
SQL esegue entrambe le migration due volte e le due suite su PostgreSQL 16
effimero senza rete: struttura minima dichiarata, non copia del database reale.

## Stato del primo incremento distribuito

**Aggiornamento 21 settembre 2026:** primo incremento integrato in main su
richiesta del committente, sopra `9c3789b`, per il deploy automatico Coolify.
Migration e suite SQL rinumerate **244** (239–243 già occupate su main), senza
modificare il modello dati né applicare SQL. Sul codice integrato: TypeScript
senza errori, **78 check** con exit 0 (`TZ=Europe/Rome`) e suite browser isolata
superata con **182 richieste HTTP al mock e zero scritture**. Restano i limiti
di consultazione e le verifiche SQL su staging descritti sotto.

## Consegna e confine

Questo incremento è lo **scheletro navigabile** richiesto dal prompt, non il
rilascio transazionale del brief §14. Quattro sezioni, scheda progetto,
composizione della richiesta e coda «Da gestire» nel Customer Care esistente.
Le funzioni prive di dati/schema dichiarano la dipendenza: nessun invio,
caricamento o approvazione viene simulato come riuscito.

Nel primo incremento la migration 244 era scritta e non applicata (prima
numerata 233, poi 239); è stata applicata nel rilascio accessi descritto sopra.
`.env.local` usa il database di produzione anche da localhost: nessun dato di
prova su quel database. Le prove SQL con fixture sono esclusivamente per staging.

## Ricognizione verificata nel codice

| Esistente | Riuso / limite |
|---|---|
| Supabase Auth, login, recupero password, inviti | Credenziali personali; nessuna seconda autenticazione. Gli inviti non autorizzano da soli un'azienda. |
| `lib/auth.ts`, `lib/permissions.ts` | Identità memoizzata per richiesta, ruoli e super admin; gate middleware + layout + lettore server. |
| `client_assignments` | Associazione per ID verificabile con RLS; legacy senza ruolo cliente, revoca storica o limite progetto. Non usare email/contatti come autorizzazione. |
| `clients_workspace` | Pattern della proiezione sicura; non riutilizzabile dal cliente perché espone contesto interno. |
| `projects`, `milestones`, `tasks` (147/148) | Flag `visibility` già presente, default interno. Le milestone dei template possono nascere visibili: non equivale a una pubblicazione controllata. Le task interne non sono attività del cliente. |
| `documents` (080) | Collegamento a documento originale; mancano versioni immutabili e accesso file validato per il portale. Non inoltrare `file_url`. |
| `milestones.approved_by/at` | Approvazione sulla milestone, non su una versione di file: insufficiente per il brief. |
| `/customer-care`, `/workspace/customer-care`, `CustomerCareClient` | Punto interno dove inserire «Da gestire», senza altra voce di menu. |
| `tickets`, `ticket_messages`, portale ticket a token | Dominio già usato, stati e autenticazione diversi; non convertire automaticamente conversazioni interne in richieste pubbliche. |
| `chat_messages`, `client_notes` | Conversazioni e note interne: non vengono lette dal portale. |
| Logo, ThemeToggle, token, font, PortalSwitcher | Identità coerente nei due temi; anteprima cliente per manager e amministrativi. |

`/portale` non esisteva. La 232 è l'ultimo file migration presente alla partenza.
Le descrizioni dei portali in `CLAUDE.md` anticipavano codice assente.

## Modello dati della 244

| Tabella nuova | Perché non basta l'esistente |
|---|---|
| `portal_memberships` | Associazione utente/azienda con referente, collaboratore, lettore; revoca e scope. Le assegnazioni esistenti sono anche dello staff. Nessun backfill automatico. |
| `portal_project_access` | Elenco dei soli progetti ammessi per un accesso limitato; il team di progetto rappresenta chi lavora, non chi può consultare. |
| `portal_deliverable_versions` | Versione immutabile collegata a `documents`, autore e pubblicazione esplicita; il documento attuale non conserva ciò che è stato approvato. |
| `portal_activities` | Cosa fare, perché, data e referente per il cliente, distinta dalle task e dagli owner interni. Eventuale versione da approvare. |
| `portal_activity_responses` | Risposta cliente da verificare, distinta da completamento; base per materiali privati, senza riutilizzare allegati interni. |
| `portal_approvals` | Esito append-only su una precisa versione, persona e data; richiedere modifiche esige un commento. |
| `portal_requests` | Sei tipi e ciclo di vita del brief, autore e chiave idempotente; i ticket legacy non hanno questo contratto. |
| `portal_request_messages` | Solo risposte pubbliche e risposte cliente, mai note interne. |
| `portal_request_notes` | Note fisicamente separate, nessuna policy cliente. |
| `portal_request_tasks` | Ponte verso task già esistenti: la richiesta non genera automaticamente lavoro approvato. Una task non si collega a due richieste. |
| `portal_events` | Cronologia interna append-only, attribuzione e riferimenti; niente snapshot con note interne inviati al cliente. |

Su `projects` si aggiungono campi **pubblici dedicati**, momento/autore di
pubblicazione, fase della relazione e data prevista/confermata. Nessun contenuto
viene pubblicato dal backfill. Le VIEW `portal_companies` e `portal_projects`
proiettano soltanto campi ammessi. Il database controlla azienda, progetto,
revoca, profilo attivo e stato pubblicato; i record figli non sopravvivono come
leggibili al ritiro del progetto.

Le scritture restano riservate al server autorizzato (service role), con vincoli
e trigger per coerenza/versioni/attribuzione. Il prossimo incremento dovrà
aggiungere guard dentro ogni azione e usare `createActorClient(userId)`.

## Lettura prima e dopo la migration

- Senza 244: associazioni legacy lette con sessione e RLS; solo ID/nome azienda e
  ID/nome/area/stato dei progetti `client_visible`, non eliminati. Nessuna
  descrizione, task, URL file o milestone ereditata dai template.
- Manager e amministrativi: selezione azienda in anteprima, sempre in sola
  lettura; non si dichiara di impersonare i permessi di uno specifico referente.
  Il manager vede le aziende di `clients_workspace` e resta escluso dal tool
  admin. Regola condivisa: `canPreviewClientPortal()`.
- Con 244: le nuove associazioni diventano canoniche. Una revoca o un elenco
  vuoto **non** riattivano il fallback legacy. Solo l'errore di schema mancante
  consente il fallback; errori di rete/permessi hanno uno stato d'errore.
- Ogni pagina rilegge l'autorizzazione server-side. `?client=` sceglie soltanto
  fra aziende autorizzate; un ID diverso non diventa una query privilegiata.
- Per il primo giro le nuove funzioni sono in consultazione anche se lo schema
  fosse presente: nessun collegamento automatico delle scritture alla produzione.

## Pubblicazione e prossimi incrementi

1. **Questo giro**: lettura, navigazione, stati vuoti, schema e piano di verifica.
2. **Flussi su staging** (stima 4–6 giorni): richieste e risposte idempotenti,
   assegnazione al PM o coda non assegnata, stati con motivazione,
   attività/materiali in verifica, approvazioni versionate, coda con azioni dirette.
3. **Pubblicazione e file** (stima 3–5 giorni): azione nel progetto/documento
   esistente, preview dei soli campi pubblici, storage privato e download
   autorizzato, limiti upload, prove a due aziende. Date e impegni richiedono
   ripubblicazione esplicita; non propagare descrizioni interne.
4. **Successivi**: onboarding, report, decisioni, digest e aggiornamenti assistiti
   secondo brief, dopo verifica integrazioni e preferenze.

Stime orientative, da confermare sui flussi approvati e su staging disponibile.
Pubblicare dal progetto evita doppie registrazioni (beneficio alto, complessità
media, rischio di diffusione involontaria mitigato dalla preview). Il ponte
richiesta/task evita copie (priorità alta, complessità bassa). Home per fase
esplicita evita configuratori (priorità media, dipendenza da referente). Digest
solo dopo preferenze e integrazione email (priorità successiva, rischio rumore).

## Decisioni umane prima del rilascio

- Confermare chi può approvare: proposta referente; collaboratore invia materiali
  e richieste, lettore consulta. Un esito definitivo per versione; dopo una
  richiesta di modifiche si pubblica una nuova versione. Nessuna approvazione implicita.
- Confermare chi autorizza/ritira pubblicazioni e accessi azienda/progetto.
- Stabilire storage privato, tipi/dimensioni file e conservazione dei materiali.
- Predisporre staging e due aziende con utenti distinti; decidere quando applicare
  la migration e riaprire i flussi transazionali.

## Piano di verifica

Gate TypeScript e tutti i `lib/**/*.check.ts`; controlli dedicati per ruoli,
selezione azienda, fallback e payload ammesso. Suite SQL con `BEGIN/ROLLBACK`,
UUID fittizi, revoca, scope progetto, pubblicazione, versione e isolamento.
Localhost: quattro sezioni, anteprima, stato senza associazione, URL alterato,
errori di caricamento, mobile e tastiera, entrambi i temi. Le verifiche eseguite
e quelle non eseguite vengono registrate a fine incremento.

## Difetti preesistenti rilevati

- Le policy legacy su `clients` sono per riga: possono consentire la lettura
  diretta di colonne interne. Le nuove VIEW da sole non chiudono tale accesso:
  la 244 aggiunge policy restrittive alle sorgenti interne del nuovo portale.
- Il workspace esclude `viewer` nel layout pur riconoscendolo nel middleware;
  non modificato qui perché indipendente dal portale cliente.
- Il login instradava il recupero password come un accesso ordinario: corretto
  nell'intervento accessi del 21 settembre, ancora da distribuire.

## Verifiche eseguite — 19 settembre 2026

- `npx tsc --noEmit`: zero errori, anche dopo la compilazione delle nuove rotte.
- Tutti i **63** `lib/**/*.check.ts`: exit 0, compreso
  `lib/portal/model.check.ts` (ruoli, azienda non autorizzata, fallback solo per
  schema assente e proiezione che scarta note, costi e date interne).
- `git diff --check`: nessun errore di whitespace.
- Parser PostgreSQL **pglast 8.4**, senza connessione a un database: sintassi
  della migration portale, allora 233 e ora 244 (87 statement, 20 corpi SQL/PLpgSQL), e della suite (93 statement,
  2 corpi) valida. Questo **non** verifica l'esecuzione, i tipi risolti contro
  lo schema reale o le policy RLS.
- `scripts/check-portal-browser.mjs`: Playwright/Chromium contro Next su
  `127.0.0.1:3100` e un Supabase **simulato** su `127.0.0.1:54329`.
  Verificati anonimo→login, cliente confinato al portale, quattro sezioni,
  scheda progetto, URL azienda/progetto estraneo, account senza associazione,
  account disattivo, errore permessi distinto dal vuoto, revoca senza fallback,
  anteprima super admin e coda dentro il workspace. Bozza conservata dopo
  ricarica, progetto precompilato e campi contestuali, invio disabilitato.
  A 390 e 1440 px, nei due temi: nessun overflow, focus tastiera visibile e
  contrasto WCAG AA misurato sul DOM (transizioni disabilitate).
  Ultimo giro: **177 richieste HTTP al mock, zero scritture**.
- Screenshot ispezionati in `/tmp/opencode/portal-browser/`: le home popolate
  rappresentano **fixture locali**, non clienti o contenuti pubblicati reali.
- Dev reale avviato in locale su **http://localhost:3000**. Verifica HTTP:
  `/portale` senza sessione → 307 a `/login`; `/login` → 200.

### Ripetere la prova browser

Playwright è stato installato solo in `/tmp/opencode`, senza cambiare le
dipendenze del prodotto. Per la prova servono liberi 3100 e 54329:

```bash
NODE_PATH=/tmp/opencode/node_modules node scripts/check-portal-browser.mjs
```

Il test chiude i propri processi, usa `.next-build` e non applica SQL.
Il normale `npm run dev` usa `.next` e rimane separato.
Eseguire TypeScript **dopo** il test browser: l'avvio di Next rigenera i file
di tipi in `.next-build/types` inclusi dal compilatore.

### Accesso manager dopo la prova del committente

Il committente usa `m.cristallo@twobee.it` e ha richiesto accesso al livello
**manager**, senza usare le credenziali del super admin. La regola è per ruolo,
non un'eccezione sull'indirizzo: manager, admin, founder e super admin possono
consultare l'anteprima. Nessun profilo è stato modificato sul database.

Il selettore del manager mostra Workspace/Portale cliente. Il Customer Care e
la pagina Ticket hanno il link diretto **«Apri portale cliente»**. La vecchia
scheda «Portali Cliente», che generava magic link ticket, si chiama **«Link
ticket»**; se manca la chiave di servizio l'azione restituisce un messaggio
gestito, senza bloccare la pagina con un'eccezione.

Verificato nel browser: ingresso manager dalla pagina ticket, selettore senza
Admin, rifiuto di `/dashboard`, aziende nascoste escluse anche con URL alterato,
junior escluso dall'anteprima, chiave ticket mancante gestita senza scritture.
La suite SQL include anche lo scope manager nelle VIEW della 244; resta da
eseguire su staging.

### Home compatta a card

Su richiesta del committente, la Home usa tre colonne su desktop: **Serve da
te**, **I tuoi progetti**, **Ultime novità**. Sotto: incontro e referente, con
larghezze diverse. I riepiloghi mostrano al massimo due elementi e rimandano
agli elenchi completi; le novità riuniscono consegne e aggiornamenti in ordine
di pubblicazione. Nessuna card vuota contiene un secondo riquadro.

Oro per il contributo del cliente, info per i progetti, accento per le novità:
solo token del tema, sempre accompagnati da titoli e icone. Testata della Home
compatta e avviso di consultazione sintetico. Verificato nel browser con
fixture senza contenuti: **1280×720, tutte le card visibili senza scroll**,
anche con selettore azienda e anteprima interna, sia in chiaro sia in scuro.
Verificati anche Home popolata, disposizione mobile e contrasto AA sul DOM.

### Configurazione locale e verifiche ancora aperte

La `.env.local` aveva URL Supabase ma chiave pubblica vuota: anche il login
restituiva 500. È stata impostata la **chiave publishable già distribuita dal
bundle pubblico** di `os.twobee.it`, verificandola con una lettura di
`/auth/v1/settings` sul progetto locale. Nessuna chiave segreta recuperata;
`.env.local` è ignorata da Git. La service role locale resta assente: il
portale legge con la sessione e la RLS, mentre altre funzioni del gestionale
possono richiedere quella configurazione preesistente.

**Non eseguiti**: migration, suite SQL su staging, login con credenziali reali,
prove RLS con due account sul database reale, upload/download, invio richieste,
approvazioni e azioni operative della coda. Questi ultimi flussi dipendono dal
secondo incremento e dalle decisioni elencate sopra. La coda non ha ancora le
azioni dirette del brief; aggiornamenti da controllare e gestione accessi
richiedono l'interfaccia interna di pubblicazione. Nessun build di produzione
o deploy eseguito. I test applicativi con mock **non certificano la RLS**.

## Ripresa del lavoro sulla VPS

Il primo incremento è stato pubblicato su **`origin/feat/portale-cliente`** fino
al commit **3464e2a** (ultimo intervento UI **485e3f8**). Il committente ha confermato di essere entrato
nel portale con il proprio account dopo l'apertura ai manager. La Home è stata
poi riorganizzata in card compatte e colorate. Il branch ha upstream e può
essere recuperato da un'altra macchina; non serve pubblicarlo nuovamente per
iniziare. A quel punto il portale restava separato da main, senza deploy.

### Allineamento al commit e307084 — 21 settembre 2026

Su richiesta del committente, il commit **e307084** di origin/main è stato
integrato **dentro `feat/portale-cliente`**, con un merge che conserva i sette
commit già pubblicati. Il tentativo iniziale di rebase era solo locale ed è
stato annullato prima di qualsiasi push. Nessun force push e nessuna modifica
al branch main. Per i prossimi allineamenti di questo branch condiviso usare
merge verso il feature branch, mantenendo la storia remota.

La migration e la suite SQL sono diventate **239**: 233–238 sono già occupate
su main. Il modello dati e gli UUID delle fixture sono invariati. Dopo
l'allineamento i check sono **75** (74 di main più quello del portale).

Verifiche ripetute sulla base aggiornata: `npx tsc --noEmit` senza errori,
tutti i **75 check** con exit 0, prova browser completata con **181 richieste
HTTP al mock e zero scritture**. Confermati accesso manager, esclusione
dell'area admin, URL alterati, revoca, bozze e Home vuota senza scroll a
1280×720 nei due temi. Il mock comprende anche la lettura `person_copy`
aggiunta dal nuovo layout workspace. La suite SQL resta non eseguita;
nessuna migration è stata applicata.

### Cosa serve per continuare da un altro computer

1. Fare `git fetch origin` e verificare lo stato del checkout: il branch
   `origin/feat/portale-cliente` è già pubblicato. Non trasferire `.env.local` tramite Git.
2. Sulla macchina di lavoro recuperare il branch
   in un worktree separato da quello usato per il deploy. Leggere `CLAUDE.md`,
   questo documento e `docs/brief-portale-cliente.md` prima di proseguire.
3. Distribuire e attivare la gestione accessi descritta sopra. Completare il
   secondo incremento: pubblicazione dal lavoro interno, richieste/risposte, materiali,
   approvazioni versionate e azioni della coda. Il codice attuale resta in
   consultazione anche se sono presenti schema e chiave di servizio.
4. Verificare la 244 contro lo schema aggiornato e provarla con la suite SQL
   **su staging**, inclusi accessi incrociati e compatibilità con i flussi
   esistenti. L'applicazione su produzione richiede un incarico esplicito;
   l'integrazione in main è stata richiesta il 2026-09-21.

### Perché le chiavi non riempiono il portale

Localhost legge già lo stesso progetto Supabase della produzione, con sessione
utente e chiave pubblica. La VPS non è necessaria per visualizzare dati reali:
servono record autorizzati e condivisi. La service role serve alle operazioni
privilegiate del server, **non** a bypassare la RLS nelle letture del cliente.

La 244 non crea dati dimostrativi né pubblica automaticamente ciò che esiste.
Associazioni utente/azienda, accessi ai progetti e contenuti pubblici devono
essere impostati esplicitamente. Gli stati vuoti attuali non vanno sostituiti
con copie indiscriminate delle task, delle note o dei documenti interni.
