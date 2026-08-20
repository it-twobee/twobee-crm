/* Gate di `lib/line-removal.ts`. Esegui: npx tsx lib/line-removal.check.ts */
import { canRemove, type RemovalLine } from './line-removal'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}
const has = (label: string, s: string | undefined, needle: string) => {
  if (s && s.toLowerCase().includes(needle.toLowerCase())) { ok++; return }
  fails.push(`${label}\n    «${needle}» non compare in: ${JSON.stringify(s)}`)
}

const riga = (o: Partial<RemovalLine> = {}): RemovalLine =>
  ({ side: 'uscita', paid: false, ...o })

// ── il caso semplice: si può togliere ───────────────────────────────────────
eq('una riga scoperta e senza documento si toglie', canRemove(riga(), true), { can: true })
eq('vale in tutti e due i versi', canRemove(riga({ side: 'entrata' }), true), { can: true })

// ── mese chiuso ─────────────────────────────────────────────────────────────
{
  const r = canRemove(riga(), false)
  eq('in un mese chiuso non si toglie niente', r.can, false)
  has('e dice cosa fare prima', r.can === false ? r.how : undefined, 'riaprilo')
  /* L'ostacolo si dice **più a monte**: a chi ha davanti una riga pagata dentro
     un mese chiuso non serve sapere della spunta, deve prima riaprire il mese. */
  const doppio = canRemove(riga({ paid: true, paid_on: '2026-08-11', invoiced: true }), false)
  has('e vince sugli altri ostacoli', doppio.can === false ? doppio.why : undefined, 'chiuso')
}

// ── riga pagata ─────────────────────────────────────────────────────────────
{
  const r = canRemove(riga({ paid: true, paid_on: '2026-08-11' }), true)
  eq('una riga pagata non si cancella', r.can, false)
  has('il verso è quello giusto', r.can === false ? r.why : undefined, 'pagata il 11/08')
  const inc = canRemove(riga({ side: 'entrata', paid: true, paid_on: '2026-07-15' }), true)
  has('e un\'entrata si dice incassata', inc.can === false ? inc.why : undefined, 'incassata il 15/07')
  /* §203 — le spunte vecchie non hanno una data: si blocca lo stesso, senza
     inventarne una. */
  const senzaData = canRemove(riga({ paid: true }), true)
  eq('senza data blocca comunque', senzaData.can, false)
  has('e non si inventa un giorno', senzaData.can === false ? senzaData.why : undefined, 'risulta pagata')
  eq('senza data non scrive «il»',
    senzaData.can === false && /il \d/.test(senzaData.why), false)
}

// ── fattura agganciata ──────────────────────────────────────────────────────
{
  const r = canRemove(riga({ invoiced: true }), true)
  eq('con una fattura sotto non si cancella', r.can, false)
  has('e la strada è la nota di credito', r.can === false ? r.how : undefined, 'nota di credito')
  /* Pagata **e** fatturata: vince la spunta, che è l'ostacolo più a monte fra i
     due — prima si toglie il fatto, poi si guarda il documento. */
  const due = canRemove(riga({ paid: true, invoiced: true }), true)
  has('la spunta viene prima del documento', due.can === false ? due.why : undefined, 'risulta pagata')
}

// ── i due casi che avvisano senza bloccare ──────────────────────────────────
{
  /* §247 — «fatturata» è una spunta, non un documento: se la fattura esiste
     davvero l'IVA di quel trimestre la contiene, e va stornata. Ma il tool non
     può saperlo, quindi avvisa e lascia decidere. */
  const r = canRemove(riga({ side: 'entrata', invoice_sent: true }), true)
  eq('marcata fatturata senza documento: si può, ma si avvisa', r.can, true)
  has('e l\'avviso nomina l\'IVA', r.can ? r.warn : undefined, 'iva')

  /* La riga nasce da una rata: cancellarla non toglie la rata, e alla prossima
     preparazione del mese torna. Senza l'avviso sembra che la cancellazione non
     abbia funzionato. */
  const rata = canRemove(riga({ installment_id: 'i1' }), true)
  eq('da contratto: si può, ma tornerà', rata.can, true)
  has('e dice dove si toglie davvero', rata.can ? rata.warn : undefined, 'contratto')

  /* Il documento vince sull'avviso: una riga con la fattura agganciata **e** la
     spunta «emessa» si blocca, non si avvisa. */
  eq('il documento batte l\'avviso',
    canRemove(riga({ invoice_sent: true, invoiced: true }), true).can, false)
}

console.log(fails.length === 0
  ? `\n${ok} controlli. Tutti i controlli passano.\n`
  : `\n${fails.length} controlli falliti su ${ok + fails.length}:\n\n  ✗ ${fails.join('\n\n  ✗ ')}\n`)
process.exit(fails.length === 0 ? 0 : 1)
