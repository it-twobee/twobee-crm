-- 274 — Il colore della persona (§483). `profiles.avatar_color`, una delle otto
-- tinte di `lib/calendar-colors.ts` (il gate controlla che l'elenco sia lo
-- stesso); null = quella derivata dall'id. La sceglie il proprietario da «Il mio
-- profilo», quindi entra fra le colonne che `guard_profile_self_update` (224)
-- gli lascia scrivere. Rilanciabile; si ferma se in produzione la guardia non è
-- più quella della 224.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_color text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_color_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_color_check
  CHECK (avatar_color IS NULL OR avatar_color IN ('blu', 'arancio', 'acqua', 'giallo', 'magenta', 'verde', 'viola', 'rosso'));

DO $$
DECLARE def text := pg_get_functiondef('public.guard_profile_self_update'::regproc);
BEGIN
  IF position('''avatar_color''' IN def) = 0
     AND position('ARRAY[''full_name'',''avatar_url'',''phone'',''job_title'',''competencies'',''dashboard_config'']' IN def) = 0 THEN
    RAISE EXCEPTION 'guard_profile_self_update in produzione non è quella della 224: riconcilia prima di applicare';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND
    (to_jsonb(NEW) - ARRAY['full_name','avatar_url','avatar_color','phone','job_title','competencies','dashboard_config'])
      IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['full_name','avatar_url','avatar_color','phone','job_title','competencies','dashboard_config'])
  THEN
    RAISE EXCEPTION 'I permessi e i dati amministrativi del profilo si modificano solo dal server autorizzato'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_profile_self_update() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
