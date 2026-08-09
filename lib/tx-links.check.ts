/**
 * Gate di `lib/tx-links.ts`. I casi sono quelli veri di agosto 2026.
 *
 *   npx tsx lib/tx-links.check.ts
 */
import { coverage, txUse, usedByTx, spread, combinations, type Alloc } from './tx-links'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

/* iCura: un bonifico da 8.784 € paga due mensilità da 4.392. Col legame singolo
   la seconda restava «spuntata senza movimento» e la si raccontava in una nota. */
const ICURA: Alloc[] = [
  { txId: 'bon-8784', lineId: 'icura-apr', amount: 4392 },
  { txId: 'bon-8784', lineId: 'icura-mag', amount: 4392 },
]
eq('la prima mensilità è coperta', coverage('icura-apr', 4392, ICURA).state, 'coperta')
eq('e anche la seconda', coverage('icura-mag', 4392, ICURA).state, 'coperta')
/* Ed è **lo stesso** bonifico: senza questo numero nessuno si accorge di averlo
   allocato tre volte, perché ogni singolo aggancio guardato da solo sembra giusto. */
eq('il bonifico è tutto distribuito', txUse('bon-8784', 8784, ICURA).free, 0)
eq('su due righe', txUse('bon-8784', 8784, ICURA).parts, 2)

/* Meta: ventisei addebiti su una riga sola. Il verso molti-a-uno funzionava già
   con la colonna, e deve continuare a funzionare. */
const META: Alloc[] = Array.from({ length: 26 }, (_, i) =>
  ({ txId: `meta-${i}`, lineId: 'ads-lug', amount: 8.14 }))
eq('ventisei addebiti su una riga', coverage('ads-lug', 211.64, META).parts, 26)
eq('e la coprono', coverage('ads-lug', 211.64, META).state, 'coperta')

/* Il caso che questo modulo esiste per non far succedere: una riga da 900 €
   marcata pagata dal primo addebito da 2 € sparisce dagli scoperti portandosi
   via 898 € che devono ancora uscire. */
const UNO: Alloc[] = [{ txId: 't1', lineId: 'ads-ago', amount: 2 }]
eq('un addebito solo non chiude una riga da 900', coverage('ads-ago', 900, UNO).state, 'parziale')
eq('e dice quanto manca', coverage('ads-ago', 900, UNO).missing, 898)
eq('una riga senza allocazioni è scoperta', coverage('vuota', 500, []).state, 'scoperta')
/* Allocare più di quanto la riga vale non è un errore da nascondere: quasi
   sempre vuol dire che la riga è sbagliata. */
eq('e allocare troppo si vede', coverage('x', 100, [{ txId: 't', lineId: 'x', amount: 150 }]).state, 'eccedente')

/* Come spalmare senza chiedere gli importi: ogni riga prende quello che le
   manca, **dalla più vecchia** — un pagamento chiude l'arretrato più antico. */
const RIGHE = [
  { lineId: 'giu', gross: 4392, month: '2026-06' },
  { lineId: 'apr', gross: 4392, month: '2026-04' },
  { lineId: 'mag', gross: 4392, month: '2026-05' },
]
const s = spread(8784, RIGHE)
eq('si parte dalla più vecchia', s.allocs.map(a => a.lineId), ['apr', 'mag'])
eq('con l\'importo pieno di ciascuna', s.allocs.map(a => a.amount), [4392, 4392])
eq('e non avanza niente', s.left, 0)
/* Quello che avanza resta libero e si vede: spingerlo dentro una riga che non
   lo vale è il modo in cui un incasso finisce nel posto sbagliato. */
const s2 = spread(14000, RIGHE)
eq('tre righe coperte', s2.allocs.length, 3)
eq('e quello che avanza resta libero', s2.left, 14000 - 4392 * 3)
/* Una riga già coperta si salta: allocarci sopra la renderebbe eccedente. */
const s3 = spread(4392, [{ lineId: 'apr', gross: 4392, covered: 4392, month: '2026-04' },
  { lineId: 'mag', gross: 4392, month: '2026-05' }])
eq('la riga già coperta si salta', s3.allocs.map(a => a.lineId), ['mag'])

/* Fatima Leo: 3.812,50 = 1.830 + 1.982,50, e nessuna delle due da sola ci arriva. */
const FL = [
  { lineId: 'fl-growth', gross: 1830 },
  { lineId: 'fl-mkt', gross: 1982.50 },
  { lineId: 'altro', gross: 2196 },
]
const c = combinations(3812.50, FL)
eq('trova la coppia che fa il totale', c.length >= 1, true)
eq('ed è growth più marketing', c[0].slice().sort(), ['fl-growth', 'fl-mkt'])
/* Una riga sola non è una combinazione: per quella basta l'importo esatto, e
   proporla qui sarebbe rumore. */
eq('una riga sola non è una combinazione', combinations(1830, FL).length, 0)
eq('e se non torna non si inventa niente', combinations(999, FL).length, 0)

/* §261 — l'allocazione più grande della riga che descrive. È lo stato lasciato
   dal travaso della 209: la colonna diceva «questo movimento è di questa riga» e
   non sapeva dire quanto, quindi l'importo scritto è quello intero. */
const FL_GROSS: Record<string, number> = { 'fl-growth': 1830, 'fl-mkt': 1982.50 }
const TRAVASO: Alloc[] = [{ txId: 'bon-3812', lineId: 'fl-growth', amount: 3812.50 }]
const speso = usedByTx(TRAVASO, id => FL_GROSS[id])
eq('la riga assorbe solo il suo lordo', speso.get('bon-3812'), 1830)
eq('e il resto del bonifico torna libero',
  txUse('bon-3812', 3812.50, TRAVASO).free === 0
  && 3812.50 - (speso.get('bon-3812') ?? 0) === 1982.50, true)
/* Due movimenti sulla stessa riga restituiscono ciascuno la sua quota: il primo
   non si tiene tutto l'eccesso solo perché è arrivato prima. */
const DUE: Alloc[] = [
  { txId: 'a', lineId: 'fl-growth', amount: 1000 },
  { txId: 'b', lineId: 'fl-growth', amount: 1000 },
]
const spesoDue = usedByTx(DUE, id => FL_GROSS[id])
eq('l\'eccesso si divide in proporzione', [spesoDue.get('a'), spesoDue.get('b')], [915, 915])
/* Un'allocazione che ci sta si legge per quello che dice: nessuno sconto. */
eq('quello che ci sta resta intero',
  usedByTx([{ txId: 'c', lineId: 'fl-mkt', amount: 1982.50 }], id => FL_GROSS[id]).get('c'), 1982.50)
/* Riga sconosciuta — cancellata, o di un dominio che qui non si legge: vale per
   quello che dice l'allocazione. Inventarle un lordo sarebbe peggio. */
eq('riga sconosciuta, allocazione intera',
  usedByTx([{ txId: 'd', lineId: 'boh', amount: 500 }], () => undefined).get('d'), 500)
/* Una riga a zero (un preventivato mai compilato) non assorbe niente: il
   movimento resta tutto libero invece di sparire dentro una riga vuota. */
eq('una riga a zero non assorbe niente',
  usedByTx([{ txId: 'e', lineId: 'vuota', amount: 500 }], () => 0).get('e'), 0)

if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
