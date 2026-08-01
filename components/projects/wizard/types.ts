import { isExternalResource } from '@/lib/permissions'
import type { Priority, Visibility, ProjectArea } from '@/lib/types/database'

export type Person = { id: string; full_name: string; app_role: string | null; avatar_url?: string | null }
export type ClientOpt = { id: string; name: string }

/** Cliente scelto allo step 1: un'anagrafica oppure progetto interno. */
export type ClientChoice = { kind: 'client'; id: string; name: string } | { kind: 'internal' }

/**
 * Il modello intermedio del wizard. Tabelle e `create_project_from_template`
 * reggono descrizione, ore stimate, priorità e consegnabile: se non passano da
 * qui, un template ricco arriva al progetto ridotto a un elenco di titoli.
 *
 * `rel_days` = giorni dall'avvio progetto. Lo portiamo dietro dal template così
 * spostare la data di inizio ricalcola l'intero piano invece di lasciare date
 * ferme a un avvio che non esiste più.
 */
export type WTask = {
  key: string; title: string; assignee_id: string | null
  due_date: string | null; visibility: Visibility
  description: string | null; estimated_hours: number | null; priority: Priority
  owner_role: string | null; rel_days: number | null
}
export type WMilestone = {
  key: string; title: string; milestone_type: 'delivery' | 'system'
  due_date: string | null; owner_id: string | null; visibility: Visibility
  description: string | null; deliverable: string | null
  owner_role: string | null; rel_days: number | null
  tasks: WTask[]
}
export type WRecurring = {
  key: string; title: string; frequency: string; owner_role: string | null
  owner_id: string | null; priority: Priority; visibility: Visibility; estimated_hours: number | null
  description: string | null
}
export type WWorkstream = {
  key: string; name: string; workstream_type: 'project' | 'recurring'
  owner_id: string | null; visibility: Visibility; description: string | null
  milestones: WMilestone[]; recurring: WRecurring[]
  collapsed?: boolean
}

/** Costruttori: i default stanno in un posto solo, non sparsi in ogni «Aggiungi». */
export const newTask = (title: string, visibility: Visibility): WTask => ({
  key: nk(), title, assignee_id: null, due_date: null, visibility,
  description: null, estimated_hours: null, priority: 'media', owner_role: null, rel_days: null,
})
export const newMilestone = (title: string, visibility: Visibility, ownerId: string | null): WMilestone => ({
  key: nk(), title, milestone_type: 'delivery', due_date: null, owner_id: ownerId, visibility,
  description: null, deliverable: null, owner_role: null, rel_days: null, tasks: [],
})
export const newRecurring = (title: string, visibility: Visibility, ownerId: string | null): WRecurring => ({
  key: nk(), title, frequency: 'weekly', owner_role: null, owner_id: ownerId,
  priority: 'media', visibility, estimated_hours: null, description: null,
})
export const newWorkstream = (name: string, ownerId: string | null): WWorkstream => ({
  key: nk(), name, workstream_type: 'project', owner_id: ownerId, visibility: 'internal',
  description: null, milestones: [], recurring: [],
})

const isoPlus = (start: string, days: number) =>
  new Date(new Date(start + 'T00:00:00').getTime() + days * 86400000).toISOString().slice(0, 10)

/** Ridatta le righe che hanno un'ancora relativa. Le date messe a mano non si toccano. */
export function applyRelativeDates(structure: WWorkstream[], start: string): WWorkstream[] {
  if (!start) return structure
  return structure.map(w => ({
    ...w,
    milestones: w.milestones.map(m => ({
      ...m,
      due_date: m.rel_days === null ? m.due_date : isoPlus(start, m.rel_days),
      tasks: m.tasks.map(t => ({
        ...t,
        due_date: t.rel_days === null ? t.due_date : isoPlus(start, t.rel_days),
      })),
    })),
  }))
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
  // solo per admin e solo con un cliente vero: il wizard lo toglie dagli altri
  { key: 'economics', label: 'Economics', hint: 'Quota, rate, subappalto' },
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
  let ms = 0, tk = 0, rc = 0, dated = 0, assigned = 0, hours = 0
  structure.forEach(w => {
    ms += w.milestones.length
    rc += w.recurring.length
    w.milestones.forEach(m => {
      if (m.due_date) dated++
      tk += m.tasks.length
      m.tasks.forEach(t => { if (t.assignee_id) assigned++; hours += t.estimated_hours ?? 0 })
    })
  })
  return { ws: structure.length, ms, tk, rc, dated, assigned, hours }
}

export const PRIORITIES: Priority[] = ['alta', 'media', 'bassa']
export type { Priority, Visibility, ProjectArea }
