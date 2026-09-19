# Portale cliente — primo incremento

19 settembre 2026 · branch `feat/portale-cliente` · sviluppo sul PC locale.
Specifica: `docs/brief-portale-cliente.md`, confrontata con il PDF v1.0.

## Consegna e confine

Questo incremento è lo **scheletro navigabile** richiesto dal prompt, non il
rilascio transazionale del brief §14. Quattro sezioni, scheda progetto,
composizione della richiesta e coda «Da gestire» nel Customer Care esistente.
Le funzioni prive di dati/schema dichiarano la dipendenza: nessun invio,
caricamento o approvazione viene simulato come riuscito.

La migration 233 viene scritta, **non applicata**. `.env.local` usa il database
di produzione anche da localhost: nessun dato di prova, deploy o scrittura su
quel database. Le future prove SQL sono esclusivamente per staging.

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
| Logo, ThemeToggle, token, font, PortalSwitcher | Identità coerente nei due temi; anteprima cliente per il solo super admin. |

`/portale` non esisteva. La 232 è l'ultimo file migration presente alla partenza.
Le descrizioni dei portali in `CLAUDE.md` anticipavano codice assente.

## Modello dati della 233

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

- Senza 233: associazioni legacy lette con sessione e RLS; solo ID/nome azienda e
  ID/nome/area/stato dei progetti `client_visible`, non eliminati. Nessuna
  descrizione, task, URL file o milestone ereditata dai template.
- Super admin: selezione azienda in anteprima, sempre in sola lettura; non si
  dichiara di impersonare i permessi di uno specifico referente.
- Con 233: le nuove associazioni diventano canoniche. Una revoca o un elenco
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
  e richieste, lettore consulta. Nessuna approvazione implicita.
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
  la 233 aggiunge policy restrittive alle sorgenti interne del nuovo portale.
- Il workspace esclude `viewer` nel layout pur riconoscendolo nel middleware;
  non modificato qui perché indipendente dal portale cliente.
- Il login instrada il recupero password come un accesso ordinario: flusso da
  verificare separatamente prima del rilascio degli inviti ai clienti.
