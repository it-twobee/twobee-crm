/**
 * Da un CSV di banca a movimenti normalizzati — calcoli puri, nessun I/O.
 *
 * Ogni banca esporta a modo suo, e nessuno dei modi è pensato per essere letto.
 * Valsabbina scrive «03/08/2026», «3812,50» e una causale numerica; Vivid scrive
 * «03.08.2026», «3812.50» e mette il fornitore in chiaro. Un parser per banca
 * diventa tre parser che divergono: qui il **dialetto si riconosce dall'intestazione**
 * e da lì in poi il resto del tool vede una forma sola.
 *
 * Il secondo lavoro è più utile del primo. Le carte producono descrizioni tutte
 * diverse per lo stesso fornitore — «FACEBK *69RNPVDF92, Dublin, IE» ventisei
 * volte con ventisei codici — e in una lista sono ventisei righe che non si
 * possono né sommare né cercare. `merchant()` le riconduce al nome vero e dice a
 * quale famiglia di spesa appartengono, che è l'unica cosa che serve per capire
 * se un conto sta facendo il lavoro per cui è stato aperto.
 */

export type Dialect = 'valsabbina' | 'vivid'

export type ParsedTx = {
  booked_on: string
  value_on: string | null
  amount: number
  description: string
  /** il nome che la banca ha messo nel campo controparte, quando ce l'ha */
  counterparty_raw: string | null
  causal_code: string | null
  channel: string | null
}

export type ParseResult = {
  dialect: Dialect
  rows: ParsedTx[]
  /** righe scartate e perché: un import che tace su cosa ha perso non è verificabile */
  skipped: string[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

const cells = (line: string, sep: string) =>
  line.split(sep).map(c => c.replace(/^"|"$/g, '').trim())

/** Il separatore vero: il punto e virgola vince perché gli importi hanno la virgola. */
function detectSep(header: string): string {
  return header.includes(';') ? ';' : header.includes('\t') ? '\t' : ','
}

/**
 * Che banca è, dall'intestazione.
 *
 * Si riconosce dai nomi di colonna e non dal nome del file: un file rinominato
 * resta importabile, e un formato nuovo fallisce con un messaggio invece di
 * produrre movimenti silenziosamente sbagliati.
 */
export function detectDialect(header: string[]): Dialect | null {
  const h = header.map(x => x.toLowerCase())
  const has = (s: string) => h.some(x => x.includes(s))
  if (has('data contabile') && has('importo')) return 'valsabbina'
  if (has('completed date') && has('payment amount')) return 'vivid'
  return null
}

/** «03/08/2026» o «03.08.2026» → «2026-08-03». */
function isoDate(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (m) {
    const [, g, mm, a] = m
    const year = a.length === 2 ? `20${a}` : a
    return `${year}-${mm.padStart(2, '0')}-${g.padStart(2, '0')}`
  }
  // già ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10)
  return null
}

/**
 * L'importo, nei due modi in cui l'Italia e il resto del mondo lo scrivono.
 *
 * «3.812,50» ha il punto per le migliaia; «3812.50» ha il punto per i decimali.
 * Si decide da quale separatore compare per ultimo: quello è il decimale.
 */
function parseAmount(v: string): number {
  const s = v.trim().replace(/\s|€|EUR/gi, '')
  if (!s) return NaN
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) return Number(s.replace(/\./g, '').replace(',', '.'))
  if (lastDot > lastComma) return Number(s.replace(/,/g, ''))
  return Number(s.replace(',', '.'))
}

export function parseStatement(csv: string): ParseResult {
  const lines = csv.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) throw new Error('Il file è vuoto')

  const sep = detectSep(lines[0])
  const header = cells(lines[0], sep)
  const dialect = detectDialect(header)
  if (!dialect) {
    throw new Error(
      'Formato non riconosciuto. Servono le colonne «Data contabile / Importo / Descrizione» '
      + `(home banking italiano) o «Completed date / Payment amount» (Vivid). Trovate: ${header.join(', ')}`)
  }

  const h = header.map(x => x.toLowerCase())
  const at = (...names: string[]) => h.findIndex(x => names.some(n => x.includes(n)))
  const col = dialect === 'valsabbina'
    ? {
        booked: at('data contabile'), value: at('data valuta'), amount: at('importo'),
        desc: at('descrizione'), causal: at('causale'), channel: at('canale'), party: -1,
      }
    : {
        booked: at('completed date'), value: at('started date'), amount: at('payment amount'),
        desc: at('reference'), causal: -1, channel: -1, party: at('counterparty name'),
      }

  const rows: ParsedTx[] = []
  const skipped: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const c = cells(lines[i], sep)
    const booked = isoDate(c[col.booked] ?? '')
    const amount = parseAmount(c[col.amount] ?? '')
    const party = col.party >= 0 ? (c[col.party] || null) : null
    const ref = col.desc >= 0 ? (c[col.desc] || '') : ''
    /* Su Vivid la descrizione utile è il nome della controparte: il campo
       «Reference» spesso lo ripete o è vuoto. Meglio ripetere che perdere. */
    const description = dialect === 'vivid' ? [party, ref].filter(Boolean).join(' — ') : ref

    if (!booked || !Number.isFinite(amount) || !description) {
      skipped.push(`riga ${i + 1}: ${!booked ? 'data illeggibile' : !Number.isFinite(amount) ? 'importo illeggibile' : 'descrizione vuota'}`)
      continue
    }

    rows.push({
      booked_on: booked,
      value_on: col.value >= 0 ? isoDate(c[col.value] ?? '') ?? booked : booked,
      amount,
      description,
      counterparty_raw: party,
      causal_code: col.causal >= 0 ? (c[col.causal] || null) : null,
      channel: col.channel >= 0 ? (c[col.channel] || null) : null,
    })
  }

  return { dialect, rows, skipped }
}

// ═══════════════════════════════════════════════════════════════════════════
// I fornitori delle carte
// ═══════════════════════════════════════════════════════════════════════════

export type SpendFamily =
  | 'advertising' | 'software' | 'hosting' | 'rappresentanza'
  | 'carburante' | 'hardware' | 'spesa' | 'banca' | 'altro'

export const FAMILY_LABEL: Record<SpendFamily, string> = {
  advertising: 'Advertising',
  software: 'Software e tool',
  hosting: 'Hosting e domini',
  rappresentanza: 'Ristoranti e rappresentanza',
  carburante: 'Carburante e viaggi',
  hardware: 'Hardware ed elettronica',
  spesa: 'Spesa e alimentari',
  banca: 'Banca e cashback',
  altro: 'Altro',
}

/**
 * Chi è questo fornitore, e che tipo di spesa è.
 *
 * Il pattern è sul nome del negozio così come lo scrive il circuito, che è
 * l'unico dato che c'è: «FACEBK *69RNPVDF92, Dublin, IE» diventa «Meta Ads»
 * ventisei volte, e da ventisei righe illeggibili nasce una voce sommabile.
 *
 * Le famiglie servono a una domanda sola: **questo conto sta pagando quello per
 * cui è stato aperto?** Un conto «marketing e software» che paga ristoranti e
 * benzina non è un errore contabile, è un'informazione — e senza la famiglia non
 * si vede, perché ogni singola spesa sembra piccola.
 */
/**
 * I nomi che questa funzione produce, con la loro famiglia.
 *
 * Serve all'**idempotenza**: `merchant` viene applicata all'import e poi
 * rileggendo dal database, dove il nome è già normalizzato. Senza questa mappa
 * «Meta Ads» non corrisponde a nessuna regola su «facebk» e trentadue movimenti
 * di advertising finivano in «Altro» — il difetto si vede solo al secondo giro.
 */
const CANONICAL: Record<string, SpendFamily> = {
  'meta ads': 'advertising', 'google ads': 'advertising', 'tiktok ads': 'advertising',
  linkedin: 'advertising',
  asana: 'software', slack: 'software', notion: 'software', figma: 'software',
  canva: 'software', adobe: 'software', 'ai tools': 'software',
  'google cloud': 'hosting', ovhcloud: 'hosting', aruba: 'hosting', hosting: 'hosting',
  'vivid money': 'banca',
  supermercato: 'spesa', elettronica: 'hardware',
  'carburante e viaggi': 'carburante', ristoranti: 'rappresentanza',
}

export function merchant(raw: string): { name: string; family: SpendFamily } {
  const s = raw.toLowerCase().trim()

  // già normalizzato: si restituisce com'è, così riapplicarla non cambia niente
  const canon = CANONICAL[s]
  if (canon) return { name: raw.trim(), family: canon }
  const rule: [RegExp, string, SpendFamily][] = [
    [/facebk|facebook|meta platf/, 'Meta Ads', 'advertising'],
    [/google ads|googleads|adwords/, 'Google Ads', 'advertising'],
    [/tiktok/, 'TikTok Ads', 'advertising'],
    [/linkedin/, 'LinkedIn', 'advertising'],
    [/asana/, 'Asana', 'software'],
    [/slack/, 'Slack', 'software'],
    [/notion/, 'Notion', 'software'],
    [/figma/, 'Figma', 'software'],
    [/canva/, 'Canva', 'software'],
    [/adobe/, 'Adobe', 'software'],
    [/openai|anthropic|claude/, 'AI tools', 'software'],
    [/google cloud|gcp/, 'Google Cloud', 'hosting'],
    [/ovh/, 'OVHcloud', 'hosting'],
    [/aruba/, 'Aruba', 'hosting'],
    [/hetzner|digitalocean|vercel|netlify/, 'Hosting', 'hosting'],
    [/vivid money/, 'Vivid Money', 'banca'],
    [/conad|lidl|carrefour|esselunga|supermerc/, 'Supermercato', 'spesa'],
    [/euronics|mediaworld|unieuro|apple store|amazon/, 'Elettronica', 'hardware'],
    [/stazione di servizio|eni |q8|ip |tamoil|esso|benzina|autostrad|telepass|trenitalia|italo|ryanair|easyjet|ita airways/,
      'Carburante e viaggi', 'carburante'],
    [/ristorant|pizzer|trattori|osteria|bar |caff|cavatappi|scogliera|kbirr|pub /, 'Ristoranti', 'rappresentanza'],
  ]
  for (const [re, name, family] of rule) if (re.test(s)) return { name, family }

  /* Nessuna regola: si ripulisce quello che c'è. I circuiti aggiungono città e
     paese dopo la virgola, e un asterisco col codice dell'incasso. */
  const clean = raw.split(',')[0].replace(/\*\S+/g, '').replace(/\s{2,}/g, ' ').trim()
  const pretty = clean.length > 2
    ? clean.split(' ').map(w => (w.length > 3 && w === w.toUpperCase()
        ? w[0] + w.slice(1).toLowerCase() : w)).join(' ')
    : raw.trim()
  return { name: pretty || 'Non riconosciuto', family: 'altro' }
}

/** Le spese per famiglia: dice se un conto fa il lavoro per cui è stato aperto. */
export function byFamily(
  txs: { amount: number; counterparty: string | null; description: string }[],
): { family: SpendFamily; label: string; total: number; count: number; names: string[] }[] {
  const map = new Map<SpendFamily, { total: number; count: number; names: Set<string> }>()
  for (const t of txs) {
    if (t.amount >= 0) continue
    const { name, family } = merchant(t.counterparty ?? t.description)
    const cur = map.get(family) ?? { total: 0, count: 0, names: new Set<string>() }
    cur.total = Math.round((cur.total + Math.abs(t.amount)) * 100) / 100
    cur.count += 1
    cur.names.add(name)
    map.set(family, cur)
  }
  return Array.from(map.entries())
    .map(([family, v]) => ({
      family, label: FAMILY_LABEL[family], total: v.total, count: v.count,
      names: Array.from(v.names),
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Le famiglie che chiedono una giustificazione, su qualunque conto aziendale.
 *
 * Non sono spese vietate: sono spese che senza una ragione scritta diventano un
 * problema. Ristoranti e alimentari hanno deducibilità limitata (75% i pasti, e
 * solo se inerenti), il carburante segue la regola del veicolo, l'elettronica va
 * attaccata a un bene o a un progetto. Il conto non può decidere se erano
 * inerenti — può solo dire quanto pesano, che è l'unica cosa che nessuno guarda
 * finché le singole spese sembrano tutte piccole.
 */
export const CHECK_FAMILIES: SpendFamily[] = ['rappresentanza', 'spesa', 'carburante', 'hardware']

/**
 * Le uscite di un conto divise in «quello per cui esiste» e «quello da spiegare».
 *
 * `banca` sta fuori da entrambe: commissioni e cashback non sono una scelta di
 * spesa. La percentuale è sul totale delle uscite, non sul saldo: un conto quasi
 * vuoto che ha speso bene e uno pieno che ha speso male hanno lo stesso saldo.
 */
export function spendSplit(
  txs: { amount: number; counterparty: string | null; description: string }[],
): {
  total: number; operativo: number; daGiustificare: number; share: number
  families: ReturnType<typeof byFamily>
} {
  const families = byFamily(txs).filter(f => f.family !== 'banca')
  const total = r2(families.reduce((n, f) => n + f.total, 0))
  const daGiustificare = r2(families
    .filter(f => CHECK_FAMILIES.includes(f.family))
    .reduce((n, f) => n + f.total, 0))
  return {
    total,
    operativo: r2(total - daGiustificare),
    daGiustificare,
    share: total > 0 ? daGiustificare / total : 0,
    families,
  }
}
