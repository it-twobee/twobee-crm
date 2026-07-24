-- 147 — Project V2: schema del nuovo motore PM (sostituzione Asana)
--
-- Gerarchia: Cliente → Progetto → Sottoprogetto (workstream) → Milestone → Task.
-- + Task Ad Hoc (task_type='ad_hoc') agganciate al solo client_id.
-- Naming libero: le tabelle omonime del vecchio modello sono state droppate
-- nel reset (mig 144). Le scritture privilegiate passano da service role
-- (Server Action); la RLS (mig 148) governa soprattutto le SELECT.
--
-- Idempotente su re-run: IF NOT EXISTS + OR REPLACE dove possibile.

BEGIN;

-- ── trigger updated_at condiviso per tutte le tabelle V2 ────────────────────
CREATE OR REPLACE FUNCTION public.tbv2_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) CATALOGO SERVIZI (tassonomia configurabile)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.service_catalog (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area            TEXT NOT NULL CHECK (area IN ('marketing','growth','digital')),
  service_type    TEXT NOT NULL,
  service_subtype TEXT,
  label           TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- UNIQUE su espressione (COALESCE) → index, non constraint inline
CREATE UNIQUE INDEX IF NOT EXISTS uidx_service_catalog
  ON public.service_catalog (area, service_type, COALESCE(service_subtype, ''));
DROP TRIGGER IF EXISTS trg_service_catalog_updated ON public.service_catalog;
CREATE TRIGGER trg_service_catalog_updated BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 2) TEMPLATE DI PROGETTO (struttura suggerita per servizio) — dati, non codice
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.project_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type    TEXT NOT NULL,
  service_subtype TEXT,
  name            TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_project_templates_updated ON public.project_templates;
CREATE TRIGGER trg_project_templates_updated BEFORE UPDATE ON public.project_templates
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

CREATE TABLE IF NOT EXISTS public.project_template_nodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  parent_id           UUID REFERENCES public.project_template_nodes(id) ON DELETE CASCADE,
  node_type           TEXT NOT NULL CHECK (node_type IN ('workstream','milestone','task','recurring_task')),
  name                TEXT NOT NULL,
  description         TEXT,
  workstream_type     TEXT CHECK (workstream_type IN ('project','recurring')),
  milestone_type      TEXT CHECK (milestone_type IN ('delivery','system')),
  frequency           TEXT CHECK (frequency IN ('daily','weekly','biweekly','monthly','quarterly','custom')),
  suggested_owner_role TEXT,
  relative_due_days   INT,
  priority            TEXT CHECK (priority IN ('alta','media','bassa')),
  visibility          TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client_visible')),
  estimated_hours     NUMERIC,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ptn_template ON public.project_template_nodes(template_id);
CREATE INDEX IF NOT EXISTS idx_ptn_parent   ON public.project_template_nodes(parent_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) PROGETTI
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  area            TEXT NOT NULL CHECK (area IN ('marketing','growth','digital')),
  service_type    TEXT NOT NULL,
  service_subtype TEXT,
  operating_model TEXT CHECK (operating_model IN ('una_tantum','continuativo','misto')),
  revenue_model   TEXT CHECK (revenue_model IN ('fixed','retainer','performance','misto')),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','on_hold','completed','archived')),
  manager_id      UUID REFERENCES public.profiles(id),
  priority        TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','bassa')),
  visibility      TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client_visible')),
  start_date      DATE,
  target_end_date DATE,
  actual_end_date DATE,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_projects_client   ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status   ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_manager  ON public.projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_area_svc ON public.projects(area, service_type);
DROP TRIGGER IF EXISTS trg_projects_updated ON public.projects;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

-- team di progetto (per scoping RLS esterni + step Team del wizard)
CREATE TABLE IF NOT EXISTS public.project_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_project TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_profile ON public.project_members(profile_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4) SOTTOPROGETTI (workstream)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.project_workstreams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  workstream_type TEXT NOT NULL DEFAULT 'project' CHECK (workstream_type IN ('project','recurring')),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived')),
  owner_id        UUID REFERENCES public.profiles(id),
  priority        TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','bassa')),
  visibility      TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client_visible')),
  start_date      DATE,
  end_date        DATE,
  sort_order      INT NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workstreams_project ON public.project_workstreams(project_id);
CREATE INDEX IF NOT EXISTS idx_workstreams_type    ON public.project_workstreams(workstream_type);
CREATE INDEX IF NOT EXISTS idx_workstreams_status  ON public.project_workstreams(status);
DROP TRIGGER IF EXISTS trg_workstreams_updated ON public.project_workstreams;
CREATE TRIGGER trg_workstreams_updated BEFORE UPDATE ON public.project_workstreams
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 5) MILESTONE (delivery | system)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.milestones (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  workstream_id      UUID NOT NULL REFERENCES public.project_workstreams(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  milestone_type     TEXT NOT NULL DEFAULT 'delivery' CHECK (milestone_type IN ('delivery','system')),
  status             TEXT NOT NULL DEFAULT 'da_fare' CHECK (status IN ('da_fare','in_corso','in_approvazione','completata')),
  owner_id           UUID REFERENCES public.profiles(id),
  due_date           DATE,
  completed_at       TIMESTAMPTZ,
  approval_required  BOOLEAN NOT NULL DEFAULT false,
  approved_by        UUID REFERENCES public.profiles(id),
  approved_at        TIMESTAMPTZ,
  deliverable        TEXT,
  completion_criteria TEXT,
  visibility         TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client_visible')),
  sort_order         INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_milestones_workstream ON public.milestones(workstream_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project    ON public.milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status     ON public.milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_due        ON public.milestones(due_date);
DROP TRIGGER IF EXISTS trg_milestones_updated ON public.milestones;
CREATE TRIGGER trg_milestones_updated BEFORE UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 6) RICORRENZE (template) — la tabella; il motore di generazione è Fase 4
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.recurring_task_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  workstream_id       UUID REFERENCES public.project_workstreams(id) ON DELETE CASCADE,
  milestone_id        UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  frequency           TEXT NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly','quarterly','custom')),
  interval            INT NOT NULL DEFAULT 1,
  recurrence_rule     TEXT,
  weekdays            INT[],
  day_of_month        INT,
  start_date          DATE NOT NULL,
  end_date            DATE,
  generation_lead_days INT NOT NULL DEFAULT 3,
  owner_id            UUID REFERENCES public.profiles(id),
  priority            TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','bassa')),
  estimated_hours     NUMERIC,
  visibility          TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client_visible')),
  active              BOOLEAN NOT NULL DEFAULT true,
  last_generated_at   TIMESTAMPTZ,
  next_generation_at  TIMESTAMPTZ,
  created_by          UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rtt_active     ON public.recurring_task_templates(active, next_generation_at);
CREATE INDEX IF NOT EXISTS idx_rtt_project    ON public.recurring_task_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_rtt_workstream ON public.recurring_task_templates(workstream_id);
DROP TRIGGER IF EXISTS trg_rtt_updated ON public.recurring_task_templates;
CREATE TRIGGER trg_rtt_updated BEFORE UPDATE ON public.recurring_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 7) TASK (di progetto | ad_hoc)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  task_type             TEXT NOT NULL DEFAULT 'project' CHECK (task_type IN ('project','ad_hoc')),
  project_id            UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  workstream_id         UUID REFERENCES public.project_workstreams(id) ON DELETE CASCADE,
  milestone_id          UUID REFERENCES public.milestones(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  status                TEXT NOT NULL DEFAULT 'da_fare' CHECK (status IN ('da_fare','in_corso','in_review','richiesta_supporto','completato')),
  priority              TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','bassa')),
  assignee_id           UUID REFERENCES public.profiles(id),
  start_date            DATE,
  due_date              DATE,
  estimated_hours       NUMERIC,
  logged_hours          NUMERIC NOT NULL DEFAULT 0,
  visibility            TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client_visible')),
  recurring_template_id UUID REFERENCES public.recurring_task_templates(id) ON DELETE SET NULL,
  is_recurring_instance BOOLEAN NOT NULL DEFAULT false,
  generated_for_date    DATE,
  created_by            UUID REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  CONSTRAINT tasks_hierarchy_chk CHECK (
    (task_type = 'project' AND project_id IS NOT NULL AND workstream_id IS NOT NULL AND milestone_id IS NOT NULL)
    OR
    (task_type = 'ad_hoc'  AND project_id IS NULL AND workstream_id IS NULL AND milestone_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_tasks_client_type ON public.tasks(client_id, task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone   ON public.tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workstream  ON public.tasks(workstream_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project     ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee    ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due         ON public.tasks(due_date);
-- anti-duplicati occorrenze ricorrenti (idempotenza generazione)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_tasks_recurrence
  ON public.tasks(recurring_template_id, generated_for_date)
  WHERE recurring_template_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_tasks_updated ON public.tasks;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 8) MULTI-ASSEGNATARIO + COMMENTI + CHECKLIST
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.task_assignees (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  profile_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_primary_owner BOOLEAN NOT NULL DEFAULT false,
  role_in_task     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task    ON public.task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_profile ON public.task_assignees(profile_id);
DROP TRIGGER IF EXISTS trg_task_assignees_updated ON public.task_assignees;
CREATE TRIGGER trg_task_assignees_updated BEFORE UPDATE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

CREATE TABLE IF NOT EXISTS public.task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client_visible')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON public.task_comments(task_id);
DROP TRIGGER IF EXISTS trg_task_comments_updated ON public.task_comments;
CREATE TRIGGER trg_task_comments_updated BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_done     BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checklist_task ON public.task_checklist_items(task_id);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 9) TRIGGER DI DOMINIO (Fase 0): milestone di sistema + sync primario
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Ogni Sottoprogetto nasce con la milestone di sistema "Operatività continua"
-- (regge le ricorrenze e le attività senza consegna, dato milestone_id NOT NULL).
CREATE OR REPLACE FUNCTION public.tbv2_ensure_system_milestone()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.milestones (project_id, workstream_id, title, milestone_type, visibility, sort_order)
  VALUES (NEW.project_id, NEW.id, 'Operatività continua', 'system', NEW.visibility, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_workstream_system_milestone ON public.project_workstreams;
CREATE TRIGGER trg_workstream_system_milestone AFTER INSERT ON public.project_workstreams
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_ensure_system_milestone();

-- tasks.assignee_id = primario di task_assignees (primo is_primary_owner, poi il
-- più vecchio). Mantiene il campo primario leggibile dalle viste.
CREATE OR REPLACE FUNCTION public.tbv2_sync_task_primary_assignee()
RETURNS TRIGGER AS $$
DECLARE v_task UUID; v_primary UUID;
BEGIN
  v_task := COALESCE(NEW.task_id, OLD.task_id);
  SELECT profile_id INTO v_primary
  FROM public.task_assignees
  WHERE task_id = v_task
  ORDER BY is_primary_owner DESC, created_at ASC
  LIMIT 1;
  UPDATE public.tasks SET assignee_id = v_primary WHERE id = v_task;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_task_assignees_sync ON public.task_assignees;
CREATE TRIGGER trg_task_assignees_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_sync_task_primary_assignee();

COMMIT;

-- verifica: le 12 tabelle V2 devono esistere
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN (
  'service_catalog','project_templates','project_template_nodes','projects',
  'project_members','project_workstreams','milestones','recurring_task_templates',
  'tasks','task_assignees','task_comments','task_checklist_items'
) ORDER BY tablename;
