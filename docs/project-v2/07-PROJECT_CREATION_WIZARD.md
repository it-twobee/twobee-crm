# 07 — Project Creation Wizard

Un **unico** wizard condiviso (`<ProjectWizard>`), richiamabile da: sezione globale
`/progetti`, dominio cliente (`/clienti/[id]/progetti`, cliente precompilato),
dashboard admin. Workspace solo se il ruolo è autorizzato (doc 10).

## Step

1. **Cliente** — se aperto dal dominio cliente è **precompilato e bloccato**.
   Altrimenti select obbligatoria. Mostra progetti/servizi già attivi del cliente
   e possibili sovrapposizioni.
2. **Area** — 3 card: Marketing / Growth / Digital.
3. **Servizio** — solo i servizi dell'area (dal `service_catalog`). Digital →
   eventuale `service_subtype` (CRM/Gestionale/Applicativo).
4. **Informazioni** — nome, descrizione, obiettivo, `start_date`, `target_end_date?`,
   `manager_id` (PM), `priority`, `status` (default draft), `visibility`.
5. **Team** — PM, risorse, collaboratori, partner, supervisore → popola
   `task_assignees`/team di progetto. **Nessun dato economico** ai ruoli workspace.
6. **Template** — propone i `project_templates` del servizio scelto: albero
   Sottoprogetti → Milestone → Task → Task ricorrenti (con owner suggeriti,
   scadenze relative, frequenze). L'utente può partire da template o da vuoto.
7. **Personalizzazione** — su una preview editabile: aggiungi/modifica/elimina/
   riordina nodi, cambia owner/date/priorità, imposta ricorrenze. Ogni Sottoprogetto
   ricorrente riceve automaticamente la milestone di sistema "Operatività continua".
8. **Anteprima** — albero completo Cliente→Progetto→Sottoprogetti→Milestone→Task.
   Validazioni bloccanti/warning: campi mancanti, owner mancanti, date incoerenti,
   duplicazioni, ricorrenze, progetti simili già attivi.
9. **Conferma** — creazione **atomica**.

## Creazione atomica

Tutta la creazione (progetto + N workstream + N milestone + milestone di sistema +
N task + N template ricorrenti) avviene in **una** Server Action che chiama una
funzione DB transazionale `create_project_from_template(payload jsonb)` (service
role). O tutto o niente: nessun progetto parzialmente creato. In caso di errore →
rollback + messaggio. (Nota: il vecchio `create_project_from_wizard()` è stato
droppato nel reset; se ne scrive una nuova versione.)

## Regole
- Il wizard **non** consente di creare Task senza progetto: i Task Ad Hoc si creano
  dalla sezione Task Ad Hoc del cliente, non dal wizard.
- Precompilazione cliente non ri-chiede la selezione.
- I template sono dati (`project_templates`), non codice: modificarli non richiede
  deploy (doc 17).

## Riuso
Lo stesso `<ProjectWizard>` monta in modalità `embedded` (dentro dominio cliente)
o `standalone` (da /progetti). Un solo componente, una sola Server Action.
