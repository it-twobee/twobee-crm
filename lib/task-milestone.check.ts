/* §479 — Una task diventa milestone. Esegui: npx tsx lib/task-milestone.check.ts */
import { STATO_MILESTONE_DA_TASK, motivoNonTrasformabile, milestoneDaTask, titoloNellaMilestone, type TaskDaTrasformare } from '@/lib/task-milestone'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const base: TaskDaTrasformare = {
  title: 'M1 · Consegna demo al cliente', status: 'in_corso', due_date: '2026-10-28', assignee_id: 'u1',
  task_type: 'project', project_id: 'p1', workstream_id: 'w1', parent_task_id: null, is_recurring_instance: false,
}

console.log('\n— Quale task può diventare milestone —')
is('una task di progetto sì', motivoNonTrasformabile(base), null)
is('una ad hoc no', motivoNonTrasformabile({ ...base, task_type: 'ad_hoc', project_id: null, workstream_id: null }) !== null, true)
is('una del cliente no', motivoNonTrasformabile({ ...base, task_type: 'cliente' }) !== null, true)
is('una sotto-task no', motivoNonTrasformabile({ ...base, parent_task_id: 't0' }) !== null, true)
is('una ricorrente no', motivoNonTrasformabile({ ...base, is_recurring_instance: true }) !== null, true)
is('una eliminata no', motivoNonTrasformabile({ ...base, deleted_at: '2026-10-10T00:00:00Z' }) !== null, true)

console.log('\n— La milestone che nasce —')
const m = milestoneDaTask(base)
is('il titolo resta, senza il vecchio prefisso (§485)', m.title, 'Consegna demo al cliente')
is('stessa data', m.due_date, '2026-10-28')
is('il responsabile è l\'assegnatario', m.owner_id, 'u1')
is('in corso resta in corso', m.status, 'in_corso')
is('senza prefisso il nome si scrive uguale', milestoneDaTask({ ...base, title: 'Shooting' }).title, 'Shooting')
is('senza assegnatario, senza responsabile', milestoneDaTask({ ...base, assignee_id: null }).owner_id, null)
is('la descrizione passa alla milestone', milestoneDaTask({ ...base, description: ' Script da approvare ' }).description, 'Script da approvare')
is('senza descrizione, niente descrizione', milestoneDaTask({ ...base, description: '  ' }).description, null)

console.log('\n— Gli stati si traducono —')
is('in revisione → in approvazione', STATO_MILESTONE_DA_TASK.in_review, 'in_approvazione')
is('completato → completata', STATO_MILESTONE_DA_TASK.completato, 'completata')
is('richiesta di supporto è lavoro in corso', STATO_MILESTONE_DA_TASK.richiesta_supporto, 'in_corso')
is('ogni stato della task ha il suo', Object.keys(STATO_MILESTONE_DA_TASK).sort(), ['completato', 'da_fare', 'in_corso', 'in_review', 'richiesta_supporto'])

console.log('\n— Il nome di una sotto-task dentro la milestone nuova —')
is('il prefisso vecchio si toglie', titoloNellaMilestone('M1 · Consegna demo'), 'Consegna demo')
is('senza prefisso non si tocca', titoloNellaMilestone('Consegna demo'), 'Consegna demo')

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)
