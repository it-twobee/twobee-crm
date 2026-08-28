/**
 * Il Markdown del modello, ridotto a quello che un pannello da 420px sa mostrare.
 *
 * Nasce da uno screenshot: alla prima domanda vera il modello ha risposto con una
 * tabella a pipe di cinque colonne, e il pannello la stampava con
 * `whitespace-pre-wrap` — quindi `|--------|-------|` a schermo e ogni riga
 * spezzata a metà. Su un telefono era illeggibile.
 *
 * Il prompt ora chiede di non usare tabelle, ma un prompt è una preferenza, non
 * un vincolo: prima o poi una tabella torna. Qui una tabella viene **ribaltata**
 * in righe — titolo sopra, il resto sotto in piccolo — che è la forma che regge
 * in una colonna stretta.
 *
 * Puro di proposito: lo verifica `format.check.ts` e lo importa un componente
 * client.
 */

export interface Span { text: string; bold?: boolean }

export interface RowItem {
  /** La prima colonna: quasi sempre il nome della cosa. */
  title: Span[]
  /** Le altre colonne, già ripulite dai segnaposto vuoti. */
  meta: string[]
}

export type Block =
  | { kind: 'p'; spans: Span[] }
  | { kind: 'ul'; items: Span[][] }
  | { kind: 'rows'; rows: RowItem[] }

/** I segnaposto che i modelli mettono in una cella vuota. */
const EMPTY_CELL = new Set(['', '-', '–', '—', 'n/d', 'null', 'none', '/'])

/** `**grassetto**` → span in grassetto. Il resto dei marcatori si toglie: in un
 *  pannello stretto il corsivo non aggiunge niente e il backtick è rumore. */
export function parseInline(raw: string): Span[] {
  const text = raw.replace(/`([^`]*)`/g, '$1')
  const out: Span[] = []
  const re = /\*\*([^*]+)\*\*|__([^_]+)__/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[1] ?? m[2], bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  // un singolo * o _ residuo è un marcatore rimasto scoperto, non contenuto
  return out
    .map((s) => ({ ...s, text: s.text.replace(/(^|\s)[*_](\S)/g, '$1$2').replace(/(\S)[*_](\s|$)/g, '$1$2') }))
    .filter((s) => s.text !== '')
}

const isTableLine = (l: string) => l.startsWith('|') && l.includes('|', 1)
const isSeparator = (l: string) => /^\|?[\s:|-]+\|?$/.test(l) && l.includes('-')

function cells(line: string): string[] {
  const t = line.replace(/^\|/, '').replace(/\|$/, '')
  return t.split('|').map((c) => c.trim())
}

const bulletOf = (l: string) => l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)

/** Toglie i marcatori di titolo: `##` in una colonna da 420px non serve. */
const stripHeading = (l: string) => l.replace(/^#{1,6}\s*/, '')

export function parseAnswer(raw: string): Block[] {
  const lines = (raw ?? '').replace(/\r/g, '').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  let bullets: Span[][] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    const spans = parseInline(paragraph.join(' ').trim())
    if (spans.length) blocks.push({ kind: 'p', spans })
    paragraph = []
  }
  const flushBullets = () => {
    if (!bullets.length) return
    blocks.push({ kind: 'ul', items: bullets })
    bullets = []
  }
  const flushAll = () => { flushParagraph(); flushBullets() }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line) { flushAll(); continue }

    // ─── tabella: si ribalta in righe ─────────────────────────────────────────
    if (isTableLine(line)) {
      flushAll()
      const table: string[] = []
      while (i < lines.length && isTableLine(lines[i].trim())) {
        table.push(lines[i].trim())
        i++
      }
      i-- // la riga corrente non è più della tabella

      const rowsRaw = table.filter((l) => !isSeparator(l)).map(cells)
      if (!rowsRaw.length) continue

      // Con la riga di separazione la prima è un'intestazione; senza, i modelli
      // la mettono comunque quasi sempre. Se l'unica riga è quella, la si mostra.
      const hasHeader = table.some(isSeparator) && rowsRaw.length > 1
      const body = hasHeader ? rowsRaw.slice(1) : rowsRaw

      const rows: RowItem[] = body
        .map((r) => ({
          first: (r[0] ?? '').trim(),
          title: parseInline(r[0] ?? ''),
          meta: r.slice(1).filter((c) => !EMPTY_CELL.has(c.toLowerCase())),
        }))
        // Una riga di soli segnaposto è rumore: senza questo controllo il «–» del
        // titolo la teneva in vita, e a schermo compariva un trattino solo.
        .filter((r) => (r.title.length && !EMPTY_CELL.has(r.first.toLowerCase())) || r.meta.length)
        .map(({ title, meta }) => ({ title, meta }))

      if (rows.length) blocks.push({ kind: 'rows', rows })
      continue
    }

    const b = bulletOf(line)
    if (b) {
      flushParagraph()
      const spans = parseInline(stripHeading(b[1]))
      if (spans.length) bullets.push(spans)
      continue
    }

    flushBullets()
    paragraph.push(stripHeading(line))
  }

  flushAll()
  return blocks
}
