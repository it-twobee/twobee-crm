-- Fase 1 (operatività di base): stato "nuovo / da vedere" per-utente.
-- Un elemento (progetto, sprint, milestone, task) resta evidenziato come "nuovo"
-- finché l'utente non lo apre. Qui la sorgente di verità: UNA RIGA = quell'utente
-- ha VISTO quell'elemento. Assenza di riga + created_at recente ⇒ "nuovo".
-- Per-utente: due colleghi hanno badge indipendenti. RLS own-only (profile_id = auth.uid()).
-- Le milestone vivono in `tasks` (is_milestone) → item_type 'task'. item_id basta a
-- identificare (UUID globalmente unici), item_type è per leggibilità/debug.

CREATE TABLE IF NOT EXISTS public.item_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL,
  item_type   TEXT NOT NULL CHECK (item_type IN ('project','sprint','task')),
  seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_item_views_profile ON public.item_views(profile_id);

ALTER TABLE public.item_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_views_select_own ON public.item_views;
CREATE POLICY item_views_select_own ON public.item_views
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS item_views_insert_own ON public.item_views;
CREATE POLICY item_views_insert_own ON public.item_views
  FOR INSERT WITH CHECK (profile_id = auth.uid());

-- serve per l'upsert onConflict (aggiorna seen_at su rivisita)
DROP POLICY IF EXISTS item_views_update_own ON public.item_views;
CREATE POLICY item_views_update_own ON public.item_views
  FOR UPDATE USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS item_views_delete_own ON public.item_views;
CREATE POLICY item_views_delete_own ON public.item_views
  FOR DELETE USING (profile_id = auth.uid());

-- `sprints` non aveva created_at (001): serve al badge "nuovo". I record esistenti
-- vengono datati alla loro start_date (proxy: uno sprint vecchio non è "nuovo");
-- i futuri insert prendono now().
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
UPDATE public.sprints SET created_at = start_date::timestamptz WHERE created_at IS NULL;
ALTER TABLE public.sprints ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.sprints ALTER COLUMN created_at SET NOT NULL;
