/**
 * Gate di `lib/allocations.ts`. I casi sono quelli veri di luglio e agosto 2026,
 * letti sul database: sono le quattro forme che un campo solo non regge.
 *
 *   npx tsx lib/allocations.check.ts
 */
import {
  txCoverage, targetCoverage, freeOn, validate, propose, findings, evidenceOf, superseded,
  type Allocation, type AllocTx, type Candidate,
} from './allocations'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

const tx = (id: string, amount: number, source = 'banca'): AllocTx => ({ id, amount, source })
let seq = 0
const al = (txId: string, target: Allocation['target'], targetId: string, amount: number,
  evidence: Allocation['evidence'] = 'certificata'): Allocation =>
  ({ id: `a${++seq}`, txId, target, targetId, amount, evidence })

// ── evidenza: chi può certificare ───────────────────────────────────────────
eq('un movimento di banca certifica', evidenceOf(tx('t', -100, 'banca')), 'certificata')
/* §195 — il contante e la carta di un socio sono fatti, non dichiarazioni. */
eq('e uno a mano pure', evidenceOf(tx('t', -100, 'manuale')), 'certificata')
/* §226 — un `derivato` nasce dalla spunta che dovrebbe confermare. */
eq('un dichiarato non certifica niente', evidenceOf(tx('t', -100, 'derivato')), 'dichiarata')

// ── un bonifico che paga due fatture: «Affinity (2 addebiti)» ───────────────
{
  /* Il caso che ha creato la riga doppia da 5.100 nel conto economico di luglio:
     due bonifici veri, 3.000 e 2.100, che pagavano l'acconto Seven e l'acconto
     ISF. Con un campo solo il tool ne aggancia uno e inventa una riga. */
  const t = tx('t1', -5100)
  const allocs = [al('t1', 'costo', 'seven', 3000), al('t1', 'costo', 'isf', 2100)]
  const c = txCoverage(t, allocs)
  eq('il movimento è spiegato per intero', { s: c.state, a: c.allocated, r: c.remaining },
     { s: 'coperto', a: 5100, r: 0 })
  eq('e ognuna delle due sa quanto ha preso',
     targetCoverage(3000, 'costo', 'seven', allocs).allocated, 3000)
  eq('non resta niente da allocare', freeOn(t, allocs), 0)
}

// ── una fattura pagata da due bonifici ──────────────────────────────────────
{
  const allocs = [al('a', 'costo', 'x', 2000), al('b', 'costo', 'x', 989)]
  const c = targetCoverage(2989, 'costo', 'x', allocs)
  eq('due movimenti coprono la stessa riga', { s: c.state, a: c.allocated }, { s: 'coperto', a: 2989 })
}

// ── pagata a metà: l'imponibile sì, l'IVA no ────────────────────────────────
{
  /* Affinity, 23 luglio: fattura da 2.562 e bonifico da 2.100. La riga non è
     scoperta e non è coperta — è a metà, ed è un terzo stato che serve. */
  const c = targetCoverage(2562, 'costo', 'y', [al('t', 'costo', 'y', 2100)])
  eq('coperta in parte', c.state, 'parziale')
  eq('e dice quanto manca', c.remaining, 462)
}

// ── il caso dei compensi: 3.412 che sono due cose ───────────────────────────
{
  /* A Marco a luglio sono usciti 3.412 €: 3.191,12 di quota socio più 220,88 di
     provvigione — la sua, divisa a metà con Toto. E a Toto ne sono usciti
     altrettanti, per la ragione opposta.

     Da qui la proprietà che nessun campo singolo può avere: **la stessa
     provvigione risulta pagata da due bonifici diversi**, uno a testa. Il tool
     continua ad attribuirla al commerciale del cliente (§286) — l'accordo fra
     loro resta fuori — ma il percorso dei soldi adesso si può scrivere. */
  const marco = tx('bonifico-marco', -3412)
  const toto = tx('bonifico-toto', -3412)
  const allocs = [
    al('bonifico-marco', 'compenso', 'marco-socio', 3191.12),
    al('bonifico-marco', 'compenso', 'marco-commerciale', 220.88),
    al('bonifico-toto', 'compenso', 'toto-socio', 3191.12),
    al('bonifico-toto', 'compenso', 'marco-commerciale', 220.88),
  ]
  eq('il bonifico a Marco è spiegato tutto', txCoverage(marco, allocs).state, 'coperto')
  eq('e quello a Toto pure', txCoverage(toto, allocs).state, 'coperto')
  const prov = targetCoverage(442.11, 'compenso', 'marco-commerciale', allocs)
  eq('la provvigione è pagata da due bonifici', prov.allocated, 441.76)
  eq('e restano trentacinque centesimi', prov.state, 'parziale')
  eq('la quota di Marco è chiusa',
     targetCoverage(3191.12, 'compenso', 'marco-socio', allocs).state, 'coperto')
}

// ── non si alloca più di quello che è passato ───────────────────────────────
{
  const t = tx('t', -1000)
  eq('sforare si rifiuta',
     validate(t, [], [{ target: 'costo', targetId: 'x', amount: 1200 }]).ok, false)
  const v = validate(t, [], [{ target: 'costo', targetId: 'x', amount: 1200 }])
  eq('e si dice di quanto', v.ok === false && v.why.includes('1000.00'), true)
  /* Quello che è già stato allocato riduce il libero: è il caso di due persone
     che aprono lo stesso movimento. */
  eq('il già allocato conta',
     validate(t, [al('t', 'costo', 'a', 700)], [{ target: 'costo', targetId: 'b', amount: 400 }]).ok, false)
  eq('entro il libero passa',
     validate(t, [al('t', 'costo', 'a', 700)], [{ target: 'costo', targetId: 'b', amount: 300 }]).ok, true)
  eq('e dice cosa resta',
     validate(t, [], [{ target: 'costo', targetId: 'x', amount: 400 }]),
     { ok: true, total: 400, leftover: 600 })

  eq('zero non è un importo',
     validate(t, [], [{ target: 'costo', targetId: 'x', amount: 0 }]).ok, false)
  /* L'importo è sempre positivo: il verso lo decide la riga, non il segno. */
  eq('e nemmeno un negativo',
     validate(t, [], [{ target: 'costo', targetId: 'x', amount: -100 }]).ok, false)
  eq('la stessa riga due volte si rifiuta',
     validate(t, [], [
       { target: 'costo', targetId: 'x', amount: 100 },
       { target: 'costo', targetId: 'x', amount: 200 },
     ]).ok, false)
  /* Due target diversi con lo stesso id non sono la stessa cosa. */
  eq('ma ricavo e costo con lo stesso id sono due cose',
     validate(t, [], [
       { target: 'costo', targetId: 'x', amount: 100 },
       { target: 'ricavo', targetId: 'x', amount: 200 },
     ]).ok, true)
  eq('niente scelto, niente da fare', validate(t, [], []).ok, false)
}

// ── la proposta: come si spartisce ──────────────────────────────────────────
{
  const t = tx('t', -5100)
  const scelte: Candidate[] = [
    { target: 'costo', targetId: 'seven', label: 'Acconto Seven', remaining: 3000 },
    { target: 'costo', targetId: 'isf', label: 'Acconto ISF', remaining: 2562 },
  ]
  const p = propose(t, [], scelte)
  eq('la prima prende tutto il suo scoperto', p.drafts[0].amount, 3000)
  eq('la seconda quello che resta', p.drafts[1].amount, 2100)
  eq('non avanza niente', p.leftover, 0)
  /* E si dice **quanto manca** alla seconda: senza, sembra saldata. */
  eq('ma la seconda resta scoperta di 462', p.short, [{ targetId: 'isf', label: 'Acconto ISF', missing: 462 }])

  /* Se avanza, avanza e si vede: inventare una destinazione per far tornare il
     conto è il modo in cui un registro smette di servire. */
  const q = propose(tx('t2', -5000), [], [
    { target: 'costo', targetId: 'a', label: 'Una', remaining: 1000 },
  ])
  eq('quello che avanza resta avanzato', q.leftover, 4000)
  eq('e non si inventa una destinazione', q.drafts.length, 1)

  /* Un movimento già speso per intero non propone niente, e lo dice sulle
     righe che restano fuori. */
  const r = propose(t, [al('t', 'costo', 'z', 5100)], scelte)
  eq('senza libero non propone niente', r.drafts.length, 0)
  eq('e le dichiara scoperte', r.short.length, 2)
}

// ── il registro si controlla da solo ────────────────────────────────────────
{
  const grossOf = (target: string, id: string) => id === 'sparita' ? null : 1000
  const f = findings(
    [tx('t1', -1000), tx('t2', -500)],
    [al('t1', 'costo', 'a', 1200), al('t2', 'costo', 'sparita', 500)],
    grossOf as never)
  eq('un movimento sovra-allocato è critico',
     f.find(x => x.id.startsWith('over:'))?.severity, 'critico')
  eq('e un\'allocazione orfana pure',
     f.find(x => x.id.startsWith('orfana:'))?.severity, 'critico')
  eq('una riga pagata più del dovuto è un\'attenzione',
     findings([tx('t', -2000)], [al('t', 'costo', 'a', 1500)], (() => 1000) as never)
       .find(x => x.id.startsWith('pagata-troppo:'))?.severity, 'attenzione')
  eq('un registro sano non dice niente',
     findings([tx('t', -1000)], [al('t', 'costo', 'a', 1000)], (() => 1000) as never).length, 0)
}

// ── §300 · un fatto spegne la dichiarazione ─────────────────────────────────
{
  /* Il caso vero: la riga «Beneficiari Vari Distinta» aveva 3.868 € dichiarati
     dalla spunta e ha ricevuto 4.077 € dal bonifico del 20 agosto. Sommati
     facevano 7.945 su 4.077 dovuti — la riga pagata due volte, una dalla spunta
     e una dalla banca. È la regola di §189 (`bank_on_match`) che al registro
     mancava. */
  const dichiarata = al('derivato', 'costo', 'personale', 3868, 'dichiarata')
  const fresh = [{ target: 'costo' as const, targetId: 'personale', amount: 4077 }]
  eq('la dichiarazione della stessa riga si spegne',
     superseded([dichiarata], fresh).map(a => a.id), [dichiarata.id])
  /* Una dichiarazione non scaccia un'altra dichiarazione: si perderebbe l'unica
     traccia di un pagamento che nessuno ha ancora dimostrato. */
  eq('e solo quella della riga toccata',
     superseded([al('d', 'costo', 'altra', 100, 'dichiarata')], fresh).length, 0)
  eq('una certificata non si tocca',
     superseded([al('d', 'costo', 'personale', 100, 'certificata')], fresh).length, 0)
}

// ── certificato e dichiarato restano distinti ───────────────────────────────
{
  const c = targetCoverage(1000, 'costo', 'x', [
    al('t1', 'costo', 'x', 600, 'certificata'),
    al('t2', 'costo', 'x', 400, 'dichiarata'),
  ])
  eq('coperta per mille', c.allocated, 1000)
  eq('ma dimostrata per seicento', c.certified, 600)
}

console.log(fails.length === 0
  ? `\n${ok} controlli. Tutti i controlli passano.\n`
  : `\n${fails.length} controlli falliti su ${ok + fails.length}:\n\n  ✗ ${fails.join('\n\n  ✗ ')}\n`)
process.exit(fails.length === 0 ? 0 : 1)
