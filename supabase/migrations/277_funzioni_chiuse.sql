-- 277 — Le funzioni privilegiate non si chiamano senza login (§492).
-- Linter di Supabase: 47 funzioni SECURITY DEFINER di `public` eseguibili da
-- `anon`, cioè da chiunque abbia la chiave pubblica (sta nel JavaScript che
-- ogni browser scarica) via /rest/v1/rpc/<nome>. Fra queste:
--   create_project_from_template — crea un progetto con qualunque contenuto, a
--     nome di chiunque; get_vacation_balance — le ferie di chiunque;
--     link_invoices_* e sync_client_* — riscrivono dati economici;
--     get_unread_counts — i non letti di chiunque.
-- Verificato il 21 ottobre 2026 sul database, una per una (vedi docs/migrations.md).
--
-- 1. Nessuna funzione definer di `public` resta eseguibile da anon. Si toglie
--    anche a PUBLIC — il permesso di default di Postgres — ma prima si registra
--    chi l'aveva: authenticated e service_role lo riavranno esplicito, altrimenti
--    le policy RLS che chiamano is_staff(), get_my_role()… smetterebbero di
--    funzionare per tutti.
-- 2. Otto funzioni le chiamano solo il server (service role), i trigger o il
--    cron, che girano come `postgres`: si chiudono anche ad authenticated —
--    dove ci sono anche i clienti del portale.
-- 3. get_vacation_balance: le proprie ferie, o di chiunque se admin.
-- 4. get_cc_*: i contatori del customer care solo allo staff.
-- 5. Le funzioni nuove nascono chiuse ad anon e PUBLIC: una RPC pubblica va
--    aperta di proposito, con un GRANT scritto.
-- Rilanciabile.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1 ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE f record; a boolean; s boolean;
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    a := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    s := has_function_privilege('service_role', f.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF a THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig); END IF;
    IF s THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig); END IF;
  END LOOP;
END $$;

-- 2 ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_project_from_template(jsonb, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.link_invoices_to_clients() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.link_invoice_rectifications() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_mrr(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_payment_status(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_type(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_all_client_payment_status() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_unread_counts(uuid) FROM authenticated;

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_vacation_balance(p_profile_id uuid, p_year integer DEFAULT (EXTRACT(year FROM now()))::integer)
 RETURNS TABLE(annual_days integer, accrued_days numeric, used_days numeric, remaining_days numeric, annual_leave_hours integer, used_leave_hours numeric, remaining_leave_hours numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_contract RECORD;
  v_months NUMERIC;
  v_used_vacation NUMERIC;
  v_used_leave NUMERIC;
BEGIN
  -- §492 — le proprie, o di chiunque se admin: nessuna riga altrimenti
  IF p_profile_id IS DISTINCT FROM auth.uid() AND public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RETURN;
  END IF;

  SELECT ec.* INTO v_contract
  FROM public.employee_contracts ec
  WHERE ec.profile_id = p_profile_id AND ec.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- Mesi maturati nell'anno (da inizio anno o data assunzione, quello che è dopo)
  v_months := LEAST(
    EXTRACT(MONTH FROM now()),
    CASE
      WHEN EXTRACT(YEAR FROM v_contract.start_date) = p_year
      THEN EXTRACT(MONTH FROM now()) - EXTRACT(MONTH FROM v_contract.start_date) + 1
      ELSE EXTRACT(MONTH FROM now())
    END
  );
  IF v_months < 0 THEN v_months := 0; END IF;

  -- Ferie usate nell'anno
  SELECT COALESCE(SUM(
    CASE
      WHEN hr.end_date IS NOT NULL
      THEN (hr.end_date - hr.start_date + 1)
      ELSE CASE WHEN hr.is_full_day THEN 1 ELSE 0.5 END
    END
  ), 0) INTO v_used_vacation
  FROM public.hr_requests hr
  WHERE hr.profile_id = p_profile_id
    AND hr.type = 'ferie'
    AND hr.status IN ('pending', 'approved')
    AND EXTRACT(YEAR FROM hr.start_date) = p_year;

  -- Permessi usati (ore)
  SELECT COALESCE(SUM(
    CASE
      WHEN hr.start_time IS NOT NULL AND hr.end_time IS NOT NULL
      THEN EXTRACT(EPOCH FROM (hr.end_time - hr.start_time)) / 3600
      ELSE CASE WHEN hr.is_full_day THEN 8 ELSE 4 END
    END
  ), 0) INTO v_used_leave
  FROM public.hr_requests hr
  WHERE hr.profile_id = p_profile_id
    AND hr.type = 'permesso'
    AND hr.status IN ('pending', 'approved')
    AND EXTRACT(YEAR FROM hr.start_date) = p_year;

  RETURN QUERY SELECT
    v_contract.annual_vacation_days,
    ROUND(v_contract.annual_vacation_days * v_months / 12, 1),
    v_used_vacation,
    ROUND(v_contract.annual_vacation_days * v_months / 12 - v_used_vacation, 1),
    v_contract.annual_leave_hours,
    v_used_leave,
    ROUND(v_contract.annual_leave_hours - v_used_leave, 1);
END;
$function$;

-- 4 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cc_message_counts(p_client_ids uuid[])
 RETURNS TABLE(channel_id uuid, count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT cm.id AS channel_id, COUNT(msg.id) AS count
    FROM public.chat_channels cm
    LEFT JOIN public.chat_messages msg ON msg.channel_id = cm.id AND msg.is_deleted = false
   WHERE cm.client_id = ANY(p_client_ids) AND cm.type = 'customer_care'
     AND public.is_staff()   -- §492 — i clienti del portale non contano i messaggi di nessuno
   GROUP BY cm.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_cc_recent_message_counts(p_client_ids uuid[])
 RETURNS TABLE(channel_id uuid, count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT cm.id AS channel_id, COUNT(msg.id) AS count
    FROM public.chat_channels cm
    LEFT JOIN public.chat_messages msg ON msg.channel_id = cm.id AND msg.is_deleted = false
     AND msg.created_at > NOW() - INTERVAL '7 days'
   WHERE cm.client_id = ANY(p_client_ids) AND cm.type = 'customer_care'
     AND public.is_staff()
   GROUP BY cm.id;
$function$;

-- CREATE OR REPLACE conserva i permessi, ma si ribadiscono: chiusi ad anon
REVOKE EXECUTE ON FUNCTION public.get_vacation_balance(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_cc_message_counts(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_cc_recent_message_counts(uuid[]) FROM PUBLIC, anon;

-- 5 ─────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
