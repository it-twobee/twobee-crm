// ─── Tag system ───────────────────────────────────────────────────────────────
export const PRESET_TAGS = [
  { id: 'growth',      label: '#growth',      color: '#22C55E' },
  { id: 'marketing',   label: '#marketing',   color: '#F59E0B' },
  { id: 'digital',     label: '#digital',     color: '#3B82F6' },
  { id: 'ai',          label: '#ai',          color: '#A855F7' },
  { id: 'tracking',    label: '#tracking',    color: '#06B6D4' },
  { id: 'automation',  label: '#automation',  color: '#8B5CF6' },
  { id: 'urgente',     label: '#urgente',     color: '#EF4444' },
  { id: 'bloccante',   label: '#bloccante',   color: '#DC2626' },
  { id: 'quick-win',   label: '#quick-win',   color: '#10B981' },
  { id: 'design',      label: '#design',      color: '#F472B6' },
  { id: 'copy',        label: '#copy',        color: '#FBBF24' },
  { id: 'dev',         label: '#dev',         color: '#60A5FA' },
  { id: 'strategia',   label: '#strategia',   color: '#C084FC' },
  { id: 'analytics',   label: '#analytics',   color: '#34D399' },
] as const

export type PresetTagId = (typeof PRESET_TAGS)[number]['id']

export const TAG_COLOR: Record<string, string> = Object.fromEntries(
  PRESET_TAGS.map(t => [t.id, t.color])
)

export const getTagColor = (tag: string): string =>
  TAG_COLOR[tag] ?? '#6B7280'

// ─── Client task templates ────────────────────────────────────────────────────
export interface ClientTaskTemplate {
  title: string
  category: string
  priority: 'alta' | 'media' | 'bassa'
  phase: 'onboarding' | 'build' | 'lancio'
  hint?: string
}

export const CLIENT_TASK_TEMPLATES: Record<string, ClientTaskTemplate[]> = {
  sito_web: [
    { title: 'Condividere logo in formato vettoriale (AI, SVG o EPS)', category: 'materiali', priority: 'alta', phase: 'onboarding', hint: 'Serve anche versione su sfondo chiaro e scuro se disponibile' },
    { title: 'Inviare foto professionali o immagini del brand', category: 'materiali', priority: 'alta', phase: 'onboarding', hint: 'Minimo 10 immagini in alta risoluzione' },
    { title: 'Fornire testi per le pagine principali (Home, Chi siamo, Servizi)', category: 'contenuti', priority: 'alta', phase: 'build', hint: 'Testo in Word o Google Doc' },
    { title: 'Acquistare o trasferire il dominio', category: 'tecnico', priority: 'alta', phase: 'onboarding', hint: 'Fornire accesso pannello DNS o trasferire a nostro registrar' },
    { title: 'Condividere credenziali hosting o scegliere piano', category: 'tecnico', priority: 'media', phase: 'onboarding' },
    { title: 'Approvare bozza grafica homepage', category: 'approvazione', priority: 'alta', phase: 'build', hint: 'Entro 48h dalla ricezione' },
    { title: 'Fornire dati per pagina Contatti e mappa', category: 'contenuti', priority: 'bassa', phase: 'build' },
    { title: 'Test e approvazione finale prima del go-live', category: 'approvazione', priority: 'alta', phase: 'lancio', hint: 'Compilare form di test e verificare su mobile' },
  ],
  ecommerce: [
    { title: 'Esportare catalogo prodotti (Excel/CSV con nome, prezzo, SKU)', category: 'contenuti', priority: 'alta', phase: 'onboarding', hint: 'Include descrizioni e categorie' },
    { title: 'Inviare immagini prodotti in alta risoluzione', category: 'materiali', priority: 'alta', phase: 'onboarding', hint: 'Minimo 3 foto per prodotto su sfondo bianco' },
    { title: 'Configurare metodo di pagamento (Stripe/PayPal/Klarna)', category: 'tecnico', priority: 'alta', phase: 'onboarding', hint: 'Accesso pannello del provider scelto' },
    { title: 'Definire tariffe e zone di spedizione', category: 'contenuti', priority: 'alta', phase: 'build' },
    { title: 'Fornire dati fiscali per fatturazione automatica', category: 'tecnico', priority: 'media', phase: 'onboarding' },
    { title: 'Approvare layout scheda prodotto', category: 'approvazione', priority: 'alta', phase: 'build' },
    { title: 'Effettuare ordine di test e verificare processo', category: 'approvazione', priority: 'alta', phase: 'lancio' },
  ],
  campagna: [
    { title: 'Condividere accesso Business Manager / Meta Ads', category: 'accessi', priority: 'alta', phase: 'onboarding', hint: 'Aggiungere our@twobee.it come amministratore' },
    { title: 'Condividere accesso Google Ads o creare account', category: 'accessi', priority: 'alta', phase: 'onboarding' },
    { title: 'Approvare budget mensile e calendar campagna', category: 'approvazione', priority: 'alta', phase: 'onboarding' },
    { title: 'Inviare materiali creativi (video, foto, copy)', category: 'materiali', priority: 'alta', phase: 'build', hint: 'Formato: 1:1, 9:16, 1.91:1 per Meta; 16:9 per YouTube' },
    { title: 'Verificare e approvare landing page di destinazione', category: 'approvazione', priority: 'alta', phase: 'build' },
    { title: 'Confermare target audience e lista esclusioni', category: 'strategia', priority: 'media', phase: 'build' },
  ],
  lead_gen: [
    { title: 'Fornire lead magnet o contenuto gratuito per funnel', category: 'contenuti', priority: 'alta', phase: 'onboarding' },
    { title: 'Configurare CRM o scegliere piattaforma (HubSpot, ActiveCampaign...)', category: 'tecnico', priority: 'alta', phase: 'onboarding' },
    { title: 'Approvare sequenza email di nurturing', category: 'approvazione', priority: 'alta', phase: 'build' },
    { title: 'Fornire accesso analytics esistenti (GA, pixel...)', category: 'accessi', priority: 'media', phase: 'onboarding' },
    { title: 'Testare form di acquisizione lead e thank you page', category: 'approvazione', priority: 'alta', phase: 'lancio' },
    { title: 'Definire SLA per follow-up lead (entro quante ore)', category: 'strategia', priority: 'media', phase: 'onboarding' },
  ],
  app_ai: [
    { title: 'Fornire documenti/dati per training o RAG (PDF, CSV, FAQ)', category: 'materiali', priority: 'alta', phase: 'onboarding', hint: 'Documenti aziendali, manuali, FAQ clienti' },
    { title: 'Definire use case prioritari e personas utente', category: 'strategia', priority: 'alta', phase: 'onboarding' },
    { title: 'Fornire esempi di conversazioni o scenari d\'uso', category: 'contenuti', priority: 'media', phase: 'build' },
    { title: 'Testare versione beta e raccogliere feedback', category: 'approvazione', priority: 'alta', phase: 'build' },
    { title: 'Approvare tono di voce e personalità AI', category: 'approvazione', priority: 'alta', phase: 'build' },
    { title: 'Fornire API keys o configurare integrazioni', category: 'tecnico', priority: 'alta', phase: 'onboarding' },
  ],
  custom: [
    { title: 'Kickoff call: allineare obiettivi e tempistiche', category: 'strategia', priority: 'alta', phase: 'onboarding' },
    { title: 'Fornire materiali di brand (logo, font, colori)', category: 'materiali', priority: 'alta', phase: 'onboarding' },
    { title: 'Condividere accessi necessari', category: 'accessi', priority: 'alta', phase: 'onboarding' },
    { title: 'Approvare prima deliverable', category: 'approvazione', priority: 'alta', phase: 'build' },
    { title: 'Feedback ciclo mid-project', category: 'approvazione', priority: 'media', phase: 'build' },
  ],
}

export const PHASE_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  build:      'Build',
  lancio:     'Lancio',
}

export const PHASE_COLOR: Record<string, string> = {
  onboarding: '#F59E0B',
  build:      '#3B82F6',
  lancio:     '#22C55E',
}
