# 10 — Permission & RLS Matrix

Fonte ruoli: `lib/permissions.ts` (`ADMIN_ROLES`, `WORKSPACE_ROLES`,
`CLIENT_ROLES`, `EXTERNAL_ROLES`, `coarseRole`). Le regole si applicano su **3
livelli**: Server Action, API e **RLS** (la UI non è una barriera).

## Ruoli coarse
- **admin** = super_admin, founder, admin
- **team** = manager, senior, junior, stage, freelance, partner (workspace)
- **client** = client
- **guest** = risorsa esterna (accesso clienti caduto col reset, da ridisegnare)

## Matrice azioni

| Azione | admin | manager | PM (manager_id) | risorsa team | client |
|---|---|---|---|---|---|
| Creare progetto | ✅ | ✅ | — | ❌ | ❌ |
| Modificare/archiviare progetto | ✅ | ✅ (assegnati) | ✅ | ❌ | ❌ |
| Creare sottoprogetto | ✅ | ✅ | ✅ | ❌ | ❌ |
| Creare milestone | ✅ | ✅ | ✅ | ❌ | ❌ |
| Creare task (progetto) | ✅ | ✅ | ✅ | ✅ (scoped) | ❌ |
| Creare task Ad Hoc | ✅ | ✅ | ✅ | ✅ (per permesso) | ❌ |
| Creare ricorrenza (istanza) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modificare template globale | ✅ (solo super_admin) | ❌ | ❌ | ❌ | ❌ |
| Aggiornare stato/commentare task assegnata | ✅ | ✅ | ✅ | ✅ | ✅ (se client_visible+assegnata) |
| Completare task | ✅ | ✅ | ✅ | ✅ | ✅ (task cliente) |
| Approvare milestone | ✅ | ✅ | ✅ | ❌ | ✅ (se approval_required) |
| Vedere dati economici | ✅ (per ruolo) | ❌ | ❌ | ❌ | ❌ |

"scoped" = limitato ai progetti/sottoprogetti a cui la risorsa è assegnata.

## RLS per tabella (principi)

- **projects / project_workstreams / milestones**
  - admin: ALL.
  - team: SELECT se membro del team di progetto o assegnatario di una sua task;
    INSERT/UPDATE solo admin/manager/PM (via service role o policy su `manager_id`).
  - client: SELECT solo righe `visibility='client_visible'` del proprio `client_id`.
- **tasks**
  - admin: ALL.
  - team: SELECT task assegnate (via `task_assignees`) o dei progetti in cui è nel
    team; INSERT task scoped; UPDATE campi operativi delle proprie.
  - client: SELECT `visibility='client_visible' AND client_id = mio` ; UPDATE
    limitato (stato/commento/completamento) alle task cliente assegnate.
  - Ad Hoc: stesse regole via `client_id`; assegnatario decide la visibilità in
    workspace (risorsa) o cliente.
- **task_assignees / task_comments / task_checklist_items**
  - lettura allineata al task padre; scrittura assegnatari via service role.
- **recurring_task_templates**
  - admin/manager/PM: CRUD sui propri progetti; generazione occorrenze via service
    role (cron). client: nessun accesso ai template.
- **service_catalog / project_templates**
  - SELECT: staff. INSERT/UPDATE/DELETE: solo super_admin.

## Dati economici
Nessuna colonna economica nelle tabelle di progetto/task (per scelta). `revenue_model`
su `projects` è metadato non sensibile; eventuali importi vivranno in tabelle
economiche separate (fase futura) con RLS admin-only, mai esposte a workspace/cliente.

## Stato RLS `clients` (VERIFICATO 2026-07-24)
- `clients_admin_all` (ALL) → `get_my_role()='admin'`.
- `clients_client_own` (SELECT) → `client`/`guest` vedono **solo la propria riga**.
- `clients_team_all` (SELECT) → `team` **interni** (`NOT is_external_resource()`)
  vedono **tutti** i clienti.
- `clients_external` **caduta** nel reset. VIEW `clients_workspace` **viva**
  (mrr/fiscali azzerati) → base per letture Workspace/Cliente.

## Debito da chiudere (fase portali, non ora)
- **Esterni** (guest, freelance/partner flaggati `is_external_resource`): oggi non
  vedono i clienti dei progetti a cui sono assegnati (solo la propria riga). Nuova
  policy `clients_external_scoped`: SELECT dei clienti con almeno un
  progetto/task assegnato alla risorsa. Da introdurre in Fase 6.
- Decidere se i `team` interni restano read-all clienti o passano a scoped col
  nuovo modello progetti.
