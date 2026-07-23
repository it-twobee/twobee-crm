-- 145 — RESET: demolizione economics, commerciale, strategia, TwoBee OS
--
-- Segue la 144. Stesso backup (supabase/backup/2026-07-22-pre-reset/).
-- Sopravvivono: clients, chat, HR/documenti/buste paga, customer care/ticket,
-- profiles e ruoli.
--
-- ⚠️ os_tasks aveva 121 righe (roadmap interna) e os_phases 8: sono nel backup
-- JSON, non nel DB. revenue_streams 12, service_catalog 17, business_costs 11.

BEGIN;

-- ── economics / fatturazione ────────────────────────────────────────────────
DROP TABLE IF EXISTS public.revenue_milestones   CASCADE;
DROP TABLE IF EXISTS public.revenue_streams      CASCADE;
DROP TABLE IF EXISTS public.invoices             CASCADE;
DROP TABLE IF EXISTS public.quotes               CASCADE;
DROP TABLE IF EXISTS public.proposal_documents   CASCADE;
DROP TABLE IF EXISTS public.client_economics     CASCADE;
DROP TABLE IF EXISTS public.business_costs       CASCADE;
DROP TABLE IF EXISTS public.resource_costs       CASCADE;

-- ── commerciale / pipeline ──────────────────────────────────────────────────
DROP TABLE IF EXISTS public.deal_activities  CASCADE;
DROP TABLE IF EXISTS public.deals            CASCADE;
DROP TABLE IF EXISTS public.lead_contacts    CASCADE;
DROP TABLE IF EXISTS public.leads            CASCADE;

-- ── strategia / OKR / direzione ─────────────────────────────────────────────
DROP TABLE IF EXISTS public.key_results      CASCADE;
DROP TABLE IF EXISTS public.objectives       CASCADE;
DROP TABLE IF EXISTS public.decisions        CASCADE;
DROP TABLE IF EXISTS public.strategic_notes  CASCADE;
DROP TABLE IF EXISTS public.company_targets  CASCADE;
DROP TABLE IF EXISTS public.roadmap_items    CASCADE;

-- ── TwoBee OS (roadmap interna) ─────────────────────────────────────────────
DROP TABLE IF EXISTS public.os_tasks          CASCADE;
DROP TABLE IF EXISTS public.os_backlog_items  CASCADE;
DROP TABLE IF EXISTS public.os_ideas          CASCADE;
DROP TABLE IF EXISTS public.os_phases         CASCADE;

DROP TABLE IF EXISTS public.onboarding_steps  CASCADE;

COMMIT;

-- verifica: deve restituire 0 righe
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'revenue_streams','revenue_milestones','invoices','quotes','proposal_documents',
    'client_economics','business_costs','resource_costs','deals','deal_activities',
    'leads','lead_contacts','objectives','key_results','decisions','strategic_notes',
    'company_targets','roadmap_items','os_tasks','os_phases','os_backlog_items',
    'os_ideas','onboarding_steps'
  );
