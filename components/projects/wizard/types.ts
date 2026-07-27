import { isExternalResource } from '@/lib/permissions'
import type { Priority, Visibility, ProjectArea } from '@/lib/types/database'

export type Person = { id: string; full_name: string; app_role: string | null; avatar_url?: string | null }
export type ClientOpt = { id: string; name: string }

/** Cliente scelto allo step 1: un'anagrafica oppure progetto interno. */
export type ClientChoice = { kind: 'client'; id: string; name: string } | { kind: 'internal' }

export type WTask = {
  key: string; title: string; assignee_id: string | null
  due_date: string | null; visibility: Visibility
}
export type WMilestone = {
  key: string; title: string; milestone_type: 'delivery' | 'system'
  due_date: string | null; owner_id: string | null; visibility: Visibility
  tasks: WTask[]
}
export type WRecurring = {
  key: string; title: string; frequency: string; owner_role: string | null
  owner_id: string | null; priority: Priority; visibility: Visibility; estimated_hours: number | null
}
export type WWorkstream = {
  key: string; name: string; workstream_type: 'project' | 'recurring'
  owner_id: string | null; visibility: Visibility
  milestones: WMilestone[]; recurring: WRecurring[]
  collapsed?: boolean
}

/** Workstream selezionato allo step 3: voce di catalogo o creato su misura. */
export type WsPick = {
  key: string
  label: string
  service_type: string
  service_subtype: string | null
  custom: boolean
}

export const AREAS: { key: ProjectArea; label: string; hint: string }[] = [
  { key: 'marketing', label: 'Marketing', hint: 'Branding · Social · Audit · Design · Eventi' },
  { key: 'growth', label: 'Growth', hint: 'Lead Generation · SaaS · E-commerce' },
  { key: 'digital', label: 'Digital', hint: 'AI Project · Digitalizzazione' },
]

export const STEPS = [
  { key: 'cliente', label: 'Cliente', hint: 'Per chi lavoriamo' },
  { key: 'area', label: 'Area', hint: 'Il perimetro' },
  { key: 'workstream', label: 'Workstream', hint: 'Cosa consegniamo' },
  { key: 'info', label: 'Info', hint: 'Nome, date, PM' },
  { key: 'team', label: 'Team', hint: 'Chi ci lavora' },
  { key: 'template', label: 'Template', hint: 'Da dove partiamo' },
  { key: 'struttura', label: 'Struttura', hint: 'L\'albero del lavoro' },
  { key: 'conferma', label: 'Conferma', hint: 'Ultimo controllo' },
] as const

export const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly'] as const
export const FREQ_LABEL: Record<string, string> = {
  daily: 'Ogni giorno', weekly: 'Ogni settimana', biweekly: 'Ogni 2 settimane',
  monthly: 'Ogni mese', quarterly: 'Ogni trimestre', custom: 'Personalizzata',
}

/** i gruppi di ruolo vivono in lib/permissions.ts: qui si legge, non si riscrive */
export const isExternal = (p: Person) => !p.app_role || isExternalResource(p.app_role)

let _k = 0
export const nk = () => `k${_k++}`

export function countTree(structure: WWorkstream[]) {
  let ms = 0, tk = 0, rc = 0, dated = 0, assigned = 0
  structure.forEach(w => {
    ms += w.milestones.length
    rc += w.recurring.length
    w.milestones.forEach(m => {
      if (m.due_date) dated++
      tk += m.tasks.length
      m.tasks.forEach(t => { if (t.assignee_id) assigned++ })
    })
  })
  return { ws: structure.length, ms, tk, rc, dated, assigned }
}

export const PRIORITIES: Priority[] = ['alta', 'media', 'bassa']
export type { Priority, Visibility, ProjectArea }
