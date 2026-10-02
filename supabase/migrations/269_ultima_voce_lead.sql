-- 269 — l'ultima interazione di ogni lead, per la riga dell'elenco (§463)
--
-- L'elenco mostra la nota dell'ultima interazione. Leggerla con una select
-- sul diario si fermerebbe alle prime mille righe (il limite di PostgREST) e i
-- lead più vecchi resterebbero senza nota senza che nessuno lo veda: la
-- funzione prende **una riga per lead** dal database.
--
-- Cosa conta come interazione: quello che è successo (`stato = 'fatta'`), non i
-- follow-up in programma, non i contatti storici senza testo, non le voci
-- «stato» che scrive il trigger della 268. Solo lettura, chiusa agli utenti:
-- la chiama il server col service role, dopo aver deciso quali lead si vedono.
--
-- Rilanciabile.

BEGIN;

CREATE OR REPLACE FUNCTION public.sales_ultime_voci(p_ids uuid[])
RETURNS TABLE (deal_id uuid, type text, outcome text, direction text, content text, occurred_at timestamptz, has_time boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (a.deal_id) a.deal_id, a.type, a.outcome, a.direction, a.content, a.occurred_at, a.has_time
    FROM public.deal_activities a
   WHERE a.deal_id = ANY(p_ids)
     AND a.stato = 'fatta'
     AND a.type NOT IN ('stato', 'contatto', 'followup')
   ORDER BY a.deal_id, a.occurred_at DESC, a.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.sales_ultime_voci(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_ultime_voci(uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica: la funzione risponde e non scrive niente
SELECT count(*) AS lead_con_interazioni
  FROM public.sales_ultime_voci(ARRAY(SELECT id FROM public.deals));
