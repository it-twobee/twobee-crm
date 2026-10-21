/* Con quale area si apre il calendario (§358).
   Esegui: npx tsx lib/area-persona.check.ts */
import { areaDiPartenza, vedeTutto, nellArea, milestoneMie, soloMieDiPartenza, AREE } from '@/lib/area-persona'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Chi governa vede tutto —')
for (const r of ['admin', 'founder', 'super_admin']) {
  is(`${r} parte da «Tutte»`, areaDiPartenza({ appRole: r, areeDeiProgetti: ['growth', 'growth'] }), '')
  is(`  e ${r} vede tutto`, vedeTutto(r), true)
}
is('un manager no', vedeTutto('manager'), false)
is('e nemmeno un junior', vedeTutto('junior'), false)

console.log('\n— L\'area si deduce dal lavoro —')
/* `profiles.area` è nulla per tutte e sette le persone attive: un default
   costruito su quella colonna non avrebbe selezionato niente per nessuno. */
is('sei marketing e cinque growth → marketing',
  areaDiPartenza({ appRole: 'manager', areeDeiProgetti: [...Array(6).fill('marketing'), ...Array(5).fill('growth')] }), 'marketing')
is('quattro growth e uno marketing → growth',
  areaDiPartenza({ appRole: 'manager', areeDeiProgetti: ['growth', 'growth', 'growth', 'growth', 'marketing'] }), 'growth')
is('solo digital → digital',
  areaDiPartenza({ appRole: 'senior', areeDeiProgetti: ['digital'] }), 'digital')

console.log('\n— La scelta esplicita batte la deduzione —')
is('`profiles.area` vince sui progetti',
  areaDiPartenza({ appRole: 'manager', areaProfilo: 'digital', areeDeiProgetti: ['growth', 'growth'] }), 'digital')
is('ma un valore fuori elenco non vale niente',
  areaDiPartenza({ appRole: 'manager', areaProfilo: 'vendite', areeDeiProgetti: ['growth'] }), 'growth')
is('maiuscole e spazi non contano',
  areaDiPartenza({ appRole: 'manager', areaProfilo: '  Growth ' }), 'growth')

console.log('\n— Quando non c\'è niente da dedurre —')
is('nessun progetto → Tutte', areaDiPartenza({ appRole: 'junior', areeDeiProgetti: [] }), '')
is('progetti senza area → Tutte',
  areaDiPartenza({ appRole: 'junior', areeDeiProgetti: [null, undefined, ''] }), '')
is('e senza niente del tutto → Tutte', areaDiPartenza({ appRole: 'stage' }), '')

console.log('\n— A parità, la stessa risposta ogni volta —')
/* Un default che cambia da solo a ogni ricarico è peggio di nessun default:
   a parità vince l'ordine con cui le aree sono scritte. */
const pari = { appRole: 'manager', areeDeiProgetti: ['marketing', 'growth', 'digital'] }
is('tre a uno pari → la prima dell\'elenco', areaDiPartenza(pari), AREE[0])
is('e non cambia rileggendo', areaDiPartenza(pari), areaDiPartenza(pari))
is('l\'ordine è growth, digital, marketing', [...AREE], ['growth', 'digital', 'marketing'])

console.log('\n— Il filtro è un confine (§484) —')
is('«Marketing»: un progetto marketing resta', nellArea('marketing', 'marketing'), true)
is('«Marketing»: un growth sparisce, anche se è tuo', nellArea('growth', 'marketing'), false)
is('«Marketing»: un progetto senza area sparisce', nellArea(null, 'marketing'), false)
is('«Tutte»: resta tutto', AREE.every(a => nellArea(a, '')), true)
is('«Tutte»: anche senza area', nellArea(null, ''), true)
is('maiuscole e spazi non contano', nellArea(' Marketing ', 'marketing'), true)

console.log('\n— Le milestone in cui sei inclusa (§487) —')
const ms = [
  { id: 'm1', owner_id: 'io' },
  { id: 'm2', owner_id: 'altra' },
  { id: 'm3', owner_id: 'altra' },
  { id: 'm4', owner_id: null },
  { id: 'm5', owner_id: 'altra' },
]
const tk = [
  { id: 't1', milestone_id: 'm2', assignee_id: 'io' },
  { id: 't2', milestone_id: 'm3', assignee_id: 'altra' },
  { id: 't3', milestone_id: 'm4', assignee_id: null },
  { id: 't4', milestone_id: null, assignee_id: 'io' },
]
const mie = milestoneMie({ io: 'io', milestones: ms, tasks: tk, taskMie: ['t2'] }).sort()
is('responsabile: sì', mie.includes('m1'), true)
is('task assegnata a me dentro: sì', mie.includes('m2'), true)
is('fra gli assegnatari di una task: sì', mie.includes('m3'), true)
is('nessun legame: no', mie.includes('m5'), false)
is('una task senza milestone non porta niente', mie, ['m1', 'm2', 'm3'])
is('senza task_assignees: solo responsabile e primaria', milestoneMie({ io: 'io', milestones: ms, tasks: tk }).sort(), ['m1', 'm2'])

console.log('\n— Con quale vista si parte —')
is('admin: Tutte', soloMieDiPartenza('admin'), false)
is('super admin: Tutte', soloMieDiPartenza('super_admin'), false)
is('manager: le sue', soloMieDiPartenza('manager'), true)
is('junior: le sue', soloMieDiPartenza('junior'), true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
