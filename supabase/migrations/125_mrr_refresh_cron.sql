-- FASE 1h — Ricalcolo notturno dell'MRR.
-- Additiva + idempotente.
--
-- PROBLEMA: il trigger `rs_sync_client_mrr` scatta sulle MODIFICHE agli accordi,
-- non sullo scorrere del tempo. Uno stream che scade stanotte lascia
-- `clients.mrr` al valore di ieri finché qualcuno non tocca quella riga.
-- È esattamente il motivo per cui in produzione c'erano TRE canoni scaduti
-- ancora a bilancio (16.300 dichiarati contro 12.100 reali).
-- Il prossimo è Petito Costruzioni, 30/09/2026.
--
-- SOLUZIONE: pg_cron alle 02:15 ogni notte. Se pg_cron non è disponibile sul
-- progetto, il blocco non fallisce: resta il pulsante manuale in Impostazioni.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- Rimuove la schedulazione precedente, se c'è (rende il blocco rieseguibile).
  PERFORM cron.unschedule('refresh-client-mrr')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-client-mrr');

  PERFORM cron.schedule(
    'refresh-client-mrr',
    '15 2 * * *',
    $cron$SELECT public.refresh_all_client_mrr()$cron$
  );
  RAISE NOTICE 'Job refresh-client-mrr schedulato alle 02:15';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_cron non disponibile (%): usa il pulsante manuale in Impostazioni', SQLERRM;
END $$;

-- Permette all'admin di forzare il ricalcolo dalla UI senza service role.
CREATE OR REPLACE FUNCTION public.refresh_mrr_now()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN public.refresh_all_client_mrr();
END $$;

REVOKE ALL ON FUNCTION public.refresh_mrr_now() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_mrr_now() TO authenticated;

-- Verifica
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'refresh-client-mrr';

-- Rollback:
--   SELECT cron.unschedule('refresh-client-mrr');
--   DROP FUNCTION public.refresh_mrr_now();
