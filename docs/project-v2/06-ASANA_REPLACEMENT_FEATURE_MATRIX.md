# 06 — Asana Replacement Feature Matrix

Confronto: funzione Asana → stato in TwoBee OS → gap → priorità → implementazione.
**P0** = indispensabile al lancio (MVP snello confermato). **P1** = subito dopo.
**P2** = rinviato (dipendenze, approvazioni avanzate, automazioni).

| Funzione Asana | TwoBee OS oggi | Gap | Prio | Implementazione |
|---|---|---|---|---|
| Progetti | assente (resettato) | tutto | P0 | `projects` + dominio progetto (doc 07/13) |
| Sezioni/gruppi dentro progetto | — | tutto | P0 | `project_workstreams` (Sottoprogetti) |
| Milestone | — | tutto | P0 | `milestones` (delivery + system) |
| Task | — | tutto | P0 | `tasks` + drawer unico (doc 14 §drawer) |
| Sottotask | — | parziale | P1 | checklist come sottotask leggeri in MVP; sottotask veri P2 |
| Task multi-assegnatario | pattern noto (task_assignees) | ricreare | P0 | `task_assignees` + sync primario |
| Task personali / My Tasks | — | tutto | P0 | vista "Le mie attività" (workspace + admin) |
| Task Ad Hoc (senza progetto) | — | tutto | P0 | `tasks.task_type='ad_hoc'` per cliente (addendum) |
| Priorità | tipo `Priority` esiste | riusare | P0 | campo `priority` |
| Scadenze / date | — | tutto | P0 | `start_date`/`due_date` |
| Task ricorrenti | — | tutto | P0 | `recurring_task_templates` + occorrenze (doc 08) |
| Commenti | pattern chat esiste | adattare | P0 | `task_comments` (nuova) |
| Menzioni @ | notifiche esistono (type mention) | estendere | P0 | parsing @ nei commenti → notifiche |
| Allegati / link file | `documents` + Storage + Drive | collegare | P0 | link documento su task (Drive + Supabase Storage) |
| Checklist | — | tutto | P0 | `task_checklist_items` (nuova) |
| Notifiche | `notifications` esiste | estendere | P0 | tipi task_assigned/task_due/mention |
| Activity log / cronologia | `activity_log` esiste | estendere | P0 | trigger audit su nuove tabelle |
| Filtri (owner/stato/data/…) | — | tutto | P0 | filtri lista/board (doc 14) |
| Ricerca globale | `global-search` esiste (ripulito) | estendere | P0 | reindicizzare progetti/task |
| Ordinamento | — | tutto | P0 | `sort_order` + UI |
| Viste: Lista | — | tutto | P0 | doc 14 |
| Viste: Bacheca (board) | — | tutto | P0 | drag&drop stato |
| Viste: Timeline | — | tutto | P0 | (calendario/gantt leggero) |
| Viste: Calendario | `calendar_events` esiste | integrare | P0 | task con due_date sul calendario |
| Drag & drop | — | tutto | P0 | board + riordino |
| Duplicazione task/progetto | — | tutto | P1 | duplica da template/istanza |
| Bulk actions | — | tutto | P1 | selezione multipla → stato/owner/scadenza |
| Template di progetto | — | tutto | P0 | `project_templates` (doc 17) — serve al wizard |
| Deep link a task | — | tutto | P0 | `/…/task/[id]` apre drawer |
| Realtime | Supabase Realtime usato su clienti | estendere | P1 | board/task update live |
| Dipendenze tra task | — | tutto | **P2** | rinviato (MVP snello) |
| Approvazioni | milestone.approval_required in schema | UI dopo | **P2** | flusso completo rinviato; campo predisposto |
| Formulari / intake | — | — | **P2** | dopo |
| Regole automatiche | — | — | **P2** | dopo |
| Campi personalizzati | — | — | **P2** | dopo |
| Portfolio | resettato di proposito | — | **P2** | non ricreare in questa fase |
| Workload/Capacity | resettato di proposito | — | **P2** | campi predisposti (estimated_hours, capacity), modulo dopo |

## Copertura al lancio
Con i P0 il team **smette di usare Asana** per l'operatività quotidiana: creare,
assegnare, pianificare, eseguire, commentare, allegare, filtrare, cercare, vedere
lista/board/timeline/calendario, ricorrenze e Ad Hoc. P1/P2 sono migliorie, non
blocchi.
