# WORKSPACE_CHANGELOG

## Fase 0 — Fondamenta di sicurezza (D1/D2/D3/D4)
**Migration**: `100_workspace_security_rls.sql` (additiva, idempotente) — **da eseguire a mano**.
**File modificati**:
- `app/(workspace)/workspace/clienti/page.tsx` → query su `clients_workspace`
- `app/(workspace)/workspace/clienti/[id]/page.tsx` → query su `clients_workspace`
- `components/clients/ClientPageClient.tsx` → `canSeeAnagrafica = isAdmin` (era anche manager/senior)
- `app/api/google/auth/route.ts` → gate server-side `@twobee.it` (+ auth utente)
- `app/api/google/callback/route.ts` → gate `@twobee.it` (difesa in profondità)

**Effetto**:
- D1: `deals/deal_activities/quotes/proposal_documents` → RLS solo admin.
- D2: `invoices` → tolto il read del team (restano admin + cliente).
- D3: `clients.mrr` e campi fiscali chiusi al team via VIEW `clients_workspace`; Anagrafica solo admin.
- D4: solo `@twobee.it` collega Google (verifica server, non solo UI); freelance/partner non-@twobee.it bloccati dal flusso standard (gate dedicato = B1, calendario interno soltanto — da progettare in Fase 2).

**Verifica**: tsc + build verdi. Test manuali per ruolo nel piano (WORKSPACE_FASE0_PLAN §Output).
**Rollback**: migration additiva; script inverso nel commento della 100; codice su Git.

**Rimandato a Fase 5**: privacy storage / URL pubblici documenti+HR (D10 li cancella comunque).

## Fase 1 — Task domain condiviso (COMPLETA)
**Migration**: `101_task_requests.sql` (stato `richiesta_supporto` + `origin_task_id`/`requested_by`).
- **1a** `lib/task-status.ts` (TERMINAL/ACTIVE/PENDING, isTaskDone/Active/PendingRequest, estendibile) + fix conteggi §7.1 in MieAttivitaClient.
- **1b** `<TaskDrawer>` condiviso (tab Dettaglio/Subtask/Commenti/Ore) + server action `updateTaskFields` (authz+service role); wire in MieAttività, ProjectPageClient, SprintMilestoneBoardSection (3 modali duplicati rimossi).
- **1c** task cliccabili → drawer in Timeline e Calendario.
- **1d** richieste dirette + supporto: `app/actions/task-requests.ts` (create/respond), `RequestInbox` (inbox in Le mie attività + dashboard workspace), `SupportRequestButton` (CTA nel drawer).
- **1e** unificate le due page "Le mie attività" in `MieAttivitaPageView`.

**Verifica**: tsc + build verdi su ogni step. Test end-to-end (drawer, richieste) da fare in-app dopo migration 100+101 (eseguite).
**Migration eseguite dall'utente**: 100 ✅, 101 ✅.

## Fase 2 — Calendario (COMPLETA)
**Migration**: `102_calendar_events.sql` (mirror eventi + colonne watch channel su google_credentials).
- **2a** `components/calendario/CalendarEventForm.tsx` — form evento unico (estratto), condiviso.
- **2b** mirror `calendar_events` + write-through (POST/PATCH/DELETE su `/api/google/events`) + refresh token persistito (fix stale) + campi timezone/ricorrenza/promemoria.
- **2c** `lib/google-calendar.ts` (syncMirrorFromGoogle + ensureCalendarWatch) + `/api/google/webhook` (push real-time); watch registrato al connect + rinnovo lazy nella GET.
- **2d** Appuntamenti progetto usa il CalendarEventForm precompilato (cliente/progetto, mirror); colori hardcoded sistemati.

**Verifica**: tsc + build verdi. Test end-to-end (crea/modifica/elimina evento, webhook, ricorrenza) da fare in-app dopo migration 102.
**Da eseguire dall'utente**: migration 102. Webhook attivo solo con dominio pubblico (Cal-Q1: presente).
**Limite noto**: modifica ricorrenza su serie esistenti (istanza vs serie) non gestita — rifinitura futura.

## Fase 5 — Documenti e Knowledge (IN CORSO)
**Migration**: `107_knowledge_redesign.sql` (additiva).
- **5a** §23/D9/D10: `DocumentsTab` cliente **Drive-only** — rimosso upload su bucket pubblico e
  dropzone; restano link Drive (cartella + file) con anteprima embed folder view (nessuna Drive API).
  I documenti legacy su storage restano in **sola apertura** (non cancellati: decisione utente,
  D10 rinviata a dopo un report). Upload intatto per HR/buste paga/documenti personali.
- **5b** §26: Knowledge ridisegnata come centro di conoscenza — sezioni **collassabili**
  (Mercato, Brand, SWOT, Offerta, Informazioni strategiche) + **Competitor** e **Idee** come liste
  vere (tabelle `client_competitors`, `client_ideas` con priorità/stato/autore) + area
  **Marginalità riservata agli admin** (`client_economics`, RLS `role='admin'`, NON `is_staff()`:
  le risorse workspace non la vedono nemmeno a livello DB). AI Prefill mantenuto, non salva senza conferma.

**Verifica**: tsc verde. **Da eseguire dall'utente**: migration 107.
**Residuo Fase 5**: anteprima alberatura Drive più ricca in Documenti workspace (§11.1); report+pulizia legacy storage (D10).

## Fase 4 — Dominio Cliente / Progetto (COMPLETA)
**Migration**: `105_client_names.sql` (display_name/legal_name).
- **4a** display_name/legal_name (§24) + backfill; anagrafica solo admin.
- **4b+4c+4d** CTA "Crea" contestuale (cliente/progetto), tab "Progetti attivi" autonoma, Brief view/edit mode.
- **4e** Gantt collassabile (sprint+milestone di base) + hover ricco condiviso col Workload.
- **4f** click su riga sprint/milestone/task/subtask → drawer/editor laterale.
- **4g** Appuntamenti finestra 20gg + matching normalizzato (lowercase/punteggiatura/token, cliente OR progetto).
- **4h** `MeetingTaskComposer` in RiunioniTab: le azioni AI (o le "prossime azioni" del recap) diventano
  task-preview modificabili (titolo/descrizione/scadenza/priorità/owner/sprint/milestone, task interna o cliente);
  select/deselect/elimina; **solo le confermate** creano task reali (owner via `bulkSetTaskAssignees`). Nessuna creazione automatica.
- **4i** `components/tasks/WorkspaceTaskList.tsx`: le liste task della dashboard workspace aprono lo stesso
  `TaskDrawer` condiviso (overlay a destra), task idratata al click; il link al progetto resta separato.
- **4j** ClientPlanTab: la preview AI/template è ora inline-editabile (titolo/scadenza/priorità) con elimina,
  prima della conferma; titoli vuoti scartati.

**Verifica**: tsc `--noEmit` verde; compile dev pulita. Test end-to-end in-app (crea task da riunione, drawer da dashboard, preview task cliente) da fare dopo migration 105.
**Da eseguire dall'utente**: migration 105 (se non già applicata).
**Rischi**: `MeetingTaskComposer` inserisce via client (RLS) sotto gate `isAdmin` UI — coerente con le altre scritture di progetto; il matching owner da nome è best-effort (default "nessun owner" se ambiguo).

## Fase 3 — Workload + Portfolio + Dashboard strategica (COMPLETA)
**Migration**: `103_workload_portfolio.sql` (tasks.start_date, profiles.weekly_capacity_hours, disattiva voce sidebar 'progetti').
- **3a** §9: `/workspace/progetti` → redirect a `/workspace/workload` (dettaglio progetto resta).
- **3b** §9.3: `computeIntensity` (finestre 7/14/30/60/90, effort spalmato start→due, capacità per risorsa, estimateCoverage) + `workloadSignals`; vista "Intensità" con barre carico/capacità e warning affidabilità.
- **3c** §9.2: timeline scala settimana/mese + hover ricco `taskHoverText` (condivisibile col Gantt). *Scale giorno/anno/sprint/milestone = rifinitura.*
- **3d** §9.4: `/api/ai/workload-plan` (Groq) + AIPlanningPanel — propone, non applica.
- **3e** §10: Portfolio filtro per tipologia (project_type reale).
- **3f** §6.4: dashboard workspace con MRR aggregato + fatturato YTD (somme via service role, mai per-cliente).

**Verifica**: tsc + build verdi. **Da eseguire dall'utente**: migration 103 (fatta).
**Limiti noti**: timeline scale complete (giorno/anno/sprint/milestone) e apply per-suggerimento AI = rifiniture future.
