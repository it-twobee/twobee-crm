import { isAdminRole, isWorkspaceRole } from './permissions'

export const SALES_STAGES = [
  ['lead', 'Da contattare', 'Nessun contatto avviato', 10],
  ['contatto', 'In contatto', 'Conversazione avviata', 20],
  ['qualificata', 'Qualificata', 'Esigenza e interlocutore verificati', 35],
  ['perimetro', 'Perimetro definito', 'Servizi, inclusioni e dipendenze chiariti', 50],
  ['proposta', 'Proposta inviata', 'Versione della proposta registrata', 65],
  ['trattativa', 'Negoziazione', 'Condizioni in discussione', 80],
  ['chiuso_vinto', 'Vinta', 'Accettazione registrata; delivery da verificare', 100],
  ['chiuso_perso', 'Persa', 'Trattativa chiusa con un motivo', 0],
] as const
export type SalesStage = typeof SALES_STAGES[number][0]
export const SALES_SOURCES = ['Meta Ads', 'Sito', 'Volantino', 'Passaparola', 'Referral', 'Telefonico', 'Network', 'Altro'] as const

export function salesSourceOptions(current?: string | null): string[] {
  return current && !SALES_SOURCES.some(source => source === current)
    ? [...SALES_SOURCES, current] : [...SALES_SOURCES]
}
export const OUTCOMES = {
  nota: 'Nota', non_risponde: 'Non risponde', ricontattare: 'Da ricontattare',
  incontro: 'Incontro fissato', proposta: 'Proposta inviata',
  pausa: 'Da riprendere', riattiva: 'Riattiva', persa: 'Non interessato', vinta: 'Vinta · cliente acquisito',
} as const
export type SalesOutcome = keyof typeof OUTCOMES
export type SalesAccess = 'admin' | 'manager' | 'owner' | null

export function salesAccess(role: string | null | undefined, enabled: boolean, active = true): SalesAccess {
  if (!active) return null
  if (isAdminRole(role)) return 'admin'
  if (!enabled || !isWorkspaceRole(role)) return null
  return role === 'manager' ? 'manager' : 'owner'
}
export function canReadDeal(access: SalesAccess, actor: string, owner: string | null) {
  return access === 'admin' || access === 'manager' || (access === 'owner' && actor === owner)
}

export type SalesDeal = {
  id: string; title: string; company_name: string; client_id: string | null
  contact_id: string | null; assigned_to: string | null; stage: SalesStage
  source: string | null; need: string | null; blocker: string | null
  next_action: string | null; next_action_on: string | null; resume_on: string | null
  monthly_value: number | null; setup_value: number | null; one_off_value: number | null
  proposal_ref: string | null; loss_reason: string | null
  created_at: string; updated_at: string; closed_at: string | null; last_interaction_at: string | null
  revision: number; delivery: Delivery; delivery_project_id: string | null
  delivery_completed_at: string | null; delivery_owner_id: string | null
}
export type Delivery = {
  goals?: string; services?: string; included?: string; excluded?: string
  promises?: string; materials?: string; missing?: string
}
export type SalesActivity = {
  id: string; deal_id: string; content: string; outcome: string | null
  created_at: string; created_by: string | null; next_action_on: string | null
}
export type SalesPerson = { id: string; full_name: string; app_role: string | null; enabled: boolean }
export type SalesClient = { id: string; name: string }
export type SalesContact = { id: string; client_id: string; full_name: string; email: string; phone: string | null }
export type SalesData = {
  actor: string; access: Exclude<SalesAccess, null>; deals: SalesDeal[]
  clients: SalesClient[]; contacts: SalesContact[]; people: SalesPerson[]
  projects: { id: string; client_id: string; name: string }[]
  services: { id: string; label: string; area: string; service_type: string; service_subtype: string | null }[]
  loadedAt: string
}
export type DealInput = {
  title: string; client_id: string | null; company_name: string; contact_name: string
  contact_email: string; contact_phone: string; contact_id: string | null
  assigned_to: string; source: string; need: string; blocker: string
  stage: SalesStage; next_action: string; next_action_on: string | null
  monthly_value: number | null; setup_value: number | null; one_off_value: number | null
  proposal_ref: string
}
export const isClosed = (stage: string) => stage === 'chiuso_vinto' || stage === 'chiuso_perso'
export function salesToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function plusDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}
export function salesPriority(d: SalesDeal, today: string): string | null {
  if (d.stage === 'chiuso_vinto') return d.delivery_completed_at ? null : 'Passaggio alla delivery da completare'
  if (isClosed(d.stage)) return null
  if (d.resume_on) return d.resume_on <= today ? 'Da riprendere' : null
  if (!d.assigned_to || !d.next_action || !d.next_action_on) return 'Prossima azione da definire'
  if (d.next_action_on < today) return 'Follow-up scaduto'
  if (d.next_action_on === today) return 'In programma oggi'
  if ((d.last_interaction_at ?? d.created_at).slice(0, 10) <= plusDays(today, -14)) return 'Nessuna interazione da 14 giorni'
  return null
}

export function salesMetrics(deals: SalesDeal[], from: string, to: string) {
  const within = (s: string | null) => !!s && s.slice(0, 10) >= from && s.slice(0, 10) <= to
  const closed = deals.filter(d => isClosed(d.stage) && within(d.closed_at))
  const won = closed.filter(d => d.stage === 'chiuso_vinto')
  const open = deals.filter(d => !isClosed(d.stage) && !d.resume_on)
  const weighted = (key: 'monthly_value' | 'setup_value' | 'one_off_value') => {
    const known = open.filter(d => d[key] !== null)
    return { value: known.length ? Math.round(known.reduce((s, d) => s + Number(d[key]) * (SALES_STAGES.find(x => x[0] === d.stage)?.[3] ?? 0), 0)) / 100 : null,
      missing: open.length - known.length }
  }
  return {
    opened: deals.filter(d => within(d.created_at)).length, won: won.length, lost: closed.length - won.length,
    winRate: closed.length ? won.length / closed.length * 100 : null,
    cycleDays: won.length ? won.reduce((s, d) => s + (Date.parse(d.closed_at!) - Date.parse(d.created_at)) / 86400000, 0) / won.length : null,
    monthly: weighted('monthly_value'), setup: weighted('setup_value'), oneOff: weighted('one_off_value'),
  }
}

export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function uuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Identificativo non valido')
}
export function validateDeal(input: DealInput, creating = false) {
  if (!input || typeof input !== 'object') throw new Error('Opportunità non valida')
  for (const key of ['title', 'company_name', 'contact_name', 'contact_email', 'contact_phone', 'source', 'need', 'blocker', 'next_action', 'proposal_ref'] as const) {
    if (typeof input[key] !== 'string' || input[key].length > (key === 'need' || key === 'blocker' ? 8000 : 500)) throw new Error('Testo mancante o troppo lungo')
  }
  if (!input.title.trim()) throw new Error('Indica il nome dell’opportunità')
  uuid(input.assigned_to)
  if (input.client_id) uuid(input.client_id)
  else if (creating && (!input.company_name.trim() || (!input.contact_email.trim() && !input.contact_phone.trim()))) throw new Error('Indica un nome e un recapito')
  if (input.contact_id) uuid(input.contact_id)
  if (input.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact_email)) throw new Error('Email non valida')
  if (!SALES_STAGES.some(s => s[0] === input.stage) || isClosed(input.stage)) throw new Error('Usa un esito per chiudere la trattativa')
  if (['qualificata', 'perimetro', 'proposta', 'trattativa'].includes(input.stage) && !input.need.trim()) throw new Error('Descrivi l’esigenza prima di qualificare la trattativa')
  if (['proposta', 'trattativa'].includes(input.stage) && !input.proposal_ref.trim()) throw new Error('Indica riferimento e versione della proposta')
  if (input.next_action_on && !validDate(input.next_action_on)) throw new Error('Data non valida')
  if (!input.next_action.trim() || !input.next_action_on) throw new Error('Indica prossima azione e data')
  for (const key of ['monthly_value', 'setup_value', 'one_off_value'] as const) {
    const v = input[key]
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 999999999 || Math.abs(v * 100 - Math.round(v * 100)) > 0.00001)) throw new Error('Gli importi devono essere positivi, con al massimo due decimali')
  }
}
