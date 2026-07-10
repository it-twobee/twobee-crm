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
