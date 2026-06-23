-- ─── Command Center tasks ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.os_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL
    CHECK (category IN ('costruire','modificare','ottimizzare','eliminare')),
  priority      TEXT NOT NULL DEFAULT 'media'
    CHECK (priority IN ('critica','alta','media','bassa')),
  section       TEXT NOT NULL DEFAULT 'dev',
  status        TEXT NOT NULL DEFAULT 'aperto'
    CHECK (status IN ('aperto','completato')),
  title         TEXT NOT NULL,
  description   TEXT,
  file_paths    TEXT[],
  related_files TEXT[],
  effort_days   NUMERIC(3,1),
  notes         TEXT,
  is_next_step  BOOLEAN NOT NULL DEFAULT false,
  ai_suggested  BOOLEAN NOT NULL DEFAULT false,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.os_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "os_tasks_admin" ON public.os_tasks;
CREATE POLICY "os_tasks_admin" ON public.os_tasks
  FOR ALL USING (public.get_my_role() = 'admin');

ALTER TABLE public.os_tasks
  ADD CONSTRAINT os_tasks_title_unique UNIQUE (title);

-- ─── Seed: stato completo del codebase al 22/06/2025 ─────────────────────────

INSERT INTO public.os_tasks (category, priority, section, title, description, file_paths, related_files, effort_days) VALUES

-- ╔══════════════════════════════════════════════════════════╗
-- ║  DB / MIGRATION                                         ║
-- ╚══════════════════════════════════════════════════════════╝

('costruire', 'critica', 'db',
 'Applicare migration chat_channels.project_id su Supabase',
 'BUG NOTO: la migration 030_channels_by_project.sql è scritta in locale ma NON è mai stata eseguita in produzione. Eseguire via Supabase Dashboard → SQL Editor: ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL; CREATE INDEX IF NOT EXISTS idx_chat_channels_project ON public.chat_channels(project_id). Finché non viene eseguita, la Chat dei progetti usa il fallback (primo canale per tipo per client_id) e tutti i progetti dello stesso cliente condividono la stessa chat.',
 ARRAY['supabase/migrations/030_channels_by_project.sql'],
 ARRAY['app/actions/project-channels.ts','components/projects/ProjectPageClient.tsx'],
 0.5),

('costruire', 'alta', 'db',
 'Applicare migration 044_decisions.sql su Supabase',
 'La tabella decisions è definita e il widget DecisionCenter è costruito con le server actions in app/actions/decisions.ts, ma la migration 044 non è stata applicata al DB di produzione. Il widget crasha al primo INSERT. Eseguire la migration via SQL Editor prima di attivare il widget nella dashboard.',
 ARRAY['supabase/migrations/044_decisions.sql'],
 ARRAY['components/dashboard/DecisionCenter.tsx','app/actions/decisions.ts'],
 0.5),

('costruire', 'alta', 'db',
 'Applicare migration 045_os_roadmap.sql su Supabase',
 'Le tabelle os_phases, os_backlog_items, os_ideas sono definite in 045_os_roadmap.sql con seed di 8 fasi pre-populate. Non sono in produzione. Necessarie se si vuole riattivare la vecchia struttura roadmap.',
 ARRAY['supabase/migrations/045_os_roadmap.sql'],
 ARRAY[]::text[],
 0.5),

('costruire', 'alta', 'db',
 'Applicare migration 046_os_tasks.sql su Supabase',
 'La tabella os_tasks (questo Command Center) è definita in 046_os_tasks.sql con seed pre-popolato. Deve essere applicata perché la sezione /twobee-os funzioni. È la migration da eseguire ADESSO.',
 ARRAY['supabase/migrations/046_os_tasks.sql'],
 ARRAY['components/os/TwoBeeOSClient.tsx','app/(dashboard)/twobee-os/page.tsx'],
 0.5),

-- ╔══════════════════════════════════════════════════════════╗
-- ║  DASHBOARD                                              ║
-- ╚══════════════════════════════════════════════════════════╝

('costruire', 'alta', 'dashboard',
 'Widget Strategic Objectives',
 'I dati degli OKR aziendali (tabella objectives) sono già fetchati in dashboard/page.tsx come dashboardData.objectives ma nessun widget li visualizza. Creare StrategicObjectives.tsx con: nome obiettivo, owner, progress bar percentuale, deadline, status (on_track/at_risk/off_track) con colori. Aggiungere a WIDGETS array e DEFAULT_LAYOUT in DashboardGrid.tsx come widget nascosto di default.',
 ARRAY['components/dashboard/StrategicObjectives.tsx','components/dashboard/DashboardGrid.tsx'],
 ARRAY['app/(dashboard)/dashboard/page.tsx','lib/types/database.ts'],
 3.0),

('costruire', 'bassa', 'dashboard',
 'AI & Automation Center widget',
 'Widget che mostra: log ultime chiamate Groq (extract-project, extract-meeting, sprint-plan, kpi-report) con tipo/latenza/esito, automazioni attive, ore stimate risparmiate. Richiede nuova tabella ai_logs per tracciare le chiamate API con timestamp e payload ridotto.',
 ARRAY['components/dashboard/AIAutomationCenter.tsx','components/dashboard/DashboardGrid.tsx','supabase/migrations/'],
 ARRAY['app/api/ai/'],
 6.0),

('modificare', 'media', 'dashboard',
 'SmartInsights → promuovere AIExecutiveBrief come principale',
 'SmartInsights genera insight con condizioni hardcoded (rule-based). AIExecutiveBrief chiama già /api/ai/executive-brief con dati reali. Valutare: rendere AIExecutiveBrief visibile di default e SmartInsights secondario, oppure aggiornare SmartInsights con chiamata Groq per insight narrativi. Il widget AIExecutiveBrief è attualmente nascosto di default (in NEW_WIDGETS).',
 ARRAY['components/dashboard/SmartInsights.tsx','components/dashboard/AIExecutiveBrief.tsx','components/dashboard/DashboardGrid.tsx'],
 ARRAY['app/api/ai/executive-brief/route.ts'],
 3.0),

('modificare', 'media', 'dashboard',
 'MarginRadar → sostituire MARGIN_BY_PACKAGE hardcoded con dati reali',
 'Il componente usa MARGIN_BY_PACKAGE con percentuali fisse per package (Worker Bee Start: 75%, Partner Quota: 45%, ecc.). Quando timesheet sarà disponibile, sostituire con calcolo reale: (mrr - costi_ore_mensili) / mrr. Nel frattempo aggiungere campo margin_pct su clients per override manuale per cliente.',
 ARRAY['components/dashboard/MarginRadar.tsx'],
 ARRAY['lib/types/database.ts','supabase/migrations/'],
 4.0),

('ottimizzare', 'media', 'dashboard',
 'DashboardGrid → pulsante reset layout localStorage nel CustomizePanel',
 'Il layout è in localStorage con chiave twobee-dash-layout-v3. Se corrotto (widget IDs cambiati dopo update), la grid si rompe. Aggiungere nel CustomizePanel un pulsante "Reset layout" che chiama localStorage.removeItem("twobee-dash-layout-v3") e window.location.reload(). Solo super admin vede il CustomizePanel.',
 ARRAY['components/dashboard/DashboardGrid.tsx'],
 ARRAY[]::text[],
 0.5),

('ottimizzare', 'bassa', 'dashboard',
 'Dashboard page.tsx → gestire errori delle 17 query senza crash',
 'Se una delle 17 Promise.all fallisce (timeout Supabase, RLS error, network), la dashboard crasha completamente. Ogni result deve avere: const data = res.error ? [] : res.data ?? []. Alcune query attualmente propagano l''errore senza default fallback.',
 ARRAY['app/(dashboard)/dashboard/page.tsx'],
 ARRAY[]::text[],
 2.0),

-- ╔══════════════════════════════════════════════════════════╗
-- ║  PROGETTI                                               ║
-- ╚══════════════════════════════════════════════════════════╝

('costruire', 'alta', 'progetti',
 'Timesheet — tabella costi orari e UI registrazione ore',
 'Creare migration per tabella timesheets (id, project_id, user_id, date, hours, hourly_rate, task_description, created_at). Aggiungere nuova tab "Timesheet" in ProjectPageClient.tsx per inserire ore lavorate per progetto per risorsa. Prerequisito fondamentale per: MarginRadar con dati reali, Financial Control con costi effettivi, calcolo marginalità per engagement.',
 ARRAY['supabase/migrations/','components/projects/ProjectPageClient.tsx'],
 ARRAY['lib/types/database.ts','components/dashboard/MarginRadar.tsx'],
 8.0),

('costruire', 'media', 'progetti',
 'Growth Performance aggregato cross-client',
 'Aggregare dati client_kpis per tutti i clienti growth: MRR medio aggregato, trend mensile, clienti in crescita vs calo, benchmark cross-client. Nuova query su client_kpis grouped by month. Widget dashboard con sparklines per ogni cliente e ranking per performance. Dati già presenti in DB, manca solo la visualizzazione aggregata.',
 ARRAY['components/dashboard/GrowthPerformance.tsx','components/dashboard/DashboardGrid.tsx'],
 ARRAY['app/(dashboard)/dashboard/page.tsx','lib/types/database.ts'],
 5.0),

('modificare', 'alta', 'progetti',
 'ensureProjectChannels() → filtrare per project_id dopo migration',
 'Dopo aver applicato la migration 030, aggiornare app/actions/project-channels.ts: il check esistenza canale deve usare .eq("project_id", projectId) invece di cercare per client_id + type. Attualmente tutti i progetti dello stesso cliente condividono gli stessi canali. Dipendenza: migration 030 deve essere applicata prima.',
 ARRAY['app/actions/project-channels.ts'],
 ARRAY['components/projects/ProjectPageClient.tsx'],
 1.0),

('modificare', 'alta', 'progetti',
 'ProjectChatSection → sostituire fallback con query per project_id',
 'In ProjectPageClient.tsx (area Chat) il fallback è: primo canale per (client_id, type). Dopo la migration, filtrare con .eq("project_id", projectId). Dipendenza: migration 030 + aggiornamento ensureProjectChannels devono essere fatti prima.',
 ARRAY['components/projects/ProjectPageClient.tsx'],
 ARRAY['app/actions/project-channels.ts'],
 2.0),

('ottimizzare', 'alta', 'progetti',
 'ProjectPageClient.tsx → split 2980 righe in subcomponent per tab',
 'Il file è di 2980 righe e contiene tutta la logica di ogni tab: Progetto, Appuntamenti, Riunioni, KPI, Aggiornamenti, Chat. Creare components/projects/tabs/: ProgettoTab.tsx, AppuntamentiTab.tsx, RiunioniTab.tsx, KpiTab.tsx, AggiornamentiTab.tsx, ChatTab.tsx. ProjectPageClient diventa orchestratore che importa le tab e gestisce lo stato condiviso. Migliora enormemente la manutenibilità.',
 ARRAY['components/projects/ProjectPageClient.tsx','components/projects/tabs/'],
 ARRAY[]::text[],
 5.0),

('ottimizzare', 'media', 'progetti',
 'ensureProjectChannels → aggiungere check exists prima di INSERT',
 'La server action viene chiamata ad ogni navigazione alla tab Chat di un progetto. Aggiungere: SELECT id FROM chat_channels WHERE project_id=X AND type=Y LIMIT 1 prima di ogni INSERT. Se esiste, return direttamente senza round-trip inutili al DB.',
 ARRAY['app/actions/project-channels.ts'],
 ARRAY[]::text[],
 1.0),

-- ╔══════════════════════════════════════════════════════════╗
-- ║  CHAT                                                   ║
-- ╚══════════════════════════════════════════════════════════╝

('modificare', 'alta', 'chat',
 'Verificare isolamento canali per progetto dopo migration',
 'Dopo aver applicato migration project_id (030) e aggiornato ensureProjectChannels() + ProjectChatSection, verificare end-to-end che ogni progetto abbia canali isolati: cliente_interno (team) e customer_care (cliente). Testare con almeno 2 progetti distinti dello stesso cliente. Verificare che i messaggi di progetto A non appaiano in progetto B.',
 ARRAY['app/actions/project-channels.ts','components/projects/ProjectPageClient.tsx'],
 ARRAY['supabase/migrations/030_channels_by_project.sql'],
 1.0),

-- ╔══════════════════════════════════════════════════════════╗
-- ║  CLIENTI                                                ║
-- ╚══════════════════════════════════════════════════════════╝

('costruire', 'media', 'clienti',
 'Tab Relazione → completare con timeline engagement e note storiche',
 'La tab Relazione in /clienti/[id] esiste ma il contenuto è minimo. Arricchire con: timeline cronologica degli eventi (inizio contratto, rinnovi, meeting chiave, cambio package), campo note storiche con editor, sentiment indicator basato su meeting e KPI recenti.',
 ARRAY['components/clients/tabs/'],
 ARRAY['lib/types/database.ts'],
 4.0),

('modificare', 'bassa', 'clienti',
 'Tab Fatturazione → collegare a Financial Control aggregato',
 'La tab Fatturazione di ogni cliente mostra le fatture del singolo cliente. Aggiungere in cima un mini-riepilogo: totale fatturato, pagato, scaduto per quel cliente specifico — allineato al formato del widget Financial Control in dashboard.',
 ARRAY['components/clients/tabs/'],
 ARRAY['components/dashboard/FinancialControl.tsx'],
 2.0),

-- ╔══════════════════════════════════════════════════════════╗
-- ║  DEV / INFRASTRUTTURA                                   ║
-- ╚══════════════════════════════════════════════════════════╝

('eliminare', 'media', 'dev',
 'TwoBeeOSClient.tsx → rimuovere codice tab obsolete',
 'Dopo il refactor a Command Center, il file contiene ancora: RoadmapTab, BacklogTab, ParkingLotTab, GovernanceTab e le interfacce Phase, BacklogItem, Idea. Rimuovere tutto il codice inutilizzato. Mantenere solo TwoBeeOSClient con i tipi OsTask.',
 ARRAY['components/os/TwoBeeOSClient.tsx'],
 ARRAY[]::text[],
 0.5),

('eliminare', 'bassa', 'dev',
 'Sidebar.tsx → import Compass e isSuperAdmin duplicato',
 'L''import Compass da lucide-react è presente ma non assegnato a nessun item. isSuperAdmin viene calcolato 2 volte nello stesso render: una a livello sections.map() e una dentro section.items.map(). Unificare e rimuovere import inutilizzato.',
 ARRAY['components/shared/Sidebar.tsx'],
 ARRAY[]::text[],
 0.5)

ON CONFLICT DO NOTHING;
