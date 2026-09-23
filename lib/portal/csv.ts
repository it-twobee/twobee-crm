/* §415 — Un CSV per l'anteprima: righe e celle, con le virgolette di un CSV vero.
   Logica pura, per provarla a macchina: un separatore sbagliato è una tabella
   di una colonna sola, cioè un file che sembra rotto e non lo è. */
export const CSV_PREVIEW_ROWS = 200

/** Il separatore: quello che compare più spesso nella prima riga. In Italia è spesso `;`. */
export function csvSeparator(firstLine: string): string {
  const [best] = [';', ',', '\t']
    .map(sep => ({ sep, count: firstLine.split(sep).length - 1 }))
    .sort((a, b) => b.count - a.count)
  return best.count > 0 ? best.sep : ','
}

/** `"Rossi; Mario"` resta una cella sola, e `""` dentro le virgolette è una virgoletta. */
export function parseCsv(text: string, max = CSV_PREVIEW_ROWS): string[][] {
  const sep = csvSeparator(text.split(/\r?\n/, 1)[0] ?? '')
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length && rows.length < max; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if ((cell || row.length) && rows.length < max) { row.push(cell); rows.push(row) }
  return rows
}
