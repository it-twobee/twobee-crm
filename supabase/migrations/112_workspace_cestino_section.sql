-- 112 — Voce "Cestino" nella sidebar del portale operativo (workspace).
-- Chi lavora in /workspace (manager, senior, junior…) elimina task da lì: deve
-- poter raggiungere il cestino per ripristinarle. La pagina è /workspace/cestino.
-- Additiva + idempotente (stesso pattern della 095_workspace_workload_section).

INSERT INTO public.workspace_sections (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
VALUES ('cestino', 'Cestino', 'Task eliminate: ripristina o elimina definitivamente', '/workspace/cestino', 'Trash2', 20, 'lavori', 1, true)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, route = EXCLUDED.route,
      icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order,
      group_key = EXCLUDED.group_key, group_order = EXCLUDED.group_order, is_active = true;

-- Visibile a tutti i ruoli workspace (sola lettura come voce di menu; il ripristino/
-- eliminazione è gated nel backend a chi ha cestinato o admin/manager).
INSERT INTO public.workspace_section_permissions (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true, false, false, false
FROM public.workspace_sections s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key = 'cestino'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );
