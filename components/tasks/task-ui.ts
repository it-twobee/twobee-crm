/**
 * §348 — il vocabolario visivo delle task, in un posto solo.
 *
 * Stati, toni, priorità e il modo di scrivere una scadenza stavano scritti due
 * volte: una nella sezione Task e una in «Le mie attività». Erano già divergenti
 * — «Completata» di qua, «Completato» di là — e la stessa task cambiava parola a
 * seconda della pagina da cui la si guardava. Qui ci sono una volta sola, e i
 * due elenchi (che ormai sono lo stesso componente) le leggono da qui.
 */
import type { TaskStatusV2 } from '@/lib/types/database'

export type Person = { id: string; full_name: string; avatar_url?: string | null }

/** l'ordine è quello delle colonne della bacheca: da fare → chiusa */
export const COLUMNS: { key: TaskStatusV2; label: string }[] = [
  { key: 'da_fare', label: 'Da fare' },
  { key: 'in_corso', label: 'In corso' },
  { key: 'in_review', label: 'In review' },
  { key: 'richiesta_supporto', label: 'Supporto' },
  { key: 'completato', label: 'Completata' },
]

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(COLUMNS.map(c => [c.key, c.label]))
export const TASK_TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_review: 'text-warning',
  richiesta_supporto: 'text-orange', completato: 'text-success',
}

export const PRIO_DOT: Record<string, string> = { alta: 'bg-error', media: 'bg-warning', bassa: 'bg-text-tertiary' }
export const PRIO_LABEL: Record<string, string> = { alta: 'Alta priorità', media: 'Priorità media', bassa: 'Bassa priorità' }
export const PRIO_RANK: Record<string, number> = { alta: 0, media: 1, bassa: 2 }

const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const today = () => iso(new Date())
export const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
/** prossimo lunedì, per rimandare a inizio settimana */
export const nextMonday = () => {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return iso(d)
}

/** compatto, per la colonna Scadenza: «3g fa», «oggi», «tra 5g», «09-30» */
export function relDays(due: string) {
  const d = Math.round((Date.parse(`${due}T00:00:00`) - Date.parse(`${today()}T00:00:00`)) / 86400000)
  if (d < 0) return { text: `${-d}g fa`, tone: 'text-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning' }
  if (d === 1) return { text: 'domani', tone: 'text-warning' }
  if (d <= 7) return { text: `tra ${d}g`, tone: 'text-warning' }
  return { text: due.slice(5), tone: 'text-text-tertiary' }
}

/** esteso, per bacheca e calendario, dove c'è spazio per un giorno della settimana */
export function dueLabel(d: string | null, completed: boolean): { text: string; tone: string } | null {
  if (!d) return null
  const t0 = Date.parse(`${today()}T00:00:00`)
  const dt = new Date(`${d}T00:00:00`)
  const diff = Math.round((dt.getTime() - t0) / 86400000)
  const base = `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`
  if (completed) return { text: base, tone: 'text-text-tertiary' }
  if (diff < 0) return { text: `${base} · ${-diff}g fa`, tone: 'text-error' }
  if (diff === 0) return { text: 'Oggi', tone: 'text-warning' }
  if (diff === 1) return { text: 'Domani', tone: 'text-warning' }
  if (diff <= 6) return { text: WEEKDAYS[dt.getDay()], tone: 'text-text-secondary' }
  return { text: base, tone: 'text-text-secondary' }
}

export const isOverdue = (t: { due_date: string | null; status: string }) =>
  !!t.due_date && t.status !== 'completato' && t.due_date < today()
