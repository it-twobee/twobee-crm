# 03 — New Domain Model

## Gerarchia canonica

```
Cliente (clients)
└── Progetto (projects)                      — servizio acquistato
    └── Sottoprogetto (project_workstreams)  — filone operativo  [label UI: "Sottoprogetto"]
        └── Milestone (milestones)           — consegna / checkpoint / milestone di sistema
            └── Task (tasks)                 — attività concreta
                └── (ricorrenza) recurring_task_templates → genera Task reali
```

**+ Task Ad Hoc** (addendum): task agganciate **direttamente al cliente**, senza
progetto/sottoprogetto/milestone/workload. Assegnabili a risorse interne o al
cliente. Vivono nella sezione "Task Ad Hoc" del dominio cliente.

## Le due nature di Task

| | Task di progetto | Task Ad Hoc |
|---|---|---|
| `task_type` | `project` | `ad_hoc` |
| `client_id` | NOT NULL | NOT NULL |
| `project_id` | NOT NULL | NULL |
| `workstream_id` | NOT NULL | NULL |
| `milestone_id` | **NOT NULL** | NULL |
| dove si crea | dominio progetto | sezione Task Ad Hoc del cliente |
| CHECK | tutti i FK di gerarchia valorizzati | tutti i FK di gerarchia NULL |

> Decisione confermata: per i task di progetto `milestone_id` è obbligatoria →
> ogni Sottoprogetto nasce con una milestone di sistema **"Operatività continua"**
> che ospita le ricorrenze e le attività senza consegna. I Task Ad Hoc sono
> l'unica eccezione, gestita da CHECK su `task_type`.

## Le due nature di Sottoprogetto (workstream)

| | Progettuale (una tantum) | Ricorrente (continuativa) |
|---|---|---|
| `workstream_type` | `project` | `recurring` |
| durata | inizio → fine, obiettivo definito | stabile per tutta la vita del progetto |
| milestone | di consegna | temporali + di sistema (Operatività, Governance) |
| task | prevalentemente una tantum | prevalentemente generate da template |
| badge UI | "Una tantum" | "Continuativa" |

Una Workstream ricorrente **non** si duplica ogni periodo: resta stabile e le sue
`recurring_task_templates` generano occorrenze reali. Dettaglio nel doc 16.

## Entità e responsabilità

- **clients** — azienda servita (esistente, dominio vivo). Ogni progetto vi punta.
- **projects** — servizio principale acquistato. Classificato per `area` +
  `service_type` (+ `service_subtype`). N progetti per cliente.
- **project_workstreams** — filone operativo. `project` o `recurring`.
- **milestones** — risultato/consegna/checkpoint, oppure di sistema
  (`milestone_type='system'`: Operatività continua, Governance, Backlog operativo).
- **tasks** — attività. `project` o `ad_hoc`. Multi-assegnatario via `task_assignees`.
- **task_assignees** — 0..N assegnatari; `is_primary_owner` = primario
  (mirror in `tasks.assignee_id`, come nel vecchio modello — mantiene le viste).
- **recurring_task_templates** — regola che genera Task periodiche (idempotente).

## Stati (confermati)

```
Progetto:      draft · active · on_hold · completed · archived
Sottoprogetto: draft · active · paused · completed · archived
Milestone:     da_fare · in_corso · in_approvazione · completata
Task:          da_fare · in_corso · in_review · richiesta_supporto · completato
```

`in_approvazione` sulla milestone solo se `approval_required=true` (approva il
cliente, doc 15). `richiesta_supporto` sul task come nel modello precedente
(la 101 esisteva; qui ridefinita per il nuovo dominio).

## Visibilità (campo `visibility` su ogni livello)

`internal` (default) · `client_visible`. Il Portale Cliente legge solo
`client_visible`. Ereditarietà suggerita: un task `client_visible` richiede che il
suo ramo (progetto/workstream/milestone) sia almeno `client_visible`. Dettaglio
regole nel doc 10/15.

## Diagramma relazioni (logico)

```
clients 1─┬─* projects 1─* project_workstreams 1─* milestones 1─* tasks *─* profiles
          │                                                    (via task_assignees)
          └─* tasks (ad_hoc, project_id NULL) ─────────────────────────┘
projects 1─* recurring_task_templates 1─* tasks (is_recurring_instance)
```

## Pilota

Cliente **Seven** — primo progetto end-to-end di validazione (vedi doc 12 §Fase 8).
