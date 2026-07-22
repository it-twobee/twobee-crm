import type React from 'react'
import type { Task, Sprint, Project } from '@/lib/types/database'

export type PageTab   = 'progetto' | 'appuntamenti' | 'riunioni' | 'kpi' | 'aggiornamenti' | 'chat' | 'piano_cliente' | 'adhoc' | 'growth'
export type ExtTask   = Task & {
  milestone_id?: string | null; workstream_id?: string | null
  parent_id?: string | null; order?: number
}
/** @deprecated Gli sprint non sono più un livello: resta per i componenti legacy. */
export type ExtSprint = Sprint & { order?: number }

// ─── Gerarchia V2: Progetto → Area di lavoro → Milestone → Task ──────────────

/** In DB `project_workstreams`; nella UI si legge "Area di lavoro". */
export interface Workstream {
  id: string
  project_id: string
  key: string | null
  name: string
  description: string | null
  position: number
  status: string
  owner_id: string | null
  start_date: string | null
  end_date: string | null
  visibility: string
  requires_client_approval: boolean
  created_at: string
}

export interface Milestone {
  id: string
  workstream_id: string
  project_id: string
  title: string
  description: string | null
  milestone_type: string
  status: string
  owner_id: string | null
  expected_date: string | null
  actual_date: string | null
  completion_criteria: string | null
  approval_required: boolean
  approved_at: string | null
  visibility: string
  sort_order: number
  created_at: string
}

export const STATUS_WS_OPTS = ['da_avviare', 'in_corso', 'completata', 'bloccata', 'saltata']
export const STATUS_WS_LABEL: Record<string, string> = {
  da_avviare: 'Da avviare', in_corso: 'In corso', completata: 'Completata',
  bloccata: 'Bloccata', saltata: 'Saltata',
}
export const MILESTONE_TYPE_LABEL: Record<string, string> = {
  delivery: 'Consegna', approval: 'Approvazione', checkpoint: 'Checkpoint',
  release: 'Release', control: 'Controllo', recurring_cycle: 'Ciclo ricorrente',
}

export interface DragHandlers<T extends { id: string }> {
  dragging: string | null; dragOver: string | null
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver:  (e: React.DragEvent, id: string) => void
  onDrop:      (e: React.DragEvent, id: string) => void
  onDragEnd:   () => void
}

export const PRIORITY_COLORS: Record<string, string>  = { alta: 'var(--color-error)', media: 'var(--color-warning)', bassa: 'var(--color-text-tertiary)' }
export const PRIORITY_LABELS: Record<string, string>  = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }
export const STATUS_TASK_OPTS  = ['da_fare', 'in_corso', 'in_revisione', 'completato']
export const STATUS_TASK_LABEL: Record<string, string> = { da_fare: 'Da fare', in_corso: 'In corso', in_revisione: 'In revisione', completato: 'Fatto' }
export const STATUS_SPRINT_OPTS: Sprint['status'][]   = ['pianificato', 'in_corso', 'completato']
export const STATUS_SPRINT_LABEL: Record<string, string> = { pianificato: 'Pianificato', in_corso: 'In corso', completato: 'Completato' }
export const STATUS_PROJECT: { v: Project['status']; l: string }[] = [
  { v: 'attivo', l: 'Attivo' }, { v: 'in_pausa', l: 'In pausa' },
  { v: 'completato', l: 'Completato' }, { v: 'archiviato', l: 'Archiviato' },
]
