/* La voce delle liste (§351). Esegui: npx tsx lib/task-mood.check.ts
   Le frasi sono libere di essere simpatiche, non di mentire: qui si controlla
   che il numero ci sia sempre, che la stessa situazione dia sempre la stessa
   frase, e che nessuna variante sfori la riga. */
import {
  verdetto, sottotitolo, saluto, seme, sottotitoloSezione, SEZIONI_CHIAVI,
  salutoPersonale, type Momento, type Ruolo, type StatoPersona,
} from '@/lib/task-mood'
import { VIETATE } from '@/lib/voce-twobee'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const MOMENTI: Momento[] = [
  { ora: null, giorno: null },
  ...[7, 11, 13, 17, 20, 23].flatMap(ora => [0, 1, 3, 5, 6].map(giorno => ({ ora, giorno }))),
]
/* Semi **consecutivi**: la scelta è un modulo sulla lunghezza del gruppo, e una
   serie a passo sette copriva un solo resto su sette — il controllo bocciava
   frasi legittime perché non le aveva mai pescate. Un test che campiona male
   accusa il codice del proprio difetto. */
const SEMI = Array.from({ length: 40 }, (_, i) => i)
const conti = (o: Partial<Parameters<typeof verdetto>[0]> = {}) =>
  ({ aperte: 10, late: 4, soon: 2, tutte: 16, ...o })

console.log('\n— Il numero non si tocca —')
let senzaNumero = 0, troppoLunghe = 0, vuote = 0
for (const m of MOMENTI) for (const s of SEMI) {
  for (const [c, n] of [
    [conti({ late: 4 }), 4],
    [conti({ late: 1 }), 1],
    [conti({ late: 0, soon: 3 }), 3],
    [conti({ late: 0, soon: 0, aperte: 7 }), 7],
  ] as const) {
    const t = verdetto(c, m, s).testo
    if (!t.includes(String(n))) senzaNumero++
    if (t.length > 92) troppoLunghe++
    if (!t.trim()) vuote++
  }
}
is('ogni verdetto con un conteggio lo scrive', senzaNumero, 0)
is('nessuna frase sfora la riga (92 caratteri)', troppoLunghe, 0)
is('nessuna frase vuota', vuote, 0)

console.log('\n— L\'ordine della gravità non cambia —')
is('il ritardo batte la scadenza vicina', verdetto(conti({ late: 2, soon: 9 }), MOMENTI[0], 1).tono, 'error')
is('la scadenza vicina batte le buone notizie', verdetto(conti({ late: 0, soon: 9 }), MOMENTI[0], 1).tono, 'warning')
is('tutto chiuso è un successo', verdetto(conti({ late: 0, soon: 0, aperte: 0 }), MOMENTI[0], 1).tono, 'success')
/* Con zero task in tutto non si può essere «in ritardo»: il caso vuoto viene
   prima di ogni altro, o la lista di chi è appena arrivato lo accoglierebbe
   con un rimprovero. */
is('nessuna task: tono neutro', verdetto({ aperte: 0, late: 0, soon: 0, tutte: 0 }, MOMENTI[0], 1).tono, 'neutro')
is('e non parla di ritardi',
  /ritard|scadut/i.test(verdetto({ aperte: 0, late: 0, soon: 0, tutte: 0 }, MOMENTI[0], 1).testo), false)

console.log('\n— Stessa situazione, stessa frase —')
const a = verdetto(conti(), { ora: 9, giorno: 1 }, seme('2026-09-18', 4, 10))
const b = verdetto(conti(), { ora: 9, giorno: 1 }, seme('2026-09-18', 4, 10))
is('due letture uguali danno lo stesso testo', a.testo === b.testo, true)
/* Il seme cambia col giorno e coi numeri: se non cambiasse, la stessa battuta
   resterebbe lì finché qualcuno non chiude una task — cioè per sempre. */
is('domani cambia', seme('2026-09-18', 4, 10) !== seme('2026-09-19', 4, 10), true)
is('e cambia se cambiano i numeri', seme('2026-09-18', 4, 10) !== seme('2026-09-18', 3, 10), true)
is('ma non cambia scrivendo nella ricerca', seme('2026-09-18', 4, 10), seme('2026-09-18', 4, 10))

console.log('\n— Prima che si sappia che ore sono —')
/* Il server sta su UTC e chi legge no: se il primo render pescasse una frase
   legata all'orologio, il browser ne scriverebbe un'altra e React protesterebbe.
   Il controllo è **strutturale, non sulle parole**: una frase pescabile senza
   momento deve restare pescabile a ogni ora e ogni giorno — è vero solo per
   quelle senza condizione. Cercare «mattina» nel testo bocciava invece frasi
   legittime che il mattino lo nominano per modo di dire («carte che servono
   sempre di lunedì mattina»): un test che guarda le parole al posto della
   regola boccia il codice giusto e lascia passare quello sbagliato. */
const insieme = (fn: (m: Momento, s: number) => string, m: Momento) =>
  new Set(SEMI.map(s => fn(m, s)))

const sempreDisponibile = (nome: string, fn: (m: Momento, s: number) => string) => {
  const neutre = insieme(fn, { ora: null, giorno: null })
  const fuori: string[] = []
  for (const m of MOMENTI.slice(1)) {
    const qui = insieme(fn, m)
    Array.from(neutre).forEach(t => { if (!qui.has(t)) fuori.push(`${t} @${m.ora}/${m.giorno}`) })
  }
  is(nome, fuori.slice(0, 2), [])
}
sempreDisponibile('il verdetto senza ora vale a ogni ora',
  (m, s) => verdetto(conti(), m, s).testo)
sempreDisponibile('il sottotitolo senza ora vale a ogni ora',
  (m, s) => sottotitolo({ origin: 'tutte', personale: true }, m, s))
sempreDisponibile('il saluto senza ora vale a ogni ora', (m, s) => saluto(m, s))

console.log('\n— Ce n\'è per ogni situazione —')
const combinazioni = MOMENTI.flatMap(m => SEMI.map(s => [m, s] as const))
is('il sottotitolo non è mai vuoto',
  combinazioni.filter(([m, s]) =>
    (['tutte', 'progetto', 'ad_hoc'] as const).some(o =>
      !sottotitolo({ origin: o, personale: true }, m, s).trim()
      || !sottotitolo({ origin: o, personale: false }, m, s).trim())).length, 0)
is('il saluto non è mai vuoto', combinazioni.filter(([m, s]) => !saluto(m, s).trim()).length, 0)
/* Quante ne vede davvero chi guarda: una sola variante è una frase fissa con
   più righe di codice intorno. */
const distinte = (fn: (m: Momento, s: number) => string) =>
  new Set(combinazioni.map(([m, s]) => fn(m, s))).size
is('il verdetto in ritardo ha più di quattro varianti',
  distinte((m, s) => verdetto(conti({ late: 4 }), m, s).testo) > 4, true)
is('il saluto ne ha più di quattro', distinte((m, s) => saluto(m, s)) > 4, true)

console.log('\n— Ogni sezione del workspace ha una voce —')
/* Una sezione senza frasi è una sezione muta, e si scopre solo aprendola: qui
   si prova ogni chiave per ogni ora e ogni giorno. */
let sezioniMute = 0, sezioniLunghe = 0
for (const k of SEZIONI_CHIAVI) for (const m of MOMENTI) for (const s of SEMI) {
  const t = sottotitoloSezione(k, m, s)
  if (!t.trim()) sezioniMute++
  if (t.length > 92) sezioniLunghe++
}
is('nessuna sezione muta', sezioniMute, 0)
is('nessun sottotitolo di sezione sfora la riga', sezioniLunghe, 0)
for (const k of SEZIONI_CHIAVI) sempreDisponibile(`${k}: senza ora vale a ogni ora`, (m, s) => sottotitoloSezione(k, m, s))
is('le sezioni coperte sono dodici', SEZIONI_CHIAVI.length, 12)

console.log('\n— Il saluto personale: numeri di chi guarda, e il suo ruolo —')
const RUOLI: Ruolo[] = ['super_admin', 'admin', 'manager', 'senior', 'junior', 'stage', 'freelance', 'partner', null]
const persona = (o: Partial<StatoPersona> = {}): StatoPersona =>
  ({ aperte: 5, late: 0, oggi: 0, chiuseOggi: 0, chiuseSettimana: 0, progetti: 0, ruolo: 'senior', ...o })

/* Due regole diverse, e la prima vale per **tutte** le frasi: un numero scritto
   nel testo dev'essere un numero dei dati. La versione precedente pretendeva
   invece che ogni frase ne citasse uno, e bocciava «Elenco pulito» — che un
   numero non ce l'ha perché non c'è niente da contare. Un test che chiede più
   della regola fa riscrivere il codice giusto. */
let pInventati = 0, pLunghe = 0, pVuote = 0, pMuteDoveConta = 0
for (const r of RUOLI) for (const m of MOMENTI) for (const s of SEMI) {
  const stati: [StatoPersona, number | null][] = [
    [persona({ ruolo: r, late: 3 }), 3],
    [persona({ ruolo: r, late: 0, oggi: 2 }), 2],
    [persona({ ruolo: r, late: 0, chiuseOggi: 4 }), 4],
    [persona({ ruolo: r, aperte: 6 }), 6],
    [persona({ ruolo: r, aperte: 0, chiuseSettimana: 9 }), null],
  ]
  for (const [st, obbligatorio] of stati) {
    const t = salutoPersonale(st, m, s)
    const veri = new Set([st.aperte, st.late, st.oggi, st.chiuseOggi, st.chiuseSettimana, st.progetti].map(String))
    for (const num of t.match(/\d+/g) ?? []) if (!veri.has(num)) pInventati++
    /* Dove il numero **è** la notizia — ritardi, scadenze di oggi, chiuse in
       giornata, carico aperto — la frase deve dirlo: girarci intorno lì
       significherebbe togliere l'unica informazione della riga. */
    if (obbligatorio !== null && !t.includes(String(obbligatorio))) pMuteDoveConta++
    if (t.length > 96) pLunghe++
    if (!t.trim()) pVuote++
  }
}
is('nessun numero inventato', pInventati, 0)
is('dove il numero è la notizia, la frase lo dice', pMuteDoveConta, 0)
is('nessun saluto sfora la riga (96 caratteri)', pLunghe, 0)
is('nessun saluto vuoto', pVuote, 0)

console.log('\n— Il ruolo cambia di cosa si parla, non il rispetto —')
const perRuolo = (r: Ruolo, st: Partial<StatoPersona>) =>
  new Set(MOMENTI.flatMap(m => SEMI.map(s => salutoPersonale(persona({ ...st, ruolo: r }), m, s))))
const stage = perRuolo('stage', { late: 3 })
const manager = perRuolo('manager', { late: 3 })
is('uno stage e un manager non leggono la stessa cosa',
  Array.from(stage).some(t => !manager.has(t)), true)
/* A chi non ha niente in lista non si rinfaccia niente: è il caso di chi è
   appena arrivato, e sarebbe un benvenuto pessimo. */
const fermo = Array.from(perRuolo('junior', { aperte: 0, late: 0, oggi: 0 }))
is('a lista vuota non si parla di ritardi', fermo.filter(t => /ritard|scadut/i.test(t)).length, 0)
is('e non si dà la colpa a nessuno', fermo.filter(t => /colpa|pigr|sveglia/i.test(t)).length, 0)

console.log('\n— Stessa persona, stessa giornata, stessa frase —')
const st = persona({ late: 2, ruolo: 'junior' })
is('due letture uguali',
  salutoPersonale(st, { ora: 9, giorno: 2 }, 12) === salutoPersonale(st, { ora: 9, giorno: 2 }, 12), true)
is('ma domani cambia',
  salutoPersonale(st, { ora: 9, giorno: 2 }, 12) !== salutoPersonale(st, { ora: 9, giorno: 3 }, 13), true)
sempreDisponibile('il saluto personale senza ora vale a ogni ora',
  (m, s) => salutoPersonale(persona({ late: 2 }), m, s))

console.log('\n— §364 · dalla parte di chi legge —')
/* Il tono è una regola, non una riscrittura una tantum: queste frasi le legge
   da sola, la mattina, una persona che sta già facendo del suo meglio. Se
   domani qualcuno rimette una battuta che fa colpa, si ferma qui — come per
   «agenzia» (§359). Le stesse parole sono vietate al modello nel validatore di
   `person-copy.ts`: una regola sola, applicata ai due generatori. */
/* I divieti arrivano da `lib/voce-twobee.ts`, dove stanno accanto alla ragione
   e dove li legge anche il validatore del testo generato: una definizione
   sola, applicata alle frasi scritte a mano **e** a quelle scritte dal
   modello. Se divergessero, il fallback potrebbe dire quello che al modello
   vietiamo — ed è proprio il fallback che si legge quando il modello sbaglia. */
const vietata = (t: string) => VIETATE.some(v => v.schema.test(t))

const tutte: string[] = []
for (const m of MOMENTI) for (const seme of SEMI) {
  for (const c of [conti({ late: 4 }), conti({ late: 0, soon: 3 }),
    conti({ late: 0, soon: 0, aperte: 7 }), conti({ late: 0, soon: 0, aperte: 0, tutte: 9 }),
    conti({ late: 0, soon: 0, aperte: 0, tutte: 0 })]) {
    tutte.push(verdetto(c, m, seme).testo)
  }
  for (const ruolo of ['founder', 'manager', 'junior', 'stage', 'freelance', null] as Ruolo[]) {
    for (const st of [{ late: 3 }, { late: 0, chiuseOggi: 4 }, { late: 0, chiuseOggi: 0, oggi: 2 },
      { aperte: 0, late: 0, oggi: 0, chiuseOggi: 0, chiuseSettimana: 4 },
      { aperte: 0, late: 0, oggi: 0, chiuseOggi: 0, chiuseSettimana: 0 },
      { aperte: 6, late: 0, oggi: 0, chiuseOggi: 0 }]) {
      const base: StatoPersona = {
        aperte: 10, late: 0, oggi: 0, chiuseOggi: 0, chiuseSettimana: 0, progetti: 2, ruolo,
      }
      tutte.push(salutoPersonale({ ...base, ...st }, m, seme))
    }
  }
}
/* §365 — anche i sottotitoli di sezione: stanno nel workspace come le altre
   righe, e una voce che cambia da pagina a pagina non è una voce. */
for (const k of SEZIONI_CHIAVI) for (const m of MOMENTI) for (const seme of SEMI) {
  tutte.push(sottotitoloSezione(k, m, seme))
}
const colpevoli = Array.from(new Set(tutte.filter(vietata)))
colpevoli.forEach(t => console.log(`     ${t}`))
is('nessuna frase scritta a mano infrange la voce', colpevoli.length, 0)
is('su un campione vero, non su tre frasi', tutte.length > 2000, true)

/* La controprova: se il filtro non trovasse niente nemmeno in una frase
   scritta apposta per fallire, non starebbe controllando niente. */
is('e il filtro funziona davvero',
  vietata('4 in ritardo. Datti una mossa.') && vietata('Sii felice!') && vietata('Sei a pezzi.'), true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
