/**
 * FatturaPA → documento leggibile. Calcoli puri, nessun I/O.
 *
 * Il file che lo SdI restituisce è l'**unica copia certa** di una fattura: quello
 * che c'è dentro è quello che è stato trasmesso, e nessuna riscrittura a mano
 * può contraddirlo. Per questo la sezione Fatture nasce da qui e non da un
 * inserimento: un archivio digitato è un secondo archivio, e due archivi che
 * dicono numeri diversi non servono a niente.
 *
 * Due lavori, in ordine:
 *
 *   1. **leggere l'XML**. Niente dipendenze nuove: FatturaPA è un formato chiuso,
 *      senza attributi che servano e senza CDATA, quindi un lettore di duecento
 *      righe lo copre per intero ed è verificabile. Aggiungere un parser generico
 *      per leggere un tracciato fisso è peso che non ricambia.
 *   2. **capire il documento**: verso, imponibili per aliquota, scadenze, segno.
 *      Una nota di credito (TD04) è una fattura **negativa**: registrarla come
 *      positiva gonfia il fatturato e falsa l'IVA, ed è l'errore che il file
 *      permette di non fare mai più.
 *
 * Il verso non si deduce dal nome del file — quello porta l'id di chi trasmette,
 * che spesso è il commercialista per entrambe le direzioni — ma dalla partita IVA
 * di chi emette: se è la nostra, la fattura è emessa.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Il lettore XML
// ═══════════════════════════════════════════════════════════════════════════

export type XmlNode = {
  name: string
  text: string
  children: XmlNode[]
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')

/** Il prefisso di namespace non porta informazione qui: `p:Data` e `Data` sono la stessa cosa. */
const localName = (raw: string) => {
  const n = raw.split(/\s/)[0]
  const i = n.indexOf(':')
  return i >= 0 ? n.slice(i + 1) : n
}

/**
 * Da testo XML ad albero. Salta prologo, commenti e istruzioni; gli attributi
 * si ignorano perché in FatturaPA non ne serve nessuno — `versione` sta anche
 * dentro `FormatoTrasmissione`.
 */
export function parseXml(src: string): XmlNode {
  const s = src.replace(/^﻿/, '')
  const root: XmlNode = { name: '#root', text: '', children: [] }
  const stack: XmlNode[] = [root]
  let i = 0

  while (i < s.length) {
    const lt = s.indexOf('<', i)
    if (lt < 0) break

    if (lt > i) {
      const t = decode(s.slice(i, lt)).trim()
      if (t) stack[stack.length - 1].text += t
    }

    if (s.startsWith('<!--', lt)) { i = s.indexOf('-->', lt) + 3 || s.length; continue }
    if (s.startsWith('<?', lt)) { i = s.indexOf('?>', lt) + 2 || s.length; continue }
    if (s.startsWith('<![CDATA[', lt)) {
      const end = s.indexOf(']]>', lt)
      stack[stack.length - 1].text += s.slice(lt + 9, end < 0 ? s.length : end)
      i = end < 0 ? s.length : end + 3
      continue
    }

    const gt = s.indexOf('>', lt)
    if (gt < 0) break
    const inner = s.slice(lt + 1, gt).trim()

    if (inner.startsWith('/')) {
      if (stack.length > 1) stack.pop()
      i = gt + 1
      continue
    }

    const node: XmlNode = { name: localName(inner), text: '', children: [] }
    stack[stack.length - 1].children.push(node)
    if (!inner.endsWith('/')) stack.push(node)
    i = gt + 1
  }

  return root
}

/** Il primo figlio lungo un percorso «A/B/C». */
export function pick(node: XmlNode | null | undefined, path: string): XmlNode | null {
  let cur = node ?? null
  for (const part of path.split('/')) {
    if (!cur) return null
    cur = cur.children.find(c => c.name === part) ?? null
  }
  return cur
}

/** Tutti i figli in fondo al percorso: le righe, i riepiloghi, le scadenze. */
export function all(node: XmlNode | null | undefined, path: string): XmlNode[] {
  const parts = path.split('/')
  const last = parts.pop()!
  const parent = parts.length ? pick(node, parts.join('/')) : node
  return parent ? parent.children.filter(c => c.name === last) : []
}

export const str = (node: XmlNode | null | undefined, path: string): string | null => {
  const n = pick(node, path)
  const t = n?.text.trim()
  return t ? t : null
}

/** Gli importi FatturaPA hanno sempre il punto decimale: nessun dialetto da indovinare. */
export const num = (node: XmlNode | null | undefined, path: string): number | null => {
  const v = str(node, path)
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ═══════════════════════════════════════════════════════════════════════════
// Il documento
// ═══════════════════════════════════════════════════════════════════════════

/**
 * I tipi che si incontrano davvero. La lista completa dello SdI è più lunga, ma
 * un codice sconosciuto non deve far fallire l'import: si tiene com'è e si
 * mostra il codice, che è più onesto di una traduzione inventata.
 */
export const DOC_TYPES: Record<string, string> = {
  TD01: 'Fattura',
  TD02: 'Acconto/anticipo su fattura',
  TD03: 'Acconto/anticipo su parcella',
  TD04: 'Nota di credito',
  TD05: 'Nota di debito',
  TD06: 'Parcella',
  TD16: 'Integrazione reverse charge interno',
  TD17: 'Integrazione/autofattura acquisti dall\'estero',
  TD18: 'Integrazione acquisti intracomunitari',
  TD19: 'Integrazione/autofattura ex art.17 c.2',
  TD20: 'Autofattura per regolarizzazione',
  TD24: 'Fattura differita',
  TD25: 'Fattura differita (art.21 c.4)',
  TD26: 'Cessione di beni ammortizzabili',
  TD27: 'Fattura per autoconsumo',
}

/** Perché su questa riga l'IVA non c'è. Senza, uno zero sembra un errore. */
export const NATURA: Record<string, string> = {
  N1: 'Escluse ex art. 15',
  N2: 'Non soggette',
  'N2.1': 'Non soggette ex artt. 7-7septies',
  'N2.2': 'Non soggette — altri casi',
  N3: 'Non imponibili',
  'N3.1': 'Non imponibili — esportazioni',
  'N3.2': 'Non imponibili — cessioni intracomunitarie',
  'N3.3': 'Non imponibili — cessioni verso San Marino',
  'N3.4': 'Non imponibili — operazioni assimilate',
  'N3.5': 'Non imponibili — dichiarazione d\'intento',
  'N3.6': 'Non imponibili — altre operazioni',
  N4: 'Esenti',
  N5: 'Regime del margine / IVA non esposta',
  N6: 'Inversione contabile',
  'N6.1': 'Inversione contabile — rottami',
  'N6.2': 'Inversione contabile — oro e argento',
  'N6.3': 'Inversione contabile — subappalto edile',
  'N6.4': 'Inversione contabile — fabbricati',
  'N6.5': 'Inversione contabile — telefoni cellulari',
  'N6.6': 'Inversione contabile — elettronica',
  'N6.7': 'Inversione contabile — edile e settori connessi',
  'N6.8': 'Inversione contabile — energia',
  'N6.9': 'Inversione contabile — altri casi',
  N7: 'IVA assolta in altro stato UE',
}

/** Come si paga, dal codice SdI. */
export const PAYMENT_METHOD: Record<string, string> = {
  MP01: 'Contanti', MP02: 'Assegno', MP03: 'Assegno circolare', MP04: 'Contanti presso tesoreria',
  MP05: 'Bonifico', MP06: 'Vaglia cambiario', MP07: 'Bollettino bancario', MP08: 'Carta di pagamento',
  MP09: 'RID', MP10: 'RID utenze', MP11: 'RID veloce', MP12: 'RIBA', MP13: 'MAV',
  MP14: 'Quietanza erario', MP15: 'Giroconto su conti di contabilità speciale',
  MP16: 'Domiciliazione bancaria', MP17: 'Domiciliazione postale', MP18: 'Bollettino di c/c postale',
  MP19: 'SEPA Direct Debit', MP20: 'SEPA Core', MP21: 'SEPA B2B', MP22: 'Trattenuta su somme già riscosse',
  MP23: 'PagoPA',
}

export type InvoiceParty = {
  name: string
  vat: string | null
  taxCode: string | null
  address: string | null
  city: string | null
  zip: string | null
  province: string | null
  country: string | null
  pec: string | null
}

export type InvoiceLine = {
  line: number
  description: string
  quantity: number | null
  unitPrice: number | null
  total: number
  vatRate: number
  natura: string | null
  /** periodo di competenza, quando la riga lo dichiara */
  from: string | null
  to: string | null
}

export type VatSummary = {
  rate: number
  taxable: number
  tax: number
  natura: string | null
  /** «I» immediata, «D» differita, «S» scissione dei pagamenti */
  collectability: string | null
}

/**
 * §323 — Quale documento questa nota rettifica.
 *
 * `DatiFattureCollegate` è il campo per cui una nota di credito non è un
 * mistero: **il documento dice da solo quale fattura annulla**, con numero e
 * data. Finché non lo leggevamo, quel legame lo ricostruiva una persona
 * scrivendo a mano una ragione di esclusione su una delle due righe — e nei
 * dati veri l'ha scritta sulla riga sbagliata due volte su quattro.
 *
 * Il tracciato non lo pretende: le TD05 di questo archivio non ce l'hanno, e
 * un TD04 senza riferimento resta una nota che non dice cosa storna. È una cosa
 * da segnalare, non da indovinare.
 */
export type RelatedDoc = {
  /** il numero come lo scrive il documento: «FPR 41/26» */
  id: string
  date: string | null
  /** la riga a cui si riferisce, quando lo storno è parziale */
  line: number | null
}

export type Installment = {
  dueDate: string | null
  amount: number
  method: string | null
  iban: string | null
}

export type ParsedInvoice = {
  /** 'emessa' se la partita IVA di chi emette è la nostra */
  direction: 'emessa' | 'ricevuta'
  docType: string
  number: string
  issuedOn: string
  currency: string
  supplier: InvoiceParty
  customer: InvoiceParty
  /** l'altra parte rispetto a noi: è quella che si mostra in elenco */
  counterparty: InvoiceParty
  lines: InvoiceLine[]
  vat: VatSummary[]
  installments: Installment[]
  /** §323 — i documenti che questo rettifica: su una nota di credito è la fattura stornata */
  related: RelatedDoc[]
  taxable: number
  tax: number
  /** totale dichiarato nel documento; se manca si ricostruisce da imponibile + imposta */
  total: number
  /** true = il totale è stato ricostruito, non letto */
  totalDerived: boolean
  stamp: number
  withholding: number
  /** contributo cassa previdenziale, che è imponibile e va sommato */
  fund: number
  dueDate: string | null
  paymentMethod: string | null
  paymentTerms: string | null
  /** §211 — TD04 è una nota di **credito**: vale meno di zero, sempre */
  sign: 1 | -1
  notes: string[]
  attachments: string[]
  transmissionId: string | null
  recipientCode: string | null
}

const CREDIT_NOTES = new Set(['TD04', 'TD08'])
const DEBIT_NOTES = new Set(['TD05', 'TD09'])

/**
 * §323 — Che **genere** di documento è, al di là del codice.
 *
 * `DOC_TYPES` traduce il codice; questo lo classifica, ed è un'altra domanda.
 * Un elenco che mostra «TD05» accanto a «TD01» chiede di ricordare a memoria
 * quale dei due aggiunge e quale toglie: sono i due codici che più facilmente
 * si scambiano, perché differiscono di una cifra e le parole si somigliano.
 *
 * La distinzione che conta è **cosa fa al fatturato**: una nota di credito
 * toglie, una di debito aggiunge — e non è ridondante col segno, perché una
 * nota di debito ha lo stesso segno di una fattura e non è una fattura.
 */
export type DocKind = 'fattura' | 'nota_credito' | 'nota_debito' | 'parcella' | 'autofattura'

const AUTO = new Set(['TD16', 'TD17', 'TD18', 'TD19', 'TD20', 'TD21', 'TD22', 'TD23', 'TD27'])

export function docKind(docType: string): DocKind {
  if (CREDIT_NOTES.has(docType)) return 'nota_credito'
  if (DEBIT_NOTES.has(docType)) return 'nota_debito'
  if (docType === 'TD06' || docType === 'TD03') return 'parcella'
  if (AUTO.has(docType)) return 'autofattura'
  return 'fattura'
}

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  fattura: 'Fattura',
  nota_credito: 'Nota di credito',
  nota_debito: 'Nota di debito',
  parcella: 'Parcella',
  autofattura: 'Autofattura',
}

export const isCreditNote = (docType: string) => docKind(docType) === 'nota_credito'
export const isDebitNote = (docType: string) => docKind(docType) === 'nota_debito'

function party(node: XmlNode | null): InvoiceParty {
  const a = pick(node, 'DatiAnagrafici')
  const name = str(a, 'Anagrafica/Denominazione')
    ?? ([str(a, 'Anagrafica/Nome'), str(a, 'Anagrafica/Cognome')].filter(Boolean).join(' ')
      || 'Senza nome')
  const country = str(a, 'IdFiscaleIVA/IdPaese')
  const code = str(a, 'IdFiscaleIVA/IdCodice')
  return {
    name,
    // la partita IVA che serve per riconoscere il soggetto è il codice, non il paese
    vat: code ? (country && country !== 'IT' ? `${country}${code}` : code) : null,
    taxCode: str(a, 'CodiceFiscale'),
    address: [str(node, 'Sede/Indirizzo'), str(node, 'Sede/NumeroCivico')].filter(Boolean).join(' ') || null,
    city: str(node, 'Sede/Comune'),
    zip: str(node, 'Sede/CAP'),
    province: str(node, 'Sede/Provincia'),
    country: str(node, 'Sede/Nazione') ?? country,
    pec: str(node, 'Contatti/Email') ?? str(node, 'Contatti/PEC'),
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Un file può contenere **più fatture** (un lotto): si restituisce un array, e
 * chi importa le tratta una per una. Nel lotto l'intestazione è condivisa, i
 * corpi no.
 */
export function parseFattura(xml: string, ownVat: string): ParsedInvoice[] {
  const root = parseXml(xml)
  const doc = root.children.find(c => c.name === 'FatturaElettronica')
    ?? root.children.find(c => c.name.startsWith('Fattura'))
  if (!doc) throw new Error('Non è una fattura elettronica: manca <FatturaElettronica>')

  const header = pick(doc, 'FatturaElettronicaHeader')
  if (!header) throw new Error('Fattura senza intestazione')

  const supplier = party(pick(header, 'CedentePrestatore'))
  const customer = party(pick(header, 'CessionarioCommittente'))
  const own = ownVat.replace(/\D/g, '')
  const direction: 'emessa' | 'ricevuta' =
    (supplier.vat ?? '').replace(/\D/g, '') === own ? 'emessa' : 'ricevuta'

  const bodies = doc.children.filter(c => c.name === 'FatturaElettronicaBody')
  if (!bodies.length) throw new Error('Fattura senza corpo')

  return bodies.map(body => {
    const g = pick(body, 'DatiGenerali/DatiGeneraliDocumento')
    const docType = str(g, 'TipoDocumento') ?? 'TD01'
    const number = str(g, 'Numero') ?? '—'
    const issuedOn = str(g, 'Data') ?? ''
    if (!issuedOn) throw new Error(`Fattura ${number}: manca la data`)

    const vat: VatSummary[] = all(body, 'DatiBeniServizi/DatiRiepilogo').map(r => ({
      rate: num(r, 'AliquotaIVA') ?? 0,
      taxable: num(r, 'ImponibileImporto') ?? 0,
      tax: num(r, 'Imposta') ?? 0,
      natura: str(r, 'Natura'),
      collectability: str(r, 'EsigibilitaIVA'),
    }))

    const lines: InvoiceLine[] = all(body, 'DatiBeniServizi/DettaglioLinee').map((l, i) => ({
      line: num(l, 'NumeroLinea') ?? i + 1,
      description: str(l, 'Descrizione') ?? '—',
      quantity: num(l, 'Quantita'),
      unitPrice: num(l, 'PrezzoUnitario'),
      total: num(l, 'PrezzoTotale') ?? 0,
      vatRate: num(l, 'AliquotaIVA') ?? 0,
      natura: str(l, 'Natura'),
      from: str(l, 'DataInizioPeriodo'),
      to: str(l, 'DataFinePeriodo'),
    }))

    /* §323 — sta sotto `DatiGenerali`, accanto al documento e non dentro, perché
       un documento può rettificarne più d'uno. Su una fattura ordinaria lo stesso
       campo cita un DDT o un ordine: è il **tipo** che gli dà il significato di
       storno, non la sua presenza. */
    const related: RelatedDoc[] = all(pick(body, 'DatiGenerali'), 'DatiFattureCollegate')
      .map(f => ({
        id: str(f, 'IdDocumento') ?? '',
        date: str(f, 'Data'),
        line: num(f, 'RiferimentoNumeroLinea') ?? num(f, 'NumLinea'),
      }))
      .filter(f => f.id)

    const installments: Installment[] = all(body, 'DatiPagamento/DettaglioPagamento').map(p => ({
      dueDate: str(p, 'DataScadenzaPagamento'),
      amount: num(p, 'ImportoPagamento') ?? 0,
      method: str(p, 'ModalitaPagamento'),
      iban: str(p, 'IBAN'),
    }))

    const taxable = r2(vat.reduce((s, v) => s + v.taxable, 0))
    const tax = r2(vat.reduce((s, v) => s + v.tax, 0))
    const stamp = num(g, 'DatiBollo/ImportoBollo') ?? 0
    const withholding = all(g, 'DatiRitenuta').reduce((s, r) => s + (num(r, 'ImportoRitenuta') ?? 0), 0)
    const fund = all(g, 'DatiCassaPrevidenziale')
      .reduce((s, c) => s + (num(c, 'ImportoContributoCassa') ?? 0), 0)

    /* Il totale dichiarato è facoltativo nel tracciato, e mezza Italia non lo
       scrive. Ricostruirlo è legittimo — imponibile + imposta − ritenuta — ma va
       **detto**, perché un totale calcolato e uno trasmesso non hanno lo stesso
       valore probatorio se il fornitore ha sbagliato i conti. */
    const declared = num(g, 'ImportoTotaleDocumento')
    const total = declared ?? r2(taxable + tax - withholding)

    return {
      direction, docType, number, issuedOn,
      currency: str(g, 'Divisa') ?? 'EUR',
      supplier, customer,
      counterparty: direction === 'emessa' ? customer : supplier,
      lines, vat, installments, related,
      taxable, tax, total: r2(total), totalDerived: declared === null,
      stamp: r2(stamp), withholding: r2(withholding), fund: r2(fund),
      // la prima scadenza è quella che conta per lo scaduto; le altre stanno nelle rate
      dueDate: installments.map(i => i.dueDate).filter(Boolean).sort()[0] ?? null,
      paymentMethod: installments.find(i => i.method)?.method ?? null,
      paymentTerms: str(pick(body, 'DatiPagamento'), 'CondizioniPagamento'),
      sign: CREDIT_NOTES.has(docType) ? -1 : 1,
      notes: all(g, 'Causale').map(c => c.text.trim()).filter(Boolean),
      attachments: all(body, 'Allegati').map(a => str(a, 'NomeAttachment') ?? 'allegato'),
      transmissionId: str(header, 'DatiTrasmissione/ProgressivoInvio'),
      recipientCode: str(header, 'DatiTrasmissione/CodiceDestinatario'),
    }
  })
}

/**
 * L'impronta di una fattura: chi la emette, il numero e la data.
 *
 * Non l'importo — una fattura corretta e ritrasmessa con lo stesso numero è la
 * **stessa** fattura, e importarla due volte raddoppierebbe il fatturato del
 * mese. Non il nome del file: lo SdI ne genera uno diverso a ogni scarico.
 */
export const invoiceKey = (i: Pick<ParsedInvoice, 'supplier' | 'number' | 'issuedOn' | 'docType'>) =>
  [i.supplier.vat ?? i.supplier.taxCode ?? i.supplier.name, i.docType, i.number, i.issuedOn]
    .join('|').toUpperCase()

/**
 * Quello che non torna dentro al documento stesso.
 *
 * Un file firmato dallo SdI può comunque contenere numeri incoerenti — succede,
 * e vale la pena vederlo all'import invece che tre mesi dopo in dichiarazione.
 */
export function invoiceWarnings(i: ParsedInvoice): string[] {
  const out: string[] = []
  const fromLines = r2(i.lines.reduce((s, l) => s + l.total, 0))

  /* §324 — la cassa previdenziale si **somma** alle righe, non si sottrae: il
     4% del professionista è imponibile, quindi `righe + cassa = imponibile`. Col
     segno sbagliato ogni parcella con la cassa risultava incoerente — la 3PR di
     Spaduzzi è 1.440 + 57,60 = 1.497,60 e torna al centesimo — e un avviso che
     sbaglia sui documenti corretti insegna a ignorarli tutti, che è il difetto
     già visto sul bollo. */
  if (i.lines.length && Math.abs(fromLines + i.fund - i.taxable) > 0.02) {
    out.push(`Le righe sommano ${fromLines.toFixed(2)}`
      + (i.fund ? ` più ${i.fund.toFixed(2)} di cassa` : '')
      + ` ma l'imponibile dichiarato è ${i.taxable.toFixed(2)}`)
  }
  /* Il bollo da 2 € può essere **a carico di chi emette** — dovuto all'erario ma
     non riaddebitato — e allora resta fuori dal totale del documento; oppure
     ribaltato al cliente, e allora ci sta dentro. Il tracciato non ha un campo
     che lo dica, quindi valgono entrambe: segnalare la prima come un errore
     riempiva di avvisi nove fatture corrette su undici col bollo, e un avviso
     che sbaglia nove volte su undici insegna a ignorarli tutti. */
  const senza = r2(i.taxable + i.tax - i.withholding)
  const con = r2(senza + i.stamp)
  if (!i.totalDerived && Math.abs(senza - i.total) > 0.02 && Math.abs(con - i.total) > 0.02) {
    out.push(`Totale dichiarato ${i.total.toFixed(2)}, dalla somma verrebbe ${senza.toFixed(2)}`
      + (i.stamp ? ` (o ${con.toFixed(2)} col bollo riaddebitato)` : ''))
  }
  for (const v of i.vat) {
    if (v.rate === 0 && !v.natura) out.push('Aliquota zero senza codice natura: l\'IVA non spiega perché manca')
    const calc = r2(v.taxable * v.rate / 100)
    if (v.rate > 0 && Math.abs(calc - v.tax) > 0.02) {
      out.push(`Al ${v.rate}% su ${v.taxable.toFixed(2)} l'imposta sarebbe ${calc.toFixed(2)}, non ${v.tax.toFixed(2)}`)
    }
  }
  if (i.installments.length) {
    const sum = r2(i.installments.reduce((s, x) => s + x.amount, 0))
    if (Math.abs(sum - i.total) > 0.02) {
      out.push(`Le rate sommano ${sum.toFixed(2)} contro un totale di ${i.total.toFixed(2)}`)
    }
  }
  if (!i.dueDate) out.push('Nessuna data di scadenza: lo scaduto non si può calcolare')
  /* §323 — Una nota che non dice cosa rettifica.
     Il tracciato non obbliga a compilare `DatiFattureCollegate`, ma senza quel
     campo la nota è un importo che gira per l'archivio senza un posto: non si sa
     quale fattura smetta di essere un credito, e quel credito resta a gonfiare
     lo scaduto finché qualcuno non se ne ricorda. Vale per il credito e per il
     debito: una nota di debito che non dice cosa integra è la stessa cosa. */
  const kind = docKind(i.docType)
  if ((kind === 'nota_credito' || kind === 'nota_debito') && !i.related.length) {
    out.push(`${DOC_KIND_LABEL[kind]} senza il riferimento al documento che rettifica: `
      + 'quale fattura tocchi va deciso a mano')
  }
  return out
}
