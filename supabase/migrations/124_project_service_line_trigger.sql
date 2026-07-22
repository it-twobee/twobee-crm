-- FASE 1g — `service_line` derivata automaticamente da `project_kind`.
-- Additiva + idempotente.
--
-- PROBLEMA: la 115 ha dato a service_line il DEFAULT 'digital'. Esistono 8 punti
-- che creano progetti (workspace-create ×2, NewClientModal, PanoramicaTab,
-- ProjectStatusTab, ProgettiClient, CreateProjectModal, OperativaClient) più lo
-- script scripts/import-asana.ts, che sta per creare 85 progetti su 11 clienti.
-- Tutti scrivono `project_kind` e nessuno `service_line`: senza questo trigger
-- nascerebbero tutti 'digital', inclusi i Growth, e la classificazione andrebbe
-- rifatta a mano — cioè esattamente ciò che la Fase 1 doveva evitare.
--
-- SOLUZIONE: il DEFAULT sparisce e un trigger BEFORE INSERT deriva il valore da
-- project_kind quando non è stato indicato esplicitamente. Copre gli 8 punti
-- esistenti e quelli futuri, senza toccare una riga di TypeScript.
-- (I trigger BEFORE girano prima della verifica del NOT NULL: la colonna resta
-- NOT NULL e l'insert senza service_line continua a funzionare.)

ALTER TABLE public.projects ALTER COLUMN service_line DROP DEFAULT;
ALTER TABLE public.projects ALTER COLUMN delivery_model DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.projects_derive_service_line()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.service_line IS NULL THEN
    NEW.service_line := CASE NEW.project_kind
      WHEN 'growth'    THEN 'growth'
      WHEN 'marketing' THEN 'marketing'
      WHEN 'ai'        THEN 'ai'
      WHEN 'digital'   THEN 'digital'
      ELSE 'digital'
    END;
  END IF;

  IF NEW.delivery_model IS NULL THEN
    -- Growth e Marketing sono operatività ricorrente; il resto è progettuale.
    NEW.delivery_model := CASE NEW.service_line
      WHEN 'growth'    THEN 'recurring_operations'
      WHEN 'marketing' THEN 'recurring_operations'
      ELSE 'structured_project'
    END;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS projects_service_line ON public.projects;

CREATE TRIGGER projects_service_line
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_derive_service_line();

-- Riallinea eventuali progetti già creati con il default 'digital' errato.
UPDATE public.projects
SET service_line = CASE project_kind
      WHEN 'growth'    THEN 'growth'
      WHEN 'marketing' THEN 'marketing'
      WHEN 'ai'        THEN 'ai'
      ELSE 'digital'
    END,
    delivery_model = CASE
      WHEN project_kind IN ('growth','marketing') THEN 'recurring_operations'
      ELSE 'structured_project'
    END
WHERE project_kind IS NOT NULL
  AND service_line = 'digital'
  AND project_kind <> 'digital';

-- Rollback:
--   DROP TRIGGER projects_service_line ON public.projects;
--   DROP FUNCTION public.projects_derive_service_line();
--   ALTER TABLE public.projects ALTER COLUMN service_line SET DEFAULT 'digital';
--   ALTER TABLE public.projects ALTER COLUMN delivery_model SET DEFAULT 'structured_project';
