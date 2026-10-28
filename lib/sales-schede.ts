/**
 * §494 — il foglio dei lead ha più schede, una per modulo Meta.
 *
 * Meta scrive ogni modulo in una scheda sua: «Modulo 1 - Lancio» è la prima
 * campagna, «Modulo 2 - IA» l'inserzione sull'intelligenza artificiale. Un
 * lead della seconda è un lead come gli altri, e il giro che leggeva solo la
 * `gid=0` non lo vedeva: arrivava sul foglio e nel tool no, senza un errore —
 * il modo peggiore di perdere un contatto, perché nessuno sa di doverlo cercare.
 *
 * `SALES_SHEET_CSV_URL` adesso è un **elenco**: voci separate da `;` o a capo,
 * ognuna `Etichetta|indirizzo CSV`. Una voce sola senza etichetta è la
 * configurazione di prima e continua a valere.
 *
 * Qui dentro non c'è rete: testo in, schede e confronti out.
 * Gate: `npx tsx lib/sales-schede.check.ts`.
 */

export type Scheda = {
  /** il nome con cui la scheda compare nel riepilogo e nella provenienza del lead */
  etichetta: string
  /** l'indirizzo CSV della scheda: `…/d/<ID>/export?format=csv&gid=<GID>` */
  url: string
  /** documento e scheda, se l'indirizzo è di Google: servono al ritorno */
  foglio: { id: string; gid: number } | null
}

/** `…/d/<ID>/export?format=csv&gid=<GID>` → id e gid */
export function foglioDaUrl(url: string): { id: string; gid: number } | null {
  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1]
  if (!id) return null
  const gid = Number(url.match(/[?&#]gid=(\d+)/)?.[1] ?? 0)
  return { id, gid: Number.isFinite(gid) ? gid : 0 }
}

/**
 * Dalla configurazione alle schede. Il `|` separa perché nell'indirizzo non
 * c'è mai, mentre `=` e `&` sì; il `;` separa le voci per lo stesso motivo,
 * e perché in Coolify una variabile su una riga sola è quella che si legge.
 *
 * Due voci con lo stesso indirizzo sono una: leggere due volte la stessa
 * scheda non fa danni (il secondo giro trova tutto già dentro) ma il
 * riepilogo conterebbe ogni lead due volte.
 */
export function schedeDa(config: string | null | undefined): Scheda[] {
  const out: Scheda[] = []
  for (const voce of (config ?? '').split(/[;\n]/)) {
    const t = voce.trim()
    if (!t) continue
    const sbarra = t.indexOf('|')
    const url = (sbarra >= 0 ? t.slice(sbarra + 1) : t).trim()
    if (!url || out.some(s => s.url === url)) continue
    const foglio = foglioDaUrl(url)
    const etichetta = (sbarra >= 0 ? t.slice(0, sbarra) : '').trim()
      || (foglio ? `Scheda ${foglio.gid}` : 'Foglio')
    out.push({ etichetta, url, foglio })
  }
  return out
}

/**
 * Le schede che il documento ha davvero, lette dalla pagina pubblica
 * `htmlview` di Google — la stessa condivisione «chiunque abbia il link» che
 * serve all'ingresso, quindi niente chiave in più.
 *
 * Serve a una domanda sola: **c'è una scheda che il giro non legge?** Il
 * giorno in cui Meta apre un modulo nuovo, la scheda nasce sul foglio e
 * nessuno pensa a Coolify. La pagina non è un'interfaccia documentata: se
 * Google ne cambia la forma, qui torna un elenco vuoto e il Controllo dice
 * «non so», non «tutto a posto».
 */
export function schedeDaHtml(html: string): { nome: string; gid: number }[] {
  const out: { nome: string; gid: number }[] = []
  const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(-?\d+)"/g
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const nome = m[1].replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\(.)/g, '$1')
    const gid = Number(m[2])
    if (!out.some(s => s.gid === gid)) out.push({ nome, gid })
  }
  return out
}

/** quello che il Controllo sa di una scheda, letto adesso dal foglio */
export type StatoScheda = {
  etichetta: string
  /** righe nella scheda, intestazione esclusa */
  righe: number
  /** prove di Meta e righe senza un nome */
  scartati: number
  /** lead veri nella scheda */
  lead: number
  /** di questi, quanti sono già nel tool */
  nelTool: number
  /** eliminati a mano (§378): stanno sul foglio e non devono rientrare */
  eliminati: number
  /** lead della scheda che non sono entrati: il numero che deve fare zero */
  mancanti: number
  /** la data dell'ultimo lead arrivato sulla scheda, come la scrive Meta */
  ultimo: string | null
  /** colonne che il giro sa leggere e questa scheda non ha (§494) */
  assenti: string[]
  errore?: string
}

/** le schede del documento che nessuna voce della configurazione legge */
export function schedeNonLette(
  schede: Scheda[],
  nelDocumento: Map<string, { nome: string; gid: number }[]>,
): { nome: string; gid: number }[] {
  const out: { nome: string; gid: number }[] = []
  for (const [id, tutte] of Array.from(nelDocumento.entries())) {
    const lette = new Set(schede.filter(s => s.foglio?.id === id).map(s => s.foglio!.gid))
    for (const t of tutte) if (!lette.has(t.gid)) out.push(t)
  }
  return out
}
