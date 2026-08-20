/* Gate di `lib/bank-actual.ts`. Esegui: npx tsx lib/bank-actual.check.ts */
import { bankActual, grossOfLine, netOfGross, actualLabel, type ActualLine, type ActualTx } from './bank-actual'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

const riga = (net: number, vat = true): ActualLine => ({ net, vat_applied: vat, vat_rate: 0.22 })
const tx = (amount: number, o: Partial<ActualTx> = {}): ActualTx =>
  ({ id: 't', amount, source: 'banca', ...o })

// ── lordo e imponibile ──────────────────────────────────────────────────────
eq('il lordo di 2.450 con IVA', grossOfLine(riga(2450)), 2989)
eq('senza IVA il lordo è il netto', grossOfLine(riga(1300, false)), 1300)
eq('e lo scorporo torna indietro', netOfGross(2989, riga(2450)), 2450)
/* §295 — è qui che l'IVA sul subappalto smette di essere un dettaglio fiscale:
   con l'aliquota spenta lo scorporo non avviene e il costo sale del 22%. */
eq('con l\'IVA spenta il lordo entra intero', netOfGross(2989, riga(2450, false)), 2989)

// ── nessun movimento: la riga resta quello che è ────────────────────────────
eq('senza movimenti non si dice niente', bankActual(riga(2450), []), { state: 'nessuno' })
/* §226 — un `derivato` nasce dalla spunta che si sta verificando: usarlo
   sarebbe far confermare a un'affermazione sé stessa. */
eq('un movimento dichiarato non conferma niente',
   bankActual(riga(2450), [tx(-2989, { source: 'derivato' })]), { state: 'nessuno' })
/* §195 — il contante e la carta di un socio sono fatti, non dichiarazioni. */
eq('un movimento a mano invece sì',
   bankActual(riga(2450), [tx(-2989, { source: 'manuale' })]).state, 'combacia')

// ── il caso vero: Affinity, 2.450 + IVA, bonifico da 2.989 ──────────────────
{
  const r = bankActual(riga(2450), [tx(-2989)])
  eq('il bonifico conferma la riga', r.state, 'combacia')
  eq('e ne scorpora l\'imponibile', r.state === 'combacia' ? r.net : null, 2450)
  eq('il verso del movimento non conta', bankActual(riga(2450), [tx(2989)]).state, 'combacia')
}

// ── si è pagato un altro numero: l'effettivo va corretto ────────────────────
{
  const r = bankActual(riga(2450), [tx(-3050)])
  eq('un lordo più alto dice un effettivo più alto', r.state, 'diverso')
  eq('e lo scorpora', r.state === 'diverso' ? r.net : null, 2500)
  eq('dichiarando di quanto', r.state === 'diverso' ? r.delta : null, 50)
  eq('la frase dice il numero della banca',
     actualLabel(r)?.includes('3050.00'), true)
}

// ── il caso di luglio: pagato l'imponibile e non l'IVA ──────────────────────
{
  /* Affinity, 23 luglio: fattura da 2.562 (2.100 + 462) e bonifico da 2.100.
     Il costo resta 2.100 — è quello che il fornitore ha fatturato — e quello
     che manca è l'IVA, non una parte del lavoro. Riscrivere l'effettivo a
     1.721,31 sarebbe un numero plausibile e sbagliato. */
  const r = bankActual(riga(2100), [tx(-2100)])
  eq('un movimento che non copre il lordo è parziale', r.state, 'parziale')
  eq('e dice quanto manca', r.state === 'parziale' ? r.missing : null, 462)
  eq('la frase non promette niente', actualLabel(r)?.includes('mancano'), true)
}

// ── due movimenti sulla stessa riga si sommano ──────────────────────────────
{
  const r = bankActual(riga(2450), [tx(-2000, { id: 'a' }), tx(-989, { id: 'b' })])
  eq('due bonifici che insieme la coprono', r.state, 'combacia')
  eq('e il netto è quello della riga', r.state === 'combacia' ? r.net : null, 2450)
}

// ── un movimento che paga più righe non si spartisce qui ────────────────────
{
  /* «Affinity (2 addebiti) 5.100» pagava due subappalti: il suo lordo non
     appartiene a nessuno dei due da solo, e spartirlo è il lavoro del registro
     delle allocazioni. Finché non c'è, la funzione lo dice invece di indovinare. */
  const r = bankActual(riga(2459.33), [tx(-5100, { shared: true })])
  eq('condiviso: non si tocca niente', r.state, 'condiviso')
  eq('e si dice perché', actualLabel(r)?.includes('anche altre'), true)
  eq('basta che uno lo sia',
     bankActual(riga(2450), [tx(-2000, { id: 'a' }), tx(-989, { id: 'b', shared: true })]).state, 'condiviso')
}

// ── una riga senza IVA: il lordo è l'imponibile ─────────────────────────────
{
  /* Gabriele fattura in forfettario: 1.300 escono e 1.300 sono. Scorporare
     inventerebbe un credito IVA che non esiste. */
  const r = bankActual(riga(1300, false), [tx(-1300)])
  eq('un forfettario combacia senza scorporo', r.state, 'combacia')
  eq('e il netto è il lordo', r.state === 'combacia' ? r.net : null, 1300)
}

console.log(fails.length === 0
  ? `\n${ok} controlli. Tutti i controlli passano.\n`
  : `\n${fails.length} controlli falliti su ${ok + fails.length}:\n\n  ✗ ${fails.join('\n\n  ✗ ')}\n`)
process.exit(fails.length === 0 ? 0 : 1)
