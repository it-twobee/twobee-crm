/* §479 — Una task nel calendario di Progetti. Esegui: npx tsx lib/task-calendario.check.ts */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
// runtime JSX classico fuori da Next: stessa riga di gantt-lanes.check.ts
;(globalThis as unknown as { React: unknown }).React = React
import { ProjectGantt } from '@/components/projects/ProjectGantt'
import type { ProjectWorkstream } from '@/lib/types/database'
import {
  STATO_COME_MILESTONE, motivoFuoriCalendario, taskInCalendario, taskInCalendarioMie, type TaskDaSegnare,
} from '@/lib/task-calendario'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const base: TaskDaSegnare = {
  task_type: 'project', project_id: 'p1', workstream_id: 'w1', milestone_id: 'm1',
  parent_task_id: null, is_recurring_instance: false,
}

console.log('\n— Quale task va nel calendario —')
is('una task di progetto sì', motivoFuoriCalendario(base), null)
is('una ad hoc no', motivoFuoriCalendario({ ...base, task_type: 'ad_hoc', project_id: null, workstream_id: null, milestone_id: null }) !== null, true)
is('una del cliente no', motivoFuoriCalendario({ ...base, task_type: 'cliente' }) !== null, true)
is('una sotto-task no', motivoFuoriCalendario({ ...base, parent_task_id: 't0' }) !== null, true)
is('una ricorrente no', motivoFuoriCalendario({ ...base, is_recurring_instance: true }) !== null, true)
is('una eliminata no', motivoFuoriCalendario({ ...base, deleted_at: '2026-10-10T00:00:00Z' }) !== null, true)

console.log('\n— Cosa disegna il calendario —')
const t = (id: string, extra: Record<string, unknown>) => ({ id, due_date: '2026-10-26', on_calendar: true, deleted_at: null, parent_task_id: null, ...extra })
const disegnate = taskInCalendario([
  t('segnata', {}),
  t('non segnata', { on_calendar: false }),
  t('senza data', { due_date: null }),
  t('eliminata', { deleted_at: '2026-10-23T12:00:00Z' }),
  t('sotto-task', { parent_task_id: 'segnata' }),
  { id: 'prima della migration', due_date: '2026-10-26', deleted_at: null, parent_task_id: null },
]).map(x => x.id)
is('solo la segnata, con la data, viva, di primo livello', disegnate, ['segnata'])

console.log('\n— «Le mie» (§487) —')
is('assegnatario primario o fra gli assegnatari', taskInCalendarioMie({
  io: 'u1',
  tasks: [{ id: 'a', assignee_id: 'u1' }, { id: 'b', assignee_id: 'u2' }, { id: 'c', assignee_id: null }],
  taskMie: ['b'],
}), ['a', 'b'])

console.log('\n— Gli stati si leggono come quelli della milestone —')
is('in revisione → in approvazione', STATO_COME_MILESTONE.in_review, 'in_approvazione')
is('completato → completata', STATO_COME_MILESTONE.completato, 'completata')
is('richiesta di supporto è lavoro in corso', STATO_COME_MILESTONE.richiesta_supporto, 'in_corso')
is('ogni stato della task ha il suo', Object.keys(STATO_COME_MILESTONE).sort(), ['completato', 'da_fare', 'in_corso', 'in_review', 'richiesta_supporto'])

/* Il 23 ottobre «Build Ads» è diventata un riquadro nuovo e la task è sparita da
   «Refresh Black Friday Visionark». Il pulsante non crea più milestone e non
   elimina niente: se torna a farlo, è qui che si vede. */
console.log('\n— La task resta nel suo riquadro —')
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const azioni = src('app/actions/tasks.ts')
const corpo = azioni.slice(azioni.indexOf('export async function mettiNelCalendario'))
const fine = corpo.indexOf('\nexport ', 1)
const mettiNelCalendario = fine > 0 ? corpo.slice(0, fine) : corpo
is('l\'azione esiste', mettiNelCalendario.startsWith('export async function mettiNelCalendario'), true)
is('scrive solo on_calendar', /\.update\(\{ on_calendar: on \}\)/.test(mettiNelCalendario), true)
is('non crea milestone', /from\('milestones'\)/.test(mettiNelCalendario), false)
is('non elimina la task', /deleted_at:/.test(mettiNelCalendario), false)
is('non sposta la task', /milestone_id:/.test(mettiNelCalendario), false)
is('«Trasforma in milestone» non c\'è più', /trasformaTaskInMilestone/.test(src('app/actions/milestones.ts') + src('components/projects/TaskDetailDrawer.tsx')), false)

console.log('\n— Il calendario la disegna —')
const buildAds = {
  id: 't-build-ads', title: 'Build Ads', status: 'da_fare' as const, due_date: '2026-10-26', assignee_id: null,
  milestone_id: 'm-refresh', workstream_id: 'w1', project_id: 'p1',
}
const ws = { id: 'w1', name: 'Campagne', project_id: 'p1', workstream_type: 'continuous', start_date: null, end_date: null } as unknown as ProjectWorkstream
// la milestone che la contiene non ha data: senza la task la corsia non ci sarebbe
const html = renderToStaticMarkup(createElement(ProjectGantt, {
  workstreams: [ws], milestones: [], taskInCalendario: [buildAds], tasks: [], profiles: [], onOpenMilestone: () => {},
}))
is('la corsia c\'è anche senza milestone datate', html.includes('Campagne'), true)
is('la task ha il suo segno', html.includes('aria-label="Task Build Ads"'), true)
is('è un quadrato, non il cerchio delle milestone', /aria-label="Task Build Ads"[^>]*>\s*<span class="[^"]*rounded-md/.test(html), true)
is('l\'intestazione la conta', html.includes('1 task in calendario'), true)
is('la legenda la spiega', html.includes('Task in calendario'), true)
const senza = renderToStaticMarkup(createElement(ProjectGantt, {
  workstreams: [ws], milestones: [], taskInCalendario: [], tasks: [], profiles: [],
}))
is('senza task segnate la legenda non cambia', senza.includes('Task in calendario'), false)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)
