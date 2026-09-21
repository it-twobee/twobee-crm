/* §391 — lo scheletro dentro un periodo. Esegui: npx tsx lib/scheletro-periodo.check.ts

   L'errore di questo modulo è una data fuori dal periodo: il report di fine
   trimestre che finisce nel trimestre dopo, dove nessuno lo cerca. Succede
   perché i periodi non durano uguale — Q3 sono due mesi, Q4 quattro,
   febbraio ventotto giorni — e uno scheletro è uno solo. */
import { scadenza, scheletro, type NodoScheletro } from '@/lib/scheletro-periodo'
import { trimestre, mese } from '@/lib/periodi'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(56)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const n = (o: Partial<NodoScheletro> & { id: string }): NodoScheletro => ({
  parent_id: null, node_type: 'task', name: o.id, relative_due_days: null, sort_order: 0, ...o,
})

const Q4 = trimestre(2026, 4)   // 1 set → 31 dic, 122 giorni
const Q3 = trimestre(2026, 3)   // 1 lug → 31 ago, 62 giorni
const FEB = mese(2026, 2)       // 1 → 28 febbraio

console.log('\n— Le date restano dentro il periodo —')
{
  is('il giorno zero è il primo', scadenza(Q4, 0), '2026-09-01')
  is('il quinto giorno', scadenza(Q4, 4), '2026-09-05')
  /* Negativo conta dalla fine, e `-1` è l'ultimo giorno: contare da zero
     all'indietro avrebbe voluto dire che l'ultimo è `-0`, che non esiste. */
  is('meno uno è l\'ultimo giorno', scadenza(Q4, -1), '2026-12-31')
  is('meno sette è una settimana prima della fine', scadenza(Q4, -7), '2026-12-25')

  /* Il caso per cui esiste lo schiacciamento: lo stesso scheletro tarato su
     Q4 (quattro mesi) applicato a Q3 (due) metterebbe il report a
     settembre, dentro il trimestre dopo. */
  is('un giorno oltre la fine si schiaccia sull\'ultimo', scadenza(Q3, 200), '2026-08-31')
  is('e su Q4 lo stesso numero ci sta', scadenza(Q4, 100), '2026-12-10')
  is('febbraio non diventa marzo', scadenza(FEB, 60), '2026-02-28')
  is('e l\'ultimo giorno di febbraio è il 28', scadenza(FEB, -1), '2026-02-28')
  /* Un negativo più lungo del periodo non torna al mese prima. */
  is('meno cento su un mese resta il primo', scadenza(FEB, -100), '2026-02-01')
  is('senza giorni relativi non c\'è scadenza', scadenza(Q4, null), null)
}

console.log('\n— Su un trimestre: tappe con dentro i loro task —')
{
  const nodi: NodoScheletro[] = [
    n({ id: 'm1', node_type: 'milestone', name: 'Piano del trimestre', relative_due_days: 5, sort_order: 10 }),
    n({ id: 't1', parent_id: 'm1', name: 'Obiettivi e budget', relative_due_days: 3, sort_order: 11 }),
    n({ id: 'm2', node_type: 'milestone', name: 'Report di fine periodo', relative_due_days: -1, sort_order: 90 }),
  ]
  const r = scheletro(nodi, Q4, 'quarter')
  is('le tappe sono due', r.tappe.map(t => t.title), ['Piano del trimestre', 'Report di fine periodo'])
  /* Cinque giorni **dopo** l'inizio: il giorno zero è il primo del periodo,
     e serve che sia zero perché '-1' possa essere l'ultimo. */
  is('con le date dentro il periodo', r.tappe.map(t => t.due_date), ['2026-09-06', '2026-12-31'])
  is('il task sta nella sua tappa', r.task.map(t => [t.title, t.dentro]), [['Obiettivi e budget', 'm1']])
}

console.log('\n— Su un mese: il periodo È già la tappa —')
{
  /* Annidare una milestone dentro una milestone è una cosa che il modello
     non ha: i nodi tappa spariscono e i loro task si attaccano al periodo. */
  const nodi: NodoScheletro[] = [
    n({ id: 'm1', node_type: 'milestone', name: 'Piano editoriale', relative_due_days: 2, sort_order: 10 }),
    n({ id: 't1', parent_id: 'm1', name: 'Calendario contenuti', relative_due_days: 3, sort_order: 11 }),
    n({ id: 't2', name: 'Report del mese', relative_due_days: -1, sort_order: 90 }),
  ]
  const r = scheletro(nodi, FEB, 'month')
  is('nessuna tappa: ci sarebbe una tappa dentro una tappa', r.tappe.length, 0)
  is('e i task restano tutti, attaccati al periodo',
    r.task.map(t => [t.title, t.dentro]),
    [['Calendario contenuti', null], ['Report del mese', null]])
  is('con le date giuste', r.task.map(t => t.due_date), ['2026-02-04', '2026-02-28'])
}

console.log('\n— L\'ordine e i casi vuoti —')
{
  const nodi: NodoScheletro[] = [
    n({ id: 'b', node_type: 'milestone', name: 'Seconda', sort_order: 20 }),
    n({ id: 'a', node_type: 'milestone', name: 'Prima', sort_order: 10 }),
  ]
  is('l\'ordine è quello del template, non quello di arrivo',
    scheletro(nodi, Q4, 'quarter').tappe.map(t => t.title), ['Prima', 'Seconda'])
  is('uno scheletro vuoto non crea niente',
    scheletro([], Q4, 'quarter'), { tappe: [], task: [] })
  /* Un task il cui padre non c'è non si butta: si attacca al periodo. Un
     template incompleto deve produrre meno, non perdere delle righe. */
  is('un task orfano resta, attaccato al periodo',
    scheletro([n({ id: 't', parent_id: 'sparito', name: 'Orfano' })], Q4, 'quarter').task.map(t => t.dentro),
    [null])
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
