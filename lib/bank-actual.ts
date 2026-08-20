/**
 * Quanto è uscito davvero, secondo l'estratto conto. (§296)
 *
 * Nel conto economico l'**effettivo** di una riga è quello che una persona ha
 * scritto guardando la fattura, e finché nessun movimento lo conferma è la
 * stima migliore che c'è. Ma quando la riga è agganciata a un movimento
 * `banca`, quel numero non è più la stima migliore: c'è un fatto, e il fatto
 * batte l'opinione — è la stessa regola del cedolino (§182) e del modello F24
 * (§242).
 *
 * **Dal conto passa il lordo, la riga è imponibile.** Un subappalto da 2.450 €
 * con IVA muove 2.989 €: prendere il numero della banca e scriverlo
 * nell'effettivo gonfierebbe il costo del 22% e con lui il margine di progetto,
 * le quote digital, il target costi. Quindi si scorpora, sempre, con l'aliquota
 * della riga — che è il motivo per cui l'IVA sul subappalto (§295) non è un
 * dettaglio fiscale: senza, questo scorporo non avviene e i conti si spostano.
 *
 * Tre esiti, e la differenza fra il secondo e il terzo è tutto il punto:
 *
 *   · **combacia** — la banca conferma quello che c'era scritto. Niente da fare,
 *     e la riga può dirsi certificata.
 *   · **dice un altro numero** — si è pagato più o meno del previsto. È il caso
 *     in cui l'effettivo va corretto, ed è quello che il §272 chiamerebbe un
 *     numero plausibile e sbagliato: nessuno va a controllarlo.
 *   · **non basta a coprire la riga** — il movimento paga solo una parte
 *     (l'acconto Affinity di luglio, 2.100 € su una fattura da 2.562: hanno
 *     versato l'imponibile e non l'IVA). Qui **non si riscrive niente**: il
 *     costo è quello che il fornitore ha fatturato, non quello che gli è ancora
 *     uscito. Si dichiara che è coperto a metà e si aspetta il resto.
 *
 * Un movimento che paga **più righe** non entra in questo conto: il suo lordo
 * non appartiene a nessuna delle due da solo, e spartirlo è esattamente il
 * lavoro del registro delle allocazioni. Finché non c'è, quelle righe restano
 * come sono e la funzione lo dice invece di indovinare.
 */

export type ActualLine = {
  /** l'imponibile che la riga porta adesso */
  net: number
  vat_applied: boolean
  vat_rate: number
}

export type ActualTx = {
  id: string
  amount: number
  source: string
  /** quante righe di conto economico questo movimento sta pagando */
  shared?: boolean
}

export type BankActual =
  | { state: 'nessuno' }
  | { state: 'condiviso'; why: string }
  | { state: 'combacia'; gross: number; net: number }
  | { state: 'diverso'; gross: number; net: number; delta: number }
  | { state: 'parziale'; gross: number; net: number; missing: number }

const r2 = (n: number) => Math.round(n * 100) / 100

/** Il lordo di una riga: dal conto passa il totale della fattura. */
export const grossOfLine = (l: ActualLine) => r2(l.net * (l.vat_applied ? 1 + l.vat_rate : 1))

/** L'imponibile dentro un lordo, con l'aliquota della riga. */
export const netOfGross = (gross: number, l: ActualLine) =>
  r2(l.vat_applied ? gross / (1 + l.vat_rate) : gross)

export function bankActual(line: ActualLine, txs: ActualTx[], tol = 0.01): BankActual {
  /* Solo i movimenti veri. Un `derivato` nasce dalla spunta che si sta
     verificando, e usarlo sarebbe far confermare a un'affermazione sé stessa
     (§226). Un `manuale` invece è un fatto: contante, carta di un socio (§195). */
  const veri = txs.filter(t => t.source === 'banca' || t.source === 'manuale')
  if (!veri.length) return { state: 'nessuno' }

  if (veri.some(t => t.shared)) {
    return {
      state: 'condiviso',
      why: 'Un movimento di questa riga ne paga anche altre: il suo lordo non è tutto suo.',
    }
  }

  const gross = r2(veri.reduce((s, t) => s + Math.abs(t.amount), 0))
  const net = netOfGross(gross, line)
  const atteso = grossOfLine(line)

  if (Math.abs(gross - atteso) <= tol) return { state: 'combacia', gross, net }
  if (gross < atteso - tol) {
    return { state: 'parziale', gross, net, missing: r2(atteso - gross) }
  }
  return { state: 'diverso', gross, net, delta: r2(net - line.net) }
}

/** La frase da mettere accanto al numero: dice **da dove viene**, sempre. */
export function actualLabel(a: BankActual): string | null {
  switch (a.state) {
    case 'nessuno': return null
    case 'condiviso': return a.why
    case 'combacia': return 'Confermato dall\'estratto conto'
    case 'diverso': return a.delta > 0
      ? `Dal conto sono usciti ${a.gross.toFixed(2)} €: ${Math.abs(a.delta).toFixed(2)} € in più del previsto`
      : `Dal conto sono usciti ${a.gross.toFixed(2)} €: ${Math.abs(a.delta).toFixed(2)} € in meno del previsto`
    case 'parziale':
      return `Coperta per ${a.gross.toFixed(2)} €: mancano ancora ${a.missing.toFixed(2)} €`
  }
}
