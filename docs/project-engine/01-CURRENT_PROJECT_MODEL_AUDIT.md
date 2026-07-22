# 01 — Audit del modello progetti (read-only)

Data: 2026-07-19 · Metodo: lettura di codice, migration e tipi + SELECT read-only
su produzione. Nessuna scrittura.

---

## 0. Premessa: metà di questo brief è già in produzione

Questo audit arriva dopo le Fasi 0–4 completate oggi (migration 115–131). Diverse
richieste del brief sono **già implementate**, e riproporle creerebbe colonne
duplicate — l'errore che il brief stesso vieta.

| Richiesta del brief | Stato |
|---|---|
| §3.2 linea di servizio | ✅ `projects.service_line` (115), 7 valori incl. `marketing` |
| §3.3 motore operativo | ⚠️ `projects.delivery_model` (115) — **3 valori contro i 5 richiesti** |
| §3.4 modello economico | ✅ `revenue_streams.revenue_model` (116) — sull'accordo, non sul progetto |
| §9 routine ricorrenti | ✅ `growth_routines` + generazione idempotente (129/130) |
| §11 iniziative una tantum | ✅ `growth_initiatives` (129) |
| §22 attività ad hoc cliente | ✅ `tasks.scope_type='client'` + `client_id` (128) |
| §12 UI Growth (Panoramica/Routine/Iniziative) | ✅ `GrowthSections.tsx` |
| §8.1 verticale E-commerce / Lead Gen | ✅ `projects.project_type` + `lib/growth-routines.ts` |
| §4 progetto sempre legato al cliente | ✅ `projects.client_id NOT NULL` da sempre |

**Genuinamente nuovo**: Service Catalog (§5), wizard unico (§6), Startup 3
settimane (§8), Planning Cycles (§10), fasi Digital (§14), release e test cliente
(§15–16), data fine dinamica (§17), partner e subappalto (§18), servizi
Marketing come motori distinti (§20–21), portale cliente semplificato (§26).

---

## 1. Come vengono creati oggi i progetti

**Sette punti di creazione diversi**, nessuno condiviso:

| File | Contesto |
|---|---|
| `app/actions/workspace-create.ts:59` | Workspace, "+ Crea" |
| `app/actions/workspace-create.ts:306` | Workspace, creazione contestuale a una task |
| `components/clients/NewClientModal.tsx:110` | crea un progetto **automatico** a ogni nuovo cliente |
| `components/clients/tabs/PanoramicaTab.tsx:469` | scheda cliente |
| `components/clients/tabs/ProjectStatusTab.tsx:766` | scheda cliente, altra tab |
| `components/progetti/ProgettiClient.tsx:927` | pagina Progetti, con template |
| `components/reparti/CreateProjectModal.tsx:51` | reparti |
| `components/operativa/OperativaClient.tsx:93` | operativa |

Otto in realtà. Campi scritti: `client_id`, `name`, `status`, `project_kind`,
`project_type`, `sprint_current`, a volte `manager_id`. Nessuno scrive
`service_line` — ci pensa il trigger della 124.

`NewClientModal` crea `Progetto {nome cliente}` a ogni cliente nuovo, senza
chiedere niente: è il motivo per cui nasceranno progetti senza servizio.

---

## 2. Quali campi determinano oggi il tipo di progetto

Tre colonne sovrapposte:

| Colonna | Valori | Stato |
|---|---|---|
| `project_kind` | growth, marketing, digital, ai | **deprecata** (115), letta ancora in 25 file |
| `service_line` | growth, digital, marketing, ai, hybrid, consulting, other | fonte di verità (115) |
| `project_type` | ecommerce, lead_gen, sito_web, app_ai, campagna, custom | tipologia tecnica **e** verticale Growth |
| `delivery_model` | recurring_operations, structured_project, hybrid | motore operativo (115) |

`project_type` fa **due lavori insieme**: distingue il verticale Growth
(`ecommerce` vs `lead_gen`) e la tipologia tecnica Digital (`sito_web`,
`app_ai`). Finché Growth e Digital erano separati funzionava; con il Service
Catalog del brief diventa ambiguo — "Sito e-commerce" (Digital) e "Growth
E-commerce" (Growth) userebbero entrambi `ecommerce`.

---

## 3. Template esistenti

**Sei template hardcoded** in `components/progetti/ProgettiClient.tsx:864`, non
in database, non configurabili, usati da un solo form su otto:

| Label | `type` | `kind` | Milestone |
|---|---|---|---|
| Campagna Performance | campagna | growth | 6 |
| E-commerce | ecommerce | **growth** | 8 |
| Lead Generation | lead_gen | growth | ? |
| App AI / Custom | app_ai | digital | ? |
| Sito Web / Landing | sito_web | digital | ? |
| Personalizzato | custom | growth | 0 |

**Errore di classificazione già presente**: il template "E-commerce" è
`kind: 'growth'` ma le sue milestone sono un progetto Digital —
*Architettura & tech stack · Design UI/UX · Sviluppo frontend · Backend &
integrazioni · Go-Live*. È esattamente la confusione fra categoria commerciale e
motore operativo che il brief vuole eliminare, già in produzione.

`task_templates` (tabella, migration 011): **0 righe, nessuna UI**. Ha
`service_type ∈ (growth, digital, entrambi)` e `tasks JSONB`. È il candidato
naturale del Service Catalog, oppure va sostituita.

---

## 4. Growth e Digital oggi

**Growth**: motore completo, costruito oggi. `growth_routines` (regola) +
occorrenze come task con `routine_id` + `period_key`, unicità garantita
dall'indice. `growth_initiatives` per le una tantum. UI in `GrowthSections.tsx`
con Panoramica / Routine / Iniziative / Lead.

**Manca**: la fase Startup (§8) e i Planning Cycles (§10). Oggi un Growth Program
parte direttamente dalle routine.

**Digital**: struttura completa in DB (sprints, milestone via
`tasks.is_milestone`, subtask via `parent_task_id`, dipendenze) ma **nessuna fase
progettuale**, nessuna release, nessun testing cliente, nessuna data calcolata.
La UI è `ProjectPageClient.tsx`, **3000 righe**, condivisa fra Growth e Digital.

---

## 5. Sprint e milestone

`sprints(project_id, name, start_date, end_date, status)` — 4 righe in produzione.
Milestone = `tasks.is_milestone = true`; le figlie puntano con `milestone_id`.
Subtask = `parent_task_id` + `depth`.

Non esiste il concetto di **fase** (§14): `Discovery → Analisi → Progettazione →
… → Chiusura` non ha dove vivere. Lo sprint è temporale, la fase è logica: non
sono la stessa cosa e servirebbero entrambe.

---

## 6. Task e ricorrenze

Dominio unico `tasks`, con le colonne aggiunte oggi:
`scope_type` (project | client | personal), `work_type` (project | startup |
routine | initiative | adhoc), `client_id`, `routine_id`, `period_key`,
`initiative_id`.

`tasks.recurrence` (011: settimanale | quindicinale | mensile) esiste ed è
**morta**: nessuna riga la usa, il motore ricorrente passa da `growth_routines`.
Da rimuovere.

Frequenze supportate oggi: settimanale, quindicinale, mensile, trimestrale.
Il brief (§9) chiede anche **giornaliera** e **personalizzata**.

---

## 7. Preventivi, accordi, fatture

- `quotes` (011 + 064): margini completi, **0 righe**, nessun link a `projects`
- `deals` (011): pipeline, **0 righe**
- `revenue_streams` (116): l'accordo economico, `project_id` opzionale — **10 righe**
- `invoices`: `stream_id`, `project_id`, IVA scomposta (118) — 0 righe

Il collegamento progetto↔economia esiste già ed è quello giusto:
`revenue_streams.project_id`. Manca il collegamento `quotes → projects` e
`quotes → revenue_streams` (§6 step 4 del brief).

---

## 8. Risorse, partner, subappalto

- `task_assignees`: multi-assegnatario, funzionante
- `projects.manager_id`: il PM
- `resource_profiles` (068): tipi `partner_company`, `partner_user`,
  `agency_supplier`, `external_freelancer`, con flag `can_view_project_context`,
  `can_view_client_context`, `can_view_own_compensation`. **0 righe**
- `resource_costs`: 6 righe, admin-only

Le fondamenta per il partner ci sono (§18) ma non sono mai state usate. Manca
completamente: work package, scope assegnato, deliverable partner, SLA,
approvazione TwoBee.

---

## 9. Componenti da riusare, componenti duplicati

**Da riusare**
- `lib/workload.ts` — calcoli puri, già estesi per le ad hoc; il Gantt di
  progetto (§13) è un riuso di `taskSpan`/`computeEffortBuckets`
- `lib/growth-routines.ts` — periodi e seed, già testati
- `GrowthSections`, `ClientAdHocPanel`, `LeadsSection`, `AccordiEconomiciTab`
- `ContextualCreate` — il "+ Crea" contestuale è la base del wizard unico

**Duplicati da unificare**
- **8 punti di creazione progetto** → un wizard solo (§6)
- I 6 template hardcoded → Service Catalog
- `PanoramicaTab` e `ProjectStatusTab` creano entrambi progetti dalla scheda cliente
- `ProjectPageClient.tsx` a 3000 righe serve Growth e Digital insieme

---

## 10. Tabelle coinvolte

`clients` · `projects` · `sprints` · `tasks` · `task_assignees` ·
`task_dependencies` · `task_templates` · `revenue_streams` ·
`revenue_milestones` · `quotes` · `deals` · `invoices` · `growth_routines` ·
`growth_initiatives` · `client_integrations` · `lead_contacts` ·
`resource_profiles` · `resource_costs` · `client_kpis` · `portfolios`

## 11. RLS coinvolte

- `tasks_team_read_all` — riscritta oggi su `scope_type` (128)
- `projects_*` — lettura staff, scrittura admin/PM
- `growth_routines` / `growth_initiatives` — staff read, admin write (129)
- `revenue_streams` / `client_integration_secrets` — admin-only e deny-all
- `clients_workspace` — VIEW con economici azzerati (100)
- **Da verificare**: nessuna policy oggi limita un partner al suo work package.
  Il portale risorsa esiste (`resource_profiles.can_access_resource_portal`) ma
  non è mai stato esercitato con dati veri.

---

## 12. Dati storici da riclassificare

Praticamente nulla — vedi `02-EXISTING_PROJECT_CLASSIFICATION.md`:

| | |
|---|---|
| `projects` | **2** (`Test` digital, `Growth Fatima Leo` growth) |
| `tasks` | 65 (27 routine reali di Fatima, 31 nel progetto `Test`, 7 di prova) |
| `sprints` | 4 |
| `quotes` / `deals` | 0 |
| `task_templates` / `resource_profiles` | 0 |

---

## 13. Rischi di regressione

| # | Rischio | Gravità |
|---|---|---|
| R1 | Unificare 8 form di creazione in uno solo: ognuno ha un contesto (reparto, cliente, workspace) e chi lo usa ha abitudini | **alta** |
| R2 | `ProjectPageClient` a 3000 righe da splittare in Growth/Digital/Marketing: qualunque errore è invisibile finché non apri quella tab | **alta** |
| R3 | `project_type` fa doppio lavoro (verticale Growth + tipologia Digital): separarlo tocca 29 file | media |
| R4 | `delivery_model` ha 3 valori, il brief ne chiede 5: allargare il CHECK è additivo, ma la logica che lo legge va rivista | media |
| R5 | `project_kind` ancora letto in 25 file dopo la deprecazione | media |
| R6 | Data fine dinamica (§17): dipende da stime, ferie, capacità e tempi cliente — se sbagliata, nessuno si fida più del numero | **alta** |
| R7 | `NewClientModal` crea un progetto automatico senza servizio: con il catalogo diventa un progetto non classificabile | bassa, ma immediata |

---

## 14. Decisioni prodotto ancora necessarie

In `12-IMPLEMENTATION_ROADMAP.md`, sezione domande. Le tre che bloccano
l'architettura:

1. **`delivery_model` a 3 o a 5 valori?** Il brief chiede `growth_program`,
   `digital_project`, `recurring_service`, `structured_one_off`,
   `hybrid_delivery`. Oggi sono `recurring_operations`, `structured_project`,
   `hybrid`. Rinominare tocca tutto; allargare crea sinonimi.
2. **`project_type` si divide?** Verticale Growth e tipologia Digital sono due
   cose in un campo solo.
3. **Il Service Catalog sta in `task_templates` o in una tabella nuova?**
   `task_templates` esiste, è vuota, e ha già `service_type` + `tasks JSONB`.
