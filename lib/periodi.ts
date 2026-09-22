/**
 * §388 — i periodi di un progetto: quali esistono, come si chiamano, quando aprirli.
 *
 * Qui non c'è rete e non c'è database: entrano una data e una forma, escono
 * i periodi. È il motivo per cui il gate può provarlo su vent'anni di
 * calendario senza toccare niente — e serve, perché gli unici errori che
 * questo modulo può fare sono quelli che si vedono a novembre.
 *
 * **I trimestri non sono quelli del calendario.** Sono quelli della
 * stagione commerciale, e la differenza non è un dettaglio: per chi fa
 * advertising il blocco che conta va dal rientro al Natale, quattro mesi,
 * mentre luglio e agosto sono due mesi corti in cui non si lancia niente.
 * Scriverli solari avrebbe spezzato in due la stagione più importante
 * dell'anno — ed è anche il motivo per cui le nove corsie in archivio si
 * chiamano tutte «Set-Dic» e nessuna si chiama «Q3».
 *
 *   Q1  gen feb mar
 *   Q2  apr mag giu
 *   Q3  lug ago            ← corto: è l'estate
 *   Q4  set ott nov dic    ← lungo: è la stagione
 *
 * Gate: `npx tsx lib/periodi.check.ts`.
 */

export type Forma = 'quarter' | 'month' | 'none'

export type Periodo = {
  /** la chiave con cui si riconosce un periodo già aperto: `2026-Q4`, `2026-09` */
  chiave: string
  /** come si chiama a video: «Q4 2026», «Settembre 2026» */
  etichetta: string
  /** primo e ultimo giorno, inclusi */
  dal: string
  al: string
}

const MESI = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

/** i quattro blocchi: primo mese e ultimo mese, 1-based e inclusi */
export const TRIMESTRI: [number, number][] = [
  [1, 3],   // Q1
  [4, 6],   // Q2
  [7, 8],   // Q3 — due mesi
  [9, 12],  // Q4 — quattro
]

const due = (n: number) => String(n).padStart(2, '0')
const iso = (a: number, m: number, g: number) => `${a}-${due(m)}-${due(g)}`
/** l'ultimo giorno del mese, senza fidarsi di una tabella: il 29 febbraio esiste */
export const ultimoGiorno = (anno: number, mese: number) => new Date(anno, mese, 0).getDate()

/**
 * La forma di un servizio, date le righe di catalogo del suo `service_type`.
 *
 * Si cerca per tipo **e** sottotipo: la Digitalizzazione ha tre righe e
 * potrebbero non volere lo stesso ritmo. Senza riga, `none` — un servizio
 * che il catalogo non conosce non ha periodi, e inventarglieli vorrebbe dire
 * aprire corsie su un progetto che non le aspetta.
 *
 * Sta qui e non dentro chi apre i periodi perché la domanda se la fanno in
 * due: il motore, per sapere cosa creare, e la modale «nuova workstream»,
 * per sapere **cosa proporre** (§396).
 */
export function formaDiServizio(
  righe: { service_subtype?: string | null; period_shape?: Forma | null }[],
  sottotipo: string | null,
): Forma {
  const riga = righe.find(r => (r.service_subtype ?? null) === (sottotipo ?? null)) ?? righe[0]
  return riga?.period_shape ?? 'none'
}

/** in che trimestre commerciale cade questo mese (1..4) */
export function trimestreDelMese(mese: number): number {
  const i = TRIMESTRI.findIndex(([a, b]) => mese >= a && mese <= b)
  if (i < 0) throw new Error(`Mese fuori intervallo: ${mese}`)
  return i + 1
}

export function trimestre(anno: number, q: number): Periodo {
  const [da, a] = TRIMESTRI[q - 1] ?? []
  if (!da) throw new Error(`Trimestre inesistente: ${q}`)
  return {
    chiave: `${anno}-Q${q}`,
    etichetta: `Q${q} ${anno}`,
    dal: iso(anno, da, 1),
    al: iso(anno, a, ultimoGiorno(anno, a)),
  }
}

export function mese(anno: number, m: number): Periodo {
  if (m < 1 || m > 12) throw new Error(`Mese inesistente: ${m}`)
  return {
    chiave: `${anno}-${due(m)}`,
    etichetta: `${MESI[m]} ${anno}`,
    dal: iso(anno, m, 1),
    al: iso(anno, m, ultimoGiorno(anno, m)),
  }
}

/** il periodo in cui cade una data, secondo la forma */
export function periodoDi(giorno: string, forma: Forma): Periodo | null {
  if (forma === 'none') return null
  const [a, m] = giorno.split('-').map(Number)
  if (!a || !m) throw new Error(`Data illeggibile: ${giorno}`)
  return forma === 'quarter' ? trimestre(a, trimestreDelMese(m)) : mese(a, m)
}

/** il periodo successivo a questo */
export function dopo(p: Periodo, forma: Forma): Periodo {
  if (forma === 'month') {
    const [a, m] = p.chiave.split('-').map(Number)
    return m === 12 ? mese(a + 1, 1) : mese(a, m + 1)
  }
  const [a, q] = [Number(p.chiave.slice(0, 4)), Number(p.chiave.slice(6))]
  return q === 4 ? trimestre(a + 1, 1) : trimestre(a, q + 1)
}

/**
 * I periodi che devono esistere fra oggi e l'orizzonte, quello in corso
 * compreso.
 *
 * L'orizzonte è in giorni e non in periodi, ed è una scelta: «due trimestri
 * avanti» a fine dicembre vuol dire vedere fino a giugno, a inizio gennaio
 * fino a marzo — la stessa impostazione darebbe due risultati lontani mesi.
 * In giorni la finestra è sempre quella.
 */
export function periodiDaAprire(oggi: string, forma: Forma, orizzonteGiorni: number): Periodo[] {
  if (forma === 'none') return []
  const limite = new Date(`${oggi}T00:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() + orizzonteGiorni)
  const fine = limite.toISOString().slice(0, 10)

  const out: Periodo[] = []
  let p = periodoDi(oggi, forma)!
  /* Si esce quando il periodo **comincia** dopo l'orizzonte: uno che inizia
     dentro la finestra si apre tutto, anche se finisce fuori. Tagliarlo a
     metà vorrebbe dire un trimestre che compare a pezzi. */
  while (p.dal <= fine) {
    out.push(p)
    p = dopo(p, forma)
    // cintura: vent'anni di periodi vuol dire che qualcuno ha passato una data sbagliata
    if (out.length > 240) throw new Error('Troppi periodi: controlla la data di partenza')
  }
  return out
}

// ── le ricorrenze commerciali ────────────────────────────────────────────

/**
 * La data di un evento commerciale in un dato anno.
 *
 * Tre famiglie, e la quarta è l'onestà: **i saldi non si calcolano**. In
 * Italia le date le fissano le Regioni e cambiano ogni anno; una formula
 * che li mettesse al 5 gennaio sarebbe giusta qualche volta e sbagliata
 * senza dirlo tutte le altre. Per quelli la regola è `manuale` e la
 * risposta è `null`, che a video diventa «data da confermare».
 *
 *   fisso:12-25            Natale
 *   ultimo:5:11            ultimo venerdì di novembre — Black Friday
 *   ultimo:5:11+3          il lunedì dopo — Cyber Monday
 *   nesimo:7:2:5           seconda domenica di maggio — Festa della mamma
 *   pasqua / pasqua+1      Pasqua e Pasquetta
 *   manuale                la scrive una persona
 *
 * Lo scostamento `+N` / `-N` vale per **tutte** le regole e non solo per la
 * Pasqua: il Cyber Monday è il Black Friday più tre giorni, e senza
 * scostamento andrebbe scritto a mano ogni anno — cioè andrebbe sbagliato
 * l'anno che nessuno se ne ricorda.
 *
 * I giorni della settimana sono 1=lunedì … 7=domenica, come ISO: `getDay()`
 * mette la domenica a zero, ed è la trappola in cui si cade una volta sola
 * ma la si scopre di novembre.
 */
export function dataEvento(regola: string, anno: number): string | null {
  const grezza = regola.trim()
  if (grezza === 'manuale') return null

  /* Lo scostamento si stacca prima — vale per tutte le regole, e tenerlo
     dentro ognuna vorrebbe dire scriverlo quattro volte e dimenticarlo in
     una — ma la grammatica dev'essere **ancorata**, non indovinata: con un
     `(.*?)([+-]\d+)$` goloso al contrario, il `-25` di `fisso:12-25`
     diventa uno scostamento e Natale finisce a febbraio. */
  const BASE = /^(fisso:\d{1,2}-\d{1,2}|ultimo:[1-7]:\d{1,2}|nesimo:[1-7]:[1-5]:\d{1,2}|pasqua)([+-]\d{1,3})?$/
  const pezzi = grezza.match(BASE)
  if (!pezzi) throw new Error(`Regola non riconosciuta: «${regola}»`)
  const r = pezzi[1]
  const scarto = pezzi[2] ? Number(pezzi[2]) : 0

  const base = (() => {
    let m = r.match(/^fisso:(\d{1,2})-(\d{1,2})$/)
    if (m) return iso(anno, Number(m[1]), Number(m[2]))

    m = r.match(/^ultimo:([1-7]):(\d{1,2})$/)
    if (m) {
      const [gs, mese_] = [Number(m[1]), Number(m[2])]
      for (let g = ultimoGiorno(anno, mese_); g >= 1; g--) {
        if (giornoIso(anno, mese_, g) === gs) return iso(anno, mese_, g)
      }
      return null
    }

    m = r.match(/^nesimo:([1-7]):([1-5]):(\d{1,2})$/)
    if (m) {
      const [gs, n, mese_] = [Number(m[1]), Number(m[2]), Number(m[3])]
      let visti = 0
      for (let g = 1; g <= ultimoGiorno(anno, mese_); g++) {
        if (giornoIso(anno, mese_, g) !== gs) continue
        if (++visti === n) return iso(anno, mese_, g)
      }
      /* Il quinto lunedì di un mese che ne ha quattro non esiste: `null`,
         non il quarto. Restituire il più vicino sarebbe una data buona che
         nessuno ha chiesto. */
      return null
    }

    // `BASE` ha già escluso tutto il resto: qui resta solo la Pasqua
    return pasqua(anno)
  })()

  if (base === null || scarto === 0) return base
  const d = new Date(`${base}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + scarto)
  return d.toISOString().slice(0, 10)
}

/** 1=lunedì … 7=domenica, in UTC: il fuso locale sposta la mezzanotte */
const giornoIso = (a: number, m: number, g: number) => {
  const d = new Date(Date.UTC(a, m - 1, g)).getUTCDay()
  return d === 0 ? 7 : d
}

/** Pasqua gregoriana, algoritmo anonimo: nessuna tabella da aggiornare nel 2031 */
export function pasqua(anno: number): string {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mese_ = Math.floor((h + l - 7 * m + 114) / 31)
  const giorno = ((h + l - 7 * m + 114) % 31) + 1
  return iso(anno, mese_, giorno)
}

/**
 * Quando si comincia a lavorare su un evento: la data meno l'anticipo.
 *
 * Il Black Friday non si prepara il Black Friday. È l'unico numero che
 * distingue una corsia utile da una che si apre il giorno in cui serviva
 * già chiusa.
 */
export function inizioLavoro(dataEvento: string, giorniAnticipo: number): string {
  const d = new Date(`${dataEvento}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - giorniAnticipo)
  return d.toISOString().slice(0, 10)
}
