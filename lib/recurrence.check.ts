/* Verifica della regola di ricorrenza (§337). Esegui: npx tsx lib/recurrence.check.ts */
import {
  matches, occurrencesBetween, nextOccurrence, nearestToToday, collapseSeries,
  monthlyVolume, ruleLabel, type RecurrenceRule,
} from '@/lib/recurrence'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(56)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const yes = (label: string, got: boolean) => { if (!got) fail++; console.log(`${got ? 'OK ' : 'NO '} ${label}`) }
const r = (o: Partial<RecurrenceRule>): RecurrenceRule =>
  ({ frequency: 'weekly', start_date: '2026-09-01', ...o })

/* 2026-09-01 è un martedì. Le date di questo file sono scelte per farlo
   cadere su un cambio di mese e su un cambio di settimana: è lì che le
   ricorrenze sbagliano. */
console.log('\n— Ogni giorno —')
is('tutti i giorni', occurrencesBetween(r({ frequency: 'daily' }), '2026-09-01', '2026-09-05'),
  ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'])
is('ogni tre giorni parte dall\'inizio',
  occurrencesBetween(r({ frequency: 'daily', interval: 3 }), '2026-09-01', '2026-09-10'),
  ['2026-09-01', '2026-09-04', '2026-09-07', '2026-09-10'])
is('prima della partenza non cade niente',
  occurrencesBetween(r({ frequency: 'daily' }), '2026-08-20', '2026-08-31'), [])
is('dopo la fine nemmeno',
  occurrencesBetween(r({ frequency: 'daily', end_date: '2026-09-03' }), '2026-09-01', '2026-09-10'),
  ['2026-09-01', '2026-09-02', '2026-09-03'])

console.log('\n— Ogni settimana —')
is('senza giorni scelti vale quello della partenza (martedì)',
  occurrencesBetween(r({}), '2026-09-01', '2026-09-30'),
  ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'])
is('lunedì e mercoledì',
  occurrencesBetween(r({ weekdays: [1, 3] }), '2026-09-01', '2026-09-14'),
  ['2026-09-02', '2026-09-07', '2026-09-09', '2026-09-14'])

/* Il difetto che questa regola esiste per non riavere: contando i giorni
   trascorsi invece delle settimane di calendario, una `biweekly` che parte di
   mercoledì e ricade di lunedì saltava un'occorrenza su due. */
console.log('\n— Ogni due settimane, partendo a metà settimana —')
const bi = r({ frequency: 'biweekly', start_date: '2026-09-02', weekdays: [1] })
is('i lunedì alternati, contati per settimana di calendario',
  occurrencesBetween(bi, '2026-09-01', '2026-10-15'),
  ['2026-09-07', '2026-09-21', '2026-10-05'])
yes('e non è lo stesso insieme della settimanale',
  JSON.stringify(occurrencesBetween(bi, '2026-09-01', '2026-10-15'))
  !== JSON.stringify(occurrencesBetween(r({ start_date: '2026-09-02', weekdays: [1] }), '2026-09-01', '2026-10-15')))

console.log('\n— Ogni mese —')
is('il 25, mese dopo mese',
  occurrencesBetween(r({ frequency: 'monthly', start_date: '2026-08-25' }), '2026-09-01', '2026-11-30'),
  ['2026-09-25', '2026-10-25', '2026-11-25'])
is('ogni due mesi salta quello in mezzo',
  occurrencesBetween(r({ frequency: 'monthly', interval: 2, start_date: '2026-08-25' }), '2026-09-01', '2026-12-31'),
  ['2026-10-25', '2026-12-25'])
is('il trimestrale cade ogni tre',
  occurrencesBetween(r({ frequency: 'quarterly', start_date: '2026-01-10' }), '2026-01-01', '2026-12-31'),
  ['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10'])
/* Il 31 non esiste a febbraio, e spostarlo al 28 farebbe comparire una chiusura
   mensile tre giorni prima senza che nessuno l'abbia chiesta. */
is('il 31 salta i mesi che non ce l\'hanno',
  occurrencesBetween(r({ frequency: 'monthly', start_date: '2026-01-31' }), '2026-01-01', '2026-04-30'),
  ['2026-01-31', '2026-03-31'])

console.log('\n— La prossima —')
is('da oggi in avanti', nextOccurrence(r({ weekdays: [1] }), '2026-09-15'), '2026-09-21')
is('oggi stesso conta come prossima', nextOccurrence(r({ frequency: 'daily' }), '2026-09-15'), '2026-09-15')
is('una regola finita non ne ha più',
  nextOccurrence(r({ frequency: 'daily', end_date: '2026-09-10' }), '2026-09-15'), null)
/* `custom` è una RRULE iCal: senza un lettore vero non produce niente, e dirlo
   è meglio che indovinare una data. */
is('custom non inventa date', nextOccurrence(r({ frequency: 'custom' }), '2026-09-15'), null)
yes('e non cade mai', !matches(r({ frequency: 'custom' }), '2026-09-15'))

console.log('\n— Sul calendario ne compare una sola —')
const serie = [
  { id: 'a', due_date: '2026-08-25', recurring_template_id: 't1' },
  { id: 'b', due_date: '2026-09-25', recurring_template_id: 't1' },
  { id: 'c', due_date: '2026-10-25', recurring_template_id: 't1' },
  { id: 'd', due_date: '2026-09-30', recurring_template_id: null },
]
is('la più vicina guardando avanti', nearestToToday(serie, '2026-09-15')?.id, 'b')
is('a parità di serie resta una tappa sola più le consegne vere',
  collapseSeries(serie, '2026-09-15').map(x => x.id).sort(), ['b', 'd'])
/* Quando la serie è finita la riga non sparisce: «questa non c'è più» e «non
   c'è mai stata» sono due cose diverse, e sul calendario si leggevano uguali. */
is('serie tutta passata: resta l\'ultima', nearestToToday(serie.slice(0, 1), '2026-09-15')?.id, 'a')
is('senza date non c\'è niente da mostrare',
  nearestToToday([{ id: 'x', due_date: null }], '2026-09-15'), null)
/* Una consegna vera non si accorpa con niente: il giorno in cui questa funzione
   la nascondesse, il calendario smetterebbe di servire a quello per cui esiste. */
is('due consegne senza serie restano due',
  collapseSeries([{ due_date: '2026-09-20' }, { due_date: '2026-09-21' }], '2026-09-15').length, 2)

console.log('\n— Quanto produce, detto prima di salvare —')
/* Da martedì 15 settembre, i lunedì nei trenta giorni successivi sono 21/9,
   28/9, 5/10 e 12/10: quattro, non cinque. */
is('una settimanale in un mese', monthlyVolume(r({ weekdays: [1] }), '2026-09-15'), 4)
is('una giornaliera', monthlyVolume(r({ frequency: 'daily' }), '2026-09-15'), 31)
is('una mensile', monthlyVolume(r({ frequency: 'monthly', start_date: '2026-09-25' }), '2026-09-15'), 1)

console.log('\n— Come si legge —')
is('settimanale', ruleLabel(r({ weekdays: [1, 3] })), 'ogni settimana, di lunedì e mercoledì')
is('quindicinale', ruleLabel(r({ frequency: 'biweekly', weekdays: [5] })), 'ogni due settimane, di venerdì')
is('mensile', ruleLabel(r({ frequency: 'monthly', day_of_month: 25 })), 'ogni mese, il 25')
is('giornaliera con intervallo', ruleLabel(r({ frequency: 'daily', interval: 3 })), 'ogni 3 giorni')

/* Il fuso: una ricorrenza «ogni lunedì» calcolata con l'ora locale cade di
   domenica per mezza Europa una volta l'anno, e si scopre dal calendario di
   qualcun altro. I conti sono in UTC e il cambio d'ora non li tocca. */
console.log('\n— Il cambio d\'ora non sposta niente —')
is('a cavallo dell\'ultima domenica di ottobre',
  occurrencesBetween(r({ weekdays: [1], start_date: '2026-10-19' }), '2026-10-19', '2026-11-09'),
  ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
