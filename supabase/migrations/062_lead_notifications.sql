-- ─── Notifiche automatiche in-app all'arrivo di un nuovo lead ────────────────
-- Trigger universale: vale per qualsiasi fonte (form, import, futura API/webhook).
-- Crea una notifica per ogni membro del team commerciale + l'eventuale assegnatario.

CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  body_txt TEXT;
BEGIN
  body_txt := COALESCE(NEW.company || ' · ', '') || 'via ' || NEW.source::text;

  FOR r IN
    SELECT DISTINCT id FROM public.profiles
    WHERE is_active = true
      AND (app_role IN ('admin', 'manager', 'super_admin') OR id = NEW.assigned_to)
  LOOP
    INSERT INTO public.notifications (profile_id, user_id, type, title, body, link)
    VALUES (r.id, r.id, 'new_lead', 'Nuovo lead: ' || NEW.name, body_txt, '/commerciale');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_notify_insert ON public.leads;
CREATE TRIGGER leads_notify_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();
