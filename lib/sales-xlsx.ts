/**
 * §433 — un foglio Excel, letto come si legge un CSV.
 *
 * Chi passa una lista di lead la passa in Excel, quasi mai in CSV: chiedere di
 * «salvare come CSV» è un passaggio in cui si perdono gli accenti (Excel su Mac
 * esporta in un'altra codifica) e gli zeri davanti ai telefoni. Quindi il file
 * si legge com'è.
 *
 * Un `.xlsx` è uno zip con dentro dell'XML. Lo zip lo apre zip.js, che c'è già
 * per l'area file (§421); qui c'è solo la parte che non ha rete e non ha
 * browser — da due testi XML a righe di celle — così il gate la prova con dei
 * dati. Esce lo stesso `string[][]` di `leggiCsv`, e da lì in poi il percorso è
 * uno: riconoscimento delle colonne, anteprima, doppioni.
 *
 * Si legge **il primo foglio**, nell'ordine del file. Un file con tre fogli
 * probabilmente ha i lead nel primo; se non è così lo dice l'anteprima, che
 * mostra le colonne trovate prima di importare.
 *
 * Gate: `npx tsx lib/sales-xlsx.check.ts`.
 */

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** il testo di un nodo XML, con le entità risolte */
export function testoXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITA[e.toLowerCase()] ?? m
  })
}

/**
 * Le stringhe condivise: Excel scrive ogni testo una volta sola e nelle celle
 * mette il numero. Una stringa può essere spezzata in più pezzi con formati
 * diversi (`<r><t>…</t></r>`), e si ricompone; la pronuncia fonetica
 * giapponese (`<rPh>`) non è testo della cella e si salta.
 */
export function stringheCondivise(xml: string): string[] {
  const out: string[] = []
  for (const [, si] of Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g))) {
    const senzaFonetica = si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
    const pezzi = Array.from(senzaFonetica.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g))
    out.push(pezzi.map(p => testoXml(p[1] ?? '')).join(''))
  }
  return out
}

/** `C12` → colonna 2 (da zero). Senza riferimento vale la posizione nella riga. */
export function colonnaDi(rif: string | undefined): number | null {
  const m = rif?.match(/^([A-Z]+)\d*$/i)
  if (!m) return null
  let n = 0
  for (const c of m[1].toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Un numero come lo scriverebbe una persona. Excel salva `0,1+0,2` come
 * `0.30000000000000004` e un telefono lungo come `3.33123456E9`: il primo si
 * arrotonda alle cifre che Excel stesso mostra, il secondo torna intero.
 */
export function numeroLeggibile(v: string): string {
  const n = Number(v)
  if (!Number.isFinite(n) || v.trim() === '') return v
  if (Number.isInteger(n)) return String(n)
  return String(Number(n.toPrecision(15)))
}

/**
 * Le righe del foglio, già in ordine e senza buchi.
 *
 * Le celle vuote Excel non le scrive: una riga può saltare da A a D, e senza
 * guardare il riferimento il valore di D finirebbe in B — il telefono al posto
 * della mail, lo stesso difetto silenzioso che `leggiCsv` evita con le
 * virgolette. Le righe vuote in mezzo si tolgono, come fa il CSV.
 */
export function righeFoglio(xml: string, condivise: string[]): string[][] {
  const righe: string[][] = []
  for (const [, dentro] of Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))) {
    const riga: string[] = []
    let pos = 0
    for (const c of Array.from(dentro.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g))) {
      const attr = c[1]
      const corpo = c[2] ?? ''
      const col = colonnaDi(attr.match(/\br="([^"]+)"/)?.[1]) ?? pos
      const tipo = attr.match(/\bt="([^"]+)"/)?.[1] ?? 'n'
      const v = corpo.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1]
      let valore = ''
      if (tipo === 's') valore = condivise[Number(v)] ?? ''
      else if (tipo === 'inlineStr') {
        valore = Array.from(corpo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map(p => testoXml(p[1])).join('')
      } else if (tipo === 'b') valore = v === '1' ? 'VERO' : v === '0' ? 'FALSO' : ''
      else if (tipo === 'str' || tipo === 'e') valore = testoXml(v ?? '')
      else valore = v === undefined ? '' : numeroLeggibile(testoXml(v))
      while (riga.length < col) riga.push('')
      riga[col] = valore
      pos = col + 1
    }
    if (riga.some(v => v.trim() !== '')) righe.push(riga)
  }
  const larghezza = Math.max(0, ...righe.map(r => r.length))
  return righe.map(r => r.concat(Array(larghezza - r.length).fill('')))
}

/**
 * Dove sta il primo foglio. `workbook.xml` dice l'ordine e un id, le relazioni
 * dicono il file. Se qualcosa manca si prova il nome di default: la gran parte
 * dei file lo usa, e se nemmeno quello c'è chi chiama dirà che il file non si
 * legge.
 */
export function percorsoPrimoFoglio(workbook: string | null, relazioni: string | null): string {
  const PREDEFINITO = 'xl/worksheets/sheet1.xml'
  const id = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1]
    ?? workbook?.match(/<sheet\b[^>]*\bid="([^"]+)"/)?.[1]
  if (!id || !relazioni) return PREDEFINITO
  const rel = Array.from(relazioni.matchAll(/<Relationship\b([^>]*)\/?>/g))
    .map(m => m[1]).find(a => a.includes(`Id="${id}"`))
  const target = rel?.match(/\bTarget="([^"]+)"/)?.[1]
  if (!target) return PREDEFINITO
  if (target.startsWith('/')) return target.slice(1)
  return target.startsWith('xl/') ? target : `xl/${target}`
}

export const eExcel = (nome: string) => /\.xlsx$/i.test(nome)
