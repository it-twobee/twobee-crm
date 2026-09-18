/**
 * §346 — le tappe dentro la sezione Task: un modello solo per tre elenchi.
 *
 * La sezione Task le contiene tutte (§340) — di progetto e ad hoc — ma una
 * **milestone** non ci compariva da nessuna parte, e nemmeno in «Le mie
 * attività»: chi ha una tappa in carico la vedeva solo sul calendario del
 * progetto, cioè solo se era già andato a cercarla. Sedici tappe con un
 * responsabile, zero liste personali che le nominano.
 *
 * **Non si mescolano alle task**, e la ragione non è estetica:
 * - le task di una tappa sono **già** nell'elenco, quindi in una lista sola lo
 *   stesso lavoro si conta due volte e «12 in ritardo» diventa un numero che
 *   non esiste da nessuna parte;
 * - lo stato parla un'altra lingua (`in_approvazione`/`completata` contro
 *   `in_review`/`completato`): la stessa colonna direbbe due cose;
 * - una tappa non si spunta — si consegna, e a volte si fa approvare.
 *
 * Le **milestone di sistema restano fuori**: «Operatività continua» nasce dal
 * trigger su ogni workstream (§322), non ha data e non si chiude. Diciotto
 * righe identiche e senza scadenza in cima all'elenco sono esattamente il
 * rumore che §337 ha tolto dal calendario.
 *
 * Il modello è qui e non nei componenti perché lo chiedono in tre — la sezione
 * Task dell'admin, quella del workspace e «Le mie attività» — e una regola
 * scritta tre volte diverge alla prima correzione.
 *
 * Gate: `npx tsx lib/task-board.check.ts`.
 */

export type MilestoneStatus = 'da_fare' | 'in_corso' | 'in_approvazione' | 'completata'

export const MS_STATUS_LABEL: Record<MilestoneStatus, string> = {
  da_fare: 'Da fare', in_corso: 'In corso',
  in_approvazione: 'In approvazione', completata: 'Consegnata',
}

/** una tappa chiusa è `completata`: il resto è lavoro vivo */
export const isTappaAperta = (status: string) => status !== 'completata'

export type MilestoneInput = {
  id: string
  project_id: string
  workstream_id: string
  title: string
  status: string
  milestone_type: string
  owner_id: string | null
  due_date: string | null
  approval_required?: boolean | null
  is_recurring_instance?: boolean | null
}

/** delle task serve solo da dove vengono e se sono ancora aperte */
export type TaskLite = { milestone_id?: string | null; status: string }

export type TappaRow = {
  id: string
  title: string
  projectId: string
  projectName: string
  workstreamId: string
  clientId: string | null
  clientName: string | null
  ownerId: string | null
  dueDate: string | null
  status: MilestoneStatus
  aperta: boolean
  ritardo: boolean
  vicina: boolean
  approvazione: boolean
  ricorrente: boolean
  taskAperte: number
  taskTotali: number
}

const DAY = 86_400_000
const oggi = () => new Date().toISOString().slice(0, 10)
const piu = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

/**
 * Le tappe, con quante task hanno ancora aperte.
 *
 * Il conteggio delle task è la sola informazione che la milestone non porta con
 * sé e che serve a decidere se guardarla: «M2 · 0 aperte su 4» e «M2 · 4 aperte
 * su 4» sono due situazioni opposte e sulla riga si leggono uguali.
 */
export function tappeRows(input: {
  milestones: MilestoneInput[]
  tasks: TaskLite[]
  projects: { id: string; name: string; client_id?: string | null }[]
  clientName?: Record<string, string>
  today?: string
}): TappaRow[] {
  const t = input.today ?? oggi()
  const in7 = piu(t, 7)
  const proj = new Map(input.projects.map(p => [p.id, p]))

  const aperte = new Map<string, number>()
  const totali = new Map<string, number>()
  for (const task of input.tasks) {
    const k = task.milestone_id
    if (!k) continue
    totali.set(k, (totali.get(k) ?? 0) + 1)
    if (task.status !== 'completato') aperte.set(k, (aperte.get(k) ?? 0) + 1)
  }

  return input.milestones
    .filter(m => m.milestone_type !== 'system')
    .map(m => {
      const p = proj.get(m.project_id)
      const clientId = p?.client_id ?? null
      const status = (m.status as MilestoneStatus)
      const aperta = isTappaAperta(status)
      return {
        id: m.id,
        title: m.title,
        projectId: m.project_id,
        projectName: p?.name ?? 'Progetto',
        workstreamId: m.workstream_id,
        clientId,
        clientName: clientId ? (input.clientName?.[clientId] ?? null) : null,
        ownerId: m.owner_id,
        dueDate: m.due_date,
        status,
        aperta,
        ritardo: aperta && !!m.due_date && m.due_date < t,
        vicina: aperta && !!m.due_date && m.due_date >= t && m.due_date <= in7,
        approvazione: !!m.approval_required,
        ricorrente: !!m.is_recurring_instance,
        taskAperte: aperte.get(m.id) ?? 0,
        taskTotali: totali.get(m.id) ?? 0,
      }
    })
    /* per data, e le senza data in fondo: una tappa senza scadenza non è
       urgente, è **da datare** — e messa in cima spinge giù quelle che una data
       ce l'hanno e sta per scadere */
    .sort((a, b) => {
      const da = a.dueDate ?? '9999-12-31', db = b.dueDate ?? '9999-12-31'
      if (da !== db) return da < db ? -1 : 1
      return a.title.localeCompare(b.title)
    })
}

/** i filtri della sezione Task e quelli di «Le mie attività», nello stesso posto */
export type TappaFiltro =
  | 'tutte' | 'aperte' | 'unassigned'
  | 'late' | 'overdue' | 'soon' | 'today' | 'week' | 'none'

export function filtraTappe(rows: TappaRow[], opts: {
  q?: string
  /** `__none__` = senza cliente, come nella sezione Task (§321) */
  clientId?: string
  ownerId?: string
  mode?: TappaFiltro
  today?: string
} = {}): TappaRow[] {
  const t = opts.today ?? oggi()
  const in7 = piu(t, 7)
  const q = (opts.q ?? '').trim().toLowerCase()
  const mode = opts.mode ?? 'aperte'

  return rows.filter(r => {
    if (q && !r.title.toLowerCase().includes(q)
      && !r.projectName.toLowerCase().includes(q)
      && !(r.clientName ?? '').toLowerCase().includes(q)) return false
    if (opts.clientId === '__none__') { if (r.clientId !== null) return false }
    else if (opts.clientId && r.clientId !== opts.clientId) return false
    if (opts.ownerId && r.ownerId !== opts.ownerId) return false

    if (mode === 'tutte') return true
    if (!r.aperta) return false
    if (mode === 'aperte') return true
    if (mode === 'late' || mode === 'overdue') return r.ritardo
    if (mode === 'soon') return r.vicina
    /* «Prossimi 7 giorni» di «Le mie attività» esclude oggi, che ha il suo
       riquadro: contarlo due volte farebbe due riquadri che sommati superano il
       totale delle tappe aperte. */
    if (mode === 'week') return !!r.dueDate && r.dueDate > t && r.dueDate <= in7
    if (mode === 'today') return !!r.dueDate && r.dueDate === t
    if (mode === 'none') return !r.dueDate
    return !r.ownerId
  })
}

export type TappeCounts = {
  totali: number; aperte: number; chiuse: number
  ritardo: number; vicine: number; senzaResponsabile: number; senzaData: number
}

export function tappeCounts(rows: TappaRow[]): TappeCounts {
  const aperte = rows.filter(r => r.aperta)
  return {
    totali: rows.length,
    aperte: aperte.length,
    chiuse: rows.length - aperte.length,
    ritardo: aperte.filter(r => r.ritardo).length,
    vicine: aperte.filter(r => r.vicina).length,
    senzaResponsabile: aperte.filter(r => !r.ownerId).length,
    senzaData: aperte.filter(r => !r.dueDate).length,
  }
}
