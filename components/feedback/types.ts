export type FeedbackKind = 'improvement' | 'new_section' | 'idea' | 'bug'
export type FeedbackStatus = 'nuovo' | 'in_valutazione' | 'pianificato' | 'in_corso' | 'realizzato' | 'archiviato'

export interface FeedbackSection { key: string; label: string }

export interface FeedbackItem {
  id: string
  author_id: string
  source_portal: 'admin' | 'workspace'
  kind: FeedbackKind
  target_section_key: string | null
  proposed_section_name: string | null
  title: string
  description: string
  impact: 'bassa' | 'media' | 'alta'
  status: FeedbackStatus
  admin_note: string | null
  vote_count: number
  created_at: string
  author: { full_name: string | null; avatar_url: string | null } | null
}

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  nuovo: 'Nuovo',
  in_valutazione: 'In valutazione',
  pianificato: 'Pianificato',
  in_corso: 'In corso',
  realizzato: 'Realizzato',
  archiviato: 'Archiviato',
}

export const STATUS_STYLE: Record<FeedbackStatus, string> = {
  nuovo: 'bg-info-dim text-info',
  in_valutazione: 'bg-warning-dim text-warning',
  pianificato: 'bg-accent-dim text-accent',
  in_corso: 'bg-gold-dim text-gold-text',
  realizzato: 'bg-success-dim text-success',
  archiviato: 'bg-surface-active text-text-tertiary',
}

export const KIND_LABELS: Record<FeedbackKind, string> = {
  improvement: 'Miglioramento',
  new_section: 'Nuova sezione',
  idea: 'Idea',
  bug: 'Problema',
}

export const IMPACT_LABELS: Record<'bassa' | 'media' | 'alta', string> = {
  bassa: 'Impatto basso', media: 'Impatto medio', alta: 'Impatto alto',
}
