# WORKSPACE_IMPLEMENTATION_PLAN

> Piano maestro del refactor Portale Workspace TwoBee OS. Mappa OGNI sezione della
> spec (§1–§39) alla fase che la realizza, con stato. Fonte: WORKSPACE_AUDIT.md +
> WORKSPACE_DECISIONS.md. Dettaglio per-fase e output §37 in `WORKSPACE_FASE<N>_PLAN.md`.

## Principi trasversali (validi in ogni fase)
- **§2 Fonte unica**: nessuna entità `workspace_*` parallela — vista role-based su `clients/projects/sprints/tasks`.
- **§4 Regole**: riuso prima di ricreare, migration additive/idempotenti, no RLS permissive, no URL pubblici per file sensibili, no dato economico al Workspace, tsc+build verdi, test per ruolo.
- **§3 Sicurezza multi-layer**: UI + Server Action + API + query + RLS.
- **Parità Admin↔Workspace**: stessa sezione, stesso componente con flag portale (no fork).

## Roadmap (9 fasi)

| Fase | Sezioni spec | Stato |
|---|---|---|
| **0 — Sicurezza** | §3, §38.38 | ✅ **fatto** (mig. 100) |
| **1 — Task domain** | §5, §6.1(parziale), §6.2, §6.3, §7.1, §7.2 | ✅ **fatto** (mig. 101) |
| **2 — Calendario** | §8, §8.1, §8.2, §8.3, §16, §16.1 | ⏳ prossima |
| **3 — Workload + Portfolio + Dashboard strategica** | §9 (+sotto), §10, §6.4 | ⏳ |
| **4 — Cliente/Progetto** | §12, §13, §14, §15 (+sotto), §17, §20, §24, §6.1(completa) | ⏳ |
| **5 — Documenti & Knowledge** | §11, §11.1, §23, §26, §26.1, +0d storage | ⏳ |
| **6 — Customer Care & nav** | §21, §27, §27.1, §27.2, §28 | ⏳ |
| **7 — HR/Cronologia/Profilo** | §29, §31, §33, §33.1, §33.2, §34 | ⏳ |
| **8 — Stabilizzazione + verifiche** | §35, §38, §40; verifiche §18/§19/§22/§25/§30/§32 | ⏳ |

## Dettaglio per fase

### Fase 0 — Sicurezza ✅
Economici → admin-only (deals/quotes/proposals/invoices); VIEW `clients_workspace`
(mrr/fiscali azzerati); Anagrafica solo admin; gate Google `@twobee.it` server-side.
Mig. 100. Rimandato qui→Fase 5: privacy storage/URL pubblici (0d).

### Fase 1 — Task domain ✅
`<TaskDrawer>` unico (MieAttività/Progetto/board reparti) + `updateTaskFields`;
helper stati terminali estendibile + fix conteggi; task cliccabili (Elenco/Bacheca/
Timeline/Calendario); richieste dirette + supporto (`richiesta_supporto`, `origin_task_id`,
`RequestInbox`, `SupportRequestButton`); page unificate. Mig. 101.
*Residuo §6.1*: liste task della dashboard workspace → drawer (spostato in Fase 4).

### Fase 2 — Calendario ⏳ (prossima, piano dedicato da approvare)
`CalendarEventForm` unico (Calendario admin/workspace + Appuntamenti progetto);
sync bidirezionale webhook Google (tabella eventi + external id + sync status);
overlay task (non sincronizzate come eventi); form evento da progetto.
Decisioni: D8 webhook, D4-bis gate freelance (B1).

### Fase 3 — Workload + Portfolio + Dashboard strategica ⏳
Workload: "Progetti attivi"→Workload (redirect/alias); collasso persistito; griglia+
timeline multi-scala (giorno/mese/anno/sprint/milestone) con hover ricco condiviso col
Gantt; intensità futura reale (finestre 7/14/30/60/90; `estimated_hours`, `tasks.start_date`
NEW, sprints, `team_leaves` approvate; warning stime); AI planning (propone, non applica).
Portfolio (§10): filtro per tipologia progetto (campo reale). Dashboard (§6.4): widget
MRR macro aggregato + fatturato totale aggregato. Decisioni: D5 capacità, D6 start_date, D7 assenze.

### Fase 4 — Cliente/Progetto ⏳
CTA "Crea" contestuale (cliente/progetto/sprint/milestone/task/subtask precompilati);
tab "Progetti attivi" autonoma (no duplicazione con Panoramica); rimuovi link "Tutta";
Brief view/edit-mode; Gantt collassabile + hover condiviso col Workload; drawer su
sprint/milestone/task/subtask; Appuntamenti 20gg + matching normalizzato (OR); Riunioni→task
(interne o cliente); Task cliente preview modificabile; Anagrafica `display_name`/`legal_name`.
+ completare §6.1 (task dashboard cliccabili). Decisioni: D13 20gg/OR, D14 interne+cliente.

### Fase 5 — Documenti & Knowledge ⏳
Documenti Workspace/cliente Drive-only (rimuovi upload/URL pubblici; embed alberatura §11.1);
cancella documenti legacy storage (D10); privacy storage/bucket (0d). Knowledge redesign
strutturato (Mercato/Competitor/Brand/SWOT/Offerta/Idee/Strategico) + area Marginalità
protetta founder/admin (server+RLS); UX collassabile, AI prefill (no auto-save). Decisioni: D9 embed.

### Fase 6 — Customer Care & navigazione ⏳
AI Customer Care interna (CTA "Suggerisci azioni", non invia/non crea auto); "Aggiungi
persone" collassato; fix active-state Ticket (route boundary); deprecare chat interne v1.0
(nascondi a livello DB, non cancellare tabelle).

### Fase 7 — HR/Cronologia/Profilo ⏳
Rimuovi "Caricamento documento HR" dalla sezione richieste (mantieni ferie/permessi/malattia);
bucket privati (buste paga signed URL, hr-attachments no public); Cronologia restore singola
modifica (reversible/restored_at/restored_by; l'`activity_log` ha già snapshot+diff) + retention
30gg (audit sicurezza separato); Profilo UX su griglia + Email read-only + rimuovi "Competenze" UI.

### Fase 8 — Stabilizzazione + verifiche ⏳
RLS per ruolo, build/typecheck, responsive, a11y, regressioni, data quality (estendere
`data_quality_report`). Verifiche-solo (no rebuild): §18 KPI progetto, §19 Aggiornamenti,
§22 KPI cliente, §25 Relazione, §30 Feedback, §32 Documenti personali.

## Migration eseguite / da eseguire
096–099 ✅ · 100 ✅ · 101 ✅ · (102+ nelle fasi successive: Fase 2 tabella eventi calendario,
Fase 3 `tasks.start_date` + capacità risorsa, Fase 4 `clients.display_name/legal_name`,
Fase 5 knowledge/storage, Fase 7 activity_log restore/retention).

## Output §37 per fase
File modificati/creati · Migration · Tabelle · RLS · Componenti riusati/eliminati · Route ·
Test auto/manuali · Rischi residui · Rollback → raccolti in `WORKSPACE_CHANGELOG.md` e nei
`WORKSPACE_FASE<N>_PLAN.md`.
