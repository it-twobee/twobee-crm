/* §395 — Pubblicazione dei contenuti nel portale. Logica pura: le regole che
   il database impone con i trigger vivono anche qui, perché un errore SQL
   arriva all'utente come «operazione non riuscita» e non gli dice cosa manca. */
export const PORTAL_PHASES = {
  avvio: 'Avvio', lavorazione: 'Lavorazione', verifica: 'Verifica', continuativo: 'Continuativo',
} as const
export const PORTAL_DATE_KINDS = {
  prevista: 'Prevista', confermata: 'Confermata',
} as const
export const PORTAL_ACTIVITY_KINDS = {
  materiale: { label: 'Allega', hint: 'Il cliente carica un materiale; l’attività torna in verifica al team.' },
  risposta: { label: 'Rispondi', hint: 'Il cliente risponde a una domanda.' },
} as const

export type PortalPhase = keyof typeof PORTAL_PHASES
export type PortalDateKind = keyof typeof PORTAL_DATE_KINDS
export type PortalActivityKind = keyof typeof PORTAL_ACTIVITY_KINDS

/** I soli campi che il cliente legge. Nessuno arriva dal lavoro interno. */
export type PortalProjectFields = {
  title: string
  objective: string | null
  scope: string | null
  update: string | null
  next_step: string | null
  contact: string | null
  target_date: string | null
  date_kind: PortalDateKind
  phase: PortalPhase | null
}

const TITLE_MAX = 240
const TEXT_MAX = 5000

export const EMPTY_PROJECT_FIELDS: PortalProjectFields = {
  title: '', objective: null, scope: null, update: null, next_step: null,
  contact: null, target_date: null, date_kind: 'prevista', phase: null,
}

function text(value: unknown, max: number, label: string): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error(`${label}: valore non valido.`)
  const clean = value.trim()
  if (!clean) return null
  if (clean.length > max) throw new Error(`${label}: massimo ${max} caratteri.`)
  return clean
}

function isoDate(value: unknown, label: string): string | null {
  const clean = text(value, 10, label)
  if (clean === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T00:00:00Z`))) {
    throw new Error(`${label}: data non valida.`)
  }
  return clean
}

export function parsePortalProject(input: Partial<PortalProjectFields>): PortalProjectFields {
  const title = text(input?.title, TITLE_MAX, 'Titolo pubblico')
  if (!title) throw new Error('Il titolo pubblico è obbligatorio: è la prima cosa che il cliente legge.')
  const date_kind = input?.date_kind ?? 'prevista'
  if (!Object.hasOwn(PORTAL_DATE_KINDS, date_kind)) throw new Error('Tipo di data non valido.')
  const phase = input?.phase ?? null
  if (phase !== null && !Object.hasOwn(PORTAL_PHASES, phase)) throw new Error('Fase della relazione non valida.')
  return {
    title,
    objective: text(input?.objective, TEXT_MAX, 'Obiettivo'),
    scope: text(input?.scope, TEXT_MAX, 'Perimetro condiviso'),
    update: text(input?.update, TEXT_MAX, 'Aggiornamento'),
    next_step: text(input?.next_step, TEXT_MAX, 'Prossimo passo'),
    contact: text(input?.contact, TITLE_MAX, 'Referente'),
    target_date: isoDate(input?.target_date, 'Data prevista o confermata'),
    date_kind: date_kind as PortalDateKind,
    phase: phase as PortalPhase | null,
  }
}

/** Cosa manca perché la scheda pubblica dica qualcosa, oltre al minimo del database. */
export function missingForPublication(fields: Partial<PortalProjectFields>): string[] {
  const missing: string[] = []
  if (!fields?.title?.trim()) missing.push('titolo pubblico')
  if (!fields?.objective?.trim()) missing.push('obiettivo')
  if (!fields?.next_step?.trim()) missing.push('prossimo passo')
  if (!fields?.contact?.trim()) missing.push('referente')
  return missing
}

/* Il trigger `portal_guard_project_publication` rifiuta una modifica ai campi
   condivisi che non alzi `portal_published_at`: finché il progetto è
   pubblicato, «salva» **è** «ripubblica», e l'interfaccia deve dirlo. */
export function needsRepublish(saved: PortalProjectFields, draft: PortalProjectFields): boolean {
  return (Object.keys(EMPTY_PROJECT_FIELDS) as (keyof PortalProjectFields)[])
    .some(key => (saved[key] ?? null) !== (draft[key] ?? null))
}

export type ClientTask = {
  id: string
  client_id: string | null
  task_type: string
  title: string
  description: string | null
  due_date: string | null
  deleted_at: string | null
}

/** Perché questa task non si può condividere. `null` = si può. */
export function blockedReason(task: ClientTask): string | null {
  if (task.task_type !== 'cliente') return 'Solo una task al cliente diventa un’attività del portale.'
  if (!task.client_id) return 'Senza azienda non c’è un portale dove pubblicarla.'
  if (task.deleted_at) return 'La task è stata eliminata.'
  if (!task.title?.trim()) return 'Manca il titolo.'
  if (!task.description?.trim()) return 'Manca il perché: il cliente deve sapere a cosa serve.'
  return null
}

export type PortalActivityFields = {
  client_id: string
  source_task_id: string
  title: string
  reason: string
  kind: PortalActivityKind
  due_date: string | null
  contact_name: string
}

export function activityFromTask(
  task: ClientTask,
  options: { kind: PortalActivityKind; contactName: string },
): PortalActivityFields {
  const blocked = blockedReason(task)
  if (blocked) throw new Error(blocked)
  if (!Object.hasOwn(PORTAL_ACTIVITY_KINDS, options?.kind)) throw new Error('Tipo di attività non valido.')
  const contact = text(options?.contactName, TITLE_MAX, 'A chi rivolgersi')
  if (!contact) throw new Error('Indica a chi deve rivolgersi il cliente.')
  return {
    client_id: task.client_id!,
    source_task_id: task.id,
    title: task.title.trim().slice(0, TITLE_MAX),
    reason: task.description!.trim().slice(0, TEXT_MAX),
    kind: options.kind,
    due_date: task.due_date || null,
    contact_name: contact,
  }
}

export function nextVersion(versions: { version: number }[]): number {
  return versions.reduce((max, v) => Math.max(max, Number(v.version) || 0), 0) + 1
}

export function latestPublished<T extends { version: number; published_at: string | null }>(versions: T[]): T | null {
  return versions.filter(v => v.published_at)
    .sort((a, b) => b.version - a.version)[0] ?? null
}

export function deliverableDownloadHref(versionId: string): string {
  return `/api/portale/consegne/${versionId}`
}

export function parseDeliverableTitle(value: unknown): string {
  const title = text(value, TITLE_MAX, 'Titolo della consegna')
  if (!title) throw new Error('Dai un nome alla consegna: è quello che il cliente legge nell’elenco.')
  return title
}
