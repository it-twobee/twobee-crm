-- Voce "Workload" nel portale operativo.
-- Il layout la inietta comunque come fallback se questa non è applicata; qui la
-- rendiamo persistente e configurabile come le altre sezioni.

INSERT INTO public.workspace_sections (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
VALUES ('workload', 'Workload', 'Carico di lavoro e timeline dei progetti', '/workspace/workload', 'Gauge', 7, 'lavori', 1, true)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, route = EXCLUDED.route,
      icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order,
      group_key = EXCLUDED.group_key, group_order = EXCLUDED.group_order, is_active = true;

-- Visibile a tutti i ruoli workspace (sola lettura; l'editing è gated nel codice
-- al PM del progetto o all'admin).
INSERT INTO public.workspace_section_permissions (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true, false, false, false
FROM public.workspace_sections s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key = 'workload'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );
