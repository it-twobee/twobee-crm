# Registro migration

## Come si numera (§423)

Una migration in lavorazione si chiama `XXX_nome.sql`, con `-- XXX —` in testa.
Il numero si prende un attimo prima del commit, con `npm run migrazione
XXX_nome.sql`: fa il fetch, guarda `origin/main` e il tuo lavoro, e rinomina.
Poi si aggiorna qui «La prossima libera è la **NNN**» e si committa subito.
`lib/migrazioni.check.ts` ferma i numeri doppi, le intestazioni col numero
vecchio e questa frase se non torna. I doppi storici (080, 081, 109, 223)
restano, con il motivo scritto nel controllo.

Prima di **applicare**: la verità è il database, non questo registro. Confronta
le funzioni che la migration riscrive con quelle in produzione, e scrivi qui che
cosa è andato davvero.

## Stato consolidato al 2026-09-15

**Verificato sul database il 2026-09-15**, una per una: 205, 206, 207, 213, 214,
215, 222, 223 (tappe ricorrenti), 223 (commerciale) e 224 **ci sono tutte**. Sei
di quelle righe qui sotto dicevano ancora «da eseguire» ed erano applicate da
tempo: un registro che elenca lavoro già fatto è il modo più veloce per far
rieseguire una migration a qualcuno, e va riletto contro il database e non
contro la memoria (§222).

La **221** non va rieseguita: gli effetti sono stati verificati via SQL MCP,
non via REST, e la 224 ha poi corretto ulteriormente `handle_new_user`.
Il dettaglio delle policy e delle verifiche è nel paragrafo §329 sotto.

> **Provata sul campo il 2026-09-15**, per sbaglio: rieseguita, la 221 muore con
> `42710 policy "channel_guests_staff" already exists`. È dentro un
> `BEGIN/COMMIT`, quindi **rollback di tutto** — e va bene così, perché la sua
> `CREATE OR REPLACE FUNCTION handle_new_user()` avrebbe riportato indietro la
> 224, che quella lettura dai metadati l'ha tolta del tutto. Ma un errore che
> **sembra** un guasto e invece è una protezione lascia chi lo legge senza sapere
> se il danno è stato fatto o evitato: i `DROP POLICY IF EXISTS` ora coprono
> anche i nomi nuovi, così il secondo giro è innocuo e silenzioso.
>
> La regola che se ne ricava: **una migration che non si può rilanciare è una
> migration che si può solo temere.** Quando due file toccano la stessa funzione
> — qui la 221 e la 224 su `handle_new_user` — l'ordine di esecuzione diventa
> parte del risultato, e l'unico modo di renderlo innocuo è che rilanciare il
> più vecchio non disfi il più nuovo.

> **Due migration numerate 223.** `223_recurring_milestones.sql` (§337, tappe
> ricorrenti) e `223_sales_workspace.sql` (commerciale) sono **entrambe
> applicate**, nate in due sessioni parallele che non si vedevano. Il numero
> doppio non ha rotto niente — Supabase registra la sua versione, non il nome
> del file — ma il registro è una tabella ordinata e due righe con la stessa
> chiave sono una trappola per chi arriva dopo. La **244 è del portale
> cliente**, integrato in main; la **245** aggiunge la gestione accessi.
> La **246** introduce l'isolamento file; la **247** e la **248** i periodi e lo
> scheletro dei progetti; la **249** la pubblicazione nel portale; la **250** lo
> spazio file del cliente; la **251** l'area file condivisa; la **252** la misura
> dell'utilizzo; la **253** rimette i trigger di cronologia persi nel reset del
> dominio progetti; la **254** organizza l'area file (§413); la **255** toglie il
> blocco che impediva di eliminare un membro per una sola task; la **256** lascia
> cancellare un account senza portarsi via i file del cliente; la **257** insegna
> alle guardie del portale cos'è una cancellazione. La **258** non c'è: era il
> numero di una bozza (i link pubblici dell'area cliente), che adesso è
> `XXX_area_file_link.sql` e prenderà il suo numero al commit (§423). La
> **259** slega l'autore delle cartelle. La **260** insegna alla RLS dei lead
> gli Account Owner (§430) — **applicata** il 2026-09-24 (verificato: `sales_can_read_deal` risponde). La **261** porta priorità e membership in due
> tabelle (§436) — **applicata** il 2026-09-24 (verificato: CHECK spariti, tabelle seminate, 2 chiavi esterne). La **262** porta i campi personalizzati della
> scheda lead (§437) — **applicata** il 2026-09-24 (verificato: tabella, colonna, funzione chiusa agli utenti). La **263** porta la timeline del lead (§438): `deal_activities` diventa il diario, e ultimo contatto, tentativi e prossimo follow-up li ricalcola `sales_ricalcola_contatto` — **applicata** il 2026-09-25 (verificato: 23 contatti storici senza ora, 19 lead tornati «mai sentiti», 0 ultimi contatti che il diario non spiega). Riscrive `log_activity()` della 253 con una riga in più, e si ferma da sola se in produzione ne trova un'altra. La **264** manda il promemoria dei follow-up senza Google (§439): `sales_promemoria_followup()` ogni cinque minuti via pg_cron, un quarto d'ora prima, una volta sola (`sales_promemoria`, deny-all) — **applicata** il 2026-09-25 (verificato: tabella e funzione rispondono). Senza, i follow-up si fissano lo stesso e la campanella tace. La **265** tiene le viste salvate dell'elenco dei lead (§440): `sales_viste`, una query per riga — la stessa dell'indirizzo — personale o condivisa, deny-all — **applicata** il 2026-09-25 (verificato: tabella vuota, nessuna policy). Senza, l'elenco filtra e ricorda lo stesso, e salvare una vista dice che manca la migration. La prossima libera è la **266**.

> **La 249 è nata 247.** È stata scritta e **applicata in produzione** mentre su
> main arrivavano `247_periodi_e_ricorrenze` e `248_scheletro_periodi`, da una
> sessione che non le vedeva. Il file è stato rinumerato **dopo** l'applicazione,
> come già successo alla 244 (233 → 239 → 244): Supabase registra la **sua**
> versione — qui `20260922084609`, nome `portal_publishing` — non il nome del
> file, quindi il rinumero non cambia niente sul database e **non va
> riapplicata**. Il numero nel nome serve a chi legge il repo, e due file con lo
> stesso numero sono una trappola per chi arriva dopo.

## 259 — chi ha creato una cartella si elimina (§422, applicata il 2026-09-23)

`259_cartelle_senza_autore.sql`: **applicata in produzione** via MCP, versione
`20260923144805 cartelle_senza_autore`, con la tabella ancora vuota. Verificata
subito dopo: colonna nullable, vincolo `SET NULL`, guardia nuova con i due
trigger al loro posto, guardia dei file della 256 intatta. Provata su PostgreSQL
effimero, rilanciata due volte (`node scripts/check-portal-sql.mjs`, prova
`supabase/tests/259_cartelle_senza_autore.check.sql`); senza la 259 la stessa
prova muore su `portal_material_folders_created_by_fkey`, cioè riproduce il
blocco. Prerequisiti: **254**, **256**. Rilanciabile.

`portal_material_folders.created_by` diventa nullable e `ON DELETE SET NULL`:
la cartella resta dov'è, e l'autore si slega. Nessuna pagina legge chi ha
creato una cartella, quindi non serve un nome accanto all'id come per i file.

La guardia delle cartelle impara la stessa eccezione della 256: passa solo se
l'autore diventa NULL e **il resto della riga è identico**. Il confronto è
sulla riga intera meno `created_by` (`to_jsonb(NEW) - 'created_by'`), non su un
elenco: una colonna aggiunta domani resta protetta senza doversene ricordare.
L'eccezione sta **prima** del controllo sull'attore, perché questa modifica non
la fa una persona. Una cartella nuova senza firma, un autore riscritto o uno
slegamento che si porta dietro un altro cambio restano rifiutati.

Un rinomina successivo non ridà un autore alla cartella: `keep_folder` scrive
l'attore solo sulle cartelle che crea.

Nel portale restano **16 colonne** verso `profiles` che bloccano ancora
un'eliminazione, contate sul database il 2026-09-23. Fra le altre
`portal_materials.archived_by` e `deleted_by`: chi ha archiviato o rimosso un
file non si elimina. Ognuna ha una guardia sua, da leggere prima di slegarla
(vedi la verifica 2 della 256).

## 254 — l'area file si organizza (§413, applicata il 2026-09-23 **senza la sezione 3**)

`254_area_file_cartelle.sql`: provata su PostgreSQL effimero
(`node scripts/check-portal-sql.mjs`, rilanciata due volte) e **applicata in
produzione** via MCP, versione `20260923140832 area_file_cartelle`.
Prerequisiti: 244, 246, 250, 251. Additiva, nessun backfill.

> **In produzione è arrivata dopo la 256, e senza la sezione 3.** La 256 era già
> applicata, e il suo `portal_guard_material` è il corpo della 254 più
> l'eccezione §419 (l'autore che si slega). Riscriverlo con la sezione 3 avrebbe
> tolto quell'eccezione, e un account che ha caricato un file sarebbe tornato
> impossibile da eliminare. Verificato dopo: il guard ha lo stesso md5 di prima,
> la tabella ha RLS e i due trigger, le funzioni sono concesse solo al service role.
>
> Quindi **non rilanciare la 254 da sola**: la sezione 3 riporta indietro la
> 256, e la sezione 2 la 259. Se va rilanciata, subito dopo si rilanciano la 256
> e la 259. La suite (`scripts/check-portal-sql.mjs`) fa lo stesso: 254, poi
> 256, 257 e 259, e rifà le prove della 254 sopra.

- Nuova tabella `portal_material_folders`, solo per lo staff, con un trigger
  che firma la cartella con l'attore.
- `portal_guard_material` riscritta: `name` e `path` cambiano sui file vivi.
- Sette funzioni service-only: sposta, sposta o rinomina cartella, archivia
  cartella, elimina cartella vuota, rinomina file, quota.

La suite applica la 254 **dopo** le prove della 251: quelle raccontano la regola
di allora (il percorso non si cambiava), e restano vere per il database di
allora.

Il codice regge la migration mancante. L'area si apre, le voci per organizzare
non compaiono, e una rotta chiamata lo stesso risponde 503 e nomina la 254.

## 252 — quanto si usa il tool, contato sulle interazioni (§410, applicata il 2026-09-23)

`252_presenza_risorse.sql`: **applicata in produzione** dal SQL Editor, quindi
senza una versione registrata da Supabase — come le altre di questo repo.
Verificata dal lato applicativo subito dopo: la tabella risponde, e
`ultime_sessioni` e `presenza_totali` rispondono senza errore (zero sessioni,
che è giusto: il battito arriva col deploy). Additiva, rilanciabile, nessun
prerequisito oltre `profiles` e `activity_log`.

Porta `os_sessions` — una sessione **di interazioni**, non di login — e tre
funzioni: `registra_presenza(text,text,integer)`, l'unica concessa ad
`authenticated`, e `ultime_sessioni(integer)` + `presenza_totali(timestamptz)`,
che restano al solo service role. La tabella ha RLS **senza policy**: dice chi
lavora e quanto, e non è una cosa che si legge fra colleghi.

Due cose vanno sapute prima di rilanciarla. La prima: `registra_presenza` scrive
sulla riga di `auth.uid()` e **non** su un id che arriva dalla richiesta — se un
giorno qualcuno la cambia per accettare un parametro, il conteggio diventa una
cosa che chiunque può scrivere sul conto di chiunque. La seconda: il gap che
chiude una sessione (`interval '15 minutes'`) è lo stesso numero di
`GAP_SESSIONE_MIN` in `lib/presenza.ts`, e `lib/presenza.check.ts` **legge
questo file** per verificarlo — rinominare la migration senza aggiornare il
controllo lo fa fallire, ed è voluto.

Effetto collaterale desiderato: `profiles.last_seen_at`, aggiunta dalla **009** e
mai scritta da nessuno, da qui in poi ha un valore vero. La leggevano
`lib/person-copy.ts` e la scheda della persona.

Dettaglio in `docs/presenza.md`.

## 258 — le fasi commerciali diventano dati (§424, applicata il 2026-09-23)

`258_fasi_commerciali.sql`: **applicata in produzione**, verificata dal lato
applicativo. Rilanciabile.

Notion si spegne, quindi cade la regola che teneva dodici fasi trascritte
lettera per lettera (§367). Nascono `sales_stages` — chiave, etichetta,
**ruolo**, tinta, ordine, attiva — e `sales_motivi_perso`; su `deals` arrivano
`qualifica`, `tentativi`, `ultimo_tentativo_at`, `motivo_perso`.

Il **ruolo** (`nuovo`/`in_corso`/`vinto`/`perso`/`sospeso`) è la parte che regge
il resto: con le fasi configurabili il codice non può più nominarle, e un
`stage === 'active_client'` che smette di combaciare non è un errore — è un
`false` silenzioso. Indici parziali garantiscono una sola fase d'ingresso e una
sola vinta fra quelle attive.

Due trappole trovate eseguendola davvero, e vale la pena ricordarle:

- **`deals_stage_check`** (dalla 235) elenca a mano le dodici fasi vecchie e
  faceva morire l'UPDATE sulla prima riga. Viene tolto e **non sostituito da un
  altro elenco scritto a mano**: al suo posto c'è la chiave esterna verso
  `sales_stages`, più stretta e che si aggiorna da sola.
- il motivo «cliente inattivo» va scritto **prima** della riscrittura delle
  fasi, o quelle righe sono già «perso» come tutte le altre.

36 righe spostate: 12 perso, 9 in contatto, 6 preventivo inviato, 4 pending,
4 call fissata, 1 contratto inviato, zero orfane. E tre qualifiche recuperate
dal foglio (2 non in target, 1 in target), che prima erano schiacciate dentro
la colonna delle fasi.

Le due tabelle nuove nascono con RLS: lettura a chi ha una sessione, scrittura
solo dal service role.

## 257 — le due guardie che non conoscevano la cancellazione (§420, applicata il 2026-09-23)

`257_cancellare_una_persona.sql`: **applicata in produzione**, verificata il
2026-09-23 con la prova in coda rifatta in una transazione annullata: la guardia
rifiuta una modifica vera e lascia slegare l'autore. Rilanciabile.
Prerequisito: **256**.

La 256 non bastava, e si è visto solo provando a cancellare davvero. Due cause,
tutte e due invisibili leggendo il repository: i trigger colpevoli nascono dentro
un `DO ... EXECUTE format(...)`, quindi cercarli per nome non li trova.

**`portal_immutable`** sta su `portal_events` e rifiuta ogni UPDATE — ma
`ON DELETE SET NULL` **è** un UPDATE, quindi svuotare `actor_id` era vietato e la
cancellazione moriva lì. Adesso la guardia ammette una cosa sola: che **ogni**
differenza fra riga vecchia e nuova sia una colonna di riferimento (`*_id`,
`*_by`) che diventa NULL. Un testo riscritto o un esito cambiato restano
rifiutati, che è il motivo per cui quella guardia esiste.

**`portal_log_event`** pretende `x-actor-id` e la server action scriveva col
service role nudo: si risolve nel codice, con `createActorClient` — la regola sta
in `docs/cronologia.md` da sempre e a quell'azione non era stata applicata.

La verifica in coda prova tutte e due le strade su un evento vero dentro una
transazione che si annulla da sé: non scrive e non cancella niente.

## 256 — un account si elimina, il file del cliente resta (§419, applicata il 2026-09-23)

`256_autore_ignoto.sql`: **applicata in produzione** (verificato il 2026-09-23:
le due colonne sono nullable e `ON DELETE SET NULL`). Rilanciabile. Prerequisiti:
**250**, **251**, **254** — ed è arrivata **prima** della 254, che quindi è stata
applicata senza la sua sezione 3 (vedi la 254).

Decisione del committente, e va scritta perché non è ovvia: un account si
elimina davvero, e quello che ha caricato nell'area di un cliente resta dov'è
con l'autore **ignoto e dichiarato tale**. L'alternativa era tenere in eterno
account inutilizzati solo perché una volta hanno caricato un file.

`portal_materials.uploaded_by` e `portal_events.actor_id` diventano nullable e
`ON DELETE SET NULL`. Il nome non si perde: `uploaded_by_name` è scritto accanto
all'id dal giorno del caricamento, e l'interfaccia lo mostra con «non più nel
sistema» (`autoreTesto` in `lib/portal/explorer.ts`).

**La guardia va toccata**, ed è la parte delicata: `uploaded_by` sta nell'elenco
di ciò che non cambia dopo il caricamento, e `ON DELETE SET NULL` è tecnicamente
un UPDATE — quindi `portal_guard_material` rifiuterebbe. Il corpo è quello della
**254** ricopiato per intero con una sola aggiunta in testa al ramo UPDATE: passa
solo se l'autore diventa NULL **e tutto il resto della riga è identico**. Se la
254 viene riscritta dopo, questa aggiunta va rimessa.

`portal_material_folders.created_by` era `NOT NULL` e **bloccava**: chi aveva
creato una cartella nell'area di un cliente non si eliminava. Lo slega la **259**.

Restano fuori le altre colonne del portale che puntano a una persona
(`portal_activities.author_id`, `portal_requests`, `portal_approvals`,
`portal_material_folders.created_by`…): hanno guardie proprie sull'UPDATE che
vanno lette una per una. La **verifica 2** le elenca, così il prossimo vicolo
cieco si vede prima di sbatterci.

## 255 — una task sopravvive alla persona (§418, applicata il 2026-09-23)

`255_task_senza_persona.sql`: **applicata in produzione** (verificato il
2026-09-23: `assignee_id` e `created_by` di `tasks` sono `SET NULL`).
Rilanciabile, tocca solo vincoli.

`tasks.assignee_id` puntava a `profiles` senza clausola di cancellazione, e
senza clausola Postgres sceglie `NO ACTION`: bastava **una** task, anche chiusa,
anche assegnata per sbaglio, perché quell'account non si potesse più eliminare.
Omissione della **147**, la stessa che aveva perso i trigger di cronologia.
Adesso `SET NULL`, come già `activity_log.user_id` e `files.uploaded_by`: la
task resta, torna senza assegnatario, e la riga in `task_assignees` sparisce in
cascata — quindi le due fonti restano d'accordo.

Converte tutte le colonne di `tasks` verso `profiles` che sono nullable e
bloccanti, chiedendole allo schema: è un elenco scritto a mano che ha creato il
problema. Le colonne `NOT NULL` restano fuori, perché lì `SET NULL` violerebbe
il vincolo.

La **verifica 2** stampa l'inventario di chi blocca ancora in tutto lo schema:
non è un elenco da svuotare — per certe tabelle bloccare è giusto — ma serve a
vedere il prossimo vicolo cieco prima di aprirlo.

## 253 — la cronologia non vedeva più le task (§412, applicata)

`253_cronologia_cieca.sql`: **applicata in produzione** (verificato il
2026-09-23: `trg_log_*` c'è su `tasks`, `projects`, `invoices`, `milestones` e
`project_workstreams`, e `log_activity()` conosce le due etichette nuove).
Additiva e rilanciabile.

Rimette `trg_log_*` su tutte le tabelle con cronologia che esistono davvero —
chieste a `to_regclass`, non a un elenco scritto a mano — e insegna a
`log_activity()` l'etichetta di `milestones` e `project_workstreams`. Il corpo
della funzione è quello della **179** ricopiato per intero: `CREATE OR REPLACE`
sostituisce tutto, e una versione «solo con le mie aggiunte» riporterebbe
indietro l'attribuzione dall'header `x-actor-id`.

Perché serviva: la **144** ha droppato il dominio progetti con `CASCADE` (che
porta via i trigger) e la **147** l'ha ricostruito senza rimetterli, quindi dal
20 luglio 2026 `tasks`, `projects` e `invoices` non scrivevano più una riga.
Dettaglio in `docs/cronologia.md`.

## 251 — l'area file di un cliente (§398, applicata il 2026-09-22)

`251_area_cliente.sql`: **applicata in produzione**, versione
**`20260922113154`**. Additiva: le righe esistenti restano `source='cliente'`,
che è quello che sono. Prerequisiti: **244**, **246**, **250**.

Su `portal_materials` arrivano tre cose. **`source`** (`cliente`|`team`) è il
confine, e sta in una riga sola della policy `portal_material_read`: il cliente
legge solo ciò che ha caricato lui. **`path`** è il percorso relativo con cui il
file è arrivato dal browser — l'albero si ricostruisce da lì, quindi non esiste
una tabella delle cartelle da tenere integra; un CHECK rifiuta `.`, `..`, barre
appese, doppie barre e più di dieci livelli. **`archived_at`/`archived_by`**
tolgono il file dai nostri elenchi e non da quelli del cliente: la policy del
cliente non guarda l'archiviazione.

`portal_assert_staff_actor` verifica che un file `team` lo carichi staff attivo,
dato che `portal_is_staff()` guarda `auth.uid()` e le scritture arrivano dal
service role con l'attore nell'header. `portal_guard_material` diventa a due
rami — il nostro e il suo — e ammette dopo il caricamento solo archiviare,
rimuovere e staccare il metadato. Un file nostro non risponde a un'attività del
cliente (CHECK) e non porta l'etichetta di un progetto di un'altra azienda.

`path`, `source`, `archived_at` e `archived_by` sono concesse in SELECT ad
`authenticated` perché anche lo staff legge da lì: al cliente non raccontano
niente, visto che la sua policy gli passa solo `source='cliente'`.

Provata due volte su PostgreSQL 16 effimero con
`supabase/tests/251_area_cliente.check.sql`. Verifica in sola lettura dopo
l'applicazione: quattro colonne nuove, le due policy al loro posto,
`portal_assert_staff_actor` presente, zero colonne riservate esposte, e — la
riga che conta — **l'espressione di `portal_material_read` contiene davvero
`source`**: il confine è nel database, non in una pagina. Conteggi: 0 materiali,
0 file nostri, 0 link Drive (la tabella `documents` in produzione è vuota, che è
il motivo per cui la sezione Documenti non mostrava niente).

## 250 — lo spazio file del cliente (§397, applicata il 2026-09-22)

`250_portal_materials.sql`: **applicata in produzione**, versione
**`20260922093617`**. Additiva, nessun backfill. Prerequisiti: **244**
(portale), **246** (isolamento storage), **249** (pubblicazione), **108/109**
(metadati file).

`portal_materials` tiene i file che carica il cliente: azienda obbligatoria,
progetto **facoltativo** — è un'etichetta, non il perimetro, perché lo spazio è
dell'azienda. Con il progetto nullo `portal_can_access` esige già
`project_scope='all'`, quindi i file senza progetto restano a chi ha l'accesso
completo: la policy di lettura non ha dovuto inventare niente.

Le colonne di visualizzazione (`name`, `mime`, `size`, `kind`,
`uploaded_by_name`) sono duplicate dalla riga `files` perché il cliente non legge
né `files` né `profiles`. `storage_key` e `file_id` restano **fuori** dai grant:
il download passa dal backend. `file_id` si stacca (`ON DELETE SET NULL`) quando
il file viene rimosso davvero — la riga resta come traccia, i byte no — e un
CHECK impedisce che un materiale vivo sia senza file.

`portal_guard_material` verifica l'attore con `portal_assert_actor` (fuori il
lettore), che il file stia nella cartella `materiali` di **quell'azienda**, e che
dopo il caricamento si possa solo rimuovere: due sole transizioni ammesse, il
soft delete e il distacco del metadato. `portal_material_marks_activity` porta in
verifica l'attività a cui il materiale risponde, e la task interna a `in_review`:
il file è arrivato, non è stato approvato. Il limite di 1 GB è un CHECK, quindi
vale anche per il service role; la quota di 20 GB per azienda la fa rispettare la
rotta, che è l'unica porta di scrittura.

Riscrive `storage_context_access` aggiungendo la cartella **`materiali`**,
ammessa solo con `entity_type='client'`.

Provata due volte su PostgreSQL 16 effimero con
`supabase/tests/250_portal_materials.check.sql`. Verifica in sola lettura dopo
l'applicazione: tabella presente, 2 policy (`portal_staff_read`,
`portal_material_read`), 3 trigger, **12 colonne leggibili da `authenticated` e
zero fra quelle riservate** (`storage_key`, `file_id`), **nessun privilegio di
tabella** ad `authenticated`, 0 materiali e 0 file nella cartella. Al momento
dell'applicazione gli accessi portale attivi erano **0**: lo spazio esiste e non
lo apre ancora nessuno, perché l'abilitazione resta esplicita e personale.

## 249 — pubblicazione nel portale cliente (applicata il 2026-09-22)

`249_portal_publishing.sql`: **applicata in produzione**, versione
**`20260922084609`**. Additiva e rilanciabile, senza backfill: nessun progetto,
task o file è diventato pubblico per effetto della migration. Prerequisiti
riletti sul database reale prima di applicarla — `portal_activities` (244),
`storage_context_access` (246) e `files` (108) presenti, `portal_deliverables` e
`source_task_id` assenti — e con **0 attività, 0 versioni, 0 progetti pubblicati
e 0 task al cliente**: non c'era niente da disturbare. Prerequisiti dichiarati:
**244** (portale), **246** (isolamento storage), **158**
(`tasks.task_type='cliente'`), **108/109** (metadati file).

Cosa cambia:

- `portal_activities.project_id` diventa **nullable** e arriva
  `source_task_id uuid UNIQUE → tasks(id)`. Una task al cliente non può avere un
  progetto (CHECK della 158): pretenderlo avrebbe significato reinserirla a
  mano. Con il progetto nullo la FK composta `(project_id, client_id)` è MATCH
  SIMPLE e non vincola più, quindi si aggiunge la **FK esplicita su
  `client_id`** — senza, l'azienda resterebbe senza controllo.
  `portal_can_access(client, NULL)` esige già `project_scope='all'`: le attività
  d'azienda le vede **solo** chi ha l'accesso a tutta l'azienda, e le policy di
  lettura non sono state toccate per ottenerlo.
- Trigger `portal_sync_task_activity` su `tasks`: propaga titolo, descrizione
  (come «perché»), scadenza e stato all'attività collegata; `deleted_at` la
  ritira. Una descrizione svuotata **non** cancella il perché già pubblicato.
  `portal_log_event` pretende un attore e **solleva** se manca: dentro un UPDATE
  su `tasks` avrebbe bloccato scritture interne che oggi passano (cron,
  ricorrenti), quindi la sincronizzazione dichiara il proprio autore nel GUC di
  transazione `portal.sync_actor` e l'evento viene registrato con `action='sync'`.
- Nuova tabella `portal_deliverables` (consegna = raggruppamento delle versioni).
  `portal_deliverable_versions` prende `deliverable_id` e `file_id → files(id)`,
  `document_id` diventa nullable: la versione punta a un **file vero** su MinIO,
  non a una riga `documents`, che è un elenco di collegamenti Drive. Un link
  esterno non è una versione immutabile e non si scarica dal portale.
  `portal_guard_version` verifica che il file sia nella cartella `deliverables`
  del progetto e che `storage_key = files.object_key`.
- `retired_at`/`retired_by` sulle versioni: **l'unica modifica ammessa dopo la
  pubblicazione**. Senza, togliere un file sbagliato voleva dire ritirare
  l'intero progetto. Le policy di lettura di versioni, consegne e attività
  escludono le versioni ritirate; una versione ritirata non si approva.
- `storage_context_access` (246) riscritta con la cartella **`deliverables`**,
  ammessa solo con `entity_type='project'`: l'elenco delle cartelle sta dentro
  la funzione, quindi si sostituisce tutta. I link anonimi restano esclusi
  (`canShareFile` ammette solo `misc|knowledge|feedback`).
- `retired_at` è concessa in SELECT ad `authenticated` perché la policy delle
  attività la interroga in sottoquery: per il cliente vale sempre NULL, le righe
  ritirate non le vede. `storage_key` e `file_id` restano **fuori**.

Verificata due volte su PostgreSQL 16 effimero, insieme a 244/245/246 e alla
suite `supabase/tests/249_portal_publishing.check.sql`:

```bash
node scripts/check-portal-sql.mjs      # 244, 245, 246, 249 + suite portale
node scripts/check-storage-sql.mjs     # 246 + 249 + suite storage
```

La suite prova attività d'azienda invisibile a uno scope `selected`, risposta
ammessa solo allo scope `all`, sincronizzazione e ritiro dalla task, UPDATE su
`tasks` **senza attore** che non si rompe, file di un altro progetto rifiutato,
versione pubblicata immutabile, ritiro della singola versione, versione superata
non approvabile, ritiro del progetto che porta via consegne e attività, e
accesso incrociato fra due aziende con utenti distinti.

Verifica in sola lettura dopo l'applicazione: `portal_activities.project_id`
nullable, `source_task_id` presente, quattro colonne nuove sulle versioni
(`deliverable_id`, `file_id`, `retired_at`, `retired_by`), trigger
`portal_sync_task_activity` su `tasks`, 2 policy su `portal_deliverables`
(`portal_staff_read`, `portal_deliverable_read`) e 2 sulle versioni, nessun
privilegio di scrittura ad `authenticated`, e i vincoli `portal_activities_client_fk`,
`portal_activities_project_required`, `portal_version_deliverable`,
`portal_version_source`, `portal_version_has_source`, `portal_version_retired`.
Le colonne concesse in SELECT ad `authenticated` sulle versioni sono **14** e
**non comprendono `storage_key` né `file_id`**. Conteggi invariati: 0 consegne,
0 attività da task, 0 progetti pubblicati, 0 file nella cartella `deliverables`.
Nessun dato di prova creato.

Il rilascio del **codice** va fatto insieme: senza, il database ha le colonne e
nessuno le scrive; senza il database, la tab Portale dichiara la dipendenza e
non pubblica niente.

## 246 — isolamento degli allegati interni (applicata il 2026-09-21)

`246_storage_isolation.sql`: **applicata in produzione**, versione
**`20260921150329`**, dopo verifica dei prerequisiti sul database reale.
Prerequisiti: metadati storage 108/109, `profiles` con ruoli/stato,
`clients.workspace_hidden`, `projects.deleted_at`, `feedback.author_id` e
`chat_channels`. Chiude l'accesso diretto a file/cartelle/token per clienti,
ospiti e profili disattivati; gli utenti autenticati conservano solo SELECT
con RLS. Le scritture passano dalle API autorizzate.

`storage_context_access` è invoker e usa la RLS della sorgente; il database
impedisce parent/cartelle di contesti diversi e cicli. Il DELETE ricorsivo
verifica anche i proprietari dei figli e dei file rimasti. Rinnovo/revoca dei
link passano da una RPC service-only con lock sul file. Nessun backfill o
cancellazione di oggetti esistenti. Dettagli in `docs/storage-access.md`.

Verificata due volte su PostgreSQL 16 isolato, con suite
`supabase/tests/246_storage_isolation.check.sql`. Dopo l'applicazione: 6 policy
restrittive, 3 trigger, nessun grant di scrittura ad authenticated né SELECT ad
anon sulle tre tabelle; `storage_replace_share` eseguibile solo da service role.
Verifica in transazione READ ONLY delle letture staff e dell'isolamento senza
profilo valido: superata. Conteggi invariati: 4 file, 1 cartella, 0 condivisioni.
Rilascio accompagnato dal codice delle API storage, che ora legge via RLS e
chiama le nuove funzioni per scrivere e condividere.

## 245 — accessi al portale dalla scheda cliente (applicata il 2026-09-21)

`245_portal_access_management.sql`: **applicata in produzione**, versione
**`20260921133529`**, dopo la **244**. Aggiunge la revisione della
membership e RPC service-role-only per salvare permessi/scope, revocare e
riattivare l'accesso. Il database rilegge il ruolo e lo stato dell'attore
(`x-actor-id`), esclude aziende nascoste ai manager e lead non acquisiti,
controlla il ruolo cliente dell'account destinatario e la proprietà dei
progetti. Ambito e membership si aggiornano nella stessa transazione; una
revisione obsoleta non può annullare una revoca. Audit tramite i trigger 244.

Nessun account o invito viene creato dalla migration né alla creazione di
un'anagrafica: la tab è parte della scheda condivisa e compare automaticamente.
Gli inviti personali e i link per reimpostare la password passano da Supabase
Auth, dopo il controllo server e la verifica che le migration siano presenti.

Runner: `node scripts/check-portal-sql.mjs`. PostgreSQL 16 effimero, senza rete,
con struttura minima dichiarata in `scripts/fixtures/portal-base.sql`: 244 e
245 eseguite due volte e suite `supabase/tests/244_client_portal.check.sql` e
`supabase/tests/245_portal_access_management.check.sql` superate. Verifica
esecuzione, vincoli e isolamento sullo schema di test, **non** certificazione
dello schema reale di produzione. Prima di applicare la 244 verificare tutti
i prerequisiti e gli effetti sugli accessi legacy; nessuna fixture in produzione.

## 244 — portale cliente (applicata il 2026-09-21)

`244_client_portal.sql`: **applicata in produzione**, versione
**`20260921133528`**. Associazioni azienda/progetto
revocabili, proiezioni dei soli campi pubblici, pubblicazione esplicita, attività
cliente, versioni immutabili e approvazioni, richieste con messaggi pubblici e
note interne separate, ponte task e cronologia attribuita. Nessun backfill di
accessi o pubblicazioni. Le scritture browser sono chiuse.

Rilanciabile: `IF NOT EXISTS`, `CREATE OR REPLACE`, policy e trigger ricreati.
Prerequisiti: 080, 147/148, 213 (aziende nascoste al workspace), 224. Anteprima
per manager e amministrativi; manager limitati alle aziende del workspace. Suite
`supabase/tests/244_client_portal.check.sql`, **solo staging**, `BEGIN/ROLLBACK`.
Non eseguirla sul database condiviso con la produzione. Prima del rilascio va
verificato anche l'effetto delle policy restrittive sugli accessi legacy a
documenti e canali; la VIEW da sola non protegge le tabelle di origine.
Ricognizione, limiti del primo giro e piano: `docs/portale-cliente.md`.

Rinumerata da 233 a 239 dopo l'allineamento del branch al commit **e307084**:
su main i numeri 233–238 sono già occupati da `233_person_copy.sql`,
`234_tracce_membro.sql`, `235_sales_notion_stages.sql`,
`236_sales_notion_columns.sql`, `237_workspace_commerciale.sql` e
`238_commerciale_icona.sql`. È una verifica dei file nel repository, non
dell'applicazione di queste migration sul database.

Al merge in main del 2026-09-21 rinumerata nuovamente a **244**: 239–243 sono
ora occupate da lead eliminati, movimenti nascosti, saldi e distinte cedolini.
Il deploy del primo incremento usa il fallback di lettura già previsto e non
applica questa migration.

**Attivazione autorizzata il 2026-09-21:** prerequisiti verificati sul progetto
`ujkrrryitfqboskdqhwf`. Mancava `documents.project_id`, eliminata dal reset:
la 244 ora la aggiunge nullable con FK a `projects`, senza backfill. Il test
isolato parte dalla stessa assenza e passa anche in riesecuzione.

Dopo 244/245: **11 tabelle portale con RLS**, 11 policy restrittive sulle
sorgenti interne, 3 RPC di gestione eseguibili solo dal service role. Verifica
SQL in transazione **READ ONLY**: il manager vede le sole aziende del workspace,
il guard service-role riconosce l'attore, senza membership non si leggono né
le aziende del portale né la tabella clienti. Nessun progetto pubblicato o
accesso creato implicitamente; nessun ruolo modificato. Conteggi prima/dopo:
17 clienti, 42 progetti, 7 profili, 0 documenti; nuove membership/eventi: 0.
Le suite con fixture restano esclusivamente sul database isolato.

## 232 — una notifica, un destinatario (§350)

`232_notifications_one_recipient.sql`: **applicata** (verificato sul database il 2026-09-25). `notifications` ha due
colonne per la stessa cosa — `profile_id` (001) e `user_id` (arrivato dopo): la
RLS della 009 le guarda tutte e due, la campanella filtrava sul solo `user_id`,
e chi scriveva sceglieva. Misurato il 18 settembre 2026: **11 righe su 23** con
`user_id` nullo — le `task_request` di luglio, ai manager e a un junior —
leggibili dal database e invisibili sullo schermo.

Non sceglie quale colonna vince: **le tiene uguali**. Trigger
`trg_notification_recipient` (BEFORE INSERT OR UPDATE) che riempie quella che
manca, più il backfill delle righe vecchie. La campanella, dal canto suo, ora
legge come legge la RLS.

Rilanciabile: `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, e un UPDATE che al
secondo giro non trova più niente.

## 231 — chi ha assegnato la task (§347)

`231_task_assigned_by.sql`: **applicata** (verificato sul database il 2026-09-25). Aggiunge
`task_assignees.assigned_by` (FK a `profiles`, `ON DELETE SET NULL`). Sta lì e
non su `tasks` perché descrive l'assegnazione, non la task: su `tasks` sarebbe
una copia da riallineare a ogni cambio di titolare.

**Nessun backfill**: l'unica traccia era `activity_log`, dove le righe delle
task sono tutte anteriori al reset del dominio progetto e hanno `user_id` nullo.
Riempirla con `tasks.created_by` sarebbe stato inventare un'attribuzione —
indistinguibile, il giorno dopo, da una vera. Le assegnazioni già in archivio
restano senza autore e l'interfaccia lo dichiara.

Il codice regge la colonna mancante: le pagine personali ripiegano sulla query
di prima se la migration non è ancora applicata (perdere le task
multi-assegnate per un nome sarebbe il danno peggiore), e la sezione Task mostra
semplicemente nessun autore.

Rilanciabile: `ADD COLUMN IF NOT EXISTS`.

## 230 — via la riga «task», fantasma della sezione Task (§346)

`230_workspace_task_section_cleanup.sql`: **applicata** (verificato sul database il 2026-09-25).
`workspace_sections` aveva due righe per la stessa cosa — `ad_hoc` («Task»,
`/workspace/ad-hoc`, attiva) e `task` («Task», `/workspace/task`, spenta e senza
pagina dal reset 144/146). Dopo la 229 si chiamano anche uguali, e quella morta
si porta dietro i permessi di cinque ruoli: una spunta di distanza dal diventare
una voce di menu che rimbalza (§211). I permessi se ne vanno con lei
(`ON DELETE CASCADE`, 079).

Con la riga sparisce anche il suo aggiramento nel codice: `task` esce da
`HIDDEN_WORKSPACE_KEYS` in `app/(workspace)/layout.tsx`. Le altre chiavi
restano — chat, portfolio, workload, cestino sono funzioni tolte che possono
tornare, e la riga conserva ordine, gruppo e permessi; `task` no, perché è già
tornata con un altro nome.

Rilanciabile: il secondo giro non trova più niente da cancellare.

## 229 — nel workspace la sezione si chiama «Task» (§346)

`229_workspace_task_section_label.sql`: **applicata** (verificato sul database il 2026-09-25). Solo etichetta e
descrizione della riga `ad_hoc` in `workspace_sections`: il menu del portale
operativo diceva ancora «Task Ad Hoc», ma dal §340 quella pagina le contiene
tutte e l'intestazione dice «Task». Rotta, permessi e ordine non cambiano.

Il letterale `'Task Ad Hoc'` nella **156** è stato allineato: quella migration
ha `ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label`, quindi rilanciarla
avrebbe disfatto questa — e «rilanciare il più vecchio non deve disfare il più
nuovo» (il caso 221/224 qui sopra).

In coda la verifica mostra anche la riga **`task`**, rimasta dal seed iniziale e
**inattiva**: punta a `/workspace/task`, che non esiste. Non compare a nessuno,
ma è il posto dove qualcuno un giorno accenderà un link che rimbalza (§211).

## 228 — la finestra di generazione la decide la cadenza (§346)

`228_recurrence_window_by_frequency.sql`: **applicata** (verificato sul database il 2026-09-25).
Misurato il 18 settembre 2026 con tutte le regole a trenta giorni: un giro
avrebbe creato **236 occorrenze**, ~170 dalle sole sei giornaliere. Con la
finestra per cadenza sono 85, e 33 contando solo le regole che hanno un
responsabile.

- `recurrence_lead_days(frequency)`: giornaliera 7, settimanale e quindicinale
  30, mensile 90, trimestrale 180. **È l'unico posto dove quei numeri esistono.**
- `generation_lead_days` diventa **nullable** e perde il default: NULL = «quella
  della cadenza», la scrive il trigger `trg_recurrence_lead_days`
  (BEFORE INSERT OR UPDATE). Serve perché i due scrittori non possono
  condividere una costante: l'azione passa da PostgREST (che non chiama
  funzioni) e il wizard da `create_project_from_template`.
- La funzione del wizard torna a scrivere la colonna direttamente, con NULL
  quando il payload non porta niente — la 227 ci arrivava con un UPDATE in coda,
  che adesso non serve più.
- Backfill: `SET generation_lead_days = recurrence_lead_days(frequency) WHERE = 30`.
  I trenta della 227 non li ha scelti nessuno, visto che il campo non è esposto
  in nessun form.

Rilanciabile: `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, e un backfill che
riporta allo stesso valore quello che ci è già. In coda la verifica mostra
finestra minima e massima per cadenza e quante regole restano senza responsabile.

## 227 — le ricorrenti del wizard nascono lavorabili (§346)

`227_recurring_from_wizard.sql`: **applicata** (verificato sul database il 2026-09-25). Riscrive
`create_project_from_template` (ultima definizione: la 155) cambiando **due
righe sole** del blocco ricorrenti, e fa un backfill.

- `generation_lead_days` **non viene più scritto** se il payload non lo porta:
  vale la colonna (`DEFAULT 30` dalla 223). Prima la funzione passava 3
  esplicito, quindi il default non si applicava mai e una mensile non generava
  niente per settimane. Backfill: `SET generation_lead_days = 30 WHERE = 3`,
  idempotente.
- `owner_id` prende il **pavimento**: riga → responsabile del workstream → PM del
  progetto. Il motore copia `owner_id` in `assignee_id`, quindi una regola senza
  responsabile genera task di nessuno. Serve ai payload che il wizard non
  costruisce — la conversione di un'opportunità vinta (225) crea progetti da
  template senza passare di lì.

**Nessun backfill sui responsabili delle 15 regole esistenti**: chi riceve una
ricorrente è una decisione di qualcuno, e scriverla qui la renderebbe
indistinguibile da una scelta vera. Le dichiara la scheda progetto («mai
generate», «N senza responsabile»), che è il posto dove qualcuno può rimediare.

Rilanciabile: `CREATE OR REPLACE` più un UPDATE idempotente. In coda la verifica
conta finestre a 3, finestre a 30, regole senza responsabile e regole mai
generate.

## 226 — richieste di accesso al foglio dei compensi (§344)

`226_report_access.sql`: **applicata** (verificato sul database il 2026-09-25). Crea `report_access_requests` — chi ha
chiesto di vedere `/api/compensi`, quale mese, e la decisione dell'admin —
`ENABLE ROW LEVEL SECURITY` senza policy (deny-all come `google_credentials`:
ci passa solo il service role, dietro le guard applicative). Unico su
`(token, resource, scope)` perché ricaricare la pagina non deve moltiplicare le
notifiche a chi decide. Non tocca nessuna tabella esistente e non ha backfill:
finché non è applicata, la porta mostra il modulo e l'invio risponde «non è
stato possibile inviare la richiesta» — nessun 500, e il foglio resta
raggiungibile come prima da chi ha `canSeeEconomics`.

## 225 — acquisizione cliente alla vittoria commerciale

`225_sales_client_conversion.sql`: **applicata il 2026-09-15** via MCP,
versione `20260915142808`. Sposta la
conversione `lead` → `stabile` dalla delivery all'esito Vinta, nella stessa
transazione; riusa la riga cliente e lascia intatte le altre label. Per le
opportunità senza anagrafica supporta un collegamento esplicito o il bundle
canonico, con controllo dei nomi duplicati. Proposta accettata inseribile nello
stesso esito. Nessuna generazione economica, modifica di ruoli o backfill.
Test dedicati: `supabase/tests/225_sales_client_conversion.check.sql`.
Prima del rilascio: suite SQL 223 e 225 passate su PostgreSQL 16 isolato;
225 rieseguita e ritestata. Snapshot di sole strutture, con grant SELECT della
vista workspace ripristinato nel test perché non incluso nello snapshot delle
tabelle. Verifica remota: RPC sempre solo service role, 16 clienti e una
opportunità invariati, zero vittorie pregresse da riallineare.

## Applicate il 2026-09-15: 224 sicurezza e 223 commerciale

Progetto `ujkrrryitfqboskdqhwf`, tramite MCP `apply_migration`, in quest'ordine:

| Versione registrata | File | Esito |
|---|---|---|
| `20260915125653` | `224_profile_authorization.sql` | Applicata e verificata |
| `20260915125709` | `223_sales_workspace.sql` | Applicata e verificata |

`223_sales_workspace.sql`: ripristina `deals`/`deal_activities` se assenti e le amplia; aggiunge comandi
idempotenti, riepiloghi delivery, RLS per owner/responsabili e RPC riservati al
service role. `create_client_bundle` è condivisa con la creazione anagrafica.
Prima dell'applicazione, test SQL 223/224 e riesecuzione delle migration passati
su PostgreSQL 16 isolato, con snapshot della struttura reale (Supabase 17.6),
senza copiare dati di produzione. Fixture annullate con ROLLBACK. La 223
ripristina solo le due tabelle demolite, non le policy aperte o gli altri
domini della vecchia 011; reinstalla anche `trg_log_deals`.

Verifica remota: quattro tabelle commerciali con RLS; nessuna scrittura
diretta per anon/authenticated; RPC privilegiate solo service role; opzioni
admin restituite correttamente. Conteggi invariati prima/dopo: 9 profili,
16 clienti, 30 progetti, 16 contratti, 46 righe ricavo, 88 fatture. Le quattro
tabelle nuove sono vuote. Nessun ruolo o dato aziendale esistente modificato.
Le due colonne della 222 risultano già presenti: non rieseguita.
Il rilascio iniziale è stato successivamente distribuito e confermato
dall'utente; i conteggi sopra descrivono il momento dell'applicazione 223/224.
Vedi `docs/commerciale.md` per gli incrementi successivi.

## 221 (§329): effetti già presenti, verificati il 2026-09-15

`221_role_not_from_metadata.sql` risulta **già presente nello schema reale**
del progetto `ujkrrryitfqboskdqhwf`: corpo di `handle_new_user` corrispondente
al file, RLS attiva e sole policy `channel_guests_staff` / `ticket_portals_staff`
con `USING` e `WITH CHECK is_staff()`. Prima delle nuove applicazioni il registro MCP era vuoto:
non documenta quando sia stata eseguita. Non rieseguita, perché le due
`CREATE POLICY` fallirebbero sui nomi già esistenti. Toglie a
`handle_new_user` la lettura di `role` dai metadati dell'utente — che sono
scritti da chi crea l'invito, quindi erano un modo di scegliersi un ruolo di
autorizzazione — e restringe allo staff le policy di `channel_guests` (021) e
`ticket_portals` (028), che erano `FOR ALL USING (auth.uid() IS NOT NULL)`.

Verifiche sul database, perché il reset del 2026-07-23
ha ricreato tabelle e il registro non dice cosa c'è **adesso** (§222):

```sql
SELECT prosrc LIKE '%raw_user_meta_data->>''role''%' AS legge_role
  FROM pg_proc WHERE proname = 'handle_new_user';
SELECT tablename, policyname, qual FROM pg_policies
 WHERE tablename IN ('channel_guests','ticket_portals');
```

Dopo, il controllo che la migration **non** fa da sola, perché cambiare i
permessi di qualcuno non è una cosa che deve fare uno script:

```sql
SELECT id, email, role, app_role FROM public.profiles
 WHERE role = 'admin' AND app_role IS NULL;
```

Nessuna riga è l'esito atteso. Se ne esce qualcuna, è un profilo nato da metadati
che nessuno ha dichiarato: va guardato a mano.

**Esito 2026-09-15:** zero profili `role = 'admin' AND app_role IS NULL` e zero
profili con `app_role` amministrativo ma `role <> 'admin'`. Nessun ruolo modificato.

**Correzione eseguita con la 224:** il trigger della 221 continuava a copiare
`app_role` dai metadati, anche per i valori amministrativi. L'elenco chiuso non
è un'autorizzazione: `requireEconomicsAdmin` legge proprio `app_role`. Inoltre
`profiles.app_role` è `NOT NULL`: metadato assente o non valido porta il trigger
a inserire NULL e bloccava la creazione del profilo. La 224 assegna inizialmente
`role = 'guest'` e `app_role = 'guest'`, lasciando l'assegnazione dei ruoli al
percorso server autorizzato. Il trigger `guard_profile_self_update` (SECURITY
INVOKER) impedisce anche agli utenti autenticati di riscrivere ruoli, email,
stato attivo e altri campi amministrativi sul proprio profilo. Restano
modificabili nome, avatar, telefono, mansione, competenze e configurazione
dashboard; service role e amministrazione SQL restano autorizzati. Revocati
TRUNCATE/REFERENCES/TRIGGER sui profili per anon/authenticated.

## Registro migration (Supabase Dashboard → SQL Editor)

> **§222 — attenzione al registro.** «Applicata» non vuol dire «c'è ancora».
> Le migration **003** e **113** avevano aggiunto `tasks.asana_gid` e
> `projects.asana_gid`; il reset del 2026-07-23 (**146**) ha ricreato entrambe le
> tabelle e se le è portate via, ma nel registro restano elencate come applicate
> — perché applicate lo erano, prima. La **202** le rimette. Prima di dare per
> esistente una colonna aggiunta prima della 146, **verificala sul database**.
>
> **Niente da eseguire fino alla 220.** Verificato sul database il 2026-08-01: tutte quelle
> elencate qui sotto sono applicate, `175_tax_control.sql` e `179_os_versions.sql`
> comprese. L'attribuzione via `x-actor-id` è stata provata sul database vero:
> con l'header la modifica prende il nome di chi l'ha fatta, senza resta
> «Sistema», e un UPDATE che non cambia niente non scrive più una riga.
>
> **§313 — e il modo di verificarlo in trenta secondi.** Un `ON CONFLICT` su un
> indice che non c'è fallisce con `42P10`, e PostgREST lo risolve **prima** dei
> vincoli di chiave esterna: un upsert con valori inventati risponde `42P10` se
> l'indice manca e `23503` se c'è, senza scrivere niente. Passati così tutti gli
> `onConflict` del codice, ne mancavano due — `payslips` e `item_views` — e la
> 216 li rimette. Vale come metodo, non solo come episodio: ogni upsert è una
> promessa su un indice, e dopo un reset la promessa va riprovata.
>
> **Non eseguire** `086_decisions`, `097_data_quality_view`, `098_time_tracking`:
> riguardano domini demoliti nel reset del 2026-07-23 (decisions, time tracking,
> widget salute dati) e non hanno un solo riferimento nel codice. Restano nel
> repo come storia, non come lavoro arretrato.

La vecchia affermazione su `chat_channels.project_id` non è più valida: nello
snapshot del 2026-09-15 la colonna non c'è. La creazione canali commerciale non
la usa; non è stata ripristinata da questa migration.
Numerazione: attenzione, `080_*`, `081_*`, `092_*` e **`223_*`** compaiono due
volte. Le due 223 sono interventi distinti sviluppati in parallelo:
`223_recurring_milestones.sql` e `223_sales_workspace.sql`. Non rinominare né
rieseguire quella commerciale già registrata come `20260915125709`; verificare
sempre nome completo e schema reale. La 225 è riservata alla conversione
commerciale; il prossimo libero è **226**.

> **`219_invoice_states.sql` — applicata il 2026-09-09** (§323), e lo script di
> riallineamento è passato: **6 storni collegati** leggendo `DatiFattureCollegate`
> dagli XML già in archivio, e **9 esclusioni a mano rimosse**, perché adesso le
> spiega il documento. Le esclusioni a mano rimaste sono **zero**.

La tabella qui sotto è il **changelog**: dice cosa fa ciascuna, non cosa manca.

| # | Cosa fa | Serve anche |
|---|---|---|
| `086_decisions.sql` | ALTER su `decisions` (la 044 l'aveva già creata: NON ricrearla) | — |
| `087_workspace_groups_sections.sql` | `group_key`/`group_order` + sezioni workspace nuove | — |
| `088_payslips.sql` | Buste paga, RLS owner-only | bucket **privato** `payslips` |
| `089_personal_documents.sql` | Documenti personali con scadenze | bucket privato `personal-documents` |
| `090_chat_rework.sql` | canali `team`/`dm`, `chat_dm_participants`, `chat_best_ideas` | bucket `best-ideas` |
| `091_google_credentials.sql` | token Google fuori da `user_metadata` | ricollegare Google una volta |
| `092_workspace_team_read_all.sql` | i ruoli `team` (manager…partner) leggono TUTTI clienti/progetti/task (scrittura task resta scoped) | — |
| `093_feedback.sql` | tabelle `feedback` + `feedback_votes` (RLS staff-read/own-write/admin-manage) + sezione workspace `feedback` | — |
| `115_ai_assistant.sql` | **§314 — applicata il 2026-08-28.** Assistente AI agentico: `ai_conversations`, `ai_assistant_messages`, `ai_tool_calls` (audit di ogni chiamata) e `ai_pending_actions` + `ai_logs.profile_id`. Su `ai_pending_actions` la RLS è attiva **senza nessuna policy**: è voluto — deny-all per anon e authenticated, ci arriva solo il service role, ed è ciò che rende il pulsante «Conferma» una vera autorizzazione. Se lì comparisse una policy, gli argomenti di un'azione in attesa diventerebbero leggibili e riscrivibili dal browser | la **052** (vedi sotto) |
| `052_ai_logs.sql` | **applicata il 2026-08-28, era un buco dello snapshot.** Il file era nel repo da sempre e nel database **non c'era nessuna tabella `ai_*`** — §222 nella forma pura. `lib/ai-logger.ts` fa l'insert in fire-and-forget con `.catch(() => {})`, quindi ogni log AI è stato scartato in silenzio fino a quel giorno: nessun errore, nessuna riga. Applicata insieme alla 115 in un'unica transazione, perché la 115 fa `ALTER TABLE ai_logs` e da sola sarebbe fallita per intero | — |
| `095_workspace_workload_section.sql` | voce sidebar `workload` nel workspace (il layout la inietta comunque come fallback) | — |
| `094_private_personal_tasks.sql` | task senza progetto = personali/private: `tasks_team_read_all` ora richiede `project_id IS NOT NULL` (i colleghi non le vedono) | — |
| `096_rls_hardening.sql` | SEC-01: chiude le RLS `USING(true)` (policy lasche droppate per nome) | — |
| `097_data_quality_view.sql` | VIEW read-only `data_quality_report` (widget "Salute Dati") | — |
| `098_time_tracking_consolidation.sql` | TIME-01: `time_entries` = fonte unica; trigger alimenta `tasks.logged_hours`; deprecata `task_time_logs`. **Supera la 050** (esegui solo la 098) | — |
| `099_activity_log_uniform.sql` | LOG-01: trigger audit esteso a `decisions`; RLS `activity_log` ristretta a `is_staff()` (era aperta a tutti) | — |
| `100_workspace_security_rls.sql` | Fase 0 sicurezza Workspace: economici (deals/quotes/proposals/invoices) solo admin; VIEW `clients_workspace` (mrr/fiscali azzerati); drop `clients_team_all` | — |
| `101_task_requests.sql` | Fase 1d: stato task `richiesta_supporto` (ALTER CHECK) + `origin_task_id`/`requested_by` per richieste dirette e supporto | — |
| `102_calendar_events.sql` | Fase 2b: mirror `calendar_events` (link cliente/progetto, external_event_id, sync_status) + colonne watch channel su `google_credentials` | — |
| `103_workload_portfolio.sql` | Fase 3: `tasks.start_date` + `profiles.weekly_capacity_hours` (default 40) per intensità reale; disattiva voce sidebar `progetti` (→ Workload) | — |
| `104_workload_sidebar_position.sql` | Sidebar: "Workload" tra "Le mie attività" e "Calendario" (riordino sort_order) | — |
| `105_client_names.sql` | Fase 4a: `clients.display_name` (nome visualizzato, backfill da company_name) + `legal_name` (ragione sociale); aggiorna la VIEW `clients_workspace` | — |
| `156_workspace_adhoc_section.sql` | Voce sidebar workspace "Task Ad Hoc" → `/workspace/ad-hoc` (elenco globale delle attività fuori progetto). Nel portale admin la voce è in `nav-config.ts`, non serve SQL | — |
| `155_project_v2_internal_projects.sql` | Wizard: progetti senza cliente. `client_id` nullable su `projects`/`tasks`/`recurring_task_templates` + `create_project_from_template` accetta client NULL e scrive `start_date`/`end_date` del workstream. Le policy del portale cliente restano valide (NULL non matcha mai) | — |
| `109_item_views.sql` | Operatività Fase 1: `item_views(profile_id,item_id,item_type,seen_at)` RLS own-only per il badge "Nuovo" per-utente + aggiunge `sprints.created_at` (backfill da start_date) | — |
| `159_client_people_team_read.sql` | Anagrafica: `client_contacts`/`client_stakeholders` leggibili da tutto il team interno (erano scoped alle `client_assignments`), esterni scoped ai progetti via `get_my_v2_project_ids()`. Serve perché i manager vedano dal workspace i referenti che aggiungono | — |
| `160_clients_workspace_external_scope.sql` | SEC: la VIEW `clients_workspace` è `security_invoker = false` e filtrava solo su `is_staff()`, quindi freelance/partner vedevano **tutti** i clienti. Ora gli esterni vedono solo i clienti dei progetti di cui sono membri (colonne invariate) | — |
| `161_clients_lost_at.sql` | `clients.lost_at`: data della **prima** perdita, non si azzera se il cliente torna attivo. Serve alla notifica una-tantum di cliente perso (`applyLabelChange` in `app/actions/clients.ts`). Senza, il cambio label funziona ma la notifica può ripetersi | — |
| `162_template_library.sql` | Libreria template: 18 nuovi `project_templates` (ogni voce di catalogo ne ha almeno uno, i principali 2-3) con arco di consegna datato via `relative_due_days`, ore stimate e ruoli suggeriti. Idempotente: salta i template già presenti per (servizio, nome) | — |
| `163_profit_loss.sql` | Conto economico mensile (`pl_months`, `pl_revenue_lines`, `pl_cost_lines`, `pl_config`, `pl_partners`): sostituisce il foglio Excel. Righe **copiate** nel mese, non calcolate al volo: un mese chiuso resta quello che era | — |
| `164_revenue_streams.sql` | `revenue_streams` + `revenue_installments`: un cliente ha più contratti, ognuno con la sua vita (continuativo / a termine / rateizzato). `clients.mrr` non bastava | — |
| `165_project_economics.sql` | Correzione della 164: l'economics sta sul **progetto**, non sul cliente (`revenue_streams.project_id`). Il totale cliente è la somma dei suoi progetti | — |
| `166_sales_owner.sql` | `clients.sales_owner_id` / `sales_owner_name`: il commerciale sta in anagrafica e può essere esterno al tool (segnalatori, partner) | — |
| `167_sales_origin.sql` | `sales_origin`: cliente senza commerciale → il 15% growth si divide fra i soci in parti uguali, non resta in cassa | — |
| `168_revenue_lines_origin.sql` | `pl_revenue_lines.project_id/stream_id/installment_id` + `origin (contratto\|anagrafica\|manuale)`: la riga del mese sa da dove viene, si apre il progetto dal conto economico e si distinguono le righe ancora ferme all'MRR d'anagrafica. Importi sempre copiati | — |
| `169_client_contracts.sql` | Economics nel dominio cliente: `revenue_streams.project_id` torna **nullable** (contratto senza progetto = retainer/quota partner; CHECK: almeno cliente o progetto). `clients.mrr`, `contract_start/end` e `payment_status` diventano **derivati** dai contratti (trigger + cron notturno `sync-client-payment-status`); `clients.mrr_source` dice se il numero viene dai contratti o è ancora quello scritto a mano; `contract_end` diventa nullable (canone indeterminato) | — |
| `170_mrr_only_from_sold.sql` | Correzione della 169: l'MRR deriva solo dai contratti **venduti** (`status <> 'bozza'`). Una quotazione in bozza non riscrive più l'anagrafica (azzerava il canone reale al primo `addStream`). Include la riparazione di Affinity - SofiA (1.800, dall'audit) | — |
| `171_cost_plan.sql` | Piano dei costi: `cost_centers` (aree con budget mensile), `cost_items` (spese ricorrenti con frequenza, F/V, fornitore, validità), `cost_budgets` (tetto per area e mese). `pl_cost_lines` guadagna `center_id`/`cost_item_id` + indice unico (mese, voce) per la generazione idempotente. Seed 6 aree + backfill delle uscite esistenti per categoria | — |
| `172_cost_plan_seed.sql` | Seed del piano dal foglio «P&L_Two Bee.xlsx»: 37 voci reali (preventivato 9.750 €/mese) mappate sulle 6 aree + budget di partenza = somma del piano. Correzioni dichiarate: «PC aziendali» diventa una tantum sospesa, l'outsourcing diventa variabile. Idempotente per (area, voce) | — |
| `173_project_costs.sql` | Subappalti: `cost_items.project_id` + `pl_cost_lines.project_id`. Una lavorazione affidata fuori è una voce di piano che sa a quale progetto appartiene → margine reale per progetto (ricavo del mese − costi esterni). Nessun motore nuovo: eredita frequenze, «Porta nel mese» e budget d'area | — |
| `174_vat_and_terms.sql` | `revenue_streams.payment_terms` + `cost_items.payment_terms` (metodo di pagamento: il subappalto ricalca quello col cliente) · `pl_config.vat_regime` + `vat_interest_pct`: liquidazione IVA trimestrale con l'1% sui primi tre trimestri | — |
| `175_tax_control.sql` | Sezione Fiscale: `tax_config` (IRES/IRAP/ripresa IRAP/quota accantonamento — aliquote in configurazione, non nel codice) + `tax_provisions` (quanto è stato davvero messo da parte, per IVA e imposte). RLS admin | — |
| `176_client_pending.sql` | Terzo stato cliente: `pending` = lavorazioni sospese (CHECK esteso su `client_label`) + `clients.paused_at` (data dell'**ultima** sospensione, si azzera alla ripartenza). Fuori da MRR attivo, conto economico, alert e churn; dentro la relazione | — |
| `177_payment_status_rule.sql` | Regola pagamenti: fattura il 1° del mese, valida 15 giorni. `pagato` = tutte le righe del mese incassate · `in_attesa` = **da pagare**, scoperto entro il 15 · `scaduto` = **non pagato**, dal 16 o con un mese passato scoperto. Lo stato lo determinano le checkbox `paid` delle righe di conto economico e delle rate | — |
| `178_client_type_from_projects.sql` | `clients.client_type` derivato dai progetti (trigger su `projects`): solo digital → `digital`, solo growth/marketing → `growth`, misti → `growth_digital`. Contano i progetti non eliminati, in qualunque stato; senza progetti resta il valore scelto alla creazione | — |
| `180_activity_retention.sql` | Conservazione della cronologia: `activity_config.retention_days` (default **20**, 0 = per sempre) + `purge_activity_log()` e cron notturno alle 3:40. Ogni riga muore N giorni dopo **la sua** modifica, non tutte insieme. `activity_retention_status()` dice se pg_cron sta davvero girando: senza, la finestra è solo un'intenzione e la pagina lo scrive | — |
| `181_payroll.sql` | Personale: `hr_payroll_params` (aliquote per anno, con `verified_at` — finché è NULL la sezione dichiara che stima) + `hr_people` (organico, interni ed esterni). RLS admin, ciascuno legge la propria riga. Alimenta la voce «Persone» del conto economico | — |
| `182_payroll_ledger.sql` | Il cedolino batte la stima: `hr_payslips` (competenze/imponibili/trattenute/oneri datore, con `employer_contrib` NULL = da consulente), `hr_invoices` (imponibile, IVA detraibile o no, ritenuta, importo pagato), `hr_f24` (aggregato, `individual_detail`), `hr_tfr_movements`. Estende `hr_people` (stato, CCNL, IBAN, P.IVA, regime, netto concordato) e aggiunge socio/fornitore. Seed: organico reale + cedolini e F24 di giugno 2026 | — |
| `183_hr_personal_data.sql` | `hr_people`: `birth_date` (l'età decide l'eleggibilità all'apprendistato, under 30), `has_children`/`children_count` (alzano la soglia dei fringe benefit esenti), `dependent_spouse`. Si registra la data, non l'età: un'età nel database invecchia male | — |
| `184_hiring_incentives.sql` | **Agevolazioni**: aliquote 2026 (IRPEF 33% sul 2º scaglione, buono pasto 10 €, premi 1% entro 5.000 €), apprendistato per anno e dimensione, `hr_incentives` (catalogo esoneri con tetti e finestre), campi §184 su `hr_people` (assunzione, mai-stabile, esonero, impatriati, categoria protetta), maggiorazioni di deduzione su `tax_config`, e «Persone» → «Personale» in sola lettura dal piano dei costi | — |
| `185_digital_split.sql` | Primo giro sulla spartizione digital (quota ai soci complessiva): **superata dalla 186**, che legge le colonne nuove. Eseguirla non fa danni, `digital_partners_pct` resta inutilizzata | — |
| `186_digital_partner_quota.sql` | **Spartizione digital definitiva**: sul **margine** (ricavo − subappalti), **28% a ciascun socio** · 6% commerciale · 10% casse TwoBee = 100%. Fondo rischio **opzionale** sopra 20.000 € di progetto: 9% del margine, −3 punti a testa (28→25), scelta dell'admin riga per riga (`pl_revenue_lines.risk_fund`). Il digital non alimenta più target costi e fondo rischio ordinario | — |
| `187_drop_client_package.sql` | Via i pacchetti («Hive Basic», «Worker Bee Start», «Partner Quota»): erano nomi di listino invecchiati e `clients.package` era `NOT NULL`, quindi bloccava ogni cliente nuovo. Ricrea `clients_workspace` senza quel campo e droppa la colonna. Cosa compra un cliente lo dicono i progetti e i contratti | — |
| `188_contract_projects.sql` | `revenue_stream_projects`: un contratto può coprire **N progetti** (iCura paga 3.600 e dentro ci sono lead gen, social e sito), con quota per progetto perché il margine di progetto parte dal ricavo di quel progetto · `pass_through` su contratti e righe: le **partite di giro** (budget ads anticipato) entrano in fatturato e IVA e restano fuori dalle quote del piano compensi | — |
| `179_os_versions.sql` | Cronologia: (a) `log_activity()` legge l'attore dall'header `x-actor-id` — col service role `auth.uid()` è NULL e tutto risultava «Sistema» — e non registra gli UPDATE che non cambiano niente; (b) `os_versions` + `os_version_changes`, il changelog di prodotto con un ciclo di 15 giorni dal 2026-08-01 (v1.0.0), bozze visibili ai soli admin; (c) seed della v1.0.0 con 13 voci | — |
| `189_bank.sql` | Conto corrente: `bank_accounts` + `bank_transactions` (sorgente `banca`/`derivato`/`manuale`), trigger `bank_sync_revenue_line`/`bank_sync_cost_line` (spuntare «incassato» crea il movimento dichiarato) e `bank_on_match` (riconciliare un movimento vero spegne il dichiarato e marca la riga pagata). RLS admin | — |
| `190_bank_vivid.sql` | Secondo conto: `transfer_pair_id`/`transfer_account_id` (i due lati di un giroconto sono un fatto solo), `funding_*` (provvista ricorrente) e `bank_account_centers` (quali aree di costo paga un conto → fabbisogno del bonifico). Seed del conto Vivid collegato a Marketing TwoBee e Struttura & Software | — |
| `193_one_fact_one_line.sql` | **Una rata, una riga**: indice unico su `pl_revenue_lines.installment_id` (l'economics del cliente e quella del progetto leggono lo stesso contratto: due generazioni creavano due ricavi) + trigger `pl_cost_one_shot_guard` — una lavorazione «una tantum» atterra in un mese solo, e serve un trigger perché la frequenza sta su `cost_items` e un indice vieterebbe anche i canoni. Ripulisce prima di vincolare | — |
| `194_digital_pays_structure.sql` | **Il digital paga la struttura**: `pl_config.digital_cost_target_pct` (30% del margine nel target costi) e `digital_partner_pct` da 28% a **18%**. Il margine si distribuisce ancora per intero — 6 commerciale · 18×3 soci · 30 struttura · 10 cassa — ma cambia a chi va: prima il digital non pagava un euro di persone e sede | — |
| `195_manual_movements_pay.sql` | `bank_on_match` usciva su tutto ciò che non era `banca`, quindi agganciare un movimento **manuale** (contante, carta di un socio) a una fattura non marcava niente: la riga restava da incassare e il gemello dichiarato raddoppiava l'uscita. La regola è una sola — `derivato` è una dichiarazione, `banca` e `manuale` sono fatti — e un fatto marca la riga pagata e spegne la dichiarazione. Il saldo **reale** continua a contare solo `banca` | — |
| `196_digital_partner_back_to_28.sql` | **Annulla la 194**: la quota digital di ciascun socio torna al **28%** (25% col fondo emergenza) e `digital_cost_target_pct` a **0**. Il 28% è una decisione presa, non la variabile da cui prendere per far contribuire il digital alla struttura: quella la copre il growth, e la cassa negativa in un mese digital è la conseguenza, non un errore | — |
| `197_client_risk_rewrite.sql` | **Il rischio cliente si calcola, non si conserva**: droppa `clients.risk_score`, `prev_risk_score`, `risk_factors`, `risk_trend`, `risk_updated_at` (più `compute_client_risk`, `trigger_update_risk` e i quattro trigger della 014, dove sono sopravvissuti) e ricrea `clients_workspace` senza quelle colonne. Il motore è `lib/risk.ts`, in lettura. Non è un prerequisito: senza, l'app funziona già — le colonne restano lì e nessuno le legge | — |
| `191_bank_partner_pockets.sql` | Sottoconti dei soci: `bank_accounts.parent_id`/`owner_partner_id`/`allowance_amount`, `pl_cost_lines.partner_id` + `deductible_pct`/`vat_deductible_pct`, area «Spese soci», Klaviyo a 0 (piano gratuito). I 500 €/mese a socio **sono erogato**, non un costo in più: escono come spesa della società per recuperarne IVA e deducibilità | — |
| `207_payout_lines.sql` | **§243 — applicata** (verificato sul database il 2026-09-15: `pl_payouts` risponde). `pl_payouts`: i compensi a soci e commerciali come righe spuntabili. Importo copiato dal piano, maturazione nel mese e uscita in quello dopo (`due_month`), `paid_on` scritto dal trigger con la data di oggi. Senza, la sezione Compensi resta in sola lettura come prima | — |
| `206_vat_settlements.sql` | **§242 — applicata** (verificato sul database il 2026-09-15: `vat_settlements` risponde). `vat_settlements`: la liquidazione IVA come la dice il modello F24. Dove c'è, vince sulla stima di `lib/vat.ts`; la differenza resta visibile e dice quanto fatturato manca al conto economico. Seed del 2º trimestre 2026: 9.669,33 contro gli 8.399,87 stimati | — |
| `205_settled_from.sql` | **§230 — applicata** (verificato sul database il 2026-09-15: `pl_config.settled_from` risponde). Rinomina `payout_from` in **`settled_from`**: la linea del consolidato è una sola e vale per tre cose — compensi liquidati, spunte non certificate accettate, organico dei mesi vecchi non rincorso. Una colonna che dice meno del suo contenuto è il modo in cui il prossimo se ne inventa un altro uso | — |
| `204_payout_from.sql` | **§227 — applicata il 2026-08-08.** `pl_config.payout_from` (seed 2026-07-01): da quale mese si contano i compensi maturati verso soci e commerciali. Prima è liquidato. Senza, il registro conta da sempre e mostra a ciascuno un anticipo che non esiste | — |
| `212_payout_window.sql` | **§285/§286 — applicata il 2026-08-13.** `cost_items.installment_id` e `pl_cost_lines.installment_id`: la tranche di subappalto dichiara **quale rata del cliente finanzia**, e il margine digital la toglie da quella riga invece di spalmarla sul progetto. Più `pl_config.payout_day` (default 20) e `pl_months.payout_date`: la data dell'erogazione, che decide quali incassi entrano nella distribuzione. Backfill del legame per coda del nome, dove la corrispondenza è una sola. Senza, l'attribuzione resta proporzionale (§208) e la data cade sul giorno di default | — |
| `216_missing_unique_indexes.sql` | **§313 — applicata il 2026-08-21.** Due indici unici che il registro dava per esistenti e sul database non c'erano: `payslips(profile_id, year, month)` (la 088) e `item_views(profile_id, item_id, item_type)` (la 109). Il reset del 2026-07-23 ha ricreato le tabelle e se li è portati via — §222 nella forma pura. Deduplica **prima** di vincolare: un indice unico su una tabella con duplicati non passa. Senza, caricare una busta paga falliva con `42P10` | — |
| `218_client_lead.sql` | **§321 — applicata il 2026-09-07.** Sesto stato del cliente: `lead` nel CHECK di `client_label`. Non è ancora un cliente — fuori da MRR, conto economico, alert e rischio come la `pending` (§176) — e **non è un perso**, quindi non conta nel churn. Nasce dal composer di una task ad hoc, scrivendo un nome che in anagrafica non c'è. Additiva e idempotente: allarga un CHECK, non tocca una riga. Verificata col metodo di §313: un insert con valori finti risponde `23503` (il CHECK conosce «lead») e `23514` su una label inventata, senza scrivere niente | — |
| `219_invoice_states.sql` | **§323 — applicata il 2026-09-09.** Lo stato di una fattura e la nota che la storna. `invoices.sent_on` (l'invio, dove a saperlo è solo una persona), `invoices.from_sdi` **generata** da `raw_xml IS NOT NULL` (il file è la prova del transito: uno stato che si può digitare è uno stato di cui fidarsi a metà), `invoices.rectifies_id`, la tabella `invoice_related` con `DatiFattureCollegate` come il documento lo dichiara, e `link_invoice_rectifications()` che risolve il legame per numero e controparte — non per importo, perché una nota parziale ha un importo diverso ed è il caso in cui il legame serve di più. Rilanciabile come `link_invoices_to_clients`. Additiva: nessuna riga cambia valore, li cambia lo script | `scripts/fix-invoice-states.ts --scrivi` |
| `223_recurring_milestones.sql` | **§337 — applicata il 2026-09-15** (verificato: la tabella e le tre colonne rispondono, i 185 template task sono passati a 30 giorni di finestra, e `generate_recurring_task_occurrences()` risponde 404 — il motore SQL è ritirato). `recurring_milestone_templates` (la regola che genera le tappe ricorrenti) + `recurring_template_id`/`generated_for_date`/`is_recurring_instance` su `milestones`, con l'indice unico parziale che rende sicuro rigenerare. Alza a **30** la finestra di generazione delle task (era 3: chi riceve una ricorrente non la vedeva finché non era da fare oggi) e **ritira il motore SQL** — `generate_recurring_task_occurrences()` e la sua schedulazione `pg_cron`. Quella funzione non è mai partita: la 152 la schedulava dentro un `EXCEPTION WHEN undefined_function`, pg_cron su questo database non c'è, e il risultato misurato era **185 template attivi, zero occorrenze, `last_generated_at` NULL su tutti**. La regola vive ora in `lib/recurrence.ts`, dove è pura, ha un gate e serve anche alla pagina. Senza questa migration: le tappe ricorrenti non esistono (il pannello resta vuoto e il caricamento le salta senza rompersi), e le task continuano a generarsi a 3 giorni | env Coolify **`RECURRENCE_CRON_SECRET`** + task pianificato su `/api/recurrences/run` |
| `222_sales_split.sql` | **§330 — applicata il 2026-09-14** (verificato: le due colonne rispondono, e la sola riga marcata è l'acconto di kick-off di iCura, 20.000 €). `sales_split` su `pl_revenue_lines` **e** su `revenue_streams`, booleano a `false`. Dice che la provvigione di quella riga si divide fra i soci in parti uguali **anche se un commerciale c'è**: il nome resta scritto — è il riferimento del cliente — e cambia solo la tasca. Prima l'unico modo di ottenere la divisione era marcare la riga `sales_origin = 'inbound'`, cioè **cancellare il commerciale** per far tornare un numero. Sta su due tabelle perché è dell'accordo, non del mese: `contractDrift` (§207) la riporta dall'accordo alle righe dei mesi aperti, e le rate future nascono già con la scelta presa — una scelta da rifare a mano su ogni rata è una scelta che qualcuno dimentica, e il mese in cui la dimentica il numero resta plausibile. Additiva: senza di lei il codice legge `false` ovunque e il piano compensi si comporta come prima, ma **il pulsante «divisa?» e la casella sul contratto danno errore** | — |
| `220_client_segments.sql` | **§326 — applicata il 2026-09-09.** `clients.internal_kind` ('giro' | 'progetto'), che spacca `is_internal` nelle due cose che ci stavano dentro: le società collegate che fatturano davvero (GAV Sistemi, partita IVA e una fattura emessa) e i marchi interni che non fatturano mai (Twobee, Metroquadro, Visionark, Costruisci e arreda). Il backfill segue i **documenti**, non i nomi: chi ha una fattura è un giro — e infatti ha diviso 1 giro (GAV Sistemi) da 4 progetti (Twobee, Metroquadro, Visionark, Costruisci e arreda). Verificata col metodo di §313: un insert con `internal_kind` inventato risponde **23514**, uno con `giro` passa, e nessun cliente vero ha preso un genere. Additiva; senza di lei `segmentOf` mette tutti gli interni fra i giri, che è il default prudente | — |
| `217_tracking.sql` | **§316 — applicata il 2026-09-02** (pooler, script node; verificato: 3 tabelle deny-all senza grant ad anon/authenticated, 7 con policy staff, voce workspace con 6 permessi). Modulo Tracking (port di «arealavoro»): `client_tracking` (satellite 1:1 di clients), `tracking_checklist_state`, `tracking_checks`, `tracking_qa_results`, `tracking_qa_runs`, `tracking_report_runs`, `tracking_report_rows` con RLS `is_staff()`; **`client_platform_keys`, `client_logins`, `agency_platform_keys` con RLS attiva e NESSUNA policy + REVOKE** (deny-all, solo service role, come 091/115 — non aggiungere policy). Più la voce `tracking` in `workspace_sections` (gruppo clienti) e i permessi. Additiva e idempotente | env Coolify **`VAULT_KEY`** e **`TRACKING_CRON_SECRET`** (runtime), task pianificato 07:00 |
| `215_f24_documents.sql` | **§301 — applicata** (verificato sul database il 2026-09-15: `f24_documents` risponde). `f24_documents` + `f24_lines`: il modello F24 come documento, coi suoi tributi. Ogni riga dichiara a quale mondo appartiene (`iva`, `ritenute`, `inps`, `inail`, `credito`, `altro`) e punta al dominio che ne è l'autorità — `vat_settlements` per l'IVA (§242), `hr_f24` per il resto (§182). Il `credito` **si sottrae**: è l'indennità L. 207/2024 che esce in busta e rientra (§235). `payment_allocations.f24_id` come quarto bersaglio, col CHECK rifatto a «uno solo fra quattro». Trigger `f24_lines_balance` **deferred**: il totale versato deve essere la somma dei debiti meno i crediti, ma un modello nasce vuoto e si compila una riga alla volta. Senza, i modelli non hanno un posto e la sezione lo dichiara | — |
| `214_payment_allocations.sql` | **§297 — applicata** (verificato sul database il 2026-09-15: `payment_allocations` risponde). `payment_allocations`: quanto di un movimento paga quale riga. Un movimento ha N allocazioni, una riga ne ha N, e ognuna dice se la certifica la banca o se è solo dichiarata. CHECK a un target solo (ricavo, costo, compenso), indice unico per (movimento, target) e **trigger `alloc_within_tx`** che vieta di allocare più di quello che il movimento contiene. Backfill dai legami diretti esistenti, con l'importo tagliato al minore fra il lordo del movimento e quello della riga. `bank_transactions.revenue_line_id`/`cost_line_id` restano: si droppano quando nessun chiamante li usa. Senza, il legame resta uno a uno e l'azione lo dichiara | — |
| `213_carry_forward.sql` | **§290 — applicata** (verificato sul database il 2026-09-15: `pl_revenue_lines.carried_at` risponde). `carried_at`/`carried_from`/`carry_count` su `pl_revenue_lines` e `pl_cost_lines`: la chiusura del mese marca le righe non saldate invece di lasciarle dedurre da `openAt`. La riga **resta nel suo mese** — fattura, IVA e compensi di quel mese sono già stati dichiarati fuori — e il segno dice da quante chiusure si trascina. Backfill delle scoperte nei mesi già chiusi. Senza, il mese si chiude come prima e il trascinamento resta quello dedotto | — |
| `203_cash_calendar.sql` | **§224 — applicata il 2026-08-08.** `terms`/`due_date`/`paid_on` su `pl_revenue_lines` e `pl_cost_lines` + trigger che scrive la data di oggi quando si spunta «pagato». Backfill delle righe già spuntate **alla loro scadenza**: il costo del lavoro di giugno smette di pesare su giugno e passa a luglio. Senza, l'app funziona identica e la cassa resta quella di prima | — |

**Scorciatoia**: `supabase/APPLY_PENDING.sql` è il concatenato (081, 086–093) in
transazione, da incollare una volta sola nel SQL Editor. Bucket privati da creare
a mano: `payslips`, `personal-documents`, `best-ideas`. Le env Google
(`GOOGLE_CLIENT_ID/SECRET`, `NEXT_PUBLIC_APP_URL`) sono già presenti.

Finché non le esegui l'app **non si rompe**: le pagine mostrano `SetupNotice`
e le funzioni nuove degradano con un messaggio. I bucket vanno creati a mano
(le migration non li creano).
