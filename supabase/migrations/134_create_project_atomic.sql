-- FASE 2 (project engine) — Creazione progetto atomica.
-- Additiva + idempotente.
--
-- PERCHÉ UNA FUNZIONE POSTGRES E NON UNA SERVER ACTION
-- Il §6 step 8 chiede: "la creazione deve essere atomica o gestire correttamente
-- i rollback. Non deve lasciare progetti parziali senza segnalazione."
-- Una server action che crea in sequenza e compensa in caso di errore non lo
-- garantisce: se il processo muore a metà, la compensazione non gira e resta un
-- progetto con metà struttura. Qui tutto sta in una transazione: o esiste tutto,
-- o non esiste niente.
--
-- IL PAYLOAD PORTA IL CONTENUTO GIÀ CONFERMATO, non la chiave del catalogo da
-- espandere. Il catalogo precompila il wizard, l'utente modifica nell'anteprima
-- (§7), la funzione crea esattamente ciò che l'utente ha approvato. È il flusso
-- del §27: AI suggerisce → utente modifica → utente conferma → sistema crea.

-- ─── Prerequisiti della funzione ────────────────────────────────────────────
-- Le fasi: lo sprint è temporale, la fase è logica. Un progetto Digital ha
-- Discovery → Analisi → Sviluppo → Rilascio indipendentemente da come sono
-- scanditi gli sprint.

CREATE TABLE IF NOT EXISTS public.project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key TEXT,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'da_avviare',
  requires_client_approval BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  deliverables JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.project_phases DROP CONSTRAINT IF EXISTS pph_status_chk;
ALTER TABLE public.project_phases ADD CONSTRAINT pph_status_chk
  CHECK (status IN ('da_avviare','in_corso','completata','bloccata','saltata'));

CREATE INDEX IF NOT EXISTS idx_pph_project ON public.project_phases(project_id, position);

ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pph_staff_read" ON public.project_phases;
CREATE POLICY "pph_staff_read" ON public.project_phases
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "pph_admin_write" ON public.project_phases;
CREATE POLICY "pph_admin_write" ON public.project_phases
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS phase_id UUID
  REFERENCES public.project_phases(id) ON DELETE SET NULL;
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS phase_id UUID
  REFERENCES public.project_phases(id) ON DELETE SET NULL;

-- Data desiderata (concordata col cliente) vs stimata (calcolata): il §17
-- chiede di non toccare mai la prima. Qui nasce solo la desiderata; il calcolo
-- della stimata arriva con il Digital Engine.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS desired_end_date DATE,
  ADD COLUMN IF NOT EXISTS estimated_end_date DATE,
  ADD COLUMN IF NOT EXISTS estimate_confidence TEXT,
  ADD COLUMN IF NOT EXISTS estimate_updated_at TIMESTAMPTZ;

-- ─── La funzione ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_project_from_wizard(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
  v_uid UUID := auth.uid();
  v_client UUID;
  v_service TEXT;
  v_cat RECORD;
  v_project UUID;
  v_sprint UUID;
  v_phase UUID;
  v_item JSONB;
  v_i INT := 0;
  n_phases INT := 0; n_routines INT := 0; n_tasks INT := 0;
  v_stream UUID;
BEGIN
  v_role := public.get_my_role();
  -- IS DISTINCT FROM: get_my_role() torna NULL per un utente senza profilo e
  -- `NOT IN` in un IF non scatterebbe (bug corretto dalla 126).
  IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'team' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_client  := (payload->>'client_id')::UUID;
  v_service := payload->>'service_key';

  IF v_client IS NULL THEN RAISE EXCEPTION 'client_id obbligatorio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_client) THEN
    RAISE EXCEPTION 'cliente inesistente';
  END IF;

  SELECT * INTO v_cat FROM public.service_catalog WHERE key = v_service AND is_active;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'servizio "%" non nel catalogo', v_service; END IF;

  -- ─── Progetto ─────────────────────────────────────────────────────────────
  INSERT INTO public.projects (
    client_id, name, description, status, lifecycle_status,
    service_key, service_line, delivery_model, growth_vertical,
    project_type, project_kind, sprint_current, manager_id,
    startup_target_days, desired_end_date, is_internal_project
  ) VALUES (
    v_client,
    COALESCE(NULLIF(payload->>'name',''), v_cat.name),
    NULLIF(payload->>'description',''),
    'attivo',
    CASE WHEN v_cat.delivery_engine = 'growth_program' THEN 'startup' ELSE 'active' END,
    v_service, v_cat.service_line, v_cat.delivery_engine,
    COALESCE(NULLIF(payload->>'growth_vertical','')::TEXT, v_cat.growth_vertical),
    COALESCE(NULLIF(payload->>'project_type',''), 'custom'),
    NULL, 1,
    NULLIF(payload->>'manager_id','')::UUID,
    COALESCE((payload->>'startup_target_days')::INT, 21),
    NULLIF(payload->>'desired_end_date','')::DATE,
    COALESCE((payload->>'is_internal_project')::BOOLEAN, false)
  ) RETURNING id INTO v_project;

  -- ─── Fasi (digital_project / structured_one_off) ──────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'phases','[]'::jsonb))
  LOOP
    INSERT INTO public.project_phases (project_id, key, name, position, status)
    VALUES (v_project, v_item->>'key', v_item->>'name', v_i, 'da_avviare');
    v_i := v_i + 1; n_phases := n_phases + 1;
  END LOOP;

  -- ─── Sprint iniziale ──────────────────────────────────────────────────────
  IF COALESCE(NULLIF(payload->>'sprint_name',''), '') <> '' THEN
    INSERT INTO public.sprints (project_id, name, start_date, end_date, status)
    VALUES (
      v_project, payload->>'sprint_name',
      COALESCE(NULLIF(payload->>'start_date','')::DATE, CURRENT_DATE),
      COALESCE(NULLIF(payload->>'start_date','')::DATE, CURRENT_DATE) + 14,
      'in_corso'
    ) RETURNING id INTO v_sprint;
  END IF;

  -- ─── Routine ricorrenti (growth_program / recurring_service) ──────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'routines','[]'::jsonb))
  LOOP
    INSERT INTO public.growth_routines
      (project_id, title, description, frequency, default_estimated_hours,
       template_key, position, starts_on, is_active)
    VALUES (
      v_project, v_item->>'title', v_item->>'description',
      COALESCE(v_item->>'frequency','mensile'),
      COALESCE((v_item->>'hours')::NUMERIC, 1),
      v_item->>'key', n_routines,
      COALESCE(NULLIF(payload->>'start_date','')::DATE, CURRENT_DATE),
      true
    );
    n_routines := n_routines + 1;
  END LOOP;

  -- ─── Task di startup ──────────────────────────────────────────────────────
  v_i := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'startup_tasks','[]'::jsonb))
  LOOP
    INSERT INTO public.tasks
      (project_id, client_id, scope_type, work_type, title, description,
       status, priority, estimated_hours, position, sprint_id, is_milestone)
    VALUES (
      v_project, v_client, 'project', 'startup',
      v_item->>'title', v_item->>'description',
      'da_fare', COALESCE(v_item->>'priority','media'),
      COALESCE((v_item->>'hours')::NUMERIC, 1),
      v_i, v_sprint, false
    );
    v_i := v_i + 1; n_tasks := n_tasks + 1;
  END LOOP;

  -- ─── Accordo economico: SOLO admin ────────────────────────────────────────
  -- Un manager può creare il progetto ma non l'accordo: il progetto resta
  -- `da_definire` e compare nella coda dell'admin (migration 132). È
  -- l'obbligo che si trasferisce, non un blocco all'operatività.
  IF payload ? 'agreement' AND payload->'agreement' <> 'null'::jsonb THEN
    IF v_role <> 'admin' THEN
      RAISE EXCEPTION 'solo un admin può definire l''accordo economico';
    END IF;
    INSERT INTO public.revenue_streams
      (client_id, project_id, label, service_line, revenue_model, amount,
       billing_frequency, start_date, end_date, status, source)
    VALUES (
      v_client, v_project,
      COALESCE(payload->'agreement'->>'label', v_cat.name),
      v_cat.service_line,
      COALESCE(payload->'agreement'->>'revenue_model', v_cat.default_revenue_model),
      COALESCE((payload->'agreement'->>'amount')::NUMERIC, 0),
      COALESCE(payload->'agreement'->>'billing_frequency', v_cat.default_billing_frequency, 'una_tantum'),
      COALESCE(NULLIF(payload->>'start_date','')::DATE, CURRENT_DATE),
      NULLIF(payload->'agreement'->>'end_date','')::DATE,
      'attivo', 'wizard'
    ) RETURNING id INTO v_stream;
  END IF;

  RETURN jsonb_build_object(
    'project_id', v_project,
    'sprint_id', v_sprint,
    'stream_id', v_stream,
    'phases', n_phases,
    'routines', n_routines,
    'startup_tasks', n_tasks,
    'economic_status', (SELECT economic_status FROM public.projects WHERE id = v_project)
  );
END $$;

REVOKE ALL ON FUNCTION public.create_project_from_wizard(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project_from_wizard(JSONB) TO authenticated;

-- Rollback: DROP FUNCTION public.create_project_from_wizard(JSONB);
