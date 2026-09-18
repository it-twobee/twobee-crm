/**
 * §337 — Materializza le ricorrenze: da regola a righe vere.
 *
 * Sta fra `lib/recurrence.ts` — che è pura e non sa cosa sia un database — e i
 * due posti che la chiamano: la route del cron e l'azione che crea o assegna
 * una ricorrente. Sono due strade e un motore solo, perché «quello che genera
 * il cron» e «quello che vedo appena assegno» devono essere la stessa cosa: se
 * divergessero, la prima occorrenza comparirebbe con una data e la seconda con
 * un'altra, e nessuna delle due sarebbe sbagliata in modo visibile.
 *
 * **Idempotente leggendo, non sperando.** Prima si guarda cosa c'è già e poi si
 * scrive quello che manca, come l'import dell'estratto conto (§210) e quello
 * delle fatture: l'indice unico resta l'ultima difesa, non la prima. La
 * finestra si sovrappone a ogni giro per costruzione — è quello che la rende
 * sicura da rilanciare quante volte si vuole.
 */
import { occurrencesBetween, type RecurrenceRule } from '@/lib/recurrence'

type Db = {
  from: (t: string) => {
    select: (q?: string, o?: Record<string, unknown>) => any
    insert: (rows: unknown) => any
    update: (patch: Record<string, unknown>) => any
  }
}

const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const plus = (day: string, n: number) => iso(Date.parse(`${day}T00:00:00Z`) + n * DAY)

export type RunReport = {
  today: string
  /** `fermi` = regole attive che non generano perché non hanno un responsabile (§346) */
  tasks: { templates: number; created: number; fermi: number; window: string | null }
  milestones: { templates: number; created: number; window: string | null }
}

type TaskTemplate = {
  id: string; client_id: string | null; project_id: string | null
  workstream_id: string | null; milestone_id: string | null
  title: string; description: string | null
  frequency: RecurrenceRule['frequency']; interval: number | null
  weekdays: number[] | null; day_of_month: number | null
  start_date: string; end_date: string | null
  generation_lead_days: number; owner_id: string | null
  priority: string; estimated_hours: number | null; visibility: string
  created_by: string | null
}

type MilestoneTemplate = {
  id: string; project_id: string; workstream_id: string
  title: string; description: string | null
  frequency: RecurrenceRule['frequency']; interval: number | null
  weekdays: number[] | null; day_of_month: number | null
  start_date: string; end_date: string | null
  generation_lead_days: number; owner_id: string | null
  approval_required: boolean; deliverable: string | null; visibility: string
}

const ruleOf = (t: {
  frequency: RecurrenceRule['frequency']; interval: number | null
  weekdays: number[] | null; day_of_month: number | null
  start_date: string; end_date: string | null
}): RecurrenceRule => ({
  frequency: t.frequency, interval: t.interval, weekdays: t.weekdays,
  day_of_month: t.day_of_month, start_date: t.start_date, end_date: t.end_date,
})

/**
 * Le occorrenze che mancano, per un elenco di template.
 *
 * Pura rispetto al database: prende quello che c'è e dice cosa scrivere. È la
 * parte che il gate può provare senza una connessione.
 */
export function missingFor<T extends { id: string; generation_lead_days: number }>(
  templates: (T & Parameters<typeof ruleOf>[0])[],
  existing: { recurring_template_id: string; generated_for_date: string }[],
  today: string,
): { template: T; date: string }[] {
  const have = new Set(existing.map(e => `${e.recurring_template_id}|${e.generated_for_date}`))
  const out: { template: T; date: string }[] = []
  for (const t of templates) {
    /* §346 — la finestra la scrive il trigger `trg_recurrence_lead_days` (228)
       quando la colonna arriva vuota. Se qui arrivasse comunque un non-numero,
       questa regola **non genera**: inventare un trenta al volo farebbe
       comparire trenta righe da un trigger rotto, e nessuno andrebbe a
       cercarne la causa. */
    if (!Number.isFinite(t.generation_lead_days)) continue
    const to = plus(today, Math.max(0, t.generation_lead_days))
    for (const date of occurrencesBetween(ruleOf(t), today, to)) {
      if (!have.has(`${t.id}|${date}`)) out.push({ template: t, date })
    }
  }
  return out
}

async function insertChunks(db: Db, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 100))
    /* 23505 = l'indice unico ha fermato un doppione: due giri contemporanei, e
       il secondo non deve rompersi per una riga che c'è già. Gli altri errori
       si alzano: una generazione che fallisce in silenzio è peggio di una che
       non parte. */
    if (error && !String(error.code ?? '').includes('23505')) throw new Error(error.message)
  }
}

/**
 * Genera, e dice quanto ha generato.
 *
 * `templateId` restringe a una serie sola: è la generazione immediata di chi ha
 * appena creato o assegnato una ricorrente, e deve costare quanto una riga —
 * non quanto tutto l'archivio.
 */
export async function runRecurrences(db: Db, opts: {
  today?: string
  taskTemplateId?: string
  milestoneTemplateId?: string
  /**
   * §346 — tutte le regole di un progetto appena nato. Il wizard ne scrive
   * dieci in una volta e non ne conosce gli id: sono nate dentro la RPC. Senza
   * questo taglio l'unica alternativa era rigenerare l'archivio intero a ogni
   * progetto creato, che è il modo di far pagare a chi crea un progetto il
   * lavoro di tutti gli altri.
   */
  projectId?: string
} = {}): Promise<RunReport> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10)
  const report: RunReport = {
    today,
    tasks: { templates: 0, created: 0, fermi: 0, window: null },
    milestones: { templates: 0, created: 0, window: null },
  }

  // ── task ───────────────────────────────────────────────────────────────────
  {
    let q = db.from('recurring_task_templates').select('*').eq('active', true)
      .not('project_id', 'is', null).not('workstream_id', 'is', null)
      .not('milestone_id', 'is', null)
    if (opts.taskTemplateId) q = q.eq('id', opts.taskTemplateId)
    if (opts.projectId) q = q.eq('project_id', opts.projectId)
    const { data } = await q
    const tutti = (data ?? []) as TaskTemplate[]

    /* §346 — **una regola senza responsabile resta ferma.** Il motore copia
       `owner_id` in `assignee_id`: generarla vuol dire fabbricare lavoro di
       nessuno, una riga nuova ogni giorno che nessuno raccoglie — è così che
       sono nate le 185 occorrenze di nessuno di §337, e con la finestra a
       trenta giorni ne sarebbero arrivate 113 in un colpo solo. Fermarsi non è
       nascondere: il report dice quante ne ha lasciate ferme, la scheda
       progetto le conta in giallo, e assegnare rigenera subito (§338) — quindi
       il gesto che manca è quello che accende la serie. */
    const templates = tutti.filter(t => t.owner_id)
    report.tasks.templates = templates.length
    report.tasks.fermi = tutti.length - templates.length

    if (templates.length) {
      const ids = templates.map(t => t.id)
      const { data: have } = await db.from('tasks')
        .select('recurring_template_id, generated_for_date').in('recurring_template_id', ids)
      const missing = missingFor(templates, (have ?? []) as never, today)
      const rows = missing.map(({ template: t, date }) => ({
        client_id: t.client_id, task_type: 'project',
        project_id: t.project_id, workstream_id: t.workstream_id, milestone_id: t.milestone_id,
        title: t.title, description: t.description, status: 'da_fare', priority: t.priority,
        assignee_id: t.owner_id, due_date: date, estimated_hours: t.estimated_hours,
        visibility: t.visibility, recurring_template_id: t.id, is_recurring_instance: true,
        generated_for_date: date, created_by: t.created_by,
      }))
      await insertChunks(db, 'tasks', rows)
      report.tasks.created = rows.length
      report.tasks.window = rows.length
        ? `${today} → ${plus(today, Math.max(...templates.map(t => t.generation_lead_days)))}` : null

      /* §337 — **`task_assignees` è la sorgente canonica** (CLAUDE.md): scrivere
         solo `tasks.assignee_id` funziona finché ogni lettore ricorda di
         guardare tutti e due, e il giorno in cui una vista nuova legge solo il
         ponte la ricorrente di qualcuno sparisce dalla sua lista senza che
         nessuno tocchi niente. Il trigger `trg_task_assignees_sync` va nell'altro
         verso, quindi va scritto qui. */
      const assegnate = rows.filter(r => r.assignee_id)
      if (assegnate.length) {
        const autorePerTemplate = new Map(templates.map(t => [t.id, t.created_by ?? null]))
        const { data: nate } = await db.from('tasks')
          .select('id, assignee_id, recurring_template_id, generated_for_date')
          .in('recurring_template_id', ids).not('assignee_id', 'is', null)
        const { data: già } = await db.from('task_assignees')
          .select('task_id, profile_id')
          .in('task_id', ((nate ?? []) as { id: string }[]).map(n => n.id))
        const noti = new Set(((già ?? []) as { task_id: string; profile_id: string }[])
          .map(g => `${g.task_id}|${g.profile_id}`))
        const ponte = ((nate ?? []) as { id: string; assignee_id: string; recurring_template_id: string }[])
          .filter(n => !noti.has(`${n.id}|${n.assignee_id}`))
          /* §347 — l'autore dell'assegnazione è chi ha scritto la regola: il
             motore non decide niente, esegue. Se la regola non ha un autore
             (import, riga a mano) resta nullo, e la riga lo dichiara. */
          .map(n => ({
            task_id: n.id, profile_id: n.assignee_id, is_primary_owner: true,
            assigned_by: autorePerTemplate.get(n.recurring_template_id) ?? null,
          }))
        await insertChunks(db, 'task_assignees', ponte)
      }

      const toccati = Array.from(new Set(missing.map(m => m.template.id)))
      if (toccati.length) {
        await db.from('recurring_task_templates')
          .update({ last_generated_at: new Date().toISOString() }).in('id', toccati)
      }
    }
  }

  // ── milestone ──────────────────────────────────────────────────────────────
  {
    let q = db.from('recurring_milestone_templates').select('*').eq('active', true)
    if (opts.milestoneTemplateId) q = q.eq('id', opts.milestoneTemplateId)
    if (opts.projectId) q = q.eq('project_id', opts.projectId)
    const { data, error } = await q
    /* La 223 può non essere ancora eseguita: le task si generano lo stesso e il
       report lo dichiara, invece di far fallire tutto il giro. */
    if (error) return report
    const templates = (data ?? []) as MilestoneTemplate[]
    report.milestones.templates = templates.length

    if (templates.length) {
      const ids = templates.map(t => t.id)
      const { data: have } = await db.from('milestones')
        .select('recurring_template_id, generated_for_date').in('recurring_template_id', ids)
      const missing = missingFor(templates, (have ?? []) as never, today)
      const rows = missing.map(({ template: t, date }) => ({
        project_id: t.project_id, workstream_id: t.workstream_id,
        title: t.title, description: t.description,
        /* `delivery` e non `system`: una tappa che torna **ha una data e si
           chiude**, ed è esattamente quello che la milestone di sistema non è
           (§322). Marcarla di sistema la farebbe sparire dal calendario, che è
           il posto per cui è stata chiesta. */
        milestone_type: 'delivery', status: 'da_fare',
        owner_id: t.owner_id, due_date: date,
        approval_required: t.approval_required, deliverable: t.deliverable,
        visibility: t.visibility,
        recurring_template_id: t.id, is_recurring_instance: true, generated_for_date: date,
      }))
      await insertChunks(db, 'milestones', rows)
      report.milestones.created = rows.length
      report.milestones.window = rows.length
        ? `${today} → ${plus(today, Math.max(...templates.map(t => t.generation_lead_days)))}` : null

      const toccati = Array.from(new Set(missing.map(m => m.template.id)))
      if (toccati.length) {
        await db.from('recurring_milestone_templates')
          .update({ last_generated_at: new Date().toISOString() }).in('id', toccati)
      }
    }
  }

  return report
}
