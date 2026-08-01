-- 180 — La cronologia si conserva 20 giorni, poi si cancella da sé.
--
-- Ogni riga ha il suo termine: nasce con la modifica e muore 20 giorni dopo
-- **quella** modifica. Non c'è un azzeramento collettivo — una voce di oggi non
-- allunga la vita a una di tre settimane fa, e una scritta fra tre giorni morirà
-- tre giorni dopo le altre.
--
-- Il numero sta in configurazione e non nel codice: 20 giorni è una scelta, e le
-- scelte cambiano senza rilasciare una migration.
--
-- Va detto per intero: passata la finestra, quelle modifiche **non sono più
-- ripristinabili**, perché il ripristino legge il diff dalla riga di cronologia.
-- È il prezzo della pulizia, e l'interfaccia lo scrive invece di lasciarlo
-- scoprire a chi cerca una modifica del mese scorso.

CREATE TABLE IF NOT EXISTS public.activity_config (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  -- 0 = non cancellare mai. Sotto i 7 giorni la cronologia non serve più a niente.
  retention_days INT NOT NULL DEFAULT 20 CHECK (retention_days = 0 OR retention_days BETWEEN 7 AND 3650),
  last_purge_at  TIMESTAMPTZ,
  last_purge_rows INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.activity_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.activity_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_config_read  ON public.activity_config;
DROP POLICY IF EXISTS activity_config_admin ON public.activity_config;
-- lo staff deve poter leggere per quanto tempo si conserva la cronologia:
-- una finestra che non si conosce è una finestra di cui ci si accorge tardi
CREATE POLICY activity_config_read ON public.activity_config FOR SELECT
  USING (public.is_staff());
CREATE POLICY activity_config_admin ON public.activity_config FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ── La purga ────────────────────────────────────────────────────────────────
-- Cancella per data di creazione della singola riga: è la definizione di
-- «vent'anni dopo quella modifica», non «vent'anni dopo l'ultima».
CREATE OR REPLACE FUNCTION public.purge_activity_log()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_days    INT;
  v_deleted INT := 0;
BEGIN
  SELECT retention_days INTO v_days FROM public.activity_config WHERE id;
  IF v_days IS NULL OR v_days = 0 THEN
    RETURN 0;                      -- conservazione illimitata: non si tocca niente
  END IF;

  DELETE FROM public.activity_log
  WHERE created_at < now() - make_interval(days => v_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.activity_config
  SET last_purge_at = now(), last_purge_rows = v_deleted, updated_at = now()
  WHERE id;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_activity_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_activity_log() TO service_role;

-- ── Lo stato della purga, per l'interfaccia ─────────────────────────────────
-- Serve a non promettere una scadenza che non avviene: se pg_cron non è
-- installato la finestra è solo un'intenzione, e la pagina deve dirlo.
CREATE OR REPLACE FUNCTION public.activity_retention_status()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cfg       public.activity_config;
  v_scheduled BOOLEAN := false;
  v_expiring  INT := 0;
BEGIN
  SELECT * INTO v_cfg FROM public.activity_config WHERE id;

  BEGIN
    SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-activity-log') INTO v_scheduled;
  EXCEPTION WHEN OTHERS THEN
    v_scheduled := false;          -- pg_cron assente: nessuna purga automatica
  END;

  -- quante righe se ne vanno nelle prossime 24 ore: è l'unico numero che
  -- permette di salvare qualcosa prima che sparisca
  IF COALESCE(v_cfg.retention_days, 0) > 0 THEN
    SELECT count(*) INTO v_expiring FROM public.activity_log
    WHERE created_at < now() - make_interval(days => v_cfg.retention_days - 1);
  END IF;

  RETURN jsonb_build_object(
    'retention_days',  COALESCE(v_cfg.retention_days, 0),
    'scheduled',       v_scheduled,
    'last_purge_at',   v_cfg.last_purge_at,
    'last_purge_rows', COALESCE(v_cfg.last_purge_rows, 0),
    'expiring_soon',   v_expiring
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activity_retention_status() TO authenticated, service_role;

-- ── Giro notturno alle 3:40 (il 3:20 è già di sync-client-payment-status) ───
DO $$
BEGIN
  PERFORM cron.unschedule('purge-activity-log');
EXCEPTION WHEN OTHERS THEN
  NULL;                            -- non era programmato: va benissimo
END $$;

DO $$
BEGIN
  PERFORM cron.schedule('purge-activity-log', '40 3 * * *',
    $cron$ SELECT public.purge_activity_log(); $cron$);
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron non disponibile: la cronologia va ripulita a mano dalla pagina';
END $$;

NOTIFY pgrst, 'reload schema';
