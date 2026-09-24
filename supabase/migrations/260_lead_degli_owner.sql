-- 260 — La RLS dei lead conosce gli Account Owner (§430).
--
-- `sales_deals_read` (223) chiede `sales_can_read(assigned_to)`: chi ha
-- l'accesso `owner` legge solo le righe in cui è `assigned_to`. Ma dalla 236 chi
-- segue un lead sta in `deal_owners`, e `assigned_to` in produzione è vuoto su
-- tutti i 38 lead. La pagina e le azioni passano dal service role e tagliano da
-- sé (`requireDealAccess`, `leadDi`); chi legge con la sessione no — il
-- follow-up nel calendario (`/api/sales/follow-up`) rispondeva «Lead non
-- accessibile» a un senior che il lead lo segue davvero.
--
-- «Suo» vuol dire la stessa cosa che dice `leadDi()` in `lib/sales-guard.ts`:
-- Account Owner **o** `assigned_to`. Due definizioni diverse farebbero
-- rispondere la pagina e il calendario in due modi alla stessa domanda.
--
-- La funzione è SECURITY DEFINER per non fare un giro: la policy di
-- `deal_owners` (236) legge `deals`, e se la policy di `deals` leggesse
-- `deal_owners` con la RLS accesa le due si chiamerebbero a vicenda.
--
-- Non tocca `sales_can_read(uuid)`: resta com'è per chi la chiama ancora.
--
-- Prerequisiti: 223, 236. Rilanciabile.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.sales_can_read_deal(p_deal uuid, p_assigned uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    public.sales_access(auth.uid()) IN ('admin','manager')
    OR (public.sales_access(auth.uid()) = 'owner' AND (
      p_assigned = auth.uid()
      OR EXISTS (SELECT 1 FROM public.deal_owners o
                 WHERE o.deal_id = p_deal AND o.profile_id = auth.uid())
    )),
    false)
$$;
REVOKE ALL ON FUNCTION public.sales_can_read_deal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_can_read_deal(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS sales_deals_read ON public.deals;
CREATE POLICY sales_deals_read ON public.deals FOR SELECT TO authenticated
  USING (public.sales_can_read_deal(id, assigned_to));

COMMIT;

-- verifica: la policy usa la funzione nuova, e la funzione esiste
SELECT
  (SELECT qual FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deals' AND policyname = 'sales_deals_read') AS policy_deals,
  (SELECT count(*) FROM pg_proc WHERE proname = 'sales_can_read_deal')                        AS funzione;
