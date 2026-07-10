-- Migration 080: sezione "Clienti attivi" nel portale operativo (workspace)
-- Dati economici (MRR, pagamenti) oscurati lato app via prop hideEconomics.

INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, is_active, is_phase2)
VALUES
  ('clienti_attivi', 'Clienti attivi', 'Anagrafica clienti attivi (senza dati economici)', '/workspace/clienti', 'Users', 6, true, false)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      route = EXCLUDED.route,
      icon = EXCLUDED.icon,
      is_active = true;

-- Permessi: view per tutti i ruoli workspace (no create/edit/delete)
DO $$
DECLARE
  sec_id UUID;
  roles TEXT[] := ARRAY['manager','senior','junior','stage','freelance'];
  r TEXT;
BEGIN
  SELECT id INTO sec_id FROM public.workspace_sections WHERE key = 'clienti_attivi';
  FOREACH r IN ARRAY roles LOOP
    INSERT INTO public.workspace_section_permissions
      (section_id, app_role, can_view, can_create, can_edit, can_delete)
    VALUES (sec_id, r, true, false, false, false)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
