-- 156 — Sezione "Task Ad Hoc" nel portale Workspace
--
-- Elenco globale delle attività fuori progetto (task_type = 'ad_hoc'), finora
-- raggiungibili solo dal tab di un singolo cliente. La RLS sulle task decide
-- cosa vede ognuno: la voce di menu non allarga nessun permesso.
--
-- Posizione: gruppo 'lavori', subito dopo "Progetti" (sort_order 5), quindi 6.
-- "Documenti" occupava già il 6 e slitta al 7 per non creare un pareggio
-- (il layout ordina solo per sort_order: a parità l'ordine è arbitrario).

BEGIN;

-- fa spazio: sposta Documenti da 6 a 7
UPDATE public.workspace_sections SET sort_order = 7, updated_at = now()
WHERE key = 'documenti' AND sort_order = 6;

INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
SELECT
  'ad_hoc', 'Task Ad Hoc', 'Attività fuori progetto, per tutti i clienti',
  '/workspace/ad-hoc', 'ListTodo', 6, 'lavori',
  COALESCE((SELECT group_order FROM public.workspace_sections WHERE key = 'progetti'), 1),
  true
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  route       = EXCLUDED.route,
  icon        = EXCLUDED.icon,
  sort_order  = EXCLUDED.sort_order,
  group_key   = EXCLUDED.group_key,
  group_order = EXCLUDED.group_order,
  is_active   = true;

INSERT INTO public.workspace_section_permissions
  (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true, true, true, false
FROM public.workspace_sections AS s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key = 'ad_hoc'
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_section_permissions AS p
    WHERE p.section_id = s.id
      AND p.app_role = r.app_role
  );

COMMIT;

-- verifica
SELECT key, label, route, sort_order, group_key, is_active
FROM public.workspace_sections
WHERE group_key = 'lavori'
ORDER BY sort_order;
