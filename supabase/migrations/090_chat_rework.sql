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
