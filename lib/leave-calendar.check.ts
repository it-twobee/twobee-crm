/**
 * Gate di `lib/leave-calendar.ts`. I casi vengono dalle righe vere lette sul
 * database il 2026-08-07, intervallo rovesciato compreso.
 *
 *   npx tsx lib/leave-calendar.check.ts
 */
import {
  normalize, onDay, upcoming, monthGrid, busiestDay, countdown, covers,
  daysBetween, addDays, type RawRequest, type RawLeave,
} from './leave-calendar'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

const TODAY = '2026-08-07'

// ── date ────────────────────────────────────────────────────────────────────
eq('un giorno solo è un giorno', daysBetween('2026-08-10', '2026-08-10'), 1)
eq('dal 10 al 24', daysBetween('2026-08-10', '2026-08-24'), 15)
eq('somma giorni', addDays('2026-08-30', 3), '2026-09-02')
// il cambio d'ora non deve spostare il giorno: si lavora in UTC
eq('ultima domenica di ottobre', addDays('2026-10-24', 2), '2026-10-26')

// ── normalize · le righe vere del database ──────────────────────────────────
const REQ: RawRequest[] = [
  { id: 'r1', profile_id: 'p1', type: 'ferie', status: 'approved', start_date: '2026-08-10', end_date: '2026-08-24', notes: null },
  { id: 'r2', profile_id: 'p2', type: 'ferie', status: 'approved', start_date: '2026-08-15', end_date: '2026-08-30', notes: null },
  // riga vera: fine PRIMA dell'inizio
  { id: 'r3', profile_id: 'p3', type: 'ferie', status: 'rejected', start_date: '2026-08-24', end_date: '2026-07-31', notes: null },
  { id: 'r4', profile_id: 'p4', type: 'ferie', status: 'approved', start_date: '2026-09-10', end_date: '2026-09-30', notes: null },
  // non sono assenze: hanno una data, ma nessuno manca dall'ufficio
  { id: 'r5', profile_id: 'p1', type: 'spesa', status: 'approved', start_date: '2026-08-12', end_date: '2026-08-12', notes: null },
  { id: 'r6', profile_id: 'p1', type: 'documento_hr', status: 'pending', start_date: null, end_date: null, notes: null },
  { id: 'r7', profile_id: 'p5', type: 'permesso', status: 'pending', start_date: '2026-08-11', end_date: '2026-08-11', notes: 'visita' },
]
const LEA: RawLeave[] = [
  { id: 'l1', user_id: 'p6', type: 'ferie', status: 'approvato', start_date: '2026-06-26', end_date: '2026-06-26', notes: null },
  // stessa assenza di r1, trascritta a mano dall'admin
  { id: 'l2', user_id: 'p1', type: 'ferie', status: 'approvato', start_date: '2026-08-10', end_date: '2026-08-24', notes: null },
]

const { spans, dropped } = normalize(REQ, LEA)

eq('le assenze vere', spans.map(s => s.id), ['l1', 'r1', 'r7', 'r2', 'r4'])
/* Un intervallo rovesciato non si «aggiusta» scambiando le date: non si sa
   quale delle due sia giusta. Si scarta e si dice. */
eq('scartate col motivo', dropped.map(d => d.id).sort(), ['r3', 'r5', 'r6'])
eq('il rovesciato dice cosa non va',
   dropped.find(d => d.id === 'r3')?.reason, 'intervallo rovesciato: 2026-08-24 → 2026-07-31')
eq('una nota spesa non è un\'assenza',
   dropped.find(d => d.id === 'r5')?.reason, '«spesa» non è un\'assenza')
/* La stessa assenza scritta due volte è una sola: vince la richiesta, perché è
   quella che la persona ha scritto — il registro è una trascrizione. */
eq('deduplicata', spans.filter(s => s.profileId === 'p1').map(s => s.id), ['r1'])
eq('stati tradotti', spans.map(s => s.status),
   ['approvata', 'approvata', 'da approvare', 'approvata', 'approvata'])
eq('durata inclusiva', spans.find(s => s.id === 'r1')?.days, 15)

// ── covers / onDay ──────────────────────────────────────────────────────────
const r1 = spans.find(s => s.id === 'r1')!
eq('primo giorno incluso', covers(r1, '2026-08-10'), true)
eq('ultimo giorno incluso', covers(r1, '2026-08-24'), true)
eq('il giorno dopo no', covers(r1, '2026-08-25'), false)
eq('chi manca il 20 agosto', onDay(spans, '2026-08-20').map(s => s.profileId).sort(), ['p1', 'p2'])
eq('l\'11 agosto anche il permesso', onDay(spans, '2026-08-11').map(s => s.profileId).sort(), ['p1', 'p5'])
eq('nessuno il 5 agosto', onDay(spans, '2026-08-05').length, 0)

// ── upcoming · l'avviso a 10 giorni ─────────────────────────────────────────
const up = upcoming(spans, TODAY, 10)
eq('chi parte entro dieci giorni', up.map(s => s.profileId), ['p1', 'p5', 'p2'])
eq('quanto manca', up.map(s => s.inDays), [3, 4, 8])
/* Settembre è fuori raggio: un avviso che copre tutto non avvisa di niente. */
eq('il 10 settembre non entra', up.some(s => s.profileId === 'p4'), false)

/* Chi è già via conta come chi parte domani: la domanda è «su chi non posso
   contare», e una persona partita ieri non c'è esattamente uguale. */
const during = upcoming(spans, '2026-08-12', 10)
eq('chi è già via resta in lista', during.find(s => s.profileId === 'p1')?.started, true)
eq('e i giorni sono negativi', during.find(s => s.profileId === 'p1')?.inDays, -2)
// finita ieri: fuori
eq('le finite escono', upcoming(spans, '2026-08-25', 10).some(s => s.profileId === 'p1'), false)
// una rifiutata non è un'assenza
eq('le rifiutate mai', upcoming(spans, '2026-08-20', 10).some(s => s.profileId === 'p3'), false)

// ── monthGrid ───────────────────────────────────────────────────────────────
const grid = monthGrid(spans, '2026-08-01', TODAY)
eq('sei righe', grid.length, 6)
eq('sette giorni', grid[0].length, 7)
// agosto 2026 comincia di sabato: la griglia parte dal lunedì 27 luglio
eq('parte dal lunedì', grid[0][0].date, '2026-07-27')
eq('i giorni fuori mese ci sono', grid[0][0].inMonth, false)
eq('oggi è segnato', grid.flat().find(d => d.isToday)?.date, TODAY)
eq('il weekend è marcato', grid[0][5].isWeekend && grid[0][6].isWeekend, true)
eq('le assenze finiscono nel giorno giusto',
   grid.flat().find(d => d.date === '2026-08-20')?.spans.length, 2)

const busiest = busiestDay(grid)
/* A parità vince il primo: l'11 agosto ha ferie + permesso, come il 15, ed è
   quello che si incontra prima — è il giorno su cui inciampi, non l'ultimo. */
eq('il giorno più scoperto', busiest, { date: '2026-08-11', count: 2 })
eq('mese senza assenze = nessun picco', busiestDay(monthGrid(spans, '2026-05-01', TODAY)), null)

// ── countdown ───────────────────────────────────────────────────────────────
const c1 = countdown(spans, 'p1', TODAY)
eq('mancano tre giorni', { d: c1?.inDays, s: c1?.state }, { d: 3, s: 'vicine' })
eq('il giorno prima', countdown(spans, 'p1', '2026-08-09')?.state, 'domani')
eq('durante', countdown(spans, 'p1', '2026-08-12')?.state, 'in corso')
eq('l\'ultimo giorno lo dice', countdown(spans, 'p1', '2026-08-24')?.message,
   'Ultimo giorno. Fai finta di non aver letto.')
eq('lontane', countdown(spans, 'p4', TODAY)?.state, 'lontane')
/* Una richiesta non ancora approvata non si festeggia: un countdown su qualcosa
   che può essere rifiutato è il modo più veloce di far arrabbiare qualcuno. */
eq('il permesso in attesa non fa countdown', countdown(spans, 'p5', TODAY), null)
eq('chi non ha ferie non ha countdown', countdown(spans, 'p9', TODAY), null)
// finite: non si guarda indietro
eq('dopo il rientro sparisce', countdown(spans, 'p1', '2026-08-25'), null)
eq('la barra resta fra 0 e 1',
   [c1!.progress, countdown(spans, 'p1', '2026-08-12')!.progress].every(p => p >= 0 && p <= 1), true)

// ────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
