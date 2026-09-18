/* §345 — Le corsie del calendario si aprono davvero.
   Esegui: npx tsx lib/gantt-lanes.check.ts

   Questo controllo esiste perché «non è cliccabile» è un difetto che il
   compilatore non vede e che dal codice si legge come funzionante: la prop c'è,
   il link c'è, e sullo schermo il bersaglio è il solo nome — quaranta pixel su
   una riga di duecentosessanta. Qui il componente si rende davvero, fuori dal
   browser, e si guarda il markup che esce. Niente JSX: così gira con lo stesso
   `npx tsx` di tutti gli altri. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/* Il repo compila il JSX con il runtime classico (`tsconfig` dice
   `jsx: preserve`, e Next mette lui l'import): fuori da Next nessuno definisce
   `React`, e il componente lo cerca al momento del render. Una riga qui evita
   di dare a questo controllo un tsconfig tutto suo — che sarebbe una seconda
   configurazione da tenere allineata alla prima. */
;(globalThis as unknown as { React: unknown }).React = React
import { ProjectGantt, type GanttLane } from '@/components/projects/ProjectGantt'
import { oggiLocale } from '@/lib/calendario-lavorativo'
import type { Milestone } from '@/lib/types/database'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const ms = (id: string, due: string, ws: string): Milestone => ({
  id, title: `Tappa ${id}`, due_date: due, workstream_id: ws, project_id: 'p1',
  status: 'da_fare', milestone_type: 'delivery', owner_id: null, sort_order: 0,
} as unknown as Milestone)

const lanes: GanttLane[] = [
  // il cliente: ha la tendina, quindi il clic sulla riga apre e chiude
  { id: 'client:c1', name: 'iCura', depth: 0, href: '/clienti/c1', accent: 'bg-gold',
    milestones: [], toggle: { expanded: true, onToggle: () => {} } },
  // il progetto: nessuna tendina, quindi la riga **è** il link
  { id: 'p1', name: 'Sito iCura', depth: 1, href: '/progetti/p1',
    milestones: [ms('m1', '2026-09-20', 'w1')] },
  // un raggruppamento senza scheda propria: nessun link, e si deve vedere
  { id: 'client:int', name: 'Progetti interni', depth: 0, href: null,
    milestones: [ms('m2', '2026-09-25', 'w2')] },
]

const html = renderToStaticMarkup(createElement(ProjectGantt, {
  lanes, tasks: [], profiles: [], onOpenMilestone: () => {},
  milestoneHref: m => `/progetti/p1/workstream/${m.workstream_id}?ms=${m.id}`,
}))

/** Il tag <a> che porta a quell'indirizzo, o stringa vuota. */
const anchor = (href: string) =>
  html.match(new RegExp(`<a [^>]*href="${href.replace(/[/?]/g, '\\$&')}"[^>]*>`))?.[0] ?? ''

console.log('\n— Ogni corsia con una scheda ha il suo link —')
is('il cliente porta alla sua scheda', !!anchor('/clienti/c1'), true)
is('il progetto porta al progetto', !!anchor('/progetti/p1'), true)
is('il raggruppamento senza scheda non ha link', html.includes('href="null"'), false)

console.log('\n— Il bersaglio è la riga, non il nome —')
/* `after:inset-0` è lo strato invisibile che allarga il link su tutta la riga:
   se sparisce, resta cliccabile il solo nome — che è il difetto segnalato. */
is('la riga del progetto è tutta un link', anchor('/progetti/p1').includes('after:inset-0'), true)
/* Sul cliente no: lì il clic sulla riga apre la tendina, che è il gesto per cui
   la tendina esiste. Se si allargasse anche lì, aprire un cliente per vederne i
   progetti porterebbe via dalla pagina. */
is('sul cliente il link non copre la riga', anchor('/clienti/c1').includes('after:inset-0'), false)
is('ma la riga resta premibile (tendina)',
  (html.match(/cursor-pointer hover:bg-surface-hover/g) ?? []).length, 2)

console.log('\n— I comandi della riga restano sopra lo strato —')
/* Senza `z-10` il chevron, il chip e il «+» finirebbero **sotto** il link che
   copre la riga: si vedono, si puntano, e aprono un'altra pagina. */
is('il chevron della tendina', /class="relative z-10 shrink-0 text-text-tertiary hover:text-text-primary/.test(html), true)

console.log('\n— Le milestone sono pulsanti —')
is('una per ogni tappa', (html.match(/aria-label="Milestone /g) ?? []).length, 2)

/* Gli ultimi due non si possono provare rendendo: chiedono un ridisegno e un
   puntatore, e qui non c'è né l'uno né l'altro. Si controlla la **causa**, che
   nel sorgente si vede — come fa `actions-guard.check.ts` con le porte.

   Il difetto: scorrendo il calendario e passando col mouse su una bandierina,
   la vista tornava di colpo su oggi, e le tappe lontane erano irraggiungibili.
   Due anelli della stessa catena, e basta rimetterne uno perché torni. */
const src = readFileSync(join(process.cwd(), 'components/projects/ProjectGantt.tsx'), 'utf8')

console.log('\n— Il calendario non torna su oggi da solo —')
/* `= []` in una prop di default è un array nuovo a ogni render: invalida il
   `useMemo` delle corsie, quindi quello del modello, quindi fa ripartire
   l'effetto che riposiziona la vista. */
is('nessun array creato nelle prop di default', /=\s*\[\]\s*,/.test(src.slice(0, src.indexOf('}: {'))), false)
/* E anche con le prop ferme, un modello nuovo (zoom, tendina aperta) non deve
   riportare la vista su oggi: ci si apre una volta sola. */
is('su oggi ci si apre una volta sola', src.includes('avviato.current'), true)
is('e cambiare scala tiene il giorno al centro', src.includes('scrollForCenterDay('), true)

console.log('\n— I giorni non lavorativi sono spenti (§354/§355) —')
/* La banda del fine settimana deve stare **sotto** le corsie e non intercettare
   il puntatore: se coprisse le bandierine, il calendario diventerebbe bello e
   inservibile — e un difetto così si vede solo provando a cliccare. */
/* §355 — due difetti in fila, e nessuno dei due si vedeva dal codice: la classe
   `bg-overlay/[0.05]` **non esisteva nel CSS compilato** (banda nel markup,
   niente sullo schermo), e `bg-overlay` prende il tono del **testo**, quindi al
   buio schiariva le colonne invece di spegnerle. Il colore adesso è un token
   opaco per tema, e il gate conta quello. */
const bande = (html.match(/<span class="absolute top-0 bottom-0 bg-cal-fermo"/g) ?? []).length
const giorniHeader = (html.match(/flex flex-col items-center justify-center/g) ?? []).length
/* La testata usa la stessa tinta: contare la classe e basta contava due volte
   lo stesso giorno, e l'asserzione «meno della metà» cadeva per un pelo. La
   banda è l'unico `<span>` che la porta. */
is('le bande dei giorni fermi ci sono', bande > 0, true)
/* Due giorni su sette: «zero» e «tutti» sono i due modi in cui questa cosa si
   rompe, e nessuno dei due si vede leggendo il codice. */
is('e sono una minoranza dei giorni', bande > 0 && bande < giorniHeader / 2, true)
is('non intercettano il puntatore', html.includes('bottom-0 pointer-events-none'), true)

console.log('\n— Il segno di oggi sta su oggi (§355) —')
/* Il difetto che ha aperto §355: le colonne nascevano a mezzanotte **locale** e
   si rileggevano con `toISOString()`, che è UTC. A Roma sono due ore indietro,
   quindi la cella del 19 si dichiarava «18» e l'evidenziato finiva su domani.
   Non alza nessuna eccezione: si vede solo guardando il calendario sapendo che
   giorno è. Qui si controlla che la colonna in oro sia quella di oggi. */
const oggi = oggiLocale()
const giornoOggi = Number(oggi.slice(8))
const celleOro = Array.from(html.matchAll(/text-gold-text font-bold[^>]*>(\d{1,2})</g)).map(m => m[1])
is('la colonna in oro porta il numero di oggi',
  celleOro.length > 0 && celleOro.every(n => Number(n) === giornoOggi), true)
is('ed è una sola', new Set(celleOro).size <= 1, true)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)
