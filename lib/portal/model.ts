export type PortalCompany = {
  id: string; name: string
  role: 'referente' | 'collaboratore' | 'lettore'
  /** §397 — con `selected` la persona vede solo alcuni progetti: lo spazio
      dell'azienda le arriva in parte, e non si dichiara un totale che non è. */
  scope: 'all' | 'selected'
}
export type PortalProject = {
  id: string; client_id: string; title: string; area: string; status: string
  objective: string | null; scope: string | null; update: string | null
  next_step: string | null; contact: string | null; published_at: string | null
  target_date: string | null; date_kind: 'prevista' | 'confermata'; phase: string | null
}
export type PortalActivity = {
  /* §395 — nasce da una task al cliente, che un progetto non può averlo:
     senza progetto è un'attività dell'azienda, e la vede solo chi ha
     l'accesso a tutta l'azienda. */
  id: string; project_id: string | null; title: string; reason: string; kind: string
  due_date: string | null; contact_name: string; status: string; version_id: string | null
}
export type PortalRequest = {
  id: string; project_id: string | null; title: string; body: string; kind: string
  status: string; created_at: string
}
export type PortalVersion = {
  id: string; project_id: string; deliverable_id: string | null
  title: string; version: number; author_name: string
  published_at: string; approval_required: boolean
}

export type PortalMaterial = {
  id: string; project_id: string | null; name: string; mime: string | null
  size: number; kind: string; path: string | null; uploaded_by_name: string; created_at: string
}

export const REQUEST_KINDS = {
  supporto: { label: 'Supporto', prompt: 'Qual è la domanda o il problema?' },
  attivita: { label: 'Nuova attività', prompt: 'Quale risultato vorresti ottenere?' },
  bug: { label: 'Bug', prompt: 'Cosa accade e cosa ti aspettavi?' },
  audit: { label: 'Audit', prompt: 'Quale area vuoi analizzare e con quale obiettivo?' },
  report: { label: 'Report', prompt: 'Quale domanda vuoi chiarire?' },
  feedback: { label: 'Feedback', prompt: 'Qual è la tua osservazione o proposta?' },
} as const

export const REQUEST_STATUS: Record<string, string> = {
  ricevuta: 'Ricevuta', in_valutazione: 'In valutazione', in_lavorazione: 'In lavorazione',
  in_attesa_cliente: 'In attesa di te', risolta: 'Risolta', chiusa: 'Chiusa',
  annullata: 'Annullata', non_accolta: 'Non accolta', riaperta: 'Riaperta',
}
export const ACTIVITY_STATUS: Record<string, string> = {
  da_fare: 'Da fare', in_verifica: 'In verifica al team', completata: 'Completata',
}
export const PROJECT_STATUS: Record<string, string> = {
  draft: 'In preparazione', active: 'In lavorazione', on_hold: 'In pausa',
  completed: 'Concluso', archived: 'Archiviato',
}
export const PHASE_LABELS: Record<string, string> = {
  avvio: 'Prepariamo il prossimo passo.', lavorazione: 'Il lavoro, a colpo d’occhio.',
  verifica: 'È il momento di rivedere insieme.', continuativo: 'Il punto sul nostro percorso.',
}

export function isPortalRole(profile: { role?: string | null; app_role?: string | null } | null | undefined) {
  return !!profile && (profile.role === 'client' || profile.role === 'guest')
    && (profile.app_role === 'client' || profile.app_role === 'guest' || !profile.app_role)
}

export function isMissingPortalSchema(error: { code?: string; message?: string } | null) {
  return !!error && ['42P01', 'PGRST205'].includes(error.code ?? '')
    && (error.message ?? '').includes('portal_')
}

export function selectCompany(companies: PortalCompany[], requested?: string) {
  if (requested) return companies.find(c => c.id === requested) ?? null
  return companies[0] ?? null
}

export function portalHref(path: string, clientId?: string | null, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra)
  if (clientId) params.set('client', clientId)
  return `${path}${params.size ? `?${params}` : ''}`
}

export function portalDate(value: string | null) {
  if (!value) return 'Da concordare'
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).format(new Date(value))
}

export function legacyProject(row: { id: string; client_id: string; name: string; area: string; status: string }): PortalProject {
  return {
    id: row.id, client_id: row.client_id, title: row.name, area: row.area, status: row.status,
    objective: null, scope: null, update: null, next_step: null, contact: null,
    published_at: null, target_date: null, date_kind: 'prevista', phase: null,
  }
}
