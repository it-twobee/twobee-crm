# 15 — Client Portal Plan (`/portale`, da costruire)

## Accesso
Ruolo `client`. Middleware: `client` → `/portale`. Vede **solo** il proprio
`client_id` e **solo** righe `visibility='client_visible'`. La RLS è la barriera.

## Sezioni MVP
- **Panoramica** — stato progetti, prossime milestone, aggiornamenti recenti.
- **Progetti** — progetti attivi + sottoprogetti autorizzati ("Sottoprogetto",
  confermato).
- **Milestone** — milestone visibili + deliverable + eventuale approvazione.
- **Task cliente** — task `client_visible` assegnate al cliente (incl. **Ad Hoc**
  assegnate direttamente al cliente): il cliente può completarle e commentare.
- **Aggiornamenti** — note/report `client_visible`.
- **KPI** — sì nel MVP.
- **Documenti** — documenti `client_visible`.
- **Customer Care** — ticket (già esistente lato dati).

## Fuori MVP
- **Fatture**: NO (economics droppato; nessuna tabella).

## Cosa NON vede
task interne, routine operative interne (`Check *`), effort/ore stimate/lavorate,
note interne, costi, marginalità, assegnazioni riservate, partner non autorizzati,
altri clienti.

## Azioni cliente
- Completare le proprie task cliente (confermato).
- Commentare dove previsto.
- **Approvare milestone** con `approval_required` (confermato): passa
  `in_approvazione` → `completata` con `approved_by/approved_at`.

## Visibilità: regole
- Ereditarietà: un nodo `client_visible` richiede che i padri siano almeno
  `client_visible` (un task visibile in un progetto/sottoprogetto/milestone non
  visibile è incoerente → validazione).
- Ricorrenti: default operative `internal`; `Report`/`Meeting`/deliverable
  `client_visible`. Configurabile per template e per singola occorrenza.
- Esempio: il cliente vede "Report mensile", "Meeting periodico", "CRO Checkout in
  corso"; **non** vede "Check Ads", "Check Budget", "Check Tracking".

## Riuso
Stesso `<TaskDetailDrawer>` in modalità `client` (campi ridotti, azioni limitate).
Nessun componente task duplicato.

## Sicurezza
RLS `client` su tutte le entità (doc 10). Ridisegnare la visibilità cliente (policy
`clients_external` caduta nel reset) è **prerequisito** di questo portale.
