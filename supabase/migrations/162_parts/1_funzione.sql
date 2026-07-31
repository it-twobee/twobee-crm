CREATE OR REPLACE FUNCTION public.seed_project_template(t JSONB)
RETURNS BOOLEAN AS $fn$
DECLARE
  w JSONB; m JSONB; x JSONB;
  v_tpl UUID; v_ws UUID; v_ms UUID;
  wi INT; mi INT; xi INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_templates p
    WHERE p.service_type = t->>'service_type'
      AND p.service_subtype IS NOT DISTINCT FROM (t->>'service_subtype')
      AND p.name = t->>'name'
  ) THEN RETURN false; END IF;

  INSERT INTO public.project_templates (service_type, service_subtype, name, description, sort_order)
  VALUES (t->>'service_type', t->>'service_subtype', t->>'name', t->>'description',
          COALESCE((t->>'sort')::int, 100))
  RETURNING id INTO v_tpl;

  wi := 0;
  FOR w IN SELECT * FROM jsonb_array_elements(t->'ws') LOOP
    INSERT INTO public.project_template_nodes
      (template_id, parent_id, node_type, name, description, workstream_type, visibility, sort_order)
    VALUES (v_tpl, NULL, 'workstream', w->>'name', w->>'desc',
            COALESCE(w->>'type', 'project'), 'internal', wi)
    RETURNING id INTO v_ws;

    xi := 0;
    FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(w->'rec', '[]'::jsonb)) LOOP
      INSERT INTO public.project_template_nodes
        (template_id, parent_id, node_type, name, description, frequency,
         suggested_owner_role, priority, estimated_hours, visibility, sort_order)
      VALUES (v_tpl, v_ws, 'recurring_task', x->>'name', x->>'desc',
              COALESCE(x->>'freq', 'weekly'), x->>'role',
              COALESCE(x->>'prio', 'media'), (x->>'h')::numeric, 'internal', xi);
      xi := xi + 10;
    END LOOP;

    mi := 0;
    FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(w->'ms', '[]'::jsonb)) LOOP
      INSERT INTO public.project_template_nodes
        (template_id, parent_id, node_type, name, description, milestone_type,
         suggested_owner_role, relative_due_days, visibility, sort_order)
      VALUES (v_tpl, v_ws, 'milestone', m->>'name', m->>'desc',
              COALESCE(m->>'type', 'delivery'), m->>'role', (m->>'due')::int,
              COALESCE(m->>'vis', 'internal'), mi)
      RETURNING id INTO v_ms;

      xi := 0;
      FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(m->'tasks', '[]'::jsonb)) LOOP
        INSERT INTO public.project_template_nodes
          (template_id, parent_id, node_type, name, description, suggested_owner_role,
           relative_due_days, priority, estimated_hours, visibility, sort_order)
        VALUES (v_tpl, v_ms, 'task', x->>'name', x->>'desc', x->>'role',
                (x->>'due')::int, COALESCE(x->>'prio', 'media'),
                (x->>'h')::numeric, COALESCE(x->>'vis', 'internal'), xi);
        xi := xi + 10;
      END LOOP;
      mi := mi + 10;
    END LOOP;
    wi := wi + 10;
  END LOOP;

  RETURN true;
END;
$fn$ LANGUAGE plpgsql