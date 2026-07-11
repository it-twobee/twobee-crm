-- Riordina la sidebar workspace: "Workload" tra "Le mie attività" e "Calendario".
-- Additiva/idempotente (solo sort_order). Rinumera le voci visibili del gruppo 'lavori'.
UPDATE public.workspace_sections SET sort_order = 1 WHERE key = 'mie_attivita';
UPDATE public.workspace_sections SET sort_order = 2 WHERE key = 'workload';
UPDATE public.workspace_sections SET sort_order = 3 WHERE key = 'calendario';
UPDATE public.workspace_sections SET sort_order = 5 WHERE key = 'portfolio';
UPDATE public.workspace_sections SET sort_order = 6 WHERE key = 'documenti';
