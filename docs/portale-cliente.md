# Portale cliente

## Lo spazio file del cliente — §397, 22 settembre 2026

Fin qui il portale leggeva soltanto: noi pubblicavamo, il cliente scaricava.
Questa è la **prima scrittura che arriva dal portale**, e l'ha chiesta il
committente così: «il cliente che ha accesso al portale deve avere il suo spazio
per poter caricare le cose — immagini, video, audio — e ha sempre la possibilità
di caricare e di scaricare».

**Lo spazio è dell'azienda**, non della persona e non del progetto: `/portale/file`,
voce «I tuoi file» nella navigazione. Un file può portare l'etichetta di un
progetto, oppure nessuna. Lo vedono tutti i referenti di quell'azienda, **nel
limite dei progetti a cui sono abilitati**: chi ha lo scope `selected` non vede i
file senza progetto, perché `portal_can_access(client, NULL)` esige già
`project_scope='all'`. Il totale dello spazio usato si dichiara solo a chi vede
tutta l'azienda: agli altri la somma sarebbe un numero plausibile e sbagliato.

**Carica chi partecipa, non chi consulta.** `portal_assert_actor` esclude il
lettore, e l'anteprima interna non scrive: guardare non è partecipare. Rimuove
un file solo chi l'ha caricato; la riga resta come traccia, i byte spariscono
davvero, e il metadato si stacca dalla riga `files` eliminata.

### Perché MinIO e non Google Drive

La domanda è arrivata come «possiamo usare gdrive senza configurare uno storage
S3». S3 **non era da configurare**: MinIO gira da mesi nella rete Docker, le
cinque variabili `S3_*` sono nel container di produzione, e le consegne della
§395 ci scrivono già dentro. Nel repository Drive non è uno storage: `lib/drive.ts`
sono trentanove righe che trasformano un link di condivisione in un URL da
incorporare, gli unici scope Google richiesti sono `calendar.readonly` e
`calendar.events`, e sulla VPS non esiste nessun mount. Usarlo avrebbe voluto
dire **costruirlo**: service account, Drive condiviso Workspace, scope nuovi —
più configurazione, non meno. E si sarebbe rotto sulla cosa che tiene in piedi il
portale: o i file passano comunque dal nostro backend, e allora Drive è un bucket
più lento con le quote API sopra, oppure passano da link di condivisione, **e il
link sopravvive alla revoca dell'accesso**, che è precisamente ciò che la 246
vieta. Drive resta dov'era: i documenti che il cliente tiene suoi, come link.

### Un giga non entra in memoria

Il limite è **1 GB per file** e **20 GB per azienda**; sul disco della VPS ce ne
sono 225 liberi. Un file così non può passare da `formData()`, quindi il corpo
della richiesta è il file grezzo e `putObjectStream` lo manda a pezzi da 8 MiB
mentre arriva: se supera il limite, l'upload viene **annullato** e il byte di
troppo non tocca mai il disco. Il nome viaggia in `x-file-name`, il tipo in
`Content-Type`, e `x-idempotency-key` impedisce che un reinvio lasci due copie.
Lato pagina si usa `XMLHttpRequest` e non `fetch`, perché su mezzo giga la barra
di avanzamento è la differenza fra «sta caricando» e «si è piantato».

In discesa serve il **Range**: un player che chiede un pezzo e riceve 200 con
l'inizio ricomincia da capo. `serveStoredFile` risponde 206 con `Content-Range`,
416 per un intervallo fuori dal file, e dichiara `Accept-Ranges` anche quando
serve tutto. Vale anche per le consegne della §395, che prima non lo facevano.

### Cosa si può caricare

Immagini, video, audio e documenti, da un elenco chiuso. Restano fuori HTML, SVG,
script ed eseguibili — si guardano **il tipo dichiarato e l'estensione insieme**,
perché rinominare un file è gratis. Un tipo rifiutato non apre nemmeno lo
storage. Se la riga non si scrive, l'oggetto e il metadato vengono rimossi: mai
un file senza riga, mai una riga senza file.

### La porta

`POST /api/portale/materiali`, `GET`/`DELETE /api/portale/materiali/:id`. Non
passano da `/api/files/**`, che è dello staff e che la 246 chiude ai clienti
apposta. In lettura l'autorizzazione **è** la RLS; `storage_key` e `file_id` non
sono fra le colonne concesse ad `authenticated`, nemmeno allo staff.

Lato interno i materiali compaiono nella tab **Portale** della scheda progetto e
nella coda «Da gestire» del Customer Care, con il download autenticato.

**Migration 250 applicata in produzione** il 22 settembre, versione
`20260922093617`, con 0 accessi portale attivi al momento dell'applicazione:
niente da disturbare, e nessuno che veda la novità finché non lo invitiamo.

### Verifiche — §397

```bash
npx tsx lib/portal/materials.check.ts
npx tsx scripts/check-portal-materials-routes.ts
node scripts/check-portal-sql.mjs        # 244+245+246+249+250 ×2 + suite
```

Le rotte sono provate con Supabase e storage simulati: anonimo, profilo
disattivato, staff che prova a caricare al posto del cliente, lettore, azienda
senza membership, progetto fuori dallo scope, sei tipi rifiutati **prima** di
aprire lo storage, spazio pieno, file oltre il limite interrotto senza lasciare
residui, reinvio che non ricarica, ritorno indietro su errore di scrittura,
Range, 416 e rimozione solo dei propri file. La suite SQL prova lettore escluso,
file di un'altra azienda, cartella sbagliata, oltre il giga, immutabilità dopo il
caricamento, scope limitato, isolamento fra due aziende, materiale che manda
l'attività in verifica e la task al team, rimozione irreversibile e distacco del
metadato.

## Pubblicazione dei contenuti — step 2, 22 settembre 2026

Fino a ieri il portale aveva schema, RLS, VIEW, trigger e pagine, e **nessuna
riga di codice che ci scrivesse dentro**: un grep su `app/`, `lib/` e
`components/` non trovava un solo `insert` o `update` su `portal_activities`,
`portal_deliverable_versions` o `projects.portal_published_at`. I contenuti si
popolavano solo a mano col service role, quindi al cliente non arrivava niente.
Nel frattempo due frasi dell'interfaccia interna promettevano il contrario: il
composer delle task diceva «La deve fare il cliente: compare nel suo portale» e
`ClientAdHocTab` «Sempre visibili nel suo portale». Adesso è vero.

### Dove si pubblica

Nella **scheda del progetto**, tab **Portale** (`?tab=portale`), accanto a
Workstream, Panoramica ed Economics, in entrambi i portali —
`components/projects/ProjectPortalPanel.tsx` (server, legge con la sessione e la
RLS) e `ProjectPortalTab.tsx` (client, form e anteprima). Compare solo a chi
passa `canManageClientPortal` — **admin, founder, super admin e manager
attivi**, la stessa regola che apre e revoca gli accessi — e solo su un progetto
di un cliente: un progetto interno non ha un portale dove comparire. Nascondere
la tab non è una barriera: la porta vera è `requirePortalPublisher` dentro
`app/actions/portal-publish.ts`, che rilegge ruolo e azienda e usa
`clients_workspace` per i manager (§213), rifiuta i lead (§321) e crea il client
di servizio **dopo**.

L'**anteprima** non è un'imitazione: monta `ProjectList`, `ActivityList` e
`VersionList` da `components/portal/PortalContent.tsx`, cioè i componenti che il
cliente vede davvero, con i valori scritti in quel momento.

### Ripubblicare è esplicito

Il trigger `portal_guard_project_publication` rifiuta una modifica ai campi
condivisi che non alzi `portal_published_at`. Quindi, finché il progetto è
pubblicato, **salvare è ripubblicare**, e l'interfaccia lo dice: «Salva bozza»
esiste solo prima della prima pubblicazione, dopo c'è «Pubblica aggiornamento».
`needsRepublish` in `lib/portal/publish.ts` avvisa quando il cliente sta ancora
leggendo la versione precedente. Ritirando il progetto spariscono insieme a lui
le sue consegne e le sue attività, perché `portal_can_access` pretende
`portal_published_at IS NOT NULL`.

### Le task al cliente non si reinseriscono

`portal_activities.source_task_id` collega l'attività alla task
`task_type='cliente'` che l'ha generata; un trigger propaga titolo, descrizione
(il «perché»), scadenza e stato, e `deleted_at` ritira l'attività. Una
descrizione svuotata non cancella il perché già pubblicato: non si inventa una
motivazione, e senza descrizione la task **non si pubblica** — la tab lo dice
invece di pubblicare un'attività muta.

Una task al cliente **non può avere un progetto** (CHECK della 158), quindi
l'attività vive sull'**azienda**: `project_id` è nullo e
`portal_can_access(client, NULL)` esige già `project_scope='all'`, così la vede
solo chi ha l'accesso a tutta l'azienda. In «Da fare» la colonna «Riguarda»
mostra il nome dell'azienda invece di inventare un progetto.

Nel verso opposto, la risposta del cliente porta l'attività `in_verifica` e la
task interna a `in_review`: il materiale è arrivato, non è stato approvato.

### Consegne e download

Una **consegna** (`portal_deliverables`) raggruppa le versioni; una versione
punta a un **file vero** su MinIO (`files.id`), non a una riga `documents`, che
è un elenco di collegamenti Drive: un link esterno non è una versione immutabile
e non si scarica dal portale. Il flusso è carica → crea versione → pubblica, con
la cartella storage `deliverables`, sempre legata a un progetto
(`docs/storage-access.md`).

Una versione pubblicata è immutabile. L'unica modifica ammessa dopo la
pubblicazione è il **ritiro** (`retired_at`/`retired_by`): senza, togliere un
file sbagliato voleva dire ritirare l'intero progetto. Una versione ritirata
sparisce dal portale, non dalla storia, e non si approva.

Il download è `GET /api/portale/consegne/:versionId`, **mai**
`/api/files/:id/download`, che è dello staff. L'autorizzazione **è** la RLS: si
legge la versione con la sessione, e se la riga non torna, per chi chiede non
esiste. `storage_key` e `file_id` non sono fra le colonne concesse ad
`authenticated`; il service role arriva solo dopo, per leggere la chiave e
servire i byte con gli header degli allegati interni.

### Cosa resta non attivo, e lo dichiara

Invio richieste, risposte pubbliche, caricamento dei materiali dal cliente e
approvazioni sono **scritture del cliente**: un dominio a sé, con idempotenza e
limiti di upload propri, e restano al giro successivo. Il portale lo dice
(«l'invio dal portale non è ancora attivo»), non finge un invio riuscito. Il
badge della Home non dice più «Portale in preparazione · sola lettura», perché
consegne e aggiornamenti pubblicati adesso arrivano davvero.

### Verifiche eseguite — 22 settembre 2026

```bash
npx tsc --noEmit                                   # zero errori
npx tsx lib/portal/publish.check.ts                # nuovo
TZ=Europe/Rome <tutti gli 81 lib/**/*.check.ts>    # exit 0
npx tsx scripts/check-portal-publish-actions.ts
npx tsx scripts/check-portal-download-route.ts
node scripts/check-portal-sql.mjs                  # 244+245+246+249 ×2 + suite
node scripts/check-storage-sql.mjs
NODE_PATH=/tmp/opencode/node_modules PLAYWRIGHT_BROWSERS_PATH=/tmp/opencode/browsers \
  node scripts/check-portal-browser.mjs            # 258 richieste, zero scritture
```

Le action sono provate con Supabase simulato: ruoli negati, profilo disattivato,
sessione assente, azienda nascosta al workspace, lead, schema assente, campi non
validi che non pubblicano niente, bozza rifiutata su un progetto pubblicato,
ripubblicazione che non crea doppioni e non riscrive il tipo, file di un altro
progetto o di un'altra cartella rifiutati, numerazione delle versioni, ritiro ed
eliminazione della sola bozza. **Nessun client di servizio nasce prima del
controllo di ruolo**, ed è una cosa che si verifica contando.

La rotta di download è provata su anonimo, id non valido, riga non autorizzata
(404), errore di lettura (503, non un «non esiste»), chiave che non coincide col
file (409), alias fuori dal prefisso, storage giù (502) e contenuti attivi
scaricati come allegato.

**Migration 249 applicata in produzione** il 22 settembre, versione
`20260922084609`, dopo la rilettura dei prerequisiti sul database reale e con
zero attività, versioni, progetti pubblicati e task al cliente da disturbare.
Verifica in sola lettura dopo l'applicazione in `docs/migrations.md`: struttura,
policy, vincoli, nessuna scrittura concessa ad `authenticated` e `storage_key`
fuori dalle colonne leggibili. Nessun dato di prova creato.

**Non eseguito**: le prove con account cliente reali sul database di produzione,
e il deploy del codice — che va rilasciato insieme, altrimenti il database ha le
colonne e nessuno le scrive.

19 settembre 2026 · branch `feat/portale-cliente` · sviluppo sul PC locale.
Specifica: `docs/brief-portale-cliente.md`, confrontata con il PDF v1.0.

## Completamento PDF — step 1 isolamento file, 21 settembre 2026

**Migration 246 applicata il 21 settembre** (`20260921150329`), codice incluso
nel rilascio su main. La gestione
degli accessi già online non basta a proteggere le API preesistenti dello
storage: queste usavano il service role dopo il solo controllo di sessione.
Ora file e cartelle interni passano da staff attivo, RLS e contesto verificato;
clienti/ospiti sono esclusi anche dalle vecchie policy owner. Link anonimi non
ammessi per file cliente/progetto o sensibili, anche se il token esiste già.
Verificati revoca/scadenza, creatore disattivato, upload su contesti estranei,
proprietà dei figli nelle cancellazioni ricorsive e scritture dirette dal
browser. Regole e prove in `docs/storage-access.md`.

**Step successivo (fatto il 22 settembre, vedi sopra):** pubblicazione/ritiro
dei contenuti dal lavoro interno, collegamento delle attività cliente e download
autenticato delle sole versioni pubblicate. Restano richieste/coda,
materiali/approvazioni e collaudo end-to-end.

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
3. **Pubblicazione e file** — **fatto il 22 settembre** (migration 249 da
   applicare): tab Portale nella scheda progetto, anteprima dei soli campi
   pubblici, storage privato e download autorizzato, limiti upload, prove a due
   aziende. Date e impegni richiedono ripubblicazione esplicita; le descrizioni
   interne non vengono propagate.
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
