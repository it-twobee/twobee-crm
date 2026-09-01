/**
 * Gate delle due regole sulla dimensione dei risultati.
 *
 *   npx tsx lib/ai/tools/result.check.ts
 *
 * Sono pure e stanno in `types.ts` proprio per questo: `agent.ts` importa il
 * registry, quindi fuori da Next non si carica, e queste due funzioni si
 * potrebbero provare solo facendo domande all'assistente e sperando di
 * incrociare il caso — cioè mai, perché il caso è «la lista è più lunga del
 * tetto», che si presenta in produzione e non in una prova a mano.
 */
import { listInfo, capResult, TOOL_RESULT_CAP } from './types'

let passed = 0
const failures: string[] = []

function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++
  else failures.push(`${label}\n     atteso:  ${JSON.stringify(expected)}\n     ottenuto: ${JSON.stringify(actual)}`)
}

function ok(label: string, cond: boolean) {
  if (cond) passed++
  else failures.push(label)
}

// ─── listInfo: il totale c'è sempre, la nota solo quando serve ──────────────
check('listInfo: niente da troncare', listInfo(11, 11), { totale: 11 })
check('listInfo: lista vuota', listInfo(0, 0), { totale: 0 })
ok('listInfo: troncata → dice quanti e quanti sono', (() => {
  const r = listInfo(70, 20) as { totale: number; troncato?: string }
  return r.totale === 70 && !!r.troncato && r.troncato.includes('20') && r.troncato.includes('70')
})())
// `count` assente (la tabella non lo restituisce) non deve diventare "0 di 20":
// senza il totale vero, quello che si è visto è tutto quello che si sa.
check('listInfo: count null → totale = visti', listInfo(null, 20), { totale: 20 })

// ─── capResult: sotto il tetto passa identico ───────────────────────────────
const small = { totale: 2, task: [{ id: 'a' }, { id: 'b' }] }
check('capResult: risultato piccolo intatto', capResult(small), JSON.stringify(small))
check('capResult: null', capResult(null), 'null')
check('capResult: errore breve intatto', capResult({ error: 'x' }), '{"error":"x"}')

// ─── capResult: sopra il tetto resta JSON valido ────────────────────────────
const big = {
  totale: 400,
  task: Array.from({ length: 400 }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    titolo: `Task numero ${i} con un titolo abbastanza lungo da pesare`,
    stato: 'da_fare', scadenza: '2026-09-04', progetto: 'Metroquadro · Growth · E-commerce',
  })),
}
const cut = capResult(big)
ok('capResult: sta nel tetto', cut.length <= TOOL_RESULT_CAP)
ok('capResult: è JSON valido', (() => { try { JSON.parse(cut); return true } catch { return false } })())
const parsed = JSON.parse(cut) as { totale?: number; task?: unknown[]; troncato?: string }
ok('capResult: la lista è più corta', Array.isArray(parsed.task) && parsed.task.length < 400)
ok('capResult: qualcosa resta', Array.isArray(parsed.task) && parsed.task.length >= 1)
ok('capResult: dichiara il taglio', !!parsed.troncato && parsed.troncato.includes('400'))
// Il totale vero di `listInfo` non deve essere sacrificato dal taglio: è
// l'unico numero che permette di rispondere «quante sono» senza contarle.
check('capResult: il totale sopravvive', parsed.totale, 400)

// Un elemento singolo enorme non si può dimezzare: meglio un errore leggibile
// che un JSON rotto o una lista vuota senza spiegazione.
const huge = { progetto: { descrizione: 'x'.repeat(TOOL_RESULT_CAP * 2) } }
const hugeOut = capResult(huge)
ok('capResult: elemento non riducibile → errore valido', (() => {
  try {
    const p = JSON.parse(hugeOut) as { error?: string }
    return hugeOut.length <= TOOL_RESULT_CAP && !!p.error
  } catch { return false }
})())

// Una lista di due elementi si riduce a uno, non si arrende.
const two = { righe: [{ t: 'y'.repeat(4000) }, { t: 'z'.repeat(4000) }] }
const twoOut = capResult(two)
ok('capResult: due elementi → resta uno', (() => {
  try {
    const p = JSON.parse(twoOut) as { righe?: unknown[]; error?: string }
    return twoOut.length <= TOOL_RESULT_CAP && (p.righe?.length === 1 || !!p.error)
  } catch { return false }
})())

if (failures.length) {
  console.error(`\n${failures.length} controlli falliti su ${passed + failures.length}:\n`)
  failures.forEach((f, i) => console.error(`  ${i + 1}. ${f}`))
  process.exit(1)
}
console.log(`Tutti i controlli passano (${passed}).`)
