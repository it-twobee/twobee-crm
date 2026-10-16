/* §477 — La sfida LinkedIn del team: le regole pure.
   Esegui il gate: npx tsx lib/linkedin.check.ts

   Il CSV lo scrive l'estensione (`public/estensione-linkedin/`) dal profilo di
   chi carica; l'identità la dà il login dell'OS, non il file. */

/** Le colonne del CSV, nell'ordine in cui le scrive l'estensione. */
export const COLONNE = ['post_urn', 'url', 'reazioni', 'commenti', 'diffusioni', 'impression', 'testo'] as const
const OBBLIGATORIE = ['post_urn', 'reazioni', 'commenti', 'impression'] as const

export const MAX_CARATTERI = 400_000
export const MAX_RIGHE = 500
export const MAX_TESTO = 280

const URN_RE = /^urn:li:(activity|share|ugcPost):(\d{15,22})$/

/**
 * Quando è uscito il post, dall'ID: i primi 41 bit sono i millisecondi.
 * LinkedIn nella pagina scrive «3 sett.», non una data: l'ID invece è esatto,
 * e non si può falsificare senza falsificare il post.
 */
export function msDaUrn(urn: string): number | null {
  const m = URN_RE.exec(urn.trim())
  if (!m) return null
  const ms = Number(BigInt(m[2]) >> BigInt(22))
  // 2015–2100: fuori da lì l'ID non è di LinkedIn, o non è un ID
  return ms > 1_420_070_400_000 && ms < 4_102_444_800_000 ? ms : null
}

/** Il mese del calendario di Roma: un post delle 00:30 del 1° è del mese nuovo. */
export function meseRoma(ms: number): string {
  const parti = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(ms))
  const v = (t: string) => parti.find(p => p.type === t)?.value ?? ''
  return `${v('year')}-${v('month')}`
}

export const meseCorrente = (ora = new Date()) => meseRoma(ora.getTime())

/** RFC 4180: virgolette, virgole e a capo dentro il testo del post. */
export function parseCsv(testo: string): string[][] {
  const righe: string[][] = []
  let riga: string[] = []
  let campo = ''
  let tra = false
  const t = testo.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (tra) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') tra = false
      else campo += c
    } else if (c === '"') tra = true
    else if (c === ',') { riga.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      riga.push(campo); campo = ''
      if (riga.some(x => x.trim() !== '')) righe.push(riga)
      riga = []
    } else campo += c
  }
  riga.push(campo)
  if (riga.some(x => x.trim() !== '')) righe.push(riga)
  return righe
}

export type RigaPost = {
  post_urn: string
  url: string
  mese: string
  published_at: string
  reazioni: number
  commenti: number
  diffusioni: number | null
  impression: number | null
  testo: string
}

export type LetturaCsv =
  | { ok: false; errore: string }
  | { ok: true; righe: RigaPost[]; fuoriMese: number; scartate: string[] }

/** Una cella vuota è «non letto» (`null`), mai zero. */
function intero(v: string | undefined): number | null | 'errore' {
  const s = (v ?? '').trim()
  if (s === '') return null
  return /^\d{1,10}$/.test(s) ? Number(s) : 'errore'
}

/**
 * La regola del mese sta qui, ed è l'unica porta della scrittura: entrano
 * solo i post **pubblicati nel mese in corso** (ora di Roma). Un mese chiuso
 * non si aggiorna più — la classifica di ottobre è quella del 31 ottobre, e
 * chi carica il 5 novembre non si porta dietro i like dei primi di novembre.
 */
export function leggiCsvSfida(testo: string, ora = new Date()): LetturaCsv {
  if (testo.length > MAX_CARATTERI) return { ok: false, errore: 'Il file è troppo grande: non è il CSV dell\'estensione.' }
  const righe = parseCsv(testo)
  if (righe.length === 0) return { ok: false, errore: 'Il file è vuoto.' }
  const intest = righe[0].map(h => h.trim().toLowerCase())
  const mancano = OBBLIGATORIE.filter(c => !intest.includes(c))
  if (mancano.length) return { ok: false, errore: `Non è il CSV dell'estensione: mancano le colonne ${mancano.join(', ')}.` }
  if (righe.length - 1 > MAX_RIGHE) return { ok: false, errore: `Troppe righe (${righe.length - 1}): il massimo è ${MAX_RIGHE}.` }

  const col = (r: string[], nome: (typeof COLONNE)[number]) => {
    const i = intest.indexOf(nome)
    return i < 0 ? undefined : r[i]
  }
  const mese = meseCorrente(ora)
  const perUrn = new Map<string, RigaPost>()
  const scartate: string[] = []
  let fuoriMese = 0

  righe.slice(1).forEach((r, i) => {
    const n = i + 2
    const urn = (col(r, 'post_urn') ?? '').trim()
    const ms = msDaUrn(urn)
    if (ms === null) { scartate.push(`riga ${n}: «${urn.slice(0, 40)}» non è un post LinkedIn`); return }
    const reazioni = intero(col(r, 'reazioni'))
    const commenti = intero(col(r, 'commenti'))
    const diffusioni = intero(col(r, 'diffusioni'))
    const impression = intero(col(r, 'impression'))
    if (reazioni === 'errore' || commenti === 'errore' || diffusioni === 'errore' || impression === 'errore') {
      scartate.push(`riga ${n}: un conteggio non è un numero intero`); return
    }
    if (reazioni === null || commenti === null) { scartate.push(`riga ${n}: mancano reazioni o commenti`); return }
    const suo = meseRoma(ms)
    if (suo !== mese) { fuoriMese++; return }
    const url = (col(r, 'url') ?? '').trim()
    perUrn.set(urn, {
      post_urn: urn,
      url: /^https:\/\/www\.linkedin\.com\/[^\s"<>]*$/.test(url) ? url : `https://www.linkedin.com/feed/update/${urn}/`,
      mese: suo,
      published_at: new Date(ms).toISOString(),
      reazioni, commenti, diffusioni, impression,
      // l'apostrofo davanti a = + - @ è dell'estensione, contro le formule di Excel
      testo: (col(r, 'testo') ?? '').replace(/\s+/g, ' ').trim().replace(/^'(?=[=+\-@])/, '').slice(0, MAX_TESTO),
    })
  })
  return { ok: true, righe: Array.from(perUrn.values()), fuoriMese, scartate }
}

export type PostSfida = {
  post_urn: string
  url: string
  published_at: string
  testo: string
  reazioni: number
  commenti: number
  diffusioni: number | null
  impression: number | null
  updated_at: string
  profile_id: string
  autore: string
  avatar?: string | null
}

export type RigaClassifica = {
  profile_id: string
  autore: string
  avatar: string | null
  post: number
  reazioni: number
  commenti: number
  impression: number
  /** almeno un post senza impression lette: il totale è una soglia, non il dato */
  impressionParziali: boolean
  ultimoCaricamento: string
}

export type Criterio = 'impression' | 'reazioni' | 'commenti' | 'post'
export const CRITERI: Criterio[] = ['impression', 'reazioni', 'commenti', 'post']

export function classifica(posts: PostSfida[], criterio: Criterio = 'impression'): RigaClassifica[] {
  const per = new Map<string, RigaClassifica>()
  for (const p of posts) {
    const r = per.get(p.profile_id) ?? {
      profile_id: p.profile_id, autore: p.autore, avatar: p.avatar ?? null, post: 0, reazioni: 0, commenti: 0,
      impression: 0, impressionParziali: false, ultimoCaricamento: p.updated_at,
    }
    r.post++
    r.reazioni += p.reazioni
    r.commenti += p.commenti
    if (p.impression === null) r.impressionParziali = true
    else r.impression += p.impression
    if (p.updated_at > r.ultimoCaricamento) r.ultimoCaricamento = p.updated_at
    per.set(p.profile_id, r)
  }
  return Array.from(per.values()).sort((a, b) =>
    b[criterio] - a[criterio] || b.impression - a.impression || b.reazioni - a.reazioni || a.autore.localeCompare(b.autore, 'it'))
}

export function ordinaPost(posts: PostSfida[], criterio: Criterio = 'impression'): PostSfida[] {
  const v = (p: PostSfida) => criterio === 'post' ? Date.parse(p.published_at) : (p[criterio] ?? -1)
  return [...posts].sort((a, b) => v(b) - v(a) || Date.parse(b.published_at) - Date.parse(a.published_at))
}

/** Il giorno di Roma, «2026-10-16». */
export const giornoRoma = (ora = new Date()) => ora.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })

/**
 * Quanti giorni mancano alla chiusura: 0 è l'ultimo giorno, `null` un mese
 * chiuso (o futuro). Dalle stringhe, quindi niente fuso.
 */
export function giorniAllaChiusura(mese: string, oggi: string): number | null {
  if (oggi.slice(0, 7) !== mese) return null
  const [a, m] = mese.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return ultimo - Number(oggi.slice(8, 10))
}

/** L'ultimo giorno del mese, «2026-10-31». */
export function ultimoGiorno(mese: string): string {
  const [a, m] = mese.split('-').map(Number)
  return `${mese}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`
}

export type Distacco =
  | { tipo: 'solo' }
  | { tipo: 'vantaggio'; su: string; di: number }
  | { tipo: 'insegue'; chi: string; di: number }

/**
 * Il distacco, per il criterio della classifica: chi è primo vede il vantaggio
 * sul secondo, gli altri quanto manca per superare chi hanno davanti (un
 * pareggio non è un sorpasso: serve uno in più).
 */
export function distacco(righe: RigaClassifica[], i: number, criterio: Criterio): Distacco {
  const v = (r: RigaClassifica) => r[criterio]
  if (i === 0) return righe.length < 2 ? { tipo: 'solo' } : { tipo: 'vantaggio', su: righe[1].autore, di: v(righe[0]) - v(righe[1]) }
  return { tipo: 'insegue', chi: righe[i - 1].autore, di: v(righe[i - 1]) - v(righe[i]) + 1 }
}
