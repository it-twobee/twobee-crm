/**
 * §449 — la pagina unica di caricamento: che file è, e dove va.
 *
 * Ogni documento aveva la sua porta: gli estratti conto in Banca, gli XML in
 * Fatturazione, e i firmati `.p7m` e gli zip dello SdI da nessuna parte — si
 * aprivano a mano e si caricava un XML per volta. Qui si trascina tutto
 * insieme, e ogni file si riconosce **dal contenuto** (come fa `parseStatement`,
 * §277), non dall'estensione: un camt salvato `.txt` resta un camt.
 *
 * Puro: il browser legge i file, questo modulo decide cosa sono.
 */

import { detectDialect, type Dialect } from './bank-import'

export type TipoFile =
  | 'fattura'        // XML FatturaPA
  | 'fattura_p7m'    // FatturaPA firmata
  | 'zip'            // un archivio: si apre e si guarda dentro
  | 'banca_camt'     // estratto conto camt.053
  | 'banca_testo'    // CSV/TSV dell'home banking
  | 'banca_excel'    // XLSX dell'home banking
  | 'pdf'            // estratto, cedolino o F24: da leggere, serve un esempio
  | 'sconosciuto'

export function tipoFile(nome: string, inizio: string): TipoFile {
  const n = nome.toLowerCase()
  if (n.endsWith('.p7m')) return 'fattura_p7m'
  if (n.endsWith('.zip')) return 'zip'
  if (n.endsWith('.pdf') || inizio.startsWith('%PDF')) return 'pdf'
  if (n.endsWith('.xlsx')) return 'banca_excel'
  if (/<(?:\w+:)?FatturaElettronica[\s>]/.test(inizio)) return 'fattura'
  if (/<Document[^>]*camt\.053/i.test(inizio) || /<Ntry>/.test(inizio)) return 'banca_camt'
  if (/\.(csv|tsv|txt)$/.test(n)) return 'banca_testo'
  if (n.endsWith('.xml')) return 'sconosciuto'
  return 'sconosciuto'
}

export const ETICHETTA_TIPO: Record<TipoFile, string> = {
  fattura: 'Fattura elettronica',
  fattura_p7m: 'Fattura firmata (.p7m)',
  zip: 'Archivio zip',
  banca_camt: 'Estratto conto camt.053',
  banca_testo: 'Estratto conto CSV',
  banca_excel: 'Estratto conto Excel',
  pdf: 'PDF',
  sconosciuto: 'Non riconosciuto',
}

const DATA_EXCEL = (n: number) => {
  // i giorni dal 30 dicembre 1899, come li conta Excel
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

/**
 * Le righe di un estratto conto Excel come testo che `parseStatement` legge.
 *
 * L'home banking mette spesso un titolo, l'intestatario e il periodo sopra la
 * tabella: si parte dalla prima riga che ha un'intestazione riconoscibile. Le
 * date Excel arrivano come numeri (45560): nelle colonne data si riportano a
 * giorno/mese/anno, o la riga verrebbe scartata come «senza data».
 */
export function righeExcelATesto(righe: string[][]): { testo: string; dialetto: Dialect } | { errore: string } {
  const i = righe.findIndex(r => detectDialect(r))
  if (i < 0) return { errore: 'Nel foglio non c’è un’intestazione di estratto conto (servono una data e un importo)' }
  const intestazione = righe[i]
  const dialetto = detectDialect(intestazione)!
  const date = intestazione.map((h, k) => /data|date/i.test(h) ? k : -1).filter(k => k >= 0)
  const corpo = righe.slice(i + 1).map(r => r.map((v, k) => {
    const n = Number(v)
    return date.includes(k) && /^\d{5}(\.\d+)?$/.test(v.trim()) && n > 30_000 && n < 80_000 ? DATA_EXCEL(Math.floor(n)) : v
  }))
  const cella = (v: string) => v.replace(/[\t\r\n]+/g, ' ')
  return { testo: [intestazione, ...corpo].map(r => r.map(cella).join('\t')).join('\n'), dialetto }
}

export type Conto = { id: string; label: string; bank_name: string | null; is_primary: boolean }

/**
 * Su che conto va un estratto. Vivid esporta il suo tracciato e il camt; il
 * tracciato italiano è di Intesa (o di un'altra banca italiana): si cerca il
 * conto col nome giusto, e se non c'è quello principale. È un suggerimento — la
 * pagina lo mostra e si cambia prima di caricare.
 */
export function contoSuggerito(d: Dialect, conti: Conto[]): string | null {
  const con = (s: RegExp) => conti.find(c => s.test(`${c.label} ${c.bank_name ?? ''}`))
  const principale = conti.find(c => c.is_primary) ?? conti[0]
  if (d === 'vivid' || d === 'camt') return (con(/vivid/i) ?? principale)?.id ?? null
  return (con(/intesa|sanpaolo/i) ?? principale)?.id ?? null
}
