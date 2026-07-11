# WORKSPACE — Piano Fase 0: Fondamenta di sicurezza

> DA APPROVARE prima di scrivere codice. Chiude i debiti di sicurezza che ogni fase
> successiva erediterebbe. Basato sulle decisioni D1–D4 (WORKSPACE_DECISIONS.md).
> Ambiente verificato: migration 087/095/096/097/098 **applicate in prod** (099 idem);
> gli economici NON sono chiusi da 096. Ogni migration è **additiva + idempotente**.

## Obiettivo
Portare le barriere economiche/perimetro dal solo layer UI (`hideEconomics`) al layer
**RLS + query**, e chiudere il gate Google lato server. Nessuna nuova feature.

---

## 0a — RLS economica: solo admin (migration pura, ZERO codice) 🟢 basso rischio
`is_staff()` = `admin OR team` → oggi il team legge deals/quotes/proposals/invoices via
query diretta. Le porto ad **admin-only**. Ogni tabella ha già la policy admin/client da
preservare (verificato).

| Tabella | Policy da rimuovere | Nuova policy | Preserva |
|---|---|---|---|
| `deals` | `deals_staff` | `deals_admin` FOR ALL `get_my_role()='admin'` | — |
| `deal_activities` | `deal_activities_staff` | `deal_activities_admin` idem | — |
| `quotes` | `quotes_staff` | `quotes_admin` idem | — |
| `proposal_documents` | `proposals_staff` | `proposals_admin` idem | — |
| `invoices` | `invoices_team_read` | *(nessuna: resta solo admin+client)* | `invoices_admin`, `invoices_client_read` |

→ Chiude **D1** (commerciale) e **D2** (fatture) a livello RLS. Admin invariato; Portale Cliente invariato (`invoices_client_read` resta).

## 0b — `clients`: protezione colonne economiche/fiscali (migration VIEW + codice) 🟠 medio
L'RLS è row-level: non può nascondere `mrr`. `clients_team_all` (092) dà al team SELECT
su tutte le colonne. Soluzione:
1. **VIEW `clients_workspace`** (allowlist colonne operative): `id, company_name, client_type, status, risk_score, client_label, is_internal, active_channels, created_at` (+`display_name` quando aggiunto in Fase 4). ESCLUSE: `mrr, package, payment_status, contract_start/end, notes` e ogni campo fiscale/anagrafica.
2. **DROP `clients_team_all`** → il team perde la SELECT diretta sulla tabella `clients` (chiude l'accesso a `mrr` via API). Restano `clients_admin_all` (admin) e `clients_client_own` (cliente).
3. **Repoint query workspace** a `clients_workspace`: `app/(workspace)/workspace/clienti/page.tsx` e `clienti/[id]/page.tsx` (oggi `.select('*')`).
4. **`AnagraficaTab` admin-only** (D3): `canSeeAnagrafica` = solo admin/super_admin (oggi include `senior`).

→ Chiude **D3** (anagrafica/mrr solo admin). Rischio: `ClientiList`/`ClientPageClient` sono condivisi; con `hideEconomics` non usano `mrr` (già gated da `canSeeMrr`) — verifico che nessun sort/filter workspace legga `mrr` prima del repoint.

## 0c — Gate Google @twobee.it lato server (codice, ZERO migration) 🟢 basso
- `app/api/google/auth/route.ts`: prima di generare l'OAuth URL, `getUser()` → se l'email NON finisce con `@twobee.it` → 403 con messaggio chiaro.
- `app/api/google/callback/route.ts`: stesso check prima dell'upsert token (difesa in profondità: qualcuno potrebbe arrivare al callback con un code).
- **D4-bis** (freelance/partner non-@twobee.it): per ora **bloccati** dal flusso standard; il "gate dedicato" è additivo e si progetta in Fase 2 (non blocca la 0c).

→ Chiude **D4**.

## 0d — Privacy storage (rimandata a Fase 5, ma segnalata) ⚠️
`documents` e `hr-attachments` usano `getPublicUrl` (link pubblici permanenti). È un leak
reale, ma è **intrecciato** col refactor Documenti Drive-only (Fase 5) e con D10 (cancellare
i documenti legacy). Farlo isolato ora romperebbe la UI Documenti attuale. **Raccomando** di
tenerlo in Fase 5; se lo vuoi subito, l'unico pezzo isolabile a basso rischio è `hr-attachments`
(passare a bucket privato + signed URL, come le buste paga). → decisione tua.

---

## Output Fase 0 (per §37)
- **File creati**: `supabase/migrations/100_workspace_security_rls.sql` (0a+0b).
- **File modificati**: `app/(workspace)/workspace/clienti/page.tsx`, `clienti/[id]/page.tsx` (repoint view); `components/clients/ClientPageClient.tsx` (`canSeeAnagrafica` admin-only); `app/api/google/auth/route.ts`, `app/api/google/callback/route.ts` (gate).
- **Migration**: 100 (additiva, idempotente, DROP POLICY IF EXISTS + CREATE; CREATE OR REPLACE VIEW).
- **Tabelle/RLS coinvolte**: `deals, deal_activities, quotes, proposal_documents, invoices, clients` (+ VIEW `clients_workspace`).
- **Componenti riusati**: `lib/permissions.ts` (helper ruoli), `is_staff/get_my_role` (RLS).
- **Route**: `/api/google/*`, `/workspace/clienti*`.
- **Test manuali per ruolo**: (a) utente `team` NON legge `mrr`/`invoices`/`quotes`/`deals` né via UI né via query diretta; (b) `admin` vede tutto invariato; (c) Portale Cliente vede le proprie fatture; (d) collegamento Google: `@twobee.it` ok, altro dominio 403; (e) `senior` NON vede più Anagrafica.
- **Test automatici**: tsc + build verdi.
- **Rischi**: repoint `clients_workspace` se qualche vista workspace legge una colonna esclusa → build/tsc lo intercetta; `hideEconomics` già copre l'UI. Il DROP `clients_team_all` va testato che non tolga al team la lista clienti (la VIEW la ridà).
- **Rollback**: la 100 è additiva; rollback = ripristinare `clients_team_all` e le `*_staff` (fornirò lo script inverso). Le modifiche codice sono su branch, revert Git.

---

## SQL della migration 100 (0a + 0b) — da eseguire a mano dopo l'approvazione
```sql
-- 100 — Fase 0: chiusura RLS economica + VIEW clients_workspace
-- 0a) Commerciale/fatture → solo admin
DROP POLICY IF EXISTS "deals_staff" ON public.deals;
CREATE POLICY "deals_admin" ON public.deals FOR ALL USING (public.get_my_role()='admin') WITH CHECK (public.get_my_role()='admin');
DROP POLICY IF EXISTS "deal_activities_staff" ON public.deal_activities;
CREATE POLICY "deal_activities_admin" ON public.deal_activities FOR ALL USING (public.get_my_role()='admin') WITH CHECK (public.get_my_role()='admin');
DROP POLICY IF EXISTS "quotes_staff" ON public.quotes;
CREATE POLICY "quotes_admin" ON public.quotes FOR ALL USING (public.get_my_role()='admin') WITH CHECK (public.get_my_role()='admin');
DROP POLICY IF EXISTS "proposals_staff" ON public.proposal_documents;
CREATE POLICY "proposals_admin" ON public.proposal_documents FOR ALL USING (public.get_my_role()='admin') WITH CHECK (public.get_my_role()='admin');
DROP POLICY IF EXISTS "invoices_team_read" ON public.invoices;  -- resta invoices_admin + invoices_client_read

-- 0b) clients: il team legge solo colonne operative via VIEW; niente accesso diretto a mrr
CREATE OR REPLACE VIEW public.clients_workspace WITH (security_invoker = false) AS
  SELECT id, company_name, client_type, status, risk_score, client_label, is_internal, active_channels, created_at
  FROM public.clients;
GRANT SELECT ON public.clients_workspace TO authenticated;
DROP POLICY IF EXISTS "clients_team_all" ON public.clients;  -- team non legge più clients.* (mrr/fiscali chiusi); restano clients_admin_all + clients_client_own
```
*(Nota: il DROP di `clients_team_all` va accompagnato dal repoint delle pagine workspace alla VIEW nello STESSO deploy, altrimenti la lista clienti workspace resta vuota. Perciò migration + codice vanno insieme.)*

---

## Cosa NON tocca la Fase 0
Task domain, Calendario sync, Workload, Drive, Knowledge, Cronologia, Profilo, HR upload —
tutte fasi successive. La 0 è solo la messa in sicurezza.
