/**
 * Gate di `lib/auto-match.ts`. I casi sono quelli veri di agosto 2026. (§276)
 *
 *   npx tsx lib/auto-match.check.ts
 */
import { sureMatches } from './auto-match'
import type { BankTx, PlLineRef } from './bank'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

const tx = (o: Partial<BankTx> & { id: string; amount: number }): BankTx => ({
  account_id: 'a', booked_on: '2026-08-06', value_on: null, description: '', channel: null,
  counterparty: null, kind: 'incasso', doc_ref: null, source: 'banca', no_match_needed: false,
  revenue_line_id: null, cost_line_id: null, note: null, ...o,
} as BankTx)
const line = (o: Partial<PlLineRef> & { id: string; net: number }): PlLineRef => ({
  month: '2026-08-01', label: '', clientName: null, vatRate: 0.22, paid: false,
  direction: 'in', ...o,
} as PlLineRef)

/* Il caso normale: 2.196 € da Affinity, e la riga del canone di Affinity vale
   1.800 + IVA = 2.196 esatti. Non c'è niente da giudicare. */
const AFF_TX = tx({ id: 't1', amount: 2196, counterparty: 'Affinity Srl', description: 'bon. da affinity srl canone' })
const AFF_L = line({ id: 'l1', net: 1800, clientName: 'Affinity', label: 'Canone growth — lead generation' })
let r = sureMatches([AFF_TX], [AFF_L])
eq('importo esatto e nome che torna: è certo', r.pairs.map(p => [p.txId, p.lineId]), [['t1', 'l1']])
eq('e lo dice con che numero', r.pairs[0].why, '2196,00 € esatti · nome che torna')

/* L'importo da solo non basta: due clienti con lo stesso canone esistono, e
   abbinare il primo che capita chiude la riga sbagliata. */
eq('senza il nome non si abbina',
  sureMatches([tx({ id: 't2', amount: 2196, description: 'bonifico ricevuto' })], [AFF_L]).pairs.length, 0)
/* «Vicino» vuol dire che manca l'IVA, o che è un'altra fattura. */
eq('un importo vicino non è un importo esatto',
  sureMatches([tx({ id: 't3', amount: 2200, counterparty: 'Affinity Srl' })], [AFF_L]).pairs.length, 0)
/* Il numero del documento è una prova buona quanto il nome. */
eq('il numero fattura vale come il nome',
  sureMatches([tx({ id: 't4', amount: 2196, doc_ref: 'FPR 41/26', description: 'saldo fattura' })],
    [line({ id: 'l4', net: 1800, label: 'Canone — fattura 41' })]).pairs.length, 1)

/* §276 — la condizione che rende sicuro il resto: uno a uno. */
const DUE_RIGHE = [
  line({ id: 'r1', net: 1800, clientName: 'Affinity', label: 'Canone luglio' }),
  line({ id: 'r2', net: 1800, clientName: 'Affinity', label: 'Canone agosto' }),
]
r = sureMatches([AFF_TX], DUE_RIGHE)
eq('un movimento che potrebbe essere due righe non si abbina', r.pairs.length, 0)
eq('e si dice perché', r.ambiguous[0].why, '2 righe hanno questo importo e questo nome: la scelta è tua')

const DUE_MOV = [AFF_TX, tx({ id: 't5', amount: 2196, counterparty: 'Affinity Srl', booked_on: '2026-08-07' })]
r = sureMatches(DUE_MOV, [AFF_L])
eq('due movimenti uguali per una riga sola: nessuno dei due', r.pairs.length, 0)
eq('ed è un\'altra ragione', r.ambiguous[0].why,
  '2 movimenti uguali per la stessa riga: uno solo la paga')

/* Un `derivato` nasce dalla spunta che questo gesto dovrebbe dimostrare. */
eq('un movimento dichiarato non abbina niente',
  sureMatches([{ ...AFF_TX, source: 'derivato' } as BankTx], [AFF_L]).pairs.length, 0)
/* Un movimento già agganciato o dichiarato «niente da riconciliare» è fuori. */
eq('un movimento già agganciato resta com\'è',
  sureMatches([{ ...AFF_TX, revenue_line_id: 'x' } as BankTx], [AFF_L]).pairs.length, 0)
eq('e uno segnato «niente da riconciliare» pure',
  sureMatches([{ ...AFF_TX, no_match_needed: true } as BankTx], [AFF_L]).pairs.length, 0)
/* Una riga già pagata non si ripaga. */
eq('una riga già pagata non è candidata',
  sureMatches([AFF_TX], [{ ...AFF_L, paid: true }]).pairs.length, 0)
/* Il verso conta: un accredito non paga un costo. */
eq('un accredito non paga un costo',
  sureMatches([AFF_TX], [{ ...AFF_L, direction: 'out' }]).pairs.length, 0)

/* Un'uscita si abbina alle uscite, col segno giusto. */
eq('e un addebito paga un costo',
  sureMatches([tx({ id: 't6', amount: -793, counterparty: 'Gianni Grafica', kind: 'pagamento' })],
    [line({ id: 'c1', net: 650, vatRate: 0.22, direction: 'out', clientName: 'Gianni Grafica',
      label: 'Graphic Designer' })]).pairs.map(p => p.kind), ['costo'])

/* Il caso vero di Fatima Leo: 3.812,50 è la somma di due righe, e nessuna delle
   due da sola ci arriva. Non è un abbinamento certo — è una spartizione, e la
   fa una persona dal dialogo di conferma (§261). */
eq('un bonifico cumulativo non è un abbinamento certo',
  sureMatches([tx({ id: 't7', amount: 3812.50, counterparty: 'Leo Fatima' })], [
    line({ id: 'f1', net: 1500, clientName: 'Fatima Leo', label: 'Canone growth' }),
    line({ id: 'f2', net: 1625, clientName: 'Fatima Leo', label: 'Branding' }),
  ]).pairs.length, 0)

if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
