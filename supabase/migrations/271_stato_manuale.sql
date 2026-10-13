-- 271 — la fase del lead torna a muoverla una persona (toglie §461)
-- Il trigger sul diario smette di spostare la fase: resta solo il ricalcolo di
-- ultimo contatto, tentativi e follow-up (come nella 263). Le regole, la fase
-- «Non raggiunto» e le voci «stato» già scritte restano com'erano: non si cancella storia.
BEGIN;

CREATE OR REPLACE FUNCTION public.tbv2_deal_activity_ricalcola()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM public.sales_ricalcola_contatto(OLD.deal_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND (TG_OP = 'INSERT' OR NEW.deal_id IS DISTINCT FROM OLD.deal_id) THEN
    PERFORM public.sales_ricalcola_contatto(NEW.deal_id);
  END IF;
  RETURN NULL;
END $$;

DROP FUNCTION IF EXISTS public.sales_riallinea_stati(boolean);

NOTIFY pgrst, 'reload schema';
COMMIT;
