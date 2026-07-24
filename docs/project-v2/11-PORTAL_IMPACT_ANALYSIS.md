# 11 — Portal Impact Analysis

Tutti i portali leggono le **stesse** entità (`clients, projects,
project_workstreams, milestones, tasks, task_assignees, recurring_task_templates`).
Differiscono solo per dati visibili, permessi, azioni, navigazione, linguaggio, UI,
RLS. **Vietate** tabelle duplicate (`resource_*`, `client_*` che clonino le entità).

## Portale Admin (`/dashboard`, esistente)
- **Nuove sezioni**: `/progetti` (globale), dominio progetto, `/clienti/[id]/progetti`,
  sezione **Task Ad Hoc** nel cliente.
- **Sidebar**: estendere l'array in `components/shared/Sidebar.tsx` con "Progetti".
- **Wizard** montato standalone + embedded.
- Vede tutto secondo ruolo, inclusi metadati non economici.

## Workspace (`/workspace`, esistente — resta il portale risorsa)
- **Riattivare** sezioni: `Le mie attività`, `Progetti` (Calendario già presente).
  Le voci `workspace_sections` erano spente dal reset → riattivare solo queste con
  le nuove route.
- Legge gli **stessi** dati con RLS scoped: progetti/sottoprogetti/milestone/task
  assegnati o dei propri progetti; task ricorrenti come normali attività; niente
  dati economici.
- Freelance/partner: stesso Workspace, scoped ai propri progetti (confermato).

## Portale Cliente (`/portale`, **da costruire**)
- Legge solo `client_id` proprio + `visibility='client_visible'`.
- Vede: panoramica, progetti/sottoprogetti autorizzati, milestone visibili,
  deliverable, **task cliente** (incl. Ad Hoc assegnate al cliente), aggiornamenti,
  KPI, documenti, Customer Care. **No** fatture nel primo MVP (economics droppato).
- Non vede: task interne, ore/effort, note interne, costi, partner non autorizzati,
  altri clienti.
- Label: "Sottoprogetto" (confermato — nessuna traduzione dinamica).

## Portale Risorsa
- **Coincide con il Workspace** (confermato: si tiene `/workspace`). Non si crea
  `/risorsa`. L'addendum "Portale Risorsa" = Workspace esteso col dominio progetto.

## Debito trasversale
- Visibilità clienti per team/guest da ridisegnare (policy caduta nel reset).
- `workspace_sections`: riattivare `mie_attivita` + `progetti`; lasciare spente
  `workload`/`portfolio` (fase futura).

## Ordine (vedi doc 12)
Admin (schema+dominio) → Workspace (riattiva) → Portale Cliente (nuovo).
