import { isAdminRole, isWorkspaceRole } from '@/lib/permissions'

/* La lavagna del team: regole pure, condivise da azioni, rotte e pagina.
   L'anonimato si decide qui: `costruisciStato` è l'unico punto in cui le righe
   del database diventano quello che arriva al browser, e l'autore non lo
   attraversa — esce solo «è mio» (vedi docs/lavagna.md). */

export const LAVAGNA = { larghezza: 4000, altezza: 2600 } as const

export const COLORI_NOTA = ['giallo', 'rosa', 'verde', 'azzurro', 'arancio', 'lilla'] as const
export type ColoreNota = (typeof COLORI_NOTA)[number]

export const EMOJI = ['😂', '🔥', '❤️', '👏', '💀', '🤯'] as const
export type Emoji = (typeof EMOJI)[number]

export const TIPI_ELEMENTO = ['nota', 'sticker', 'foto', 'link'] as const
export type TipoElemento = (typeof TIPI_ELEMENTO)[number]

export const TIPI_MEDIA = ['sticker', 'foto'] as const
export type TipoMedia = (typeof TIPI_MEDIA)[number]

export const LIMITI = {
  testo: 280,
  nomeMedia: 40,
  url: 500,
  scalaMin: 0.4,
  scalaMax: 2.5,
  rotazione: 30,
  elementi: 400,
  /** byte del file che arriva, prima della ricodifica */
  byteFoto: 15 * 1024 * 1024,
  byteSticker: 5 * 1024 * 1024,
  /** lato lungo dopo la ricodifica */
  latoFoto: 1600,
  latoMini: 480,
  latoSticker: 512,
} as const

/** Chi entra: lo staff interno attivo. Il portale cliente no, mai. */
export function canSeeLavagna(p: { role?: string | null; app_role?: string | null; is_active?: boolean | null } | null): boolean {
  if (!p || p.is_active === false) return false
  if (p.role === 'admin') return isAdminRole(p.app_role)
  if (p.role === 'team') return isWorkspaceRole(p.app_role) || p.app_role === 'viewer'
  return false
}

/** Chi attacca: come sopra, tranne chi ha un account in sola lettura. */
export function canWriteLavagna(p: Parameters<typeof canSeeLavagna>[0]): boolean {
  return canSeeLavagna(p) && p?.app_role !== 'viewer'
}

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export const isColore = (v: unknown): v is ColoreNota => typeof v === 'string' && (COLORI_NOTA as readonly string[]).includes(v)
export const isEmoji = (v: unknown): v is Emoji => typeof v === 'string' && (EMOJI as readonly string[]).includes(v)
export const isTipoMedia = (v: unknown): v is TipoMedia => v === 'sticker' || v === 'foto'

/** Testo pulito: spazi ai bordi via, righe vuote in fila ridotte, al massimo `max` caratteri. */
export function pulisciTesto(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return Array.from(v.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()).slice(0, max).join('')
}

/**
 * Un link si apre in una scheda nuova da chiunque passi: solo http e https,
 * niente credenziali dentro, e un host che sembri un host. «twobee.it» senza
 * schema diventa https.
 */
export function normalizzaUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (!s || s.length > LIMITI.url) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.username || u.password) return null
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname.replace(/^www\./i, '')) && !/^\[?[0-9a-f:.]+\]?$/i.test(u.hostname)) return null
  return u.toString().length <= LIMITI.url ? u.toString() : null
}

export function dominio(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, '') } catch { return url }
}

const limita = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const numero = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export type Posizione = { x: number; y: number; rotazione: number; scala: number }

/** Le coordinate sono il centro dell'elemento, dentro la lavagna. */
export function posizioneValida(p: Partial<Record<keyof Posizione, unknown>>, prima?: Posizione): Posizione {
  return {
    x: Math.round(limita(numero(p.x, prima?.x ?? LAVAGNA.larghezza / 2), 0, LAVAGNA.larghezza)),
    y: Math.round(limita(numero(p.y, prima?.y ?? LAVAGNA.altezza / 2), 0, LAVAGNA.altezza)),
    rotazione: Math.round(limita(numero(p.rotazione, prima?.rotazione ?? 0), -LIMITI.rotazione, LIMITI.rotazione) * 10) / 10,
    scala: Math.round(limita(numero(p.scala, prima?.scala ?? 1), LIMITI.scalaMin, LIMITI.scalaMax) * 100) / 100,
  }
}

/** Un po' storto, come si attacca un foglio di fretta. */
export function rotazioneCasuale(caso: () => number = Math.random): number {
  return Math.round((caso() * 12 - 6) * 10) / 10
}

const ROMA = 'Europe/Rome'
const giornoRoma = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ROMA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/**
 * Il «quando» arriva al browser solo come giorno: l'ora esatta, accanto alla
 * presenza di chi era dentro in quel minuto, basterebbe a indovinare l'autore.
 */
export function quando(iso: string, ora: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const g = giornoRoma(d)
  if (g === giornoRoma(ora)) return 'oggi'
  if (g === giornoRoma(new Date(ora.getTime() - 86_400_000))) return 'ieri'
  const stessoAnno = g.slice(0, 4) === giornoRoma(ora).slice(0, 4)
  return new Intl.DateTimeFormat('it-IT', { timeZone: ROMA, day: 'numeric', month: 'short', ...(stessoAnno ? {} : { year: 'numeric' }) }).format(d)
}

/** L'ingombro di un elemento in punti della lavagna, prima della sua scala. */
export function ingombro(el: { tipo: TipoElemento; testo: string; media: { larghezza: number; altezza: number } | null }): { w: number; h: number } {
  const dentro = (box: number, boxH = box) => {
    const w = Math.max(1, el.media?.larghezza ?? box)
    const h = Math.max(1, el.media?.altezza ?? box)
    const k = Math.min(box / w, boxH / h)
    return { w: Math.round(w * k), h: Math.round(h * k) }
  }
  switch (el.tipo) {
    case 'nota': return { w: 220, h: 220 }
    case 'sticker': return dentro(200)
    case 'foto': {
      const img = dentro(250, 300)
      return { w: img.w + 24, h: img.h + 24 + (el.testo ? 44 : 20) }
    }
    case 'link': return { w: 280, h: el.testo ? 128 : 88 }
  }
}

/** Il post-it scrive più piccolo quanto più c'è da dire. */
export function corpoNota(testo: string): number {
  const n = testo.length
  return n <= 30 ? 36 : n <= 70 ? 30 : n <= 140 ? 24 : n <= 210 ? 20 : 18
}

export function mediaUrl(id: string, mini = false): string {
  return `/api/lavagna/media/${id}${mini ? '?v=mini' : ''}`
}

// ── Quello che arriva al browser ─────────────────────────────────────────────

export type MediaLavagna = {
  id: string
  tipo: TipoMedia
  nome: string
  larghezza: number
  altezza: number
  mio: boolean
  usi: number
  quando: string
}

export type ElementoLavagna = Posizione & {
  id: string
  tipo: TipoElemento
  z: number
  testo: string
  url: string | null
  colore: ColoreNota
  media: { id: string; larghezza: number; altezza: number } | null
  mio: boolean
  quando: string
  reazioni: Partial<Record<Emoji, number>>
  mie: Emoji[]
}

export type StatoLavagna = { elementi: ElementoLavagna[]; sticker: MediaLavagna[]; foto: MediaLavagna[] }

// ── Quello che sta nel database ──────────────────────────────────────────────

export type RigaMedia = {
  id: string; tipo: string; nome: string
  larghezza: number; altezza: number; autore: string; created_at: string
}
export type RigaElemento = {
  id: string; tipo: string; media_id: string | null; testo: string; url: string | null; colore: string
  x: number; y: number; rotazione: number; scala: number; z: number; autore: string; created_at: string
}
export type RigaReazione = { elemento_id: string; emoji: string; autore: string }

export function mediaDaRiga(r: RigaMedia, firma: string, usi: number, ora: Date): MediaLavagna {
  return {
    id: r.id,
    tipo: isTipoMedia(r.tipo) ? r.tipo : 'foto',
    nome: r.nome,
    larghezza: r.larghezza,
    altezza: r.altezza,
    mio: r.autore === firma,
    usi,
    quando: quando(r.created_at, ora),
  }
}

/**
 * Le righe diventano la lavagna di chi guarda. L'autore resta qui: esce solo
 * `mio`, e solo per le cose di chi chiede. Nessun campo del risultato porta
 * la firma di qualcuno — lo controlla `lib/lavagna.check.ts`.
 */
export function costruisciStato(
  input: { elementi: RigaElemento[]; media: RigaMedia[]; reazioni: RigaReazione[]; usi: Map<string, number> },
  firma: string,
  ora: Date = new Date(),
): StatoLavagna {
  const media = new Map(input.media.map(m => [m.id, m]))
  const conteggi = new Map<string, Partial<Record<Emoji, number>>>()
  const mie = new Map<string, Emoji[]>()
  for (const r of input.reazioni) {
    if (!isEmoji(r.emoji)) continue
    const c = conteggi.get(r.elemento_id) ?? {}
    c[r.emoji] = (c[r.emoji] ?? 0) + 1
    conteggi.set(r.elemento_id, c)
    if (r.autore === firma) mie.set(r.elemento_id, [...(mie.get(r.elemento_id) ?? []), r.emoji])
  }

  const elementi: ElementoLavagna[] = []
  for (const r of input.elementi) {
    const tipo = (TIPI_ELEMENTO as readonly string[]).includes(r.tipo) ? (r.tipo as TipoElemento) : null
    if (!tipo) continue
    const m = r.media_id ? media.get(r.media_id) : undefined
    // un media sparito porta via il suo posto sulla lavagna: niente riquadri vuoti
    if ((tipo === 'sticker' || tipo === 'foto') && !m) continue
    elementi.push({
      id: r.id,
      tipo,
      ...posizioneValida(r),
      z: r.z,
      testo: r.testo ?? '',
      url: tipo === 'link' ? r.url : null,
      colore: isColore(r.colore) ? r.colore : 'giallo',
      media: m ? { id: m.id, larghezza: m.larghezza, altezza: m.altezza } : null,
      mio: r.autore === firma,
      quando: quando(r.created_at, ora),
      reazioni: conteggi.get(r.id) ?? {},
      mie: mie.get(r.id) ?? [],
    })
  }
  elementi.sort((a, b) => a.z - b.z)

  const galleria = (tipo: TipoMedia) => input.media
    .filter(m => m.tipo === tipo)
    .map(m => mediaDaRiga(m, firma, input.usi.get(m.id) ?? 0, ora))
  return { elementi, sticker: galleria('sticker'), foto: galleria('foto') }
}

export const SEGNAPOSTO_NOTA = [
  'Confessa qualcosa…',
  'Chi ha finito il caffè?',
  'Il meeting che poteva essere una mail…',
  'Una dedica anonima a un collega',
  'La frase della settimana',
  'Idea geniale (o quasi)',
] as const
