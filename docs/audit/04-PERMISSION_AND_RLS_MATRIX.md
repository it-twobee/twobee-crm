# 04 — Permission & RLS Matrix

> Verificato su `middleware.ts`, `lib/permissions.ts` e le policy nelle migration.
> Include le **falle RLS** rilevate. Nessun fix applicato in questa fase.

## Modello ruoli
- **`role`** (grezzo, letto da `get_my_role()` nelle RLS): `admin | team | client | guest`.
- **`app_role`** (granulare): super_admin…partner, viewer, client, guest.
- Mappa unica: `coarseRole(app_role)` in `lib/permissions.ts`.

| app_role | role | Portale |
|---|---|---|
| super_admin, founder, admin | admin | Admin (tutto) |
| manager, senior, junior, stage, freelance, partner, viewer | team | `/workspace` |
| client | client | `/portale` |
| guest (+resource_profile) | guest | `/risorsa` |
| guest (senza) | guest | `/portale` |

## Gate applicativo (middleware) — ✅ corretto
1. `/api/**` → passa (auth gestita nelle route).
2. `isWorkspace = !isAdminLevel && (isWorkspaceRole || role==='team')` → confina a `/workspace`. **Copre anche `viewer`.**
3. super_admin → può entrare in `/portale` (anteprima).
4. admin-level → può visitare `/workspace`.
5. guest+resource → `/risorsa`; client/guest → `/portale`; staff → fuori da `/portale`.

## Matrice accesso dati (attesa)
| Dato | admin | manager | team | client | guest-res |
|---|:--:|:--:|:--:|:--:|:--:|
| Costi/margini/compensi | ✅ founder+ | ❌ | ❌ | ❌ | ❌ |
| Fatture/preventivi | ✅ | ❌ | ❌ | proprie | ❌ |
| MRR per cliente | ✅ | ❌ | ❌ | ❌ | ❌ |
| Clienti/progetti/task (read) | ✅ | ✅ | ✅ (092) | propri | propri |
| Scrittura task | ✅ | ✅(PM) | scoped | ❌ | proprie |
| DM altrui | ❌ | ❌ | ❌ | — | — |
| Buste paga/doc personali altrui | ✅ | ❌ | ❌ | — | — |
| Token Google | solo service role | | | | |

## RLS verificate come CORRETTE ✅
- `google_credentials`: RLS on + `REVOKE ALL FROM anon, authenticated` → **deny-all**, solo service role. Ottimo.
- `chat_dm_participants` SELECT: solo chi è partecipante del canale → **admin non legge i DM altrui**. Ottimo.
- `payslips`: SELECT owner-or-admin; scrittura solo admin. Ottimo.
- `personal_documents`: owner-or-admin. Ottimo.
- `chat_best_ideas`: staff read/insert, delete owner-or-admin.

## 🔴 FALLE RLS rilevate — `USING (true) TO authenticated`
Queste policy consentono a **qualunque utente autenticato** (incluso un `client`
o `guest` del portale) di leggere/scrivere la tabella, ignorando l'ownership.
Poiché Supabase espone le tabelle via PostgREST con la chiave `authenticated`, un
cliente potrebbe interrogare dati di **altri** clienti/progetti.

| Migration | Tabella | Rischio | Perché è un problema |
|---|---|---|---|
| `015` | `client_interactions` | 🟠 alto | note/relazioni cliente: cross-tenant read/write |
| `043` | `project_appointments` | 🟠 alto | appuntamenti di qualsiasi progetto |
| `038` | `project_comments` | 🟠 medio | commenti di qualsiasi progetto |
| `032` | `client_kpi_config` | 🟠 medio | config KPI di qualsiasi cliente |
| `035` | `task_dependencies` | 🟡 basso | dipendenze task (meno sensibile) |
| `029` | `message_reactions` | 🟡 basso | solo SELECT reazioni |

**Nota di misura:** sono `TO authenticated`, quindi **anon** è escluso. L'esposizione
reale dipende da un client/guest che interroghi direttamente PostgREST. Non è una
porta pubblica, ma **viola il least-privilege** e va chiuso prima di dare accesso a
clienti reali. → Backlog `SEC-01` (P1), fix additivo: sostituire `USING(true)` con
policy per ownership/ruolo (staff-only o cliente-solo-il-proprio).

## Autorizzazione nelle server action (a campione) ✅
- `payslips.ts`, `workload-tasks.ts`, `task-assignees.ts`, `chat-dm.ts`,
  `admin-user.ts`: fanno il check ruolo/ownership **prima** di scrivere con
  service role. Pattern corretto e coerente.
- `admin-user.adminUpdateUserProfile`: anti-escalation (solo super admin assegna
  ruoli admin; nessun auto-declassamento). ✅

## Da approfondire (non concluso in audit)
- Verificare le RLS di `invoices`, `resource_costs`, `project_cost_entries`:
  confermare che client/team **non** possano leggerle (probabile ok, ma non
  ispezionato riga per riga in questa fase).
- Confermare la fonte canonica cliente↔utente fra `client_assignments` /
  `user_client_assignments` / `client_accounts` e allineare le RLS del portale.
