import type { AiPlanSprint } from '../AiPlanBuilder'

// ─── Plan templates ────────────────────────────────────────────────────────────
export const PLAN_TEMPLATES: Record<string, { label: string; emoji: string; desc: string; plan: AiPlanSprint[] }> = {
  ecommerce: {
    label: 'E-commerce', emoji: '🛒', desc: 'Shop online, pagamenti, catalogo prodotti',
    plan: [
      { name: 'Sprint 1 — Discovery & Setup', duration_weeks: 2, milestones: [
        { title: 'Kickoff & Brief', tasks: [{ title: 'Allineamento obiettivi', priority: 'alta' }, { title: 'Definizione KPI', priority: 'alta' }, { title: 'Benchmark competitor', priority: 'media' }] },
        { title: 'Architettura piattaforma', tasks: [{ title: 'Scelta piattaforma', priority: 'alta' }, { title: 'Setup ambiente dev', priority: 'alta' }, { title: 'Configurazione dominio', priority: 'media' }] },
      ]},
      { name: 'Sprint 2 — Design & Contenuti', duration_weeks: 3, milestones: [
        { title: 'Design UI/UX', tasks: [{ title: 'Wireframe homepage', priority: 'alta' }, { title: 'Design scheda prodotto', priority: 'alta' }, { title: 'Design checkout', priority: 'alta' }] },
        { title: 'Catalogo prodotti', tasks: [{ title: 'Import prodotti', priority: 'alta' }, { title: 'Categorie e filtri', priority: 'media' }, { title: 'SEO schede prodotto', priority: 'media' }] },
      ]},
      { name: 'Sprint 3 — Sviluppo & Integrazioni', duration_weeks: 3, milestones: [
        { title: 'Sviluppo frontend', tasks: [{ title: 'Homepage', priority: 'alta' }, { title: 'Listing + filtri', priority: 'alta' }, { title: 'Scheda prodotto', priority: 'alta' }] },
        { title: 'Pagamenti & Logistica', tasks: [{ title: 'Integrazione pagamenti', priority: 'alta' }, { title: 'Configurazione spedizioni', priority: 'alta' }, { title: 'Email transazionali', priority: 'media' }] },
      ]},
      { name: 'Sprint 4 — Test & Launch', duration_weeks: 2, milestones: [
        { title: 'QA & Test', tasks: [{ title: 'Test funzionale completo', priority: 'alta' }, { title: 'Test mobile', priority: 'alta' }, { title: 'Test pagamenti', priority: 'alta' }] },
        { title: 'Go Live', tasks: [{ title: 'Deploy produzione', priority: 'alta' }, { title: 'Analytics setup', priority: 'media' }, { title: 'Handover cliente', priority: 'media' }] },
      ]},
    ],
  },
  lead_gen: {
    label: 'Lead Generation', emoji: '🎯', desc: 'Funnel, landing page, CRM, email automation',
    plan: [
      { name: 'Sprint 1 — Strategia & Copy', duration_weeks: 2, milestones: [
        { title: 'Strategia funnel', tasks: [{ title: 'Mappa customer journey', priority: 'alta' }, { title: 'Definizione lead magnet', priority: 'alta' }, { title: 'Analisi target audience', priority: 'media' }] },
        { title: 'Copy & Contenuti', tasks: [{ title: 'Copywriting landing page', priority: 'alta' }, { title: 'Email sequence', priority: 'alta' }, { title: 'Materiale lead magnet', priority: 'media' }] },
      ]},
      { name: 'Sprint 2 — Build & Integrazioni', duration_weeks: 2, milestones: [
        { title: 'Landing page', tasks: [{ title: 'Design LP', priority: 'alta' }, { title: 'Sviluppo LP', priority: 'alta' }, { title: 'Form + thank you page', priority: 'alta' }] },
        { title: 'CRM & Automation', tasks: [{ title: 'Setup CRM', priority: 'alta' }, { title: 'Sequenza email automatica', priority: 'alta' }, { title: 'Lead scoring', priority: 'media' }] },
      ]},
      { name: 'Sprint 3 — Traffic & Ottimizzazione', duration_weeks: 3, milestones: [
        { title: 'Campagna traffico', tasks: [{ title: 'Setup Meta Ads', priority: 'alta' }, { title: 'Setup Google Ads', priority: 'media' }, { title: 'A/B test headline', priority: 'alta' }] },
        { title: 'Analisi & Scale', tasks: [{ title: 'Report performance', priority: 'media' }, { title: 'Ottimizzazione CPL', priority: 'alta' }, { title: 'Scale budget vincitori', priority: 'alta' }] },
      ]},
    ],
  },
  sito_web: {
    label: 'Sito Web', emoji: '🌐', desc: 'Sito corporate, istituzionale o landing page',
    plan: [
      { name: 'Sprint 1 — Discovery & Design', duration_weeks: 2, milestones: [
        { title: 'Briefing & Struttura', tasks: [{ title: 'Sitemap', priority: 'alta' }, { title: 'Definizione stile grafico', priority: 'alta' }, { title: 'Raccolta materiali', priority: 'media' }] },
        { title: 'Design UI', tasks: [{ title: 'Homepage design', priority: 'alta' }, { title: 'Template pagine interne', priority: 'alta' }, { title: 'Mobile responsive', priority: 'alta' }] },
      ]},
      { name: 'Sprint 2 — Sviluppo & Contenuti', duration_weeks: 3, milestones: [
        { title: 'Sviluppo', tasks: [{ title: 'Setup CMS', priority: 'alta' }, { title: 'Sviluppo homepage', priority: 'alta' }, { title: 'Pagine interne', priority: 'alta' }] },
        { title: 'SEO & Contenuti', tasks: [{ title: 'Copy pagine principali', priority: 'alta' }, { title: 'SEO on-page', priority: 'media' }, { title: 'Blog setup', priority: 'bassa' }] },
      ]},
      { name: 'Sprint 3 — Test & Launch', duration_weeks: 1, milestones: [
        { title: 'QA & Go Live', tasks: [{ title: 'Test cross-browser', priority: 'alta' }, { title: 'Performance check', priority: 'alta' }, { title: 'Deploy + DNS', priority: 'alta' }] },
      ]},
    ],
  },
  app_ai: {
    label: 'App / AI / Gestionale', emoji: '🤖', desc: 'Software custom, AI, app web o mobile',
    plan: [
      { name: 'Sprint 1 — Analysis & Architecture', duration_weeks: 2, milestones: [
        { title: 'Requirements', tasks: [{ title: 'User stories', priority: 'alta' }, { title: 'Functional spec', priority: 'alta' }, { title: 'Tech stack decision', priority: 'alta' }] },
        { title: 'Architettura DB', tasks: [{ title: 'Schema database', priority: 'alta' }, { title: 'API design', priority: 'alta' }, { title: 'Auth flow', priority: 'alta' }] },
      ]},
      { name: 'Sprint 2 — MVP Core', duration_weeks: 3, milestones: [
        { title: 'Backend MVP', tasks: [{ title: 'Setup progetto', priority: 'alta' }, { title: 'CRUD principali', priority: 'alta' }, { title: 'Auth & autorizzazioni', priority: 'alta' }] },
        { title: 'Frontend MVP', tasks: [{ title: 'UI base', priority: 'alta' }, { title: 'Flusso principale', priority: 'alta' }, { title: 'Gestione errori', priority: 'media' }] },
      ]},
      { name: 'Sprint 3 — Features & Integrazioni', duration_weeks: 3, milestones: [
        { title: 'Feature avanzate', tasks: [{ title: 'Dashboard & analytics', priority: 'alta' }, { title: 'Notifiche', priority: 'media' }, { title: 'Esportazione dati', priority: 'media' }] },
        { title: 'Integrazioni API', tasks: [{ title: 'API esterne', priority: 'alta' }, { title: 'Webhook', priority: 'media' }, { title: 'Test integrazioni', priority: 'alta' }] },
      ]},
      { name: 'Sprint 4 — QA & Deploy', duration_weeks: 2, milestones: [
        { title: 'Test & Security', tasks: [{ title: 'Test unitari', priority: 'alta' }, { title: 'Security audit', priority: 'alta' }, { title: 'Performance test', priority: 'media' }] },
        { title: 'Deploy & Handover', tasks: [{ title: 'Setup produzione', priority: 'alta' }, { title: 'Documentazione', priority: 'media' }, { title: 'Training cliente', priority: 'media' }] },
      ]},
    ],
  },
  campagna: {
    label: 'Campagna Ads', emoji: '📣', desc: 'Performance marketing su Meta / Google / TikTok',
    plan: [
      { name: 'Sprint 1 — Setup & Creativita', duration_weeks: 2, milestones: [
        { title: 'Strategia media', tasks: [{ title: 'Definizione obiettivi', priority: 'alta' }, { title: 'Budget allocation', priority: 'alta' }, { title: 'Audience mapping', priority: 'alta' }] },
        { title: 'Creativita', tasks: [{ title: 'Copy ads', priority: 'alta' }, { title: 'Visual/video', priority: 'alta' }, { title: 'Landing page', priority: 'alta' }] },
      ]},
      { name: 'Sprint 2 — Launch & Ottimizzazione', duration_weeks: 4, milestones: [
        { title: 'Go Live', tasks: [{ title: 'Setup campagne', priority: 'alta' }, { title: 'Pixel & tracciamento', priority: 'alta' }, { title: 'Primo report', priority: 'media' }] },
        { title: 'Scale & Reporting', tasks: [{ title: 'Ottimizzazione bidding', priority: 'alta' }, { title: 'A/B test creativita', priority: 'alta' }, { title: 'Report mensile', priority: 'media' }] },
      ]},
    ],
  },
  custom: {
    label: 'Progetto Custom', emoji: '✨', desc: 'Template generico adattabile a qualsiasi progetto',
    plan: [
      { name: 'Sprint 1 — Discovery', duration_weeks: 2, milestones: [
        { title: 'Kickoff & Pianificazione', tasks: [{ title: 'Allineamento obiettivi', priority: 'alta' }, { title: 'Definizione scope', priority: 'alta' }, { title: 'Piano di progetto', priority: 'media' }] },
      ]},
      { name: 'Sprint 2 — Execution', duration_weeks: 3, milestones: [
        { title: 'Deliverable principale', tasks: [{ title: 'Task principale 1', priority: 'alta' }, { title: 'Task principale 2', priority: 'alta' }, { title: 'Review interna', priority: 'media' }] },
      ]},
      { name: 'Sprint 3 — Delivery', duration_weeks: 1, milestones: [
        { title: 'Consegna & Handover', tasks: [{ title: 'Review finale', priority: 'alta' }, { title: 'Consegna al cliente', priority: 'alta' }, { title: 'Raccolta feedback', priority: 'media' }] },
      ]},
    ],
  },
}
