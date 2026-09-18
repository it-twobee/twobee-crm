/* Le tappe nella sezione Task (§346). Esegui: npx tsx lib/task-board.check.ts
   Due metà: il modello (puro) e la **fascia resa davvero**, fuori dal browser.
   La seconda esiste perché «non è cliccabile» e «la tappa di sistema è sparita
   dal calendario ma non da qui» sono difetti che il compilatore non vede e che
   dal codice si leggono come funzionanti (§345). */
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as unknown as { React: unknown }).React = React
import { tappeRows, filtraTappe, tappeCounts, isTappaAperta, type MilestoneInput } from '@/lib/task-board'
import { MilestoneBand } from '@/components/tasks/MilestoneBand'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const OGGI = '2026-09-17'
const ms = (o: Partial<MilestoneInput> & { id: string }): MilestoneInput => ({
  project_id: 'p1', workstream_id: 'w1', title: 'M1 · Consegna',
  status: 'da_fare', milestone_type: 'delivery', owner_id: 'u1', due_date: '2026-09-20',
  ...o,
})
const progetti = [
  { id: 'p1', name: 'iCura · Digital · Sito web', client_id: 'c1' },
  { id: 'p2', name: 'TWO BEE · Branding', client_id: null },
]
const nomiClienti = { c1: 'iCura Impresa' }
const rows = (milestones: MilestoneInput[], tasks: { milestone_id?: string | null; status: string }[] = []) =>
  tappeRows({ milestones, tasks, projects: progetti, clientName: nomiClienti, today: OGGI })

console.log('\n— Chi entra e chi no —')
is('la milestone di sistema resta fuori',
  rows([ms({ id: 'a' }), ms({ id: 'b', milestone_type: 'system', title: 'Operatività continua', due_date: null })])
    .map(r => r.id), ['a'])
is('una consegnata resta in elenco, ma chiusa',
  rows([ms({ id: 'a', status: 'completata' })]).map(r => r.aperta), [false])
is('in approvazione è ancora aperta', isTappaAperta('in_approvazione'), true)

console.log('\n— Il contesto viene dal progetto —')
const r0 = rows([ms({ id: 'a' }), ms({ id: 'b', project_id: 'p2' })])
is('cliente e nome del progetto', r0.map(r => `${r.projectName}|${r.clientName}`),
  ['iCura · Digital · Sito web|iCura Impresa', 'TWO BEE · Branding|null'])
/* Un progetto interno non ha anagrafica: «nessun cliente» è una scelta (§321),
   e un nome inventato qui manderebbe a cercare un'anagrafica che non c'è. */
is('progetto interno: nessun cliente, non un nome finto', r0[1].clientId, null)

console.log('\n— Quante task ha ancora sotto —')
const conTask = rows([ms({ id: 'a' })], [
  { milestone_id: 'a', status: 'da_fare' },
  { milestone_id: 'a', status: 'completato' },
  { milestone_id: 'a', status: 'in_corso' },
  { milestone_id: 'altra', status: 'da_fare' },
  { milestone_id: null, status: 'da_fare' },
])
is('due aperte su tre, e le altrui non contano',
  [conTask[0].taskAperte, conTask[0].taskTotali], [2, 3])

console.log('\n— In ritardo, vicina, senza data —')
const tre = rows([
  ms({ id: 'tardi', due_date: '2026-09-10' }),
  ms({ id: 'presto', due_date: '2026-09-20' }),
  ms({ id: 'lontana', due_date: '2026-12-01' }),
  ms({ id: 'senzadata', due_date: null }),
])
is('in ordine di data, le senza data in fondo', tre.map(r => r.id),
  ['tardi', 'presto', 'lontana', 'senzadata'])
is('il ritardo è solo di quelle aperte',
  rows([ms({ id: 'x', due_date: '2026-09-10', status: 'completata' })])[0].ritardo, false)
is('oggi conta come vicina, non come ritardo',
  rows([ms({ id: 'x', due_date: OGGI })]).map(r => [r.ritardo, r.vicina]), [[false, true]])

console.log('\n— I filtri: gli stessi per i tre elenchi —')
const f = (mode: Parameters<typeof filtraTappe>[1]) => filtraTappe(tre, { ...mode, today: OGGI }).map(r => r.id)
is('aperte = tutte quelle vive', f({ mode: 'aperte' }), ['tardi', 'presto', 'lontana', 'senzadata'])
is('late', f({ mode: 'late' }), ['tardi'])
is('overdue è lo stesso di late', f({ mode: 'overdue' }), ['tardi'])
is('soon include oggi', filtraTappe(rows([ms({ id: 'x', due_date: OGGI })]), { mode: 'soon', today: OGGI }).map(r => r.id), ['x'])
is('week esclude oggi', filtraTappe(rows([ms({ id: 'x', due_date: OGGI })]), { mode: 'week', today: OGGI }), [])
is('none = senza data', f({ mode: 'none' }), ['senzadata'])
is('unassigned guarda il responsabile',
  filtraTappe(rows([ms({ id: 'x', owner_id: null }), ms({ id: 'y' })]), { mode: 'unassigned', today: OGGI }).map(r => r.id), ['x'])
is('tutte mostra anche le consegnate',
  filtraTappe(rows([ms({ id: 'x', status: 'completata' })]), { mode: 'tutte', today: OGGI }).map(r => r.id), ['x'])
is('una consegnata non passa dai filtri delle aperte',
  filtraTappe(rows([ms({ id: 'x', status: 'completata', due_date: '2026-09-10' })]), { mode: 'late', today: OGGI }), [])

console.log('\n— Cerca e restringi —')
is('la ricerca prende anche il progetto e il cliente',
  filtraTappe(r0, { q: 'icura', mode: 'aperte', today: OGGI }).map(r => r.id), ['a'])
is('il cliente filtra', filtraTappe(r0, { clientId: 'c1', mode: 'aperte', today: OGGI }).map(r => r.id), ['a'])
/* §321 — «nessun cliente» è una scelta, non un campo vuoto: deve avere la sua
   voce anche qui, o le tappe dei progetti interni non si isolano. */
is('«nessun cliente» isola gli interni',
  filtraTappe(r0, { clientId: '__none__', mode: 'aperte', today: OGGI }).map(r => r.id), ['b'])
is('il responsabile filtra',
  filtraTappe(rows([ms({ id: 'x', owner_id: 'u2' }), ms({ id: 'y' })]), { ownerId: 'u2', mode: 'aperte', today: OGGI }).map(r => r.id), ['x'])

console.log('\n— I numeri della fascia —')
is('contati sulle aperte, le chiuse a parte',
  tappeCounts(rows([
    ms({ id: 'a', due_date: '2026-09-10' }),
    ms({ id: 'b', due_date: '2026-09-19', owner_id: null }),
    ms({ id: 'c', due_date: null }),
    ms({ id: 'd', status: 'completata', due_date: '2026-09-01' }),
  ])),
  { totali: 4, aperte: 3, chiuse: 1, ritardo: 1, vicine: 1, senzaResponsabile: 1, senzaData: 1 })
is('nessuna tappa, nessun numero',
  tappeCounts(rows([])), { totali: 0, aperte: 0, chiuse: 0, ritardo: 0, vicine: 0, senzaResponsabile: 0, senzaData: 0 })

console.log('\n— La fascia, resa davvero —')
const html = (ms0: MilestoneInput[]) => renderToStaticMarkup(createElement(MilestoneBand, {
  rows: filtraTappe(rows(ms0, [{ milestone_id: 'a', status: 'da_fare' }]), { mode: 'aperte', today: OGGI }),
  people: [{ id: 'u1', full_name: 'Sabrina Nastro' }],
  hrefOf: (r: { projectId: string; workstreamId: string }) =>
    `/progetti/${r.projectId}/workstream/${r.workstreamId}`,
}))
const uno = html([ms({ id: 'a' })])
is('la riga porta alla workstream', /href="\/progetti\/p1\/workstream\/w1"/.test(uno), true)
/* §345 — il bersaglio è tutta la riga: col link sul solo titolo la risposta è
   «non è cliccabile», ed è vera nei fatti anche se il link c'è. */
is('e il bersaglio è tutta la riga', uno.includes('after:inset-0'), true)
is('dice quante task restano sotto', uno.includes('1 task aperta su 1'), true)
is('nomina il responsabile', uno.includes('Sabrina Nastro'), true)
/* Una fascia vuota che dice «nessuna tappa» occupa lo spazio delle cose da fare
   per annunciare che non ce n'è nessuna. */
is('senza tappe non si stampa niente', html([ms({ id: 'a', milestone_type: 'system', due_date: null })]), '')
is('senza responsabile lo scrive',
  html([ms({ id: 'a', owner_id: null })]).includes('senza responsabile'), true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
