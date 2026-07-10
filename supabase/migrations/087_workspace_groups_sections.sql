-- Portale Operativo: raggruppamento sidebar + sezioni mancanti.
--
-- La sidebar workspace era una lista piatta. L'albero richiesto ha 5 gruppi:
-- Dashboard / Lavori / Clienti / Team / Profilo. Il gruppo vive in tabella così
-- resta configurabile senza deploy, come il resto di workspace_sections.

ALTER TABLE public.workspace_sections
  ADD COLUMN IF NOT EXISTS group_key   TEXT NOT NULL DEFAULT 'lavori',
  ADD COLUMN IF NOT EXISTS group_order INT  NOT NULL DEFAULT 1;

-- ─── Gruppi ──────────────────────────────────────────────────────────────────
-- dashboard(0) · lavori(1) · clienti(2) · team(3) · profilo(4)

UPDATE public.workspace_sections SET group_key = 'dashboard', group_order = 0 WHERE key = 'dashboard';
UPDATE public.workspace_sections SET group_key = 'lavori',    group_order = 1 WHERE key IN ('mie_attivita','calendario','chat','progetti','documenti');
UPDATE public.workspace_sections SET group_key = 'clienti',   group_order = 2 WHERE key IN ('clienti_attivi');
UPDATE public.workspace_sections SET group_key = 'team',      group_order = 3 WHERE key = 'hr';
UPDATE public.workspace_sections SET group_key = 'profilo',   group_order = 4 WHERE key = 'profilo';

-- ─── Sezioni nuove / mancanti ────────────────────────────────────────────────
-- ON CONFLICT: la migration deve poter girare due volte senza duplicare righe.

INSERT INTO public.workspace_sections (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
VALUES
  ('portfolio',           'Portfolio',           'Progetti in portfolio',                 '/workspace/portfolio',           'Briefcase',   6, 'lavori',  1, true),
  ('customer_care',       'Customer Care',       'Richieste dei clienti',                 '/workspace/customer-care',       'Headphones',  2, 'clienti', 2, true),
  ('ticket',              'Ticket',              'Ticket aperti',                         '/workspace/customer-care/tickets','Ticket',     3, 'clienti', 2, true),
  ('buste_paga',          'Buste Paga',          'Le tue buste paga mensili',             '/workspace/buste-paga',          'Receipt',     2, 'team',    3, true),
  ('documenti_personali', 'Documenti Personali', 'Scadenze e rinnovi dei tuoi documenti', '/workspace/documenti-personali', 'FileText',    3, 'team',    3, true),
  ('cronologia',          'Cronologia',          'Le tue attività recenti',               '/workspace/cronologia',          'History',     4, 'team',    3, true)
ON CONFLICT (key) DO UPDATE
  SET label       = EXCLUDED.label,
      description = EXCLUDED.description,
      route       = EXCLUDED.route,
      icon        = EXCLUDED.icon,
      sort_order  = EXCLUDED.sort_order,
      group_key   = EXCLUDED.group_key,
      group_order = EXCLUDED.group_order,
      is_active   = EXCLUDED.is_active;

-- Ordinamento interno ai gruppi secondo l'albero richiesto
UPDATE public.workspace_sections SET sort_order = 1 WHERE key = 'mie_attivita';
UPDATE public.workspace_sections SET sort_order = 2 WHERE key = 'calendario';
UPDATE public.workspace_sections SET sort_order = 3 WHERE key = 'chat';
UPDATE public.workspace_sections SET sort_order = 4 WHERE key = 'progetti';
UPDATE public.workspace_sections SET sort_order = 5 WHERE key = 'portfolio';
UPDATE public.workspace_sections SET sort_order = 6 WHERE key = 'documenti';
UPDATE public.workspace_sections SET sort_order = 1 WHERE key = 'clienti_attivi';
UPDATE public.workspace_sections SET sort_order = 1 WHERE key = 'hr';

-- ─── Permessi: le nuove sezioni sono visibili a tutti i ruoli workspace ──────
-- Il dato resta filtrato per profilo dentro ogni pagina (buste paga e documenti
-- personali sono owner-only via RLS: vedere la voce di menu non espone nulla).

INSERT INTO public.workspace_section_permissions (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true,
       r.app_role <> 'stage',   -- lo stage non crea
       r.app_role <> 'stage',
       false
FROM public.workspace_sections s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key IN ('portfolio','customer_care','ticket','buste_paga','documenti_personali','cronologia')
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );

-- Il partner non vede i dati economici del team né i clienti attivi interni
DELETE FROM public.workspace_section_permissions p
USING public.workspace_sections s
WHERE p.section_id = s.id
  AND p.app_role = 'partner'
  AND s.key IN ('buste_paga','clienti_attivi');
