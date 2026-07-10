import type { PersonalDocument } from '@/lib/types/database'

export type DocStatus = 'valido' | 'in_scadenza' | 'scaduto' | 'senza_scadenza'

export interface DocState {
  status: DocStatus
  daysLeft: number | null
}

/** Giorni interi fra oggi e la data, negativi se già passata. Confronto per data, non per istante. */
export function daysUntil(dateStr: string, today = new Date()): number {
  const d = new Date(dateStr + 'T00:00:00')
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

export function docState(doc: Pick<PersonalDocument, 'expires_at' | 'reminder_days_before'>, today = new Date()): DocState {
  if (!doc.expires_at) return { status: 'senza_scadenza', daysLeft: null }
  const daysLeft = daysUntil(doc.expires_at, today)
  if (daysLeft < 0) return { status: 'scaduto', daysLeft }
  if (daysLeft <= (doc.reminder_days_before ?? 30)) return { status: 'in_scadenza', daysLeft }
  return { status: 'valido', daysLeft }
}

export const DOC_TYPES = [
  'Carta d’identità',
  'Passaporto',
  'Codice fiscale',
  'Permesso di soggiorno',
  'Patente',
  'Visita medica',
  'Certificazione',
  'Contratto',
  'Altro',
] as const
