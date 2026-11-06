-- 280 — La lavagna del team (§499, docs/lavagna.md).
-- Post-it, sticker, foto e link, anonimi. Solo chi ha attaccato una cosa la
-- sposta o la stacca, e la galleria di sticker e foto è di tutti.
--
-- L'autore non è un id: è una firma, HMAC-SHA256 dell'id con la chiave di
-- `lavagna_chiave`, calcolata dal server. Chi legge queste tabelle — anche chi
-- apre il database per tutt'altro — vede una stringa che non porta a nessuno;
-- per risalire a una persona bisogna volerlo, prendere la chiave e rifare il
-- conto per ogni profilo. Niente chiave esterna verso `profiles` per la stessa
-- ragione: un account eliminato non si porta via le sue cose, che sparendo
-- tutte insieme direbbero di chi erano.
--
-- Niente trigger di cronologia (`log_activity`), di proposito: ogni riga di
-- `activity_log` porta l'attore.
--
-- Tutte e quattro le tabelle sono deny-all: RLS attiva e nessuna policy.
-- Legge e scrive solo il server (`app/actions/lavagna.ts`,
-- `app/api/lavagna/media/**`), col service role, dopo `canSeeLavagna` /
-- `canWriteLavagna` — dal browser non passa niente, nemmeno la firma.
-- Prerequisiti: `workspace_sections` (087). Additiva e rilanciabile.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.lavagna_chiave (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  chiave text NOT NULL CHECK (char_length(chiave) >= 64),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- 244 bit casuali da due uuid v4: niente pgcrypto. Una volta sola: cambiarla
-- toglierebbe a tutti il diritto di staccare le proprie cose.
INSERT INTO public.lavagna_chiave (chiave)
VALUES (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lavagna_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('sticker', 'foto')),
  nome text NOT NULL DEFAULT '' CHECK (char_length(nome) <= 40),
  -- tutto ricodificato in WebP dal server (anche le GIF animate): via i dati
  -- EXIF, che direbbero con che telefono e dove è stata scattata una foto
  chiave_oggetto text NOT NULL UNIQUE CHECK (chiave_oggetto ~ '^lavagna/[0-9a-f-]{36}\.webp$'),
  chiave_mini text CHECK (chiave_mini IS NULL OR chiave_mini ~ '^lavagna/[0-9a-f-]{36}-mini\.webp$'),
  larghezza integer NOT NULL CHECK (larghezza BETWEEN 1 AND 4096),
  altezza integer NOT NULL CHECK (altezza BETWEEN 1 AND 4096),
  byte integer NOT NULL CHECK (byte > 0),
  autore text NOT NULL CHECK (autore ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lavagna_media_tipo_idx ON public.lavagna_media (tipo, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lavagna_elementi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('nota', 'sticker', 'foto', 'link')),
  -- chi ha caricato lo sticker lo può ritirare, e ritirarlo lo stacca ovunque
  media_id uuid REFERENCES public.lavagna_media(id) ON DELETE CASCADE,
  testo text NOT NULL DEFAULT '' CHECK (char_length(testo) <= 280),
  url text CHECK (url IS NULL OR (url ~ '^https?://' AND char_length(url) <= 500)),
  colore text NOT NULL DEFAULT 'giallo'
    CHECK (colore IN ('giallo', 'rosa', 'verde', 'azzurro', 'arancio', 'lilla')),
  -- il centro dell'elemento, in punti della lavagna (4000 × 2600)
  x real NOT NULL CHECK (x BETWEEN 0 AND 4000),
  y real NOT NULL CHECK (y BETWEEN 0 AND 2600),
  rotazione real NOT NULL DEFAULT 0 CHECK (rotazione BETWEEN -30 AND 30),
  scala real NOT NULL DEFAULT 1 CHECK (scala BETWEEN 0.4 AND 2.5),
  z double precision NOT NULL DEFAULT 0,
  autore text NOT NULL CHECK (autore ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lavagna_elementi_forma CHECK (
       (tipo IN ('sticker', 'foto') AND media_id IS NOT NULL AND url IS NULL)
    OR (tipo = 'nota' AND media_id IS NULL AND url IS NULL AND char_length(testo) > 0)
    OR (tipo = 'link' AND media_id IS NULL AND url IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS lavagna_elementi_z_idx ON public.lavagna_elementi (z DESC);
CREATE INDEX IF NOT EXISTS lavagna_elementi_media_idx ON public.lavagna_elementi (media_id) WHERE media_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lavagna_reazioni (
  elemento_id uuid NOT NULL REFERENCES public.lavagna_elementi(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('😂', '🔥', '❤️', '👏', '💀', '🤯')),
  autore text NOT NULL CHECK (autore ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (elemento_id, autore, emoji)
);

ALTER TABLE public.lavagna_chiave   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lavagna_media    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lavagna_elementi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lavagna_reazioni ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lavagna_chiave, public.lavagna_media, public.lavagna_elementi, public.lavagna_reazioni
  FROM anon, authenticated;

INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
SELECT
  'lavagna', 'Lavagna', 'Post-it, sticker, foto e link del team, tutti anonimi',
  '/workspace/lavagna', 'Sticker',
  COALESCE((SELECT max(sort_order) + 1 FROM public.workspace_sections WHERE group_key = 'team' AND key <> 'lavagna'), 21),
  'team',
  COALESCE((SELECT min(group_order) FROM public.workspace_sections WHERE group_key = 'team'), 3),
  true
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  route       = EXCLUDED.route,
  icon        = EXCLUDED.icon,
  group_key   = EXCLUDED.group_key,
  is_active   = true;

INSERT INTO public.workspace_section_permissions
  (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true, true, false, false
FROM public.workspace_sections AS s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key = 'lavagna'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions AS p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );

NOTIFY pgrst, 'reload schema';
COMMIT;

-- verifica: quattro tabelle con RLS e zero policy, una chiave, la voce nel workspace
SELECT
  (SELECT count(*) FROM pg_class WHERE relname LIKE 'lavagna\_%' AND relkind = 'r' AND relrowsecurity) AS tabelle_rls,
  (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'lavagna\_%') AS policy,
  (SELECT count(*) FROM public.lavagna_chiave) AS chiavi,
  (SELECT count(*) FROM public.workspace_section_permissions p JOIN public.workspace_sections s ON s.id = p.section_id WHERE s.key = 'lavagna') AS permessi_voce;
