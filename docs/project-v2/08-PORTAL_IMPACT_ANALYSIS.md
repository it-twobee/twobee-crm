# 08 — Impatto sui portali

Regola invariante (§2): **una sola fonte dati**. Nessuna tabella per portale.
Oggi la regola è già rispettata: non esistono `workspace_tasks` o
`client_portal_projects`. Va mantenuta.

| Portale | File chiave | Impatto |
|---|---|---|
| **Admin** | `ProjectPageClient.tsx` (~3000 righe), `ProgettiClient.tsx`, `clienti/[id]` | **alto** — nuove tab Workstream/Milestone, rimozione tab Sprint |
| **Workspace** | `workspace/progetti/`, `MieAttivitaClient.tsx` | medio — contesto task passa da sprint a workstream/milestone |
| **Portale Cliente** | `ClientPortalView.tsx`, `portale/` | medio — label per servizio (§18), filtro `visibility` |
| **Portale Risorsa** | `risorsa/`, `RisorsaTasks.tsx` | basso — vede task, eredita il contesto |
| **Workload** | `WorkloadClient.tsx`, `lib/workload.ts`, `PortfolioTimeline.tsx` | **alto** — filtri per area/servizio/workstream/milestone, timeline a 4 livelli |
| **Calendario** | `calendar_events` (102) | basso |
| **Dashboard** | widget vari | basso — `sprint_current` da smettere di leggere |
| **Reparti** | `BoardTeam.tsx`, `DeptOperativity.tsx` | medio — 11 occorrenze di `sprint_id` |
| **KPI / Customer Care / Documenti** | — | nessuno |

## Label per il Portale Cliente (§18)

Il cliente non deve leggere "Workstream". Label per servizio, da tabella
(`service_catalog.client_workstream_label`), non hardcoded:

| Servizio | Label cliente |
|---|---|
| Growth (lead gen, e-commerce, saas) | Iniziative |
| Brand Identity | Fasi |
| Social Media Management | Aree di lavoro |
| Digital (crm, gestionale, sito) | Moduli |
| Creazione evento | Aree organizzative |

Il cliente non vede: task interne, routine private, costi, note, effort,
workstream `visibility='internal'`, partner non autorizzati.

## Il vincolo economico

Le RLS 100/116 già impediscono al Workspace di vedere dati economici.
Il Workstream **non deve** portare importi: se serve un valore economico per
workstream (milestone_based), sta in `revenue_streams`/`revenue_milestones`, che
sono admin-only. Da non replicare su `project_workstreams`.
