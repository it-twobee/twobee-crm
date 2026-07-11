# WORKSPACE_AUDIT — Refactor Portale Workspace TwoBee OS

> Fase 1 (audit read-only). Nessuna modifica al codice. Metodo: 12 lettori paralleli
> sul codice reale + verifiche dirette. 7 aree con audit profondo (auth, shell, task,
> project, workload, calendar, docs); 5 aree (client, customer-care, hr, cronologia/profilo,
> data-quality) con audit più leggero — segnate ⚠️ dove serve un secondo passaggio.
> Alla fine: sole domande bloccanti. **Non si implementa nulla senza approvazione.**

---

## 0. Verdetto in una riga
Il Workspace **è già una vista role-based sugli stessi dati reali** (nessuna entità
`workspace_*` parallela: usa `clients/projects/sprints/tasks/task_assignees`). I problemi
non sono "dati mancanti" ma **quattro debiti trasversali**: (1) il dominio task è
frammentato in 4 editor diversi; (2) le barriere economiche sono solo UI, non RLS;
(3) Calendario e Drive non hanno vera integrazione (no sync, no API Drive); (4) molta
logica è duplicata Admin↔Workspace e dentro `ProjectPageClient` (monolite ~2980 righe).

---

## 1. Gerarchia dati — stato reale
La gerarchia della spec **esiste già nel DB** ed è coerente:

```
clients ─┬─ projects ─┬─ sprints ─┬─ tasks(is_milestone=true) [milestone]
         │            │           └─ tasks(milestone_id) ─ tasks(parent_task_id, depth 0|1|2) [subtask]
         │            └─ manager_id (PM)
         └─ client_assignments (cliente↔utente)
task_assignees(task_id, profile_id, is_primary_owner)  ← 0..N owner; tasks.assignee_id = primario
```
- `tasks.status` CHECK **stretto**: `('da_fare','in_corso','in_revisione','completato')`. Aggiungere `richiesta_supporto` (§6.3) richiede ALTER additivo del CHECK.
- `tasks.depth` CHECK `(0,1,2)` → subtask limitati a **2 livelli** (la spec ne disegna 2: coerente).
- `is_client_task` (058) già usato dal Portale Cliente (RLS `tasks_client_read`, 059).
- `os_tasks` è un dominio **separato** (Command Center /twobee-os), da NON confondere col task domain.

---

## 2. Rotte Workspace reali + sidebar
Rotte `/workspace/**`: `` (home), `attivita`, `progetti`, `progetti/[projectId]`, `clienti`,
`clienti/[id]`, `calendario`, `workload`, `portfolio`, `documenti`, `documenti-personali`,
`buste-paga`, `customer-care`, `customer-care/tickets`, `hr`, `feedback`, `cronologia`,
`profilo`. Redirect-only: `chat`→`customer-care`, `task`→`attivita`.

**Sidebar** = DB-driven: `workspace_sections` + `workspace_section_permissions` (per `app_role`,
`can_view/create/edit/delete`), lette in `app/(workspace)/layout.tsx`, rese da `WorkspaceSidebar`.
Gruppi via `group_key/group_order` (087). Collapse in `localStorage`. **Questo è il punto unico
per rinominare/nascondere voci senza deploy** (rende §9/§21 attuabili via UPDATE, non hardcode).

Incoerenze dato↔UI: le voci `chat` e `task` restano `is_active=true` in DB e sono nascoste solo
da un array hardcoded `HIDDEN_WORKSPACE_KEYS` nel layout. `progetti` ha ancora label "Progetti
attivi" mentre §9 la vuole "Workload". `customer_care` è seedato due volte (081+087) con icone
divergenti.

---

## 3. Differenze spec ↔ implementazione (per area)

### 3.1 Task domain (§5, §7) — 🔴 frammentato
- **4 editor task LIVE e diversi**: `MieAttivitaClient` (pannello laterale 320px, con Link/tag, **senza** subtask/commenti/ore), `ProjectPageClient` `TaskDetailModal` (modale, multi-assegnatario), `SprintMilestoneBoardSection` `TaskDetailModal` (copia quasi identica, usata da /reparti), `RisorsaTasks` (nessun drawer). **Nessun `TaskDrawer` condiviso.**
- L'UNICA UI con tutte le tab (Subtask/Commenti/Ore/Dipendenze) è `KanbanBoard` `TaskDetailPanel` che però è **DEAD CODE** (TaskHub non montato).
- **Write-path owner incoerente**: `MieAttivitaClient.bulkAssign` e `updateTask`, e `KanbanBoard`, scrivono `tasks.assignee_id`/`task_assignees` **direttamente** bypassando `setTaskAssignees` → viola la regola CLAUDE.md e rischia desync `assignee_id ↔ task_assignees`.
- **Conteggi completate (§7.1)**: la stringa è coerente (`'completato'` ovunque, nessun `done/completata/archiviato` sulle task) ma la condizione è **inline in 20+ punti**; manca un helper `isTaskDone`/`TERMINAL_TASK_STATUS`. Gap di robustezza, non di correttezza attuale.
- **Page duplicata**: `le-mie-attivita/page.tsx` ≡ `workspace/attivita/page.tsx` (diff = nome funzione).

### 3.2 Dominio Progetto (§15–20) — 🟠
- **CTA "Crea" unica assente** (§15): 4 bottoni separati; la precompilazione parent esiste ma non c'è entry-point unico.
- **Brief (§15.1)**: sempre editabile, nessun view/edit-mode; template/AI/genera-piano sempre visibili per admin.
- **Gantt (§15.2)**: sempre espanso; tooltip solo `title` (no intervallo/owner/stato); hover **duplicato**, non condiviso col Workload. `SprintTimeline` e `GanttChart` reimplementano lo stesso calcolo. Colori hardcoded (`#111`, `#22C55E18`, `white`) → violano il design system.
- **Drawer sprint/milestone/task (§15.3)**: assente; solo `TaskDetailModal` sulle task foglia + editing inline eterogeneo.
- **Appuntamenti (§16)**: finestra **60gg** (spec: 20); matching solo `title.includes(project.name)` (no cliente, no normalizzazione); ignora la tabella `project_appointments` (che pure viene caricata → dati orfani).
- **Riunioni (§17)**: `/api/parse-file` legge il file in-memory senza persisterlo (✅), ma le azioni AI restano **testo libero** in `meeting_notes.next_actions`; **non** genera task suggerite modificabili/confermabili.
- **Task cliente (§20)**: ✅ largamente conforme (preview select/deselect, `is_client_task`, portale cliente). Unico scostamento: gli item AI/template non sono inline-editabili **prima** della conferma (solo la modalità Manuale).
- **Board sprint/milestone DUPLICATO**: `ProjectPageClient` vs `SprintMilestoneBoardSection` (usato da /reparti).

### 3.3 Workload (§9) — 🔴 vista base, mancano i pezzi "strategici"
- `WorkloadClient` condiviso admin/workspace (✅ buon riuso). Viste: Progetti, Timeline (**solo settimanale**, cap 16 settimane hardcoded), Risorse.
- **Manca**: intensità futura con finestre 7/14/30/60/90; scale giorno/mese/anno/sprint/milestone; hover ricco (solo `title`); milestone (escluse ovunque); rilevamento conflitti; collasso persistito; **AI planning (assente del tutto)**.
- **Default 4h spacciato per reale** (§9.3): `estimated_hours ?? 4` senza warning; `sprints` e `team_leaves` esistono ma **non vengono letti** → l'intensità non riflette capacità né assenze reali. Nessuna `tasks.start_date` → effort puntuale sulla `due_date`, non spalmato.
- "Progetti attivi" (§9): coesistono **due voci** nav (`progetti` = lista + `workload` = timeline); la rinomina non è avvenuta.

### 3.4 Calendario + Google (§8) — 🔴 no gate dominio, no sync
- **§8.1 gate @twobee.it ASSENTE lato server**: `/api/google/auth` e `/callback` non controllano l'email → qualsiasi utente autenticato (anche client/guest) può collegare Google e salvare token.
- **§8.2 form**: `CalendarEventForm` non esiste; due form separati e divergenti (`EventEditorModal` in `CalendarioClient` vs modale in `AppuntamentiTab`). Mancano timezone-in-UI, ricorrenza, promemoria, colore, associazione cliente/progetto.
- **§8.3 sync bidirezionale ASSENTE**: nessuna tabella `calendar_events`, nessun `external_event_id/sync_status/last_synced`; letture live a ogni GET, scritture dirette su `primary`. Il token rinnovato in memoria **non è ripersistito**. Timezone hardcoded `Europe/Rome`.
- ✅ Le task **non** vengono inviate a Google (solo overlay interno) — conforme.

### 3.5 Documenti / Drive (§11, §23, §31, §32) — 🔴 nessuna integrazione Drive reale
- **Drive è solo embed iframe** (`DriveEmbed`, `embeddedfolderview`) di link incollati a mano. Nessun OAuth scope `drive`, nessuna chiamata `drive.files`, nessun albero espandi/collassa/breadcrumb/ricerca dell'app. → l'alberatura §11.1/§23 **va costruita** (API Drive) o resta l'iframe.
- **`DocumentsTab` carica su storage con `getPublicUrl` (URL PUBBLICO permanente)** → i documenti cliente sono accessibili senza auth da chiunque abbia il link. Da rimuovere per §23 (Drive-only) preservando gli upload di buste-paga.
- La tabella `documents.file_url` **mescola** URL storage pubblici e link Drive senza campo discriminante.
- **Buste paga (§31)**: ✅ signed URL 60s, admin-only, mai pubblico. **Documenti personali (§32)**: solo promemoria scadenza; `file_path/file_name` sono **colonne morte** → manca upload+signed URL. Nessuna policy `storage.objects` in migration per i bucket privati (rischio operativo).

### 3.6 Cliente (§12–14, §24, §26) — 🟠 ⚠️
- `ClientPageClient`/`ClientiList`/tabs riusati Admin↔Workspace via flag `hideEconomics` (✅ riuso, ma è l'unica barriera economica UI — vedi §3.8).
- **Anagrafica (§24)**: `clients.company_name` è l'unico campo nome; **mancano `display_name` e `legal_name`** (da aggiungere, additivo). `canSeeAnagrafica=true` per `senior` → un senior vede P.IVA/dati fiscali (verificare perimetro).
- **Knowledge (§26)**: esiste `client_knowledge` (066) + `ClientKnowledgeTab` + `client-knowledge.ts`. ⚠️ Va verificato se è già strutturato (Mercato/Competitor/Brand/SWOT/Offerta/Idee/Strategico) o un form generico; l'area **Marginalità** riservata a founder/admin va progettata con RLS.
- §13/§14 (rimuovere link "Tutta", "Progetti attivi" come tab autonoma) — ⚠️ da verificare in `PanoramicaTab`.

### 3.7 Customer Care / Ticket / Chat (§21, §27, §28) — 🟠 ⚠️
- **§28 bug active-state confermato**: `WorkspaceSidebar.isRouteActive` usa `pathname.startsWith(route)` senza boundary → su `/customer-care/tickets` sia `customer_care` sia `ticket` risultano attivi (entrambi gialli). Fix: match esatto o `startsWith(route+'/')` + gestione prefissi.
- **§21 chat**: nav già conforme (solo Customer Care; `chat`/`task` nascoste; nessun DM/#best-ideas in sidebar). Residuo: `chat` resta `is_active=true` in DB.
- **§27 AI Customer Care**: `cc-ai.ts` + `CustomerCareClient` esistono. ⚠️ Da verificare che sia interno-only (CTA "Suggerisci azioni", non invia messaggi né crea task in automatico) e "Aggiungi persone" collassato.

### 3.8 Sicurezza economica (§3) — 🔴 barriere solo UI, non RLS
Debito trasversale più serio. `is_staff() = get_my_role() IN ('admin','team')` → **i ruoli workspace SONO 'team'** e la RLS concede loro lettura di:
- `clients` **incl. `mrr`** (`clients_team_all`, 092) — le page fanno `.select('*')` → mrr entra nel payload RSC anche con `hideEconomics`.
- `invoices` dei clienti assegnati (`invoices_team_read`, 002).
- `quotes` **con margini** `total_cost/target_margin/margin_amount` (`quotes_staff` = `is_staff()`, 059/064).
- `proposal_documents` (`proposals_staff`, 065) e `deals/deal_activities` (`*_staff`, 059).

→ Un utente team può leggere questi dati via **query Supabase diretta** col proprio token, pur non vedendoli in UI. ✅ Correttamente chiusi ad `admin`: `resource_costs/project_cost_entries/business_costs` (063/075), `payslips` (088). **Nota `hr-attachments` usa `getPublicUrl`** (§3.9).
Fix strutturale: separare le policy per-tabella su `get_my_role()='admin'` invece di `is_staff()`, e/o VIEW `clients_workspace` senza colonne economiche + rimuovere i `.select('*')` dalle query workspace. Non risolvibile con sola RLS row-level (mrr è una colonna).

### 3.9 HR / Feedback (§29, §30) — 🟠 ⚠️
- **§29**: `WorkspaceHR` HA un upload (`hr-attachments`) gated a `type==='spesa'`, e usa **`getPublicUrl`** (privacy). La spec chiede di rimuovere "Caricamento documento HR" dalla sezione richieste (mantenendo ferie/permessi/malattia/approvazioni). Nota: c'è anche `HRClient` (usato in EMPTY-01) — ⚠️ verificare quale rende la sezione Richieste HR.
- §30 Feedback: ✅ da solo verificare (submit/stato/notifica/ownership).

### 3.10 Cronologia / Profilo (§33, §34) — 🟠 ⚠️
- **Cronologia (§33)**: `activity_log` popolato da trigger DB `log_activity` (esteso a `decisions` in LOG-01/099). Ha `snapshot` (stato nuovo/vecchio) + `diff` `{campo:{old,new}}` ma **non** i campi spec `reversible/restored_at/restored_by/before_snapshot/after_snapshot/changed_fields`. `restore-entity.ts` **esiste già** e ripristina da snapshot. → Restore parziale c'è; mancano flag reversibilità e audit del ripristino, + retention 30gg (§33.2).
- **Profilo (§34)**: `ProfiloClient` **mostra già `email`** (riga 75) e ha il campo **"Competenze"** (riga 98, da rimuovere dalla UI senza droppare colonna). UX griglia da migliorare.

---

## 4. Componenti duplicati / da riutilizzare (sintesi)
| Duplicato | Riuso corretto invece |
|---|---|
| 4 editor task (MieAttivita/ProjectPageClient/SprintMilestoneBoard/Risorsa) | **Estrarre `<TaskDrawer>` unico** componendo `AssigneePicker`+`SubtaskList`+`TaskComments`+`TimeTracker` |
| `le-mie-attivita/page` ≡ `workspace/attivita/page` | Una page, param portale |
| Board sprint/milestone (ProjectPageClient vs SprintMilestoneBoardSection) | Un board condiviso |
| 2 form evento (EventEditorModal vs AppuntamentiTab) | **`CalendarEventForm`** unico |
| Hover Gantt (ProjectPageClient) vs Workload | Tooltip condiviso |
| Mappa ruoli inline ×4 (middleware/layout/buste-paga/ClientPageClient) | `lib/permissions.ts` unica fonte |
| `canSeeMrr` definito in 2 punti con regole diverse | Helper unico |
| Codice morto `TaskHub/KanbanBoard/ListView/GanttView` | Rimuovere (dopo verifica) |

**Write-path canonici già pronti da riusare ovunque**: `task-assignees.ts`, `workload-tasks.ts` (authz+service role), `payslips.ts` (signed URL+authz), `data_quality_report` (097), helper RLS `is_staff/get_my_role/get_my_client_ids/is_founder`, `documents.visibility` (080, modello per proteggere `clients.mrr`).

---

## 5. Data quality (§35)
Già in `data_quality_report` (097): progetti senza PM, task senza owner/stima/scadenza/sprint, clienti senza assignment/progetti. Da aggiungere: milestone senza sprint, subtask orfane, progetti senza membri, eventi non sincronizzati, documenti Drive senza folder id, risorse senza profilo. Inquinanti noti: default 4h mostrato come reale; `documents.file_url` promiscuo; `personal_documents.file_path` colonne morte; `project_appointments` orfana; `client_assignments` vuota (da sessione precedente).

---

## 6. Rischi tecnici principali
1. **RLS economica**: separare `is_staff()`→`admin` su quotes/deals/proposals/invoices tocca anche l'Admin (che è `is_staff`); va fatto per-tabella con test per ruolo. Restringere `clients` richiede VIEW o select espliciti (mrr usato in sort/filter di `ClientiList`).
2. **`ProjectPageClient` monolite ~2980 righe** con mutazioni DB client-side inline: estrarre drawer/CTA richiede prima spostare le scritture su server action (rischio regressione su drag-reorder e sync assignees).
3. **Calendar sync & Drive API**: entrambe **da costruire** (tabella eventi + webhook/polling; OAuth scope drive + riconsenso di tutti gli utenti). Sono i due pezzi più grossi e meno incrementali.
4. **Bucket privacy**: nessuna policy `storage.objects` in migration; `documents` e `hr-attachments` usano URL pubblici.
5. **`middleware` salta `/api/*`**: ogni endpoint (incl. quelli economici `margin-analysis/cost-suggestions`) deve autenticare da sé.

---

## 7. Piano di intervento per fasi (mappato a spec §36)
Ordinato per dipendenze e rischio. Ogni fase = PR atomiche, tsc+build verdi, test per ruolo, e i 3 doc (PLAN/CHECKLIST/CHANGELOG).

- **Fase 0 — Fondamenta sicurezza (nuova, prima di tutto)**: chiudere le RLS economiche (§3/§3.8), gate @twobee.it server-side (§8.1), policy `storage.objects` + rimuovere URL pubblici (documents/hr). *Senza questa, ogni feature nuova eredita le falle.*
- **Fase 1 — Task domain condiviso**: `<TaskDrawer>` unico + `TaskEditor`/helper stati terminali; write-path solo via `setTaskAssignees`; task cliccabili ovunque; unificare le page duplicate; richieste Admin→Risorsa e Richiesta supporto (nuovo stato `richiesta_supporto`, ALTER CHECK).
- **Fase 2 — Calendario**: `CalendarEventForm` unico; sync bidirezionale (tabella + external id + stato); overlay task; form da progetto.
- **Fase 3 — Workload**: rinomina "Progetti attivi"→Workload; collasso persistito; griglia+timeline multi-scala; intensità reale (finestre, sprints, team_leaves) con warning stime; AI planning (propone, non applica).
- **Fase 4 — Cliente/Progetto**: CTA "Crea" contestuale; tab "Progetti attivi" autonoma; Brief view/edit; Gantt collassabile + hover condiviso; drawer su sprint/milestone; Appuntamenti 20gg + matching normalizzato; Riunioni→task; anagrafica display/legal.
- **Fase 5 — Documenti & Knowledge**: Drive-only + albero; redesign Knowledge + Marginalità protetta.
- **Fase 6 — Customer Care & nav**: AI interna; "Aggiungi persone" collassato; fix active-state Ticket; deprecare chat interne v1.0 (a livello DB).
- **Fase 7 — HR/Cronologia/Profilo**: rimuovere upload HR; bucket; restore + retention; profilo UX + email read-only + rimuovere Competenze UI.
- **Fase 8 — Stabilizzazione**: RLS per ruolo, build/typecheck, responsive, a11y, regressioni, data quality.

⚠️ **Requisito trasversale**: ogni sezione Workspace deve funzionare identica nel portale Admin (riuso stesso componente con flag portale, non fork).

---

## 8. Domande bloccanti (non risolvibili da codice/DB)
Raccolte e deduplicate dalle 7 aree + verifiche. Le porto in chat separatamente per la decisione.

**Sicurezza/perimetro**
1. La **pipeline commerciale** (`deals/deal_activities`) e i `proposal_documents` sono INVISIBILI ai ruoli workspace, o solo la marginalità (`quotes`) è vietata? (§3 non elenca `deals`).
2. Le **invoices**: il team assegnato a un cliente può vedere lo **stato pagamento** (utile al CC) o zero accesso in ogni forma?
3. La tab **Anagrafica** (P.IVA/fiscali) è in perimetro per `senior`, o solo admin?
4. Il **gate @twobee.it** per Google vale per TUTTO lo staff, o freelance/partner con email non-@twobee.it vanno ammessi con whitelist?

**Modello dati/prodotto**
5. **Capacità risorsa** per l'intensità Workload: 40h fissi o campo per part-time/freelance (oggi assente)?
6. **Intensità**: effort spalmato su un intervallo (serve `tasks.start_date`, oggi assente) o puntuale sulla `due_date`?
7. **Assenze** (`team_leaves`): solo `approvato` o anche `in_attesa`? Visibili a tutti o solo aggregate/anonime (come "Occupato" di Google)?
8. **Calendar sync**: realtime (webhook Google) o polling/cron? Solo `primary` o multi-calendario? Ricorrenza/promemoria persistiti in locale o passthrough Google?
9. **Drive**: costruire integrazione API reale (OAuth scope drive, albero navigabile, ricerca) o resta l'embed iframe di link incollati?
10. **Documenti storage esistenti** (bucket pubblico `documents`): migrare su Drive, cancellare, o read-only in transizione?

**Task/flussi**
11. Il **drawer unico** include Subtask+Commenti+Ore anche in "Le mie attività" (oggi assenti) o resta più leggero lì? E per le task cliente nel portale cliente: esposto al ruolo `client` (campi ridotti) o read-only?
12. **Richieste Admin→Risorsa** e **Richiesta supporto** (§6.2/§6.3): gestite via `tasks`+`notifications` esistenti o serve tabella dedicata additiva? Alla conferma diventano task collegate (`origin_task_id`)?
13. **Appuntamenti** (§16): finestra 20gg (spec) o 60 (codice)? Matching AND (cliente E progetto) o OR? Restare 100% Google o ripopolare `project_appointments`?
14. **Riunioni** (§17): le task generate sono interne o cliente? Con quale sprint/milestone di default?

**Ambiente**
15. Le migration pendenti (087/095 e 096–099) sono **già applicate in produzione**? Determina se i fix §9/§21 passano da `workspace_sections` o dai fallback hardcoded.
16. **Stati task**: i 4 attuali sono definitivi o va progettato l'helper stati terminali come estendibile (per `richiesta_supporto` e futuri `annullato/archiviato`)?

---

## 9. Note di metodo
- Audit profondo (agenti dedicati): auth, shell, task, project, workload, calendar, docs.
- Audit leggero (verifica diretta, ⚠️ nel testo): client/knowledge, customer-care/AI, hr, cronologia/profilo, data-quality economica (quest'ultima ampiamente coperta dall'agente auth).
- Il workflow ha esaurito il limite di sessione su 5/12 agenti (reset 19:10): le aree ⚠️ meritano un secondo passaggio di verifica **prima di implementarle**, ma i gap e le domande bloccanti qui elencati sono sufficienti per decidere il piano.
