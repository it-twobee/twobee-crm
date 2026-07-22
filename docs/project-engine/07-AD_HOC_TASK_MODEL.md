# 07 — Attività ad hoc cliente

## Già fatto (Fase 3, migration 128)

Il §22 del brief è **implementato e verificato in produzione**.

```
scope_type   project_id   client_id   team vede   significato
project      NOT NULL     derivato    sì          task di progetto
client       NULL         NOT NULL    sì          ad hoc cliente
personal     NULL         NULL        NO          todo personale
```

- `tasks.client_id`, `scope_type`, `work_type` — migration 128
- `CHECK tasks_scope_coherent` — impedisce stati incoerenti
- Policy `tasks_team_read_all` riscritta su `scope_type`
- Trigger `tasks_client_sync` — collegando a un progetto, `scope_type` passa a
  `project` e `client_id` si allinea da solo
- `ClientAdHocPanel` — nella scheda cliente e in ogni progetto (contestuale)
- Server action `client-adhoc.ts` con promozione a progetto reversibile
- Workload: le ad hoc pesano sulla risorsa, raggruppate per cliente

Verificato: vincoli rifiutano gli stati incoerenti, il trigger converte
correttamente.

### Il bug evitato

Il §22 alla lettera (`project_id` nullo + `client_id`) avrebbe reso ogni ad hoc
**invisibile a tutto il team**: la migration 094 aveva già assegnato a
`project_id IS NULL` il significato "task personale privata". Nessun errore,
solo liste vuote. `scope_type` rende esplicito ciò che era implicito nel NULL.

## Cosa resta aperto

**Imputazione economica** (§22 e domanda 31). Oggi le ad hoc pesano sul Workload
ma non generano costi. Le opzioni: costo generale cliente, costo progetto,
overhead, non fatturabile. `project_cost_entries` ha `project_id NOT NULL` —
per imputare a un cliente senza progetto quel vincolo andrebbe rilassato.

**Plafond / monte ore** (domanda 30). Non implementato. Se un cliente ha diritto
a N ore di ad hoc al mese, serve un contatore e un avviso al superamento.

**Visibilità al cliente** (domanda 29). Il campo `is_client_task` esiste ed è
esposto nel pannello con la spunta "Visibile al cliente nel suo portale". Default
**non visibile**.

**Conversione in progetto** (domanda 32). Fatto: `linkAdHocToProject`, reversibile.
