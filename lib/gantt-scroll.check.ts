/* §345 — Verifica della barra del calendario. Esegui: npx tsx lib/gantt-scroll.check.ts

   La barra è l'unico pezzo di quel componente che si può sbagliare senza che
   niente protesti: il cursore si stacca dal dito, o arriva in fondo alla pista
   mentre il calendario ha ancora tre giorni da mostrare. Si vede solo
   trascinandolo — cioè non si vede. */
import {
  thumbGeometry, thumbOffset, scrollFromDrag, scrollFromTrack, scrolledPercent,
  stepOf, centerDay, scrollForCenterDay, MIN_THUMB,
} from '@/lib/gantt-scroll'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const r2 = (n: number) => Math.round(n * 100) / 100

/* Un caso vero: /progetti a zoom «giorni». 90 giorni × 44px di griglia, una
   finestra di 740px (1000 meno la colonna dei nomi), pista larga 900. */
const VIEW = 740, TOTAL = 3960, TRACK = 900
const g = thumbGeometry(VIEW, TOTAL, TRACK)

console.log('\n— Il cursore dice quanto si sta guardando —')
is('largo quanto la parte a schermo', r2(g.w), r2((VIEW / TOTAL) * TRACK))
is('la corsa del cursore è pista meno cursore', r2(g.travel), r2(TRACK - g.w))
is('la corsa del calendario è totale meno finestra', g.max, TOTAL - VIEW)

console.log('\n— Gli estremi combaciano —')
is('a sinistra il cursore è a zero', thumbOffset(0, g), 0)
/* Se questo non torna, il cursore arriva in fondo alla pista mentre il
   calendario ha ancora qualcosa da mostrare — o il contrario. */
is('in fondo il cursore è a fine corsa', r2(thumbOffset(g.max, g)), r2(g.travel))
is('oltre il fondo non si va', r2(thumbOffset(g.max * 2, g)), r2(g.travel))
is('prima dell\'inizio nemmeno', thumbOffset(-500, g), 0)
is('a metà sta a metà', r2(thumbOffset(g.max / 2, g)), r2(g.travel / 2))

console.log('\n— Il cursore resta sotto il dito —')
/* Trascinare il cursore per tutta la sua corsa deve portare il calendario
   esattamente in fondo: né prima (resta roba fuori), né oltre (si spinge nel
   vuoto). Era qui l'errore: il rapporto era `totale / pista`. */
is('tutta la corsa = tutto il calendario', scrollFromDrag(0, g.travel, g), g.max)
is('mezza corsa = metà calendario', r2(scrollFromDrag(0, g.travel / 2, g)), r2(g.max / 2))
is('indietro dal fondo torna a zero', scrollFromDrag(g.max, -g.travel, g), 0)
is('non si scorre oltre il fondo', scrollFromDrag(g.max, 500, g), g.max)
is('né prima dell\'inizio', scrollFromDrag(0, -500, g), 0)
/* Trascinare avanti e tornare indietro della stessa quantità deve riportare
   dove si era: si riparte sempre dallo scorrimento di partenza, non si somma. */
is('andata e ritorno tornano al punto', scrollFromDrag(1000, 0, g), 1000)

console.log('\n— Anche quando il cursore tocca il minimo —')
/* Cinque anni di calendario a zoom «giorni»: il cursore proporzionale sarebbe
   di 9px e diventa 28. Se il rapporto non tenesse conto della differenza, il
   calendario correrebbe più della mano. */
const lungo = thumbGeometry(740, 80000, 900)
is('il cursore non scende sotto il minimo', lungo.w, MIN_THUMB)
is('e la sua corsa arriva comunque in fondo',
  scrollFromDrag(0, lungo.travel, lungo), lungo.max)
/* Pista più stretta del cursore minimo (finestra strettissima): non deve
   dividere per zero. */
const stretta = thumbGeometry(740, 3960, 20)
is('pista minuscola: nessun infinito', Number.isFinite(scrollFromDrag(0, 10, stretta)), true)

console.log('\n— Il clic sulla pista centra il punto premuto —')
is('a metà pista si guarda la metà del calendario',
  r2(scrollFromTrack(0.5, VIEW, TOTAL)), r2(TOTAL / 2 - VIEW / 2))
is('a sinistra non va in negativo', scrollFromTrack(0, VIEW, TOTAL), 0)
is('a destra si ferma al fondo', scrollFromTrack(1, VIEW, TOTAL), TOTAL - VIEW)

console.log('\n— Quello che sente uno screen reader —')
is('all\'inizio zero', scrolledPercent(0, g), 0)
is('in fondo cento', scrolledPercent(g.max, g), 100)
is('a metà cinquanta', scrolledPercent(g.max / 2, g), 50)

console.log('\n— Il passo delle frecce —')
/* Quasi una schermata: un pezzo in comune fra prima e dopo dice dove si è
   finiti. Una schermata intera fa perdere il filo a ogni clic. */
is('quasi una schermata', stepOf(740), 592)
is('su una finestra piccola c\'è un minimo', stepOf(100), 160)

console.log('\n— Cambiare scala non sposta il calendario —')
/* Il 40° giorno al centro, a 44px al giorno. Si passa a «settimane» (20px):
   quel giorno deve restare al centro, altrimenti il cambio di scala è un salto
   — e la scala si cambia proprio per guardare lontano da oggi. */
const giorno40 = scrollForCenterDay(40, VIEW, 44)
is('il giorno al centro si ritrova', r2(centerDay(giorno40, VIEW, 44)), 40)
const dopoZoom = scrollForCenterDay(centerDay(giorno40, VIEW, 44), VIEW, 20)
is('e resta al centro con l\'altra scala', r2(centerDay(dopoZoom, VIEW, 20)), 40)
/* All'inizio del calendario non si può centrare niente di più a sinistra del
   bordo: si resta a zero invece di chiedere uno scorrimento negativo. */
is('all\'inizio ci si ferma al bordo', scrollForCenterDay(1, VIEW, 44), 0)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)
