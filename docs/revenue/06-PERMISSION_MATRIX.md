# 06 — Matrice dei permessi economici

## Ruoli

`lib/permissions.ts` — `coarseRole(app_role)` è l'unica fonte `app_role → role`.

- **Admin portal**: `super_admin`, `founder`, `admin` → `role='admin'`
- **Workspace**: `manager`, `senior`, `junior`, `stage`, `freelance`, `partner` → `role='team'`
- **Cliente**: `client`, `guest` → `role='client'`
- **Risorsa esterna**: `guest` + `resource_profiles.can_access_resource_portal`

In produzione: 2 admin (Marco Lucci super_admin, Toto Piacente admin),
7 team (5 manager, 1 junior, +test).

## Matrice target

| Dato | admin | team (Workspace) | client | guest/risorsa |
|---|---|---|---|---|
| Growth MRR per cliente | ✅ | ❌ | ❌ | ❌ |
| Total Recurring Revenue (aggregato) | ✅ | **❓ Q10** | ❌ | ❌ |
| Fatturato YTD aggregato | ✅ | ✅ (solo somma + trend mensile) | ❌ | ❌ |
| Fatturato per cliente | ✅ | ❌ | ✅ solo il proprio | ❌ |
| `invoices` (righe) | ✅ | ❌ | ✅ solo le proprie | ❌ |
| `quotes` / `deals` / `proposal_documents` | ✅ | ❌ | ❌ | ❌ |
| `revenue_streams` (nuova) | ✅ | ❌ | ❌ | ❌ |
| `resource_costs` / `business_costs` / `project_cost_entries` | ✅ | ❌ | ❌ | ❌ |
| Margini, unit economics | ✅ | ❌ | ❌ | ❌ |
| Budget di iniziativa Growth | ✅ | ❓ Q26 | ❌ | ❌ |
| Task, sprint, milestone, progetti | ✅ | ✅ | ✅ solo i propri | scoped |
| Task ad hoc cliente | ✅ | ✅ | ❓ Q24 | scoped |
| Ore stimate / logged (Workload) | ✅ | ✅ | ❌ | proprie |

## Stato attuale vs target

### Già a posto (migration 100, in produzione)

- `deals`, `quotes`, `proposal_documents` → `FOR ALL USING (get_my_role()='admin')` ✅
- `invoices` → `invoices_team_read` **droppata** ✅
- `resource_costs`, `project_cost_entries`, `business_costs` → admin-only ✅
- VIEW `clients_workspace` con `mrr=0`, fiscali `NULL`, `security_invoker=false`,
  `WHERE is_staff()` ✅
- `clients_team_all` droppata ✅

### Da sistemare

| # | Problema | Fix |
|---|---|---|
| P1 | `app/(workspace)/workspace/page.tsx:106-110` usa `createAdminClient()` (service role) inline per calcolare MRR + fatturato. Bypassa ogni RLS; la correttezza dipende dal fatto che nessuno tocchi quel `.select()` | Sostituire con RPC `workspace_revenue_summary()` `SECURITY DEFINER` che ritorna **solo aggregati** e verifica `is_staff()` internamente. Il service role sparisce dalla pagina |
| P2 | Il Workspace vede `totalMrr`. Il §8 autorizza **solo** il fatturato | Decisione Q10. Se si toglie: rimuovere dalla pagina e dall'RPC |
| P3 | Label errato: "Totale incassato quest'anno" su un dato filtrato per `month`, non `paid_at` | Correggere formula o label (vedi Q7) |
| P4 | `revenue_streams` / `revenue_milestones` non esistono → nessuna RLS | Creare admin-only fin dal primo giorno |
| P5 | `tasks_team_read_all` esclude `project_id IS NULL` → nasconderebbe le ad hoc cliente | Vedi doc 05: passare a `scope_type IN ('project','client')` |
| P6 | `clients_workspace` non espone `display_name` / `legal_name` (migration 105) | Verificare che la VIEW sia stata aggiornata; se no, il Workspace vede solo `company_name` |

## Principio non negoziabile

> Il backend restituisce l'aggregato già autorizzato. Mai dataset dettagliati al
> client Workspace da aggregare nel browser. (§8)

Oggi questo è rispettato **come effetto**, non **come struttura**: l'aggregazione
avviene in una pagina server-side con service role. Un `select` in più e il
dettaglio esce. L'RPC `workspace_revenue_summary` sposta la garanzia dal codice
applicativo al database, dove non può essere aggirata per distrazione.

## Firma proposta

```sql
CREATE OR REPLACE FUNCTION public.workspace_revenue_summary(p_year INT DEFAULT NULL)
RETURNS TABLE (
  year INT,
  revenue_ytd NUMERIC,
  monthly_revenue JSONB,     -- [{month:'2026-01', amount:1234.00}, …]
  annual_target NUMERIC,     -- nullable
  target_progress NUMERIC,   -- nullable, 0..1
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  -- … aggregazione, MAI per cliente/progetto
END $$;

REVOKE ALL ON FUNCTION public.workspace_revenue_summary(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_revenue_summary(INT) TO authenticated;
```

`annual_target` richiede una tabella `company_targets(year, revenue_target)` —
non esiste (`client_targets` della migration 047 sono target **KPI di cliente**,
non obiettivi di fatturato aziendale). Da creare se la risposta a Q11 è sì.

## Da verificare in Fase 7

- middleware (`middleware.ts`) — gate `/workspace` vs `/dashboard`
- layout admin e workspace
- ogni Server Action che tocca `revenue_streams` / `invoices`
- `app/api/ai/*` — `margin-analysis`, `executive-brief`, `dashboard-chat`,
  `kpi-report` ricevono dati economici: verificare che non siano raggiungibili
  da un utente Workspace
- `app/actions/global-search.ts` — cerca su `quotes`/`deals`: controllare il
  filtro per ruolo
