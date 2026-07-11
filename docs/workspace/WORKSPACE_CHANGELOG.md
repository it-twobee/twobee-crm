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
