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
  | 'pdf'            // un PDF: si apre e si guarda se è un cedolino o un F24
  | 'cedolino'       // cedolino Ranocchi letto dal PDF (§450)
  | 'f24'            // modello F24 letto dal PDF (§450)
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
  cedolino: 'Cedolino',
  f24: 'Modello F24',
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

export type Conto = { id: string; label: string; bank_name: string | null; is_primary: boolean; iban?: string | null }

export const normIban = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').toUpperCase()

/**
 * §450 — l'IBAN di un estratto: il camt lo scrive nel blocco del conto, e Vivid
 * lo mette anche nel nome del file. Il CSV di Banco BPM non lo scrive da
 * nessuna parte, e lì decide il tracciato.
 */
export function ibanDelFile(nome: string, testo: string): string | null {
  const acct = /<Acct>\s*<Id>\s*<IBAN>\s*([A-Z]{2}\d{2}[A-Z0-9]{10,30})\s*<\/IBAN>/.exec(testo)
  if (acct) return normIban(acct[1])
  const n = /(?:^|[^A-Z0-9])([A-Z]{2}\d{2}[A-Z0-9]{11,30})(?:[^A-Z0-9]|$)/.exec(nome.toUpperCase())
  return n ? n[1] : null
}

/**
 * Su che conto va un estratto. **L'IBAN vince**: se un conto l'ha già, è
 * quello. Se l'IBAN c'è e nessun conto lo conosce, fra quattro conti Vivid il
 * tracciato non basta a scegliere — si lascia la scelta a chi carica, e la
 * scelta insegna l'IBAN al conto. Il tracciato italiano è Banco BPM (il conto
 * principale). È un suggerimento: la pagina lo mostra e si cambia prima di
 * caricare.
 */
export function contoSuggerito(d: Dialect, conti: Conto[], iban: string | null = null): string | null {
  if (iban) {
    const suo = conti.find(c => normIban(c.iban) === normIban(iban))
    if (suo) return suo.id
  }
  const tutti = (s: RegExp) => conti.filter(c => s.test(`${c.label} ${c.bank_name ?? ''}`))
  const principale = conti.find(c => c.is_primary) ?? conti[0]
  if (d === 'vivid' || d === 'camt') {
    const vivid = tutti(/vivid/i).filter(c => !iban || !c.iban)
    if (iban) return vivid.length === 1 ? vivid[0].id : null
    return (vivid[0] ?? principale)?.id ?? null
  }
  return (tutti(/bpm|banco|intesa|sanpaolo/i)[0] ?? principale)?.id ?? null
}

/**
 * §450 — quanto è vecchio l'ultimo dato di una fonte, in parole. «Mai» non è
 * «tanto tempo fa»: una fonte che non è mai arrivata si dice così.
 */
export function daQuanto(data: string | null, oggi: string): { testo: string; giorni: number | null } {
  if (!data) return { testo: 'mai', giorni: null }
  const g = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000
  const n = Math.round(g(oggi) - g(data.slice(0, 10)))
  return { testo: n <= 0 ? 'oggi' : n === 1 ? 'ieri' : `${n} giorni fa`, giorni: Math.max(0, n) }
}

/** l'impronta di un file, come la calcola l'archivio: esadecimale minuscolo */
export const esadecimale = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')
