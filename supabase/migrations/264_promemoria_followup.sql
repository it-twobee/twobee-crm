-- 264 — il promemoria del follow-up (§439)
--
-- Un follow-up si pianifica anche senza Google Calendar: resta nel diario del
-- lead (`deal_activities`, `type = 'followup'`, `google_event_id` vuoto), e
-- senza un calendario che suoni nessuno se ne ricorderebbe. Quindi un quarto
-- d'ora prima arriva una notifica nella campanella di chi l'ha fissato.
--
-- Solo per quelli **senza** evento Google: quelli con l'evento li ricorda già
-- Google, e due promemoria per la stessa call insegnano a ignorarne uno.
--
-- Chi è già stato avvisato sta in una tabella a parte, non in una colonna del
-- diario: scriverlo lì farebbe una voce di cronologia «Sistema» per ogni
-- promemoria, e la cronologia di un lead diventerebbe un elenco di sveglie.
--
-- Rilanciabile: `IF NOT EXISTS`, `CREATE OR REPLACE`, e il job si riprogramma.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_promemoria (
  activity_id uuid PRIMARY KEY REFERENCES public.deal_activities(id) ON DELETE CASCADE,
  inviato_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_promemoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_promemoria FROM anon, authenticated;
GRANT ALL ON public.sales_promemoria TO service_role;

CREATE OR REPLACE FUNCTION public.sales_promemoria_followup()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  WITH dovuti AS (
    SELECT a.id, a.deal_id, a.created_by, a.occurred_at, a.content, d.company_name, p.app_role
      FROM public.deal_activities a
      JOIN public.deals d    ON d.id = a.deal_id
      JOIN public.profiles p ON p.id = a.created_by
     WHERE a.type = 'followup' AND a.stato = 'in_programma'
       AND a.google_event_id IS NULL
       -- un quarto d'ora prima, e fino a un'ora dopo se il giro è saltato:
       -- oltre, un promemoria non ricorda più niente
       AND a.occurred_at <= now() + interval '15 minutes'
       AND a.occurred_at >  now() - interval '1 hour'
       AND p.is_active IS DISTINCT FROM false
       AND NOT EXISTS (SELECT 1 FROM public.sales_promemoria s WHERE s.activity_id = a.id)
  ), segnati AS (
    INSERT INTO public.sales_promemoria (activity_id)
    SELECT id FROM dovuti
    ON CONFLICT (activity_id) DO NOTHING
    RETURNING activity_id
  )
  INSERT INTO public.notifications (user_id, profile_id, type, title, body, link)
  SELECT d.created_by, d.created_by, 'followup_reminder',
         'Follow-up alle ' || to_char(d.occurred_at AT TIME ZONE 'Europe/Rome', 'HH24:MI') || ' · ' || d.company_name,
         COALESCE(NULLIF(d.content, ''), 'Follow-up'),
         -- il link resta nel portale di chi lo riceve: un collega del
         -- workspace mandato a /commerciale viene rimbalzato (§211)
         CASE WHEN d.app_role IN ('super_admin','founder','admin') THEN '/commerciale' ELSE '/workspace/commerciale' END
           || '?lead=' || d.deal_id
    FROM dovuti d JOIN segnati s ON s.activity_id = d.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.sales_promemoria_followup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_promemoria_followup() TO service_role;

COMMIT;

-- ogni cinque minuti. Guardata: se pg_cron non c'è, si dice e si va avanti.
DO $$
BEGIN
  PERFORM cron.unschedule('sales-promemoria-followup')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sales-promemoria-followup');
  PERFORM cron.schedule('sales-promemoria-followup', '*/5 * * * *',
    $cron$ SELECT public.sales_promemoria_followup(); $cron$);
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron non disponibile: schedula sales-promemoria-followup a mano';
END $$;

-- verifica: il job c'è, e un giro a vuoto non manda niente di strano
SELECT (SELECT count(*) FROM cron.job WHERE jobname = 'sales-promemoria-followup') AS job,
       public.sales_promemoria_followup() AS promemoria_inviati_adesso;
