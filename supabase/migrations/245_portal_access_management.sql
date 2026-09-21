-- Gestione accessi dalla scheda cliente. Richiede 244; nessun invito automatico.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.portal_memberships ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.portal_access_manager(p_client uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid;
BEGIN
  actor := (nullif(current_setting('request.headers',true),'')::jsonb->>'x-actor-id')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p CROSS JOIN public.clients c
    WHERE p.id = actor AND c.id = p_client AND p.is_active IS DISTINCT FROM false
      AND (p.app_role IN ('super_admin','founder','admin') OR p.email = 'm.lucci@twobee.it'
        OR (p.app_role = 'manager' AND c.workspace_hidden IS DISTINCT FROM true))
  ) THEN RAISE EXCEPTION 'Gestione accessi non autorizzata' USING ERRCODE = '42501'; END IF;
  RETURN actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_save_access(
  p_client uuid, p_profile uuid, p_role text, p_scope text, p_projects uuid[], p_revision integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; member public.portal_memberships; project uuid;
BEGIN
  actor := public.portal_access_manager(p_client);
  IF EXISTS (SELECT 1 FROM public.clients WHERE id=p_client AND client_label='lead') THEN
    RAISE EXCEPTION 'Acquisisci il lead come cliente prima di abilitare il portale';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('referente','collaboratore','lettore')
    OR p_scope IS NULL OR p_scope NOT IN ('all','selected') OR p_projects IS NULL
    OR cardinality(p_projects)>200 OR (p_scope='selected' AND cardinality(p_projects)=0)
    OR (p_scope='all' AND cardinality(p_projects)<>0) THEN
    RAISE EXCEPTION 'Permessi portale non validi' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_profile AND role IN ('client','guest')
    AND app_role IN ('client','guest') AND is_active IS DISTINCT FROM false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Questo account non è un referente cliente attivo' USING ERRCODE='42501'; END IF;
  FOREACH project IN ARRAY p_projects LOOP
    PERFORM 1 FROM public.projects WHERE id=project AND client_id=p_client AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Progetto non appartenente al cliente' USING ERRCODE='42501'; END IF;
  END LOOP;
  -- Lo stesso lock copre creazione, modifica e revoca; un retry non riattiva un revocato.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client::text || p_profile::text,0));
  SELECT * INTO member FROM public.portal_memberships WHERE client_id=p_client AND profile_id=p_profile FOR UPDATE;
  IF FOUND THEN
    IF p_revision IS NULL OR member.revision<>p_revision THEN
      RAISE EXCEPTION 'Accesso già presente o modificato: aggiorna la scheda' USING ERRCODE='40001';
    END IF;
    UPDATE public.portal_memberships SET portal_role=p_role, project_scope=p_scope,
      revoked_at=NULL, revision=revision+1 WHERE id=member.id;
  ELSE
    IF p_revision IS NOT NULL THEN RAISE EXCEPTION 'Accesso non trovato' USING ERRCODE='40001'; END IF;
    INSERT INTO public.portal_memberships(client_id,profile_id,portal_role,project_scope,created_by)
      VALUES(p_client,p_profile,p_role,p_scope,actor) RETURNING * INTO member;
  END IF;
  DELETE FROM public.portal_project_access WHERE membership_id=member.id;
  INSERT INTO public.portal_project_access(membership_id,client_id,project_id)
    SELECT member.id,p_client,id FROM (SELECT DISTINCT unnest(p_projects) AS id) selected;
  RETURN member.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_revoke_access(p_client uuid,p_profile uuid,p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.portal_access_manager(p_client);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client::text || p_profile::text,0));
  UPDATE public.portal_memberships SET revoked_at=now(), revision=revision+1
    WHERE client_id=p_client AND profile_id=p_profile AND revision=p_revision AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accesso già modificato: aggiorna la scheda' USING ERRCODE='40001'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_access_manager(uuid), public.portal_save_access(uuid,uuid,text,text,uuid[],integer),
  public.portal_revoke_access(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_access_manager(uuid), public.portal_save_access(uuid,uuid,text,text,uuid[],integer),
  public.portal_revoke_access(uuid,uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
