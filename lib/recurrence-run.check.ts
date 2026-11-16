/* Verifica di cosa manca da generare (§337). Esegui: npx tsx lib/recurrence-run.check.ts */
import { missingFor, runRecurrences } from '@/lib/recurrence-run'
import { puoToccareSerie } from '@/lib/serie-ad-hoc'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(56)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const t = (o: Partial<Parameters<typeof missingFor>[0][number]> = {}) => ({
  id: 't1', generation_lead_days: 30, frequency: 'weekly' as const, interval: 1,
  weekdays: [1], day_of_month: null, start_date: '2026-09-01', end_date: null, ...o,
})

console.log('\n— La finestra è del template, non del motore —')
is('trenta giorni di lunedì', missingFor([t()], [], '2026-09-15').map(x => x.date),
  ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'])
is('tre giorni non ne prendono nessuno',
  missingFor([t({ generation_lead_days: 3 })], [], '2026-09-15').map(x => x.date), [])
is('novanta giorni ne prendono di più',
  missingFor([t({ generation_lead_days: 90 })], [], '2026-09-15').length, 13)

console.log('\n— Rilanciare non duplica —')
const tutte = missingFor([t()], [], '2026-09-15')
const esistenti = tutte.map(x => ({ recurring_template_id: 't1', generated_for_date: x.date }))
is('al secondo giro non manca più niente', missingFor([t()], esistenti, '2026-09-15'), [])
is('e se ne cancello una, torna solo quella',
  missingFor([t()], esistenti.slice(1), '2026-09-15').map(x => x.date), ['2026-09-21'])
/* L'occorrenza di un'altra serie non conta come «già fatta»: le due chiavi sono
   template **e** data, e guardare solo la data farebbe sparire la ricorrente di
   un cliente perché quella di un altro cade lo stesso giorno. */
is('una data presa da un\'altra serie non blocca questa',
  missingFor([t()], [{ recurring_template_id: 'altro', generated_for_date: '2026-09-21' }], '2026-09-15')
    .map(x => x.date).slice(0, 1), ['2026-09-21'])

console.log('\n— Più serie insieme —')
is('ognuna con la sua finestra',
  missingFor([
    t({ id: 'a', generation_lead_days: 7 }),
    t({ id: 'b', frequency: 'monthly', day_of_month: 25, generation_lead_days: 30 }),
  ], [], '2026-09-15').map(x => `${x.template.id}:${x.date}`),
  ['a:2026-09-21', 'b:2026-09-25'])

console.log('\n— Quello che non deve generare —')
is('una serie finita non produce niente',
  missingFor([t({ end_date: '2026-09-10' })], [], '2026-09-15'), [])
is('una che parte dopo la finestra nemmeno',
  missingFor([t({ start_date: '2027-01-01' })], [], '2026-09-15'), [])
/* `custom` è una RRULE che nessuno qui sa leggere: non inventa occorrenze. */
is('custom non genera', missingFor([t({ frequency: 'custom' })], [], '2026-09-15'), [])

console.log('\n— Una finestra che non è un numero non genera —')
/* §346 — la scrive il trigger `trg_recurrence_lead_days` (228) quando la colonna
   arriva vuota. Se arrivasse comunque nulla, inventare un trenta al volo farebbe
   comparire trenta righe da un trigger rotto: meglio zero righe e un sospetto. */
is('finestra nulla: nessuna occorrenza',
  missingFor([t({ generation_lead_days: null as unknown as number })], [], '2026-09-15'), [])

async function motore() {
  console.log('\n— Una regola senza responsabile resta ferma —')
  /* Il motore copia `owner_id` in `assignee_id`: generarla vuol dire fabbricare
     lavoro di nessuno, una riga nuova ogni giorno che nessuno raccoglie. Il
     database qui è finto, ma il giro è quello vero: la scelta di chi entra sta
     dentro `runRecurrences`, non dentro `missingFor`. */
  type Riga = Record<string, unknown>
  function finto(templates: Riga[]) {
    const store: Record<string, Riga[]> = {
      recurring_task_templates: templates,
      tasks: [], task_assignees: [], recurring_milestone_templates: [], milestones: [],
    }
    let seq = 0
    const db = {
      from(tabella: string) {
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'not', 'in', 'is', 'or', 'update']) chain[m] = () => chain
        chain.insert = (rows: Riga[]) => {
          store[tabella].push(...rows.map(r => ({ id: `x${++seq}`, ...r })))
          return Promise.resolve({ error: null })
        }
        chain.then = (res: (v: unknown) => unknown) => res({ data: store[tabella], error: null })
        return chain as never
      },
    }
    return { db, store }
  }

  const regola = (o: Riga = {}): Riga => ({
    id: 'r1', client_id: 'c1', project_id: 'p1', workstream_id: 'w1', milestone_id: 'm1',
    title: 'Check Ads', description: null, frequency: 'weekly', interval: 1,
    weekdays: [1], day_of_month: null, start_date: '2026-09-01', end_date: null,
    generation_lead_days: 30, owner_id: 'u1', priority: 'media', estimated_hours: null,
    visibility: 'internal', created_by: 'u0', ...o,
  })

  const conOwner = finto([regola()])
  const r1 = await runRecurrences(conOwner.db, { today: '2026-09-15' })
  is('con responsabile genera', [r1.tasks.templates, r1.tasks.created, r1.tasks.fermi], [1, 4, 0])
  is('e l\'assegnatario è il responsabile della regola',
    Array.from(new Set(conOwner.store.tasks.map(t => t.assignee_id))), ['u1'])
  /* §337 — `task_assignees` è la sorgente canonica: scrivere solo `assignee_id`
     funziona finché ogni lettore ricorda di guardare tutti e due. */
  is('e il ponte task_assignees è scritto', conOwner.store.task_assignees.length, 4)

  const senzaOwner = finto([regola({ owner_id: null })])
  const r2 = await runRecurrences(senzaOwner.db, { today: '2026-09-15' })
  is('senza responsabile non genera niente', senzaOwner.store.tasks.length, 0)
  is('e il report lo dichiara invece di tacere',
    [r2.tasks.templates, r2.tasks.created, r2.tasks.fermi], [0, 0, 1])

  const misto = finto([regola(), regola({ id: 'r2', title: 'Check Budget', owner_id: null })])
  const r3 = await runRecurrences(misto.db, { today: '2026-09-15' })
  is('in mezzo a una ferma, l\'altra lavora',
    [r3.tasks.created, r3.tasks.fermi, Array.from(new Set(misto.store.tasks.map(t => t.title)))],
    [4, 1, ['Check Ads']])

  console.log('\n— Una serie ad hoc genera task ad hoc —')
  /* §501 — senza progetto la regola è ad hoc: le occorrenze nascono fuori da
     ogni milestone, ed è quello che `tasks_hierarchy_chk` chiede a una task ad
     hoc — progetto, corsia e tappa tutti nulli. Una riga `project` senza
     progetto il database la rifiuterebbe, e con lei tutto il giro. */
  const adHoc = finto([regola({ client_id: null, project_id: null, workstream_id: null, milestone_id: null })])
  const r4 = await runRecurrences(adHoc.db, { today: '2026-09-15' })
  is('genera come le altre', [r4.tasks.templates, r4.tasks.created], [1, 4])
  is('e sono ad hoc, fuori da ogni progetto',
    Array.from(new Set(adHoc.store.tasks.map(t => [t.task_type, t.project_id, t.workstream_id, t.milestone_id].join('|')))),
    ['ad_hoc|||'])
  is('anche senza cliente', Array.from(new Set(adHoc.store.tasks.map(t => t.client_id))), [null])
  is('e il ponte task_assignees è scritto', adHoc.store.task_assignees.length, 4)
  is('una di progetto resta di progetto',
    Array.from(new Set(conOwner.store.tasks.map(t => t.task_type))), ['project'])

  console.log('\n— Una serie ad hoc è di chi la riceve e di chi l\'ha scritta —')
  /* §501 — §322: la propria roba si tocca sempre, quella degli altri no. Sulle
     serie di progetto la regola resta quella di prima: tutto lo staff. */
  const sAdHoc = { project_id: null, owner_id: 'u1', created_by: 'u0' }
  is('chi la riceve sì', puoToccareSerie(sAdHoc, 'u1', false), true)
  is('chi l\'ha scritta sì', puoToccareSerie(sAdHoc, 'u0', false), true)
  is('un collega no', puoToccareSerie(sAdHoc, 'u9', false), false)
  is('l\'admin sì', puoToccareSerie(sAdHoc, 'u9', true), true)
  is('una di progetto resta a tutto lo staff',
    puoToccareSerie({ ...sAdHoc, project_id: 'p1' }, 'u9', false), true)
}

motore().then(() => {
  console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
  process.exit(fail === 0 ? 0 : 1)
})
