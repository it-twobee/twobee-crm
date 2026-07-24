# 02 — Legacy Residuals

> Residui del vecchio flusso progetto ancora presenti dopo il reset (144–146).
> Classificazione richiesta: **da preservare / da archiviare / da scollegare /
> da eliminare dopo conferma**. Nessuna eliminazione automatica senza approvazione.

## Sintesi

Il reset è pulito lato dati e lato route. I residui sono **cosmetici** (tipi/enum
stale) + **strutturali da riabilitare** (sezioni sidebar spente, visibilità
esterni caduta) + **igiene git** (working tree sporco). Nessun dato progettuale
orfano nel DB, nessuna FK che blocchi il nuovo schema.

---

## A. Residui nel codice

| # | Residuo | File | Classificazione | Azione |
|---|---|---|---|---|
| A1 | Working tree non committato: scheda cliente ridotta a Panoramica+Anagrafica; eliminati KpiTab, DocumentsTab, RelazioneTab, ClientKnowledgeTab, client-knowledge.ts, NewBadge, useSeen.tsx | 13 file `M`/`D` | **da scollegare** (decisione git) | committare come chiusura del reset **oppure** annullare, prima di aprire il nuovo motore |
| A2 | `interface LeadContact` + `type LeadContactSource` + `type LeadContactStatus` (tabella `lead_contacts` droppata in 145) | `lib/types/database.ts` | **da eliminare dopo conferma** | rimuovere quando si tocca database.ts per i nuovi tipi |
| A3 | `PermissionSection` include ancora `'fatturazione'` e `'task'`; `SECTIONS`/`SECTION_LABELS` idem | `lib/types/database.ts`, `lib/permissions.ts` | **da scollegare** | `task` andrà ridefinito col nuovo dominio; `fatturazione` non ha più tabelle → valutare in doc 10 |
| A4 | `NotificationType = 'task_assigned' \| 'task_due' \| 'message' \| 'mention'` | `lib/types/database.ts` | **da preservare** (riutile) | i tipi notifica task servono al nuovo motore: tenere |
| A5 | `ClientType`, `ClientLabel`, `ClientPackage`, `Priority` ecc. | `lib/types/database.ts` | **da preservare** | dominio cliente vivo |

> Verifica eseguita: `grep from('projects'|'tasks'|'sprints'|'project_workstreams'|
> 'milestones'|'recurring_task_templates'|'task_assignees'|'deals'|'objectives'|
> 'decisions'|'invoices'|'quotes'|'os_tasks'|'service_catalog'|'portfolios')` su
> `app/ components/ lib/` → **0 risultati**. Il codice non legge tabelle morte.

---

## B. Residui nel DB

| # | Residuo | Dove | Classificazione | Azione |
|---|---|---|---|---|
| B1 | Sezioni workspace spente ma presenti: `progetti, portfolio, task, mie_attivita, workload, cestino` (`is_active=false`) | `workspace_sections` | **da archiviare** | riattivare *solo* quelle del nuovo modello con le nuove route (mie_attivita, progetti); lasciare spente workload/portfolio in questa fase |
| B2 | Policy `clients_external` caduta (drop CASCADE di `get_my_project_ids()`) → esterni senza accesso clienti | RLS `clients` | **da scollegare** (già scollegata) | riprogettare la visibilità cliente per guest col Portale Risorsa/Cliente (doc 10) |
| B3 | **VERIFICATO**: policy `clients` = `admin_all` (admin), `client_own` (client/guest → propria riga), `team_all` (team interni → tutti). `clients_external` caduta. VIEW `clients_workspace` sopravvive. | RLS `clients` | **da scollegare** (gap noto) | esterni (guest/freelance/partner) non vedono i clienti dei progetti assegnati → scoping per-assegnazione nella fase portali. Riusare VIEW `clients_workspace` per Workspace/Cliente |
| B4 | Enum `chat_channels.type` può ancora ammettere `interno/task/cliente_interno` a livello di CHECK anche se le righe sono state cancellate | `chat_channels` | **da eliminare dopo conferma** | il nuovo motore non usa canali task-per-progetto? decidere in doc 13 (chat di progetto) |
| B5 | Backup JSON pre-reset (47 tabelle) | `supabase/backup/2026-07-22-pre-reset/` | **da preservare** | fonte per seed tassonomia/template e per audit storico |

---

## C. Residui git / branch

| # | Residuo | Classificazione | Azione |
|---|---|---|---|
| C1 | Branch `archive/project-v2-wip` (local + origin) — codice V2 + migration 115–143 | **da preservare** | riferimento per template, wizard, revenue model; non mergiare |
| C2 | Branch corrente `refactor/reset-project-domain` non mergiato su `main` | **da scollegare** (decisione) | decidere se il nuovo motore continua su questo branch o su un nuovo `feat/project-v2` che parte da qui |

---

## D. Cosa NON è un residuo (conferme positive)

- Nessuna tabella progetto/task/sprint/economics nel DB dopo 144/145.
- Nessuna route legacy in `(dashboard)`/`(workspace)`.
- Middleware pulito: solo gate `admin → /dashboard`, `workspace-roles → /workspace`,
  `client/guest → profilo`.
- Nessuna FK residua verso `projects`/`tasks` (colonne droppate in 146).
- Nessuna funzione SQL orfana (drop overload in 146).
- Cron MRR de-schedulato.

---

## E. Ordine consigliato di bonifica (prima di implementare)

1. **C1/C2** — decidere strategia branch (nuovo `feat/project-v2` da qui).
2. **A1** — chiudere il working tree (commit o revert).
3. **B3** — query `pg_policies` su `clients` per fotografare la RLS reale.
4. **A2/A3** — ripulire i tipi orfani **contestualmente** alla scrittura dei
   nuovi tipi (non prima, per evitare due passaggi su database.ts).
5. **B1/B2/B4** — trattare dentro le migration del nuovo schema (147+), non con
   patch isolate.

> Nessuna delle azioni sopra va eseguita prima dell'approvazione dell'architettura.
