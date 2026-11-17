-- 282 — «Vede tutti i lead» senza essere manager (§502).
--
-- `sales_access` conosceva tre livelli: admin, manager (tutta la pipeline) e
-- owner (solo i propri). Un junior che deve lavorare **tutti** i lead, senza
-- diventare manager — e quindi senza il governo su owner, eliminazione e
-- passaggio alla delivery — non aveva un posto. Nasce il livello `tutti`, che
-- la RLS legge come il manager e che le RPC di conversione (225) trattano come
-- un non-owner (non limitato) ma non come admin/manager (nessun passaggio).
--
-- Prerequisiti: 078, 223, 260. Rilanciabile.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.profile_permissions DROP CONSTRAINT IF EXISTS profile_permissions_permission_check;
ALTER TABLE public.profile_permissions ADD CONSTRAINT profile_permissions_permission_check CHECK (permission IN (
  'can_view_full_financials','can_view_macro_revenue','can_view_manager_economics',
  'can_view_deals','can_view_all_deals','can_view_team_data','can_view_strategy',
  'can_approve_hr','can_configure_workspace','can_manage_partners'
));

CREATE OR REPLACE FUNCTION public.sales_access(p_actor uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p.app_role IN ('super_admin','founder','admin') THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM profile_permissions g WHERE g.profile_id=p.id AND g.permission='can_view_deals' AND g.granted)
      THEN CASE WHEN p.app_role='manager' THEN 'manager'
        WHEN p.app_role IN ('senior','junior','stage','freelance','partner') THEN
          CASE WHEN EXISTS (SELECT 1 FROM profile_permissions a WHERE a.profile_id=p.id AND a.permission='can_view_all_deals' AND a.granted)
            THEN 'tutti' ELSE 'owner' END
        END
    END
  FROM profiles p WHERE p.id=p_actor AND p.is_active IS DISTINCT FROM false
$$;
REVOKE ALL ON FUNCTION public.sales_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_can_read_deal(p_deal uuid, p_assigned uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    public.sales_access(auth.uid()) IN ('admin','manager','tutti')
    OR (public.sales_access(auth.uid()) = 'owner' AND (
      p_assigned = auth.uid()
      OR EXISTS (SELECT 1 FROM public.deal_owners o
                 WHERE o.deal_id = p_deal AND o.profile_id = auth.uid())
    )),
    false)
$$;
REVOKE ALL ON FUNCTION public.sales_can_read_deal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_can_read_deal(uuid, uuid) TO authenticated, service_role;

COMMIT;

-- verifica: il vincolo ammette il permesso nuovo e la funzione risponde
SELECT
  (SELECT pg_get_constraintdef(oid) LIKE '%can_view_all_deals%' FROM pg_constraint
    WHERE conname = 'profile_permissions_permission_check') AS vincolo,
  (SELECT pg_get_functiondef('public.sales_access(uuid)'::regprocedure) LIKE '%tutti%')  AS funzione;
