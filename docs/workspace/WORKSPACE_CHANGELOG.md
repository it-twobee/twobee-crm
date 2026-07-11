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
