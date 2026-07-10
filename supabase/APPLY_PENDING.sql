-- ══════════════════════════════════════════════════════════════════════
-- TWO BEE — migration pendenti da applicare in un colpo solo.
-- Incolla TUTTO nel SQL Editor di Supabase e premi Run.
-- Include: 081, 086, 087, 088, 089, 090, 091, 092, 093.
-- Dopo il Run creare a mano i bucket privati: payslips, personal-documents, best-ideas.
-- ══════════════════════════════════════════════════════════════════════
BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 081_workspace_task_customercare_sections.sql
-- ─────────────────────────────────────────────────────────────────────
-- Migration 081: sezioni "Task" e "Customer Care" nel portale operativo (workspace)
-- + rinomina "Progetti assegnati" → "Progetti attivi" (ora tutti i progetti attivi, non solo quelli con task assegnate)

UPDATE public.workspace_sections
SET label = 'Progetti attivi',
    description = 'Tutti i progetti attivi, filtrabili per tipologia (growth/digital/marketing/ai)'
WHERE key = 'progetti';

INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, is_active, is_phase2)
VALUES
  ('task',           'Task',           'Vista completa su tutte le task di tutti i progetti (kanban, lista, gantt, workload)', '/workspace/task',           'ListChecks', 4, true, false),
  ('customer_care',  'Customer Care',  'Chat customer care e sistema ticket & supporto',                                       '/workspace/customer-care',  'Headset',    7, true, false)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      route = EXCLUDED.route,
      icon = EXCLUDED.icon,
      is_active = true;

-- Permessi: view + create + edit (no delete) per tutti i ruoli workspace
DO $$
DECLARE
  sec_id UUID;
  roles TEXT[] := ARRAY['manager','senior','junior','stage','freelance'];
  r TEXT;
BEGIN
  FOREACH r IN ARRAY roles LOOP
    FOR sec_id IN
      SELECT id FROM public.workspace_sections WHERE key IN ('task', 'customer_care')
    LOOP
      INSERT INTO public.workspace_section_permissions
        (section_id, app_role, can_view, can_create, can_edit, can_delete)
      VALUES (sec_id, r, true, true, true, false)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 086_decisions.sql
-- ─────────────────────────────────────────────────────────────────────
-- Decision Center — estende la tabella `decisions` creata dalla 044.
--
-- ATTENZIONE: la 044 aveva già creato public.decisions con
--   status (aperta|in_revisione|decisa|archiviata), priority, outcome, decided_by
-- Una CREATE TABLE IF NOT EXISTS qui non farebbe nulla e lascerebbe la UI a
-- scrivere su colonne inesistenti. Aggiungiamo solo ciò che manca davvero e
-- riusiamo priority/outcome invece di duplicarli con impact/decision.

ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS options   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rationale TEXT,
  ADD COLUMN IF NOT EXISTS area      TEXT,
  ADD COLUMN IF NOT EXISTS due_date  DATE;

CREATE INDEX IF NOT EXISTS idx_decisions_status ON public.decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_due_date ON public.decisions(due_date);

-- RLS: già abilitata dalla 044 con policy decisions_rls (admin|team).
-- Il Decision Center è founder/super_admin only, ma il gate sta nella pagina
-- server-side: non stringiamo la policy per non rompere altri consumer.
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────
-- 087_workspace_groups_sections.sql
-- ─────────────────────────────────────────────────────────────────────
-- Portale Operativo: raggruppamento sidebar + sezioni mancanti.
--
-- La sidebar workspace era una lista piatta. L'albero richiesto ha 5 gruppi:
-- Dashboard / Lavori / Clienti / Team / Profilo. Il gruppo vive in tabella così
-- resta configurabile senza deploy, come il resto di workspace_sections.

ALTER TABLE public.workspace_sections
  ADD COLUMN IF NOT EXISTS group_key   TEXT NOT NULL DEFAULT 'lavori',
  ADD COLUMN IF NOT EXISTS group_order INT  NOT NULL DEFAULT 1;

-- ─── Gruppi ──────────────────────────────────────────────────────────────────
-- dashboard(0) · lavori(1) · clienti(2) · team(3) · profilo(4)

UPDATE public.workspace_sections SET group_key = 'dashboard', group_order = 0 WHERE key = 'dashboard';
UPDATE public.workspace_sections SET group_key = 'lavori',    group_order = 1 WHERE key IN ('mie_attivita','calendario','chat','progetti','documenti');
UPDATE public.workspace_sections SET group_key = 'clienti',   group_order = 2 WHERE key IN ('clienti_attivi');
UPDATE public.workspace_sections SET group_key = 'team',      group_order = 3 WHERE key = 'hr';
UPDATE public.workspace_sections SET group_key = 'profilo',   group_order = 4 WHERE key = 'profilo';

-- ─── Sezioni nuove / mancanti ────────────────────────────────────────────────
-- ON CONFLICT: la migration deve poter girare due volte senza duplicare righe.

INSERT INTO public.workspace_sections (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
VALUES
  ('portfolio',           'Portfolio',           'Progetti in portfolio',                 '/workspace/portfolio',           'Briefcase',   6, 'lavori',  1, true),
  ('customer_care',       'Customer Care',       'Richieste dei clienti',                 '/workspace/customer-care',       'Headphones',  2, 'clienti', 2, true),
  ('ticket',              'Ticket',              'Ticket aperti',                         '/workspace/customer-care/tickets','Ticket',     3, 'clienti', 2, true),
  ('buste_paga',          'Buste Paga',          'Le tue buste paga mensili',             '/workspace/buste-paga',          'Receipt',     2, 'team',    3, true),
  ('documenti_personali', 'Documenti Personali', 'Scadenze e rinnovi dei tuoi documenti', '/workspace/documenti-personali', 'FileText',    3, 'team',    3, true),
  ('cronologia',          'Cronologia',          'Le tue attività recenti',               '/workspace/cronologia',          'History',     4, 'team',    3, true)
ON CONFLICT (key) DO UPDATE
  SET label       = EXCLUDED.label,
      description = EXCLUDED.description,
      route       = EXCLUDED.route,
      icon        = EXCLUDED.icon,
      sort_order  = EXCLUDED.sort_order,
      group_key   = EXCLUDED.group_key,
      group_order = EXCLUDED.group_order,
      is_active   = EXCLUDED.is_active;

-- Ordinamento interno ai gruppi secondo l'albero richiesto
UPDATE public.workspace_sections SET sort_order = 1 WHERE key = 'mie_attivita';
UPDATE public.workspace_sections SET sort_order = 2 WHERE key = 'calendario';
UPDATE public.workspace_sections SET sort_order = 3 WHERE key = 'chat';
UPDATE public.workspace_sections SET sort_order = 4 WHERE key = 'progetti';
UPDATE public.workspace_sections SET sort_order = 5 WHERE key = 'portfolio';
UPDATE public.workspace_sections SET sort_order = 6 WHERE key = 'documenti';
UPDATE public.workspace_sections SET sort_order = 1 WHERE key = 'clienti_attivi';
UPDATE public.workspace_sections SET sort_order = 1 WHERE key = 'hr';

-- ─── Permessi: le nuove sezioni sono visibili a tutti i ruoli workspace ──────
-- Il dato resta filtrato per profilo dentro ogni pagina (buste paga e documenti
-- personali sono owner-only via RLS: vedere la voce di menu non espone nulla).

INSERT INTO public.workspace_section_permissions (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true,
       r.app_role <> 'stage',   -- lo stage non crea
       r.app_role <> 'stage',
       false
FROM public.workspace_sections s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key IN ('portfolio','customer_care','ticket','buste_paga','documenti_personali','cronologia')
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );

-- Il partner non vede i dati economici del team né i clienti attivi interni
DELETE FROM public.workspace_section_permissions p
USING public.workspace_sections s
WHERE p.section_id = s.id
  AND p.app_role = 'partner'
  AND s.key IN ('buste_paga','clienti_attivi');

-- ─────────────────────────────────────────────────────────────────────
-- 088_payslips.sql
-- ─────────────────────────────────────────────────────────────────────
-- Buste paga.
--
-- Dati retributivi: il dipendente vede SOLO le proprie, nessun collega.
-- Solo admin/super_admin caricano, modificano, eliminano e leggono le altrui.
-- I file stanno nel bucket privato `payslips` (da creare a mano dal Dashboard
-- Supabase: i bucket non sono creabili da migration) e si scaricano con signed
-- URL a scadenza breve generati server-side. Mai URL pubblici.

CREATE TABLE IF NOT EXISTS public.payslips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year        INT  NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month       INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  file_path   TEXT NOT NULL,
  file_name   TEXT,
  notes       TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_profile_period
  ON public.payslips(profile_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payslips_profile ON public.payslips(profile_id);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

-- Lettura: la propria busta paga, oppure qualunque busta se admin.
DROP POLICY IF EXISTS payslips_select ON public.payslips;
CREATE POLICY payslips_select ON public.payslips
  FOR SELECT USING (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );

-- Scrittura: solo admin. Un dipendente non carica né modifica buste paga,
-- nemmeno le proprie (sarebbe un canale per alterare il documento).
DROP POLICY IF EXISTS payslips_insert ON public.payslips;
CREATE POLICY payslips_insert ON public.payslips
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS payslips_update ON public.payslips;
CREATE POLICY payslips_update ON public.payslips
  FOR UPDATE USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS payslips_delete ON public.payslips;
CREATE POLICY payslips_delete ON public.payslips
  FOR DELETE USING (public.get_my_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────
-- 089_personal_documents.sql
-- ─────────────────────────────────────────────────────────────────────
-- Documenti personali della risorsa, con scadenze e rinnovi.
--
-- Owner-only: ognuno vede e gestisce i propri. L'admin può leggerli e caricarli
-- (serve per l'onboarding e per la conformità), ma non è un archivio condiviso:
-- nessun collega vede i documenti di un altro.

CREATE TABLE IF NOT EXISTS public.personal_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_type             TEXT NOT NULL,
  label                TEXT NOT NULL,
  file_path            TEXT,
  file_name            TEXT,
  issued_at            DATE,
  expires_at           DATE,
  reminder_days_before INT NOT NULL DEFAULT 30 CHECK (reminder_days_before BETWEEN 0 AND 365),
  notes                TEXT,
  created_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_documents_profile ON public.personal_documents(profile_id);
CREATE INDEX IF NOT EXISTS idx_personal_documents_expires ON public.personal_documents(expires_at);

ALTER TABLE public.personal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_documents_select ON public.personal_documents;
CREATE POLICY personal_documents_select ON public.personal_documents
  FOR SELECT USING (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS personal_documents_insert ON public.personal_documents;
CREATE POLICY personal_documents_insert ON public.personal_documents
  FOR INSERT WITH CHECK (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS personal_documents_update ON public.personal_documents;
CREATE POLICY personal_documents_update ON public.personal_documents
  FOR UPDATE USING (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  ) WITH CHECK (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS personal_documents_delete ON public.personal_documents;
CREATE POLICY personal_documents_delete ON public.personal_documents
  FOR DELETE USING (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────────
-- 090_chat_rework.sql
-- ─────────────────────────────────────────────────────────────────────
-- Chat: nuova architettura a quattro gruppi.
--
--   Team      → #team-intern, #angolo-informativo, #best-ideas
--   Progetti  → un solo canale interno per progetto
--   Messaggi diretti → 1-a-1 fra membri del team
--   (Customer Care esce dalla chat: resta nella sua sezione)
--
-- I canali customer_care NON vengono toccati: /customer-care continua a usarli.
-- La chat semplicemente non li interroga più.

-- ─── 1. Nuovi tipi di canale ─────────────────────────────────────────────────
ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_type_check;

ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_type_check
    CHECK (type IN (
      'cliente', 'interno', 'task', 'customer_care',
      'cliente_interno', 'partner_customer_care',
      'team', 'dm'
    ));

-- Sottotipo per i tre canali aziendali fissi: serve a distinguerli fra loro
-- senza dipendere dal nome, che l'utente potrebbe rinominare.
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS team_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_channels_team_key
  ON public.chat_channels(team_key) WHERE team_key IS NOT NULL;

-- ─── 2. Partecipanti dei messaggi diretti ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_dm_participants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_participants_unique
  ON public.chat_dm_participants(channel_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_dm_participants_profile
  ON public.chat_dm_participants(profile_id);

ALTER TABLE public.chat_dm_participants ENABLE ROW LEVEL SECURITY;

-- Un DM è visibile solo ai suoi partecipanti. Niente eccezione per l'admin:
-- una conversazione privata fra due colleghi non è materiale di gestione.
DROP POLICY IF EXISTS dm_participants_select ON public.chat_dm_participants;
CREATE POLICY dm_participants_select ON public.chat_dm_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_dm_participants me
      WHERE me.channel_id = chat_dm_participants.channel_id
        AND me.profile_id = auth.uid()
    )
  );

-- L'inserimento passa sempre da una server action con service role
-- (come per chat_channels): qui neghiamo per default.
DROP POLICY IF EXISTS dm_participants_insert ON public.chat_dm_participants;
CREATE POLICY dm_participants_insert ON public.chat_dm_participants
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- ─── 3. Canali team ──────────────────────────────────────────────────────────
-- Idempotente: la migration deve poter girare due volte.

INSERT INTO public.chat_channels (name, type, team_key, position, created_at)
SELECT v.name, 'team', v.team_key, v.position, now()
FROM (VALUES
  ('team-intern',        'team_intern',        1),
  ('angolo-informativo', 'angolo_informativo', 2),
  ('best-ideas',         'best_ideas',         3)
) AS v(name, team_key, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_channels c WHERE c.team_key = v.team_key
);

-- ─── 4. Risorse di #best-ideas ───────────────────────────────────────────────
-- Non è una chat normale: ogni voce è un link o un allegato con titolo e tag.
CREATE TABLE IF NOT EXISTS public.chat_best_ideas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  url         TEXT,
  file_path   TEXT,
  file_name   TEXT,
  note        TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT best_ideas_has_content CHECK (url IS NOT NULL OR file_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_best_ideas_created ON public.chat_best_ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_best_ideas_tags ON public.chat_best_ideas USING GIN(tags);

ALTER TABLE public.chat_best_ideas ENABLE ROW LEVEL SECURITY;

-- Bacheca interna: la legge e la scrive chi fa parte del team.
DROP POLICY IF EXISTS best_ideas_select ON public.chat_best_ideas;
CREATE POLICY best_ideas_select ON public.chat_best_ideas
  FOR SELECT USING (public.get_my_role() IN ('admin', 'team'));

DROP POLICY IF EXISTS best_ideas_insert ON public.chat_best_ideas;
CREATE POLICY best_ideas_insert ON public.chat_best_ideas
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin', 'team'));

-- Elimina l'autore, oppure un admin.
DROP POLICY IF EXISTS best_ideas_delete ON public.chat_best_ideas;
CREATE POLICY best_ideas_delete ON public.chat_best_ideas
  FOR DELETE USING (created_by = auth.uid() OR public.get_my_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────
-- 091_google_credentials.sql
-- ─────────────────────────────────────────────────────────────────────
-- Credenziali Google fuori da user_metadata.
--
-- PERCHÉ: /api/google/callback salvava access_token e refresh_token in
-- auth.users.user_metadata. Quel campo è leggibile E scrivibile dal client
-- dell'utente stesso (supabase.auth.updateUser({data})), quindi un refresh
-- token — che vale finché non viene revocato — era esposto al browser.
-- Inoltre non esiste modo di leggere il metadata di un altro utente senza le
-- admin API, e il calendario condiviso ne ha bisogno.
--
-- Qui: tabella con RLS abilitata e NESSUNA policy. Anon e authenticated non
-- possono leggere né scrivere; il service role bypassa le RLS ed è l'unico
-- accesso, sempre server-side.

CREATE TABLE IF NOT EXISTS public.google_credentials (
  profile_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_token  TEXT,
  refresh_token TEXT,
  expiry        TIMESTAMPTZ,
  scope         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_credentials ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: deny-all per chiunque non sia service role.
-- (Non aggiungerne. Se serve sapere "è collegato?", usa profiles.google_connected.)

REVOKE ALL ON public.google_credentials FROM anon, authenticated;

-- Flag pubblico, non segreto: serve alla UI per mostrare "Collegato".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS google_connected BOOLEAN NOT NULL DEFAULT false;

-- Chi aveva già collegato Google ha i token nel metadata: il flag viene
-- ricalcolato al primo passaggio dal callback. Nessuna migrazione dei token:
-- non sono leggibili da qui, e vanno comunque ruotati.

-- ─────────────────────────────────────────────────────────────────────
-- 092_workspace_team_read_all.sql
-- ─────────────────────────────────────────────────────────────────────
-- ─── Workspace: manager…partner (role='team') vedono TUTTO ───────────────────
-- Richiesta: tutti i ruoli da manager in giù devono vedere, nell'area workspace,
-- tutti i clienti, tutti i progetti e tutte le task — non più solo quelli assegnati.
--
-- I ruoli workspace (manager, senior, junior, stage, freelance, partner) hanno
-- tutti role='team' in profiles; get_my_role() legge quel campo. Basta quindi
-- allargare le policy SELECT del team da "solo i miei client_ids" a "tutto".
--
-- La SCRITTURA resta invariata: tasks_team_read_write continua a limitare
-- create/update/delete ai clienti assegnati; qui aggiungiamo solo la lettura.

-- CLIENTI: da assegnati → tutti
DROP POLICY IF EXISTS "clients_team_assigned" ON public.clients;
CREATE POLICY "clients_team_all" ON public.clients
  FOR SELECT USING (public.get_my_role() = 'team');

-- PROGETTI: da assegnati → tutti
DROP POLICY IF EXISTS "projects_team" ON public.projects;
CREATE POLICY "projects_team_all" ON public.projects
  FOR SELECT USING (public.get_my_role() = 'team');

-- SPRINT: coerenza con la vista progetto completa
DROP POLICY IF EXISTS "sprints_team" ON public.sprints;
CREATE POLICY "sprints_team_all" ON public.sprints
  FOR SELECT USING (public.get_my_role() = 'team');

-- TASK: aggiunge la lettura di TUTTE le task (la policy FOR ALL scoped resta
-- per la scrittura; le policy permissive si sommano in OR).
DROP POLICY IF EXISTS "tasks_team_read_all" ON public.tasks;
CREATE POLICY "tasks_team_read_all" ON public.tasks
  FOR SELECT USING (public.get_my_role() = 'team');

-- ─────────────────────────────────────────────────────────────────────
-- 093_feedback.sql
-- ─────────────────────────────────────────────────────────────────────
-- ─── Feedback & idee: portale admin (raccolta) + operativo (proposta) ────────
-- Un feedback è sempre legato a una sezione: o una esistente (target_section_key,
-- che punta a workspace_sections.key o a una chiave di sezione admin), oppure la
-- proposta di una sezione nuova (proposed_section_name, con target_section_key NULL).

CREATE TABLE IF NOT EXISTS public.feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_portal         TEXT NOT NULL DEFAULT 'workspace' CHECK (source_portal IN ('admin','workspace')),
  kind                  TEXT NOT NULL DEFAULT 'improvement'
                          CHECK (kind IN ('improvement','new_section','idea','bug')),
  target_section_key    TEXT,          -- sezione esistente collegata; NULL se proposta nuova
  proposed_section_name TEXT,          -- nome della nuova sezione proposta
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  impact                TEXT NOT NULL DEFAULT 'media' CHECK (impact IN ('bassa','media','alta')),
  status                TEXT NOT NULL DEFAULT 'nuovo'
                          CHECK (status IN ('nuovo','in_valutazione','pianificato','in_corso','realizzato','archiviato')),
  admin_note            TEXT,
  vote_count            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_section_idx ON public.feedback (target_section_key);
CREATE INDEX IF NOT EXISTS feedback_status_idx  ON public.feedback (status);

-- Voti: una idea/feedback può essere votato dagli altri per prioritizzare.
CREATE TABLE IF NOT EXISTS public.feedback_votes (
  feedback_id UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_id, profile_id)
);

-- vote_count denormalizzato: mantenuto dal trigger.
CREATE OR REPLACE FUNCTION public.sync_feedback_votes() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feedback SET vote_count = vote_count + 1 WHERE id = NEW.feedback_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feedback SET vote_count = GREATEST(0, vote_count - 1) WHERE id = OLD.feedback_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_feedback_votes ON public.feedback_votes;
CREATE TRIGGER trg_feedback_votes
  AFTER INSERT OR DELETE ON public.feedback_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_feedback_votes();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;

-- Lo staff interno (admin + team) legge tutto: è una raccolta condivisa.
CREATE POLICY "feedback_read_staff" ON public.feedback
  FOR SELECT USING (public.get_my_role() IN ('admin','team'));

-- Ognuno crea il proprio; il cliente non entra in questa tabella.
CREATE POLICY "feedback_insert_own" ON public.feedback
  FOR INSERT WITH CHECK (author_id = auth.uid() AND public.get_my_role() IN ('admin','team'));

-- L'autore modifica il proprio; l'admin gestisce stato/note di tutti.
CREATE POLICY "feedback_update_own" ON public.feedback
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "feedback_admin_all" ON public.feedback
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "feedback_votes_read" ON public.feedback_votes
  FOR SELECT USING (public.get_my_role() IN ('admin','team'));
CREATE POLICY "feedback_votes_own" ON public.feedback_votes
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- ─── Sezione workspace "Feedback" ────────────────────────────────────────────
-- (dipende dalle colonne group_key/group_order della 087: eseguire dopo la 087)
INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
VALUES
  ('feedback', 'Feedback', 'Proponi miglioramenti e nuove sezioni', '/workspace/feedback', 'Lightbulb', 2, 'team', 3, true)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, route = EXCLUDED.route,
      icon = EXCLUDED.icon, group_key = EXCLUDED.group_key, group_order = EXCLUDED.group_order,
      is_active = true;

INSERT INTO public.workspace_section_permissions (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true, true, true, false
FROM public.workspace_sections s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key = 'feedback'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );

COMMIT;
