-- Fase 3 — Workload: campi per l'intensità reale + rinomina voce sidebar. Additiva/idempotente.

-- D6: effort spalmato su un intervallo → serve una data di inizio task (oggi assente).
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date DATE;

-- D5: capacità settimanale per risorsa (default 40h, sovrascrivibile per part-time/freelance).
-- Su profiles perché il Workload mostra tutte le risorse attive (interne + esterne).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_capacity_hours NUMERIC(5,2) NOT NULL DEFAULT 40;

-- §9: "Progetti attivi" confluisce nel Workload. Disattiva la voce sidebar 'progetti'
-- (la rotta /workspace/progetti ora redirige a /workspace/workload). Resta la voce 'workload'.
UPDATE public.workspace_sections SET is_active = false WHERE key = 'progetti';
