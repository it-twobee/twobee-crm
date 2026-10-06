/**
 * §467 — Social: il calendario dei contenuti. Logica pura, la stessa per la
 * pagina, le azioni e le rotte dei media: una regola scritta due volte non è
 * una regola.
 *
 * Il «progetto social» esisteva già, ed è un progetto con
 * `service_type='social_media_management'`. Mancava il **contenuto**: oggi il
 * piano editoriale è un nome di task («Sviluppo PED Novembre») e i post non
 * sono da nessuna parte. Qui un contenuto è una riga con giorno (e ora, se
 * c'è), canali, formato, tema, testo, creatività e stato. Il mese non è
 * un'entità: il PED di novembre sono i contenuti di novembre.
 *
 * Le date sono stringhe `YYYY-MM-DD` e l'ora `HH:MM`, da muro a Roma: non si
 * passa mai da un `Date` locale, che su un server in UTC sposta il giorno.
 */
import { MATERIAL_MAX_BYTES, materialKind, previewKind, rejectMaterial } from '@/lib/portal/materials'
import { giornoDopo, grigliaMese } from '@/lib/calendario'

export const SOCIAL_SERVICE_TYPE = 'social_media_management'
/** L'indice della tab nella scheda cliente, come `PORTAL_TAB`. */
export const SOCIAL_TAB = 12

/* ── Vocabolari ─────────────────────────────────────────────────────────────
   Gli stessi elenchi dei CHECK della migration: `lib/social.check.ts` legge il
   file SQL e li confronta, così un canale aggiunto da una parte sola si vede. */

export const CANALI = {
  instagram: { label: 'Instagram', sigla: 'IG', host: ['instagram.com'], limite: 2200 },
  facebook: { label: 'Facebook', sigla: 'FB', host: ['facebook.com', 'fb.com', 'fb.watch'], limite: 63206 },
  tiktok: { label: 'TikTok', sigla: 'TT', host: ['tiktok.com'], limite: 2200 },
  linkedin: { label: 'LinkedIn', sigla: 'IN', host: ['linkedin.com', 'lnkd.in'], limite: 3000 },
  youtube: { label: 'YouTube', sigla: 'YT', host: ['youtube.com', 'youtu.be'], limite: 5000 },
  pinterest: { label: 'Pinterest', sigla: 'PIN', host: ['pinterest.com', 'pinterest.it', 'pin.it'], limite: 500 },
  threads: { label: 'Threads', sigla: 'TH', host: ['threads.net', 'threads.com'], limite: 500 },
  x: { label: 'X', sigla: 'X', host: ['x.com', 'twitter.com'], limite: 280 },
} as const
export type Canale = keyof typeof CANALI
export const CANALI_ELENCO = Object.keys(CANALI) as Canale[]

export const FORMATI = {
  post: 'Post', carosello: 'Carosello', reel: 'Reel', story: 'Story', video: 'Video', articolo: 'Articolo',
} as const
export type Formato = keyof typeof FORMATI
export const FORMATI_ELENCO = Object.keys(FORMATI) as Formato[]

/** Il ciclo di un contenuto. Il colore è un token: chip `text` su fondo `bg`. */
export const STATI = {
  bozza: { label: 'Bozza', text: 'text-text-secondary', bg: 'bg-surface-active' },
  in_lavorazione: { label: 'In lavorazione', text: 'text-info', bg: 'bg-info-dim' },
  pronto: { label: 'Pronto', text: 'text-accent', bg: 'bg-accent-dim' },
  programmato: { label: 'Programmato', text: 'text-gold-text', bg: 'bg-gold-dim' },
  pubblicato: { label: 'Pubblicato', text: 'text-success', bg: 'bg-success-dim' },
  annullato: { label: 'Annullato', text: 'text-error', bg: 'bg-error-dim' },
} as const
export type StatoSocial = keyof typeof STATI
export const STATI_ELENCO = Object.keys(STATI) as StatoSocial[]

export const isCanale = (v: unknown): v is Canale => typeof v === 'string' && v in CANALI
export const isFormato = (v: unknown): v is Formato => typeof v === 'string' && v in FORMATI
export const isStato = (v: unknown): v is StatoSocial => typeof v === 'string' && v in STATI

/** Chiuso: chi è uscito o non uscirà più non è lavoro da fare. */
export const isChiuso = (s: string) => s === 'pubblicato' || s === 'annullato'

export function isSocialProject(p: { service_type?: string | null } | null | undefined): boolean {
  return p?.service_type === SOCIAL_SERVICE_TYPE
}

/* ── Chi può fare cosa ──────────────────────────────────────────────────────
   §322 e §339: crea ed elimina chi governa i progetti (admin e manager). Chi ha
   il contenuto in carico lo modifica anche senza governo — testo, data,
   creatività, stato — perché la propria roba si tocca sempre. */

export function dirittiSocial(input: {
  governa: boolean
  userId: string
  contenuto?: { owner_id: string | null; created_by: string | null } | null
}) {
  const proprio = !!input.contenuto
    && (input.contenuto.owner_id === input.userId || input.contenuto.created_by === input.userId)
  return { crea: input.governa, modifica: input.governa || proprio, elimina: input.governa }
}

/* ── Validazione ────────────────────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** `YYYY-MM-DD` che esiste davvero: il 31 novembre no. */
export function isGiorno(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** `HH:MM`, 00:00–23:59. */
export function isOra(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}

/** I canali nell'ordine dell'elenco, senza doppioni. `null` = c'è qualcosa che non è un canale. */
export function normalizzaCanali(input: unknown): Canale[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  if (!input.every(isCanale)) return null
  const scelti = new Set(input as Canale[])
  return CANALI_ELENCO.filter(c => scelti.has(c))
}

export type ContenutoInput = {
  planned_date: string
  planned_time: string | null
  channels: Canale[]
  format: Formato
  title: string
  caption: string | null
  owner_id: string | null
  milestone_id: string | null
}

/** Quello che arriva dal browser, ripulito. Un errore detto in italiano, mai un'eccezione. */
export function parseContenuto(raw: unknown): { ok: true; value: ContenutoInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim() : ''
  if (!title) return { ok: false, error: 'Manca il tema del contenuto.' }
  if (title.length > 160) return { ok: false, error: 'Il tema supera i 160 caratteri: il testo va nella didascalia.' }
  if (!isGiorno(r.planned_date)) return { ok: false, error: 'La data non è valida.' }
  const time = r.planned_time === '' || r.planned_time == null ? null : r.planned_time
  if (time !== null && !isOra(time)) return { ok: false, error: 'L’ora non è valida.' }
  const channels = normalizzaCanali(r.channels)
  if (!channels) return { ok: false, error: 'Scegli almeno un canale.' }
  if (!isFormato(r.format)) return { ok: false, error: 'Scegli il formato.' }
  const caption = typeof r.caption === 'string' && r.caption.trim() ? r.caption.replace(/\s+$/, '') : null
  if (caption && caption.length > 5000) return { ok: false, error: 'La didascalia supera i 5000 caratteri.' }
  const owner = r.owner_id === '' || r.owner_id == null ? null : r.owner_id
  if (owner !== null && !isUuid(owner)) return { ok: false, error: 'Il responsabile non è valido.' }
  const milestone = r.milestone_id === '' || r.milestone_id == null ? null : r.milestone_id
  if (milestone !== null && !isUuid(milestone)) return { ok: false, error: 'La milestone non è valida.' }
  return {
    ok: true,
    value: {
      planned_date: r.planned_date as string, planned_time: time as string | null, channels,
      format: r.format, title, caption, owner_id: owner as string | null, milestone_id: milestone as string | null,
    },
  }
}

/**
 * Il link di un post pubblicato: solo https, e solo sul dominio del canale.
 * Un `javascript:` in un href è un bottone che esegue codice, e un link a un
 * altro sito messo al posto di quello di Instagram non si vede finché non si
 * clicca. `null` = va bene.
 */
export function validaLinkPost(canale: Canale, url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return `Manca il link del post su ${CANALI[canale].label}.`
  let u: URL
  try { u = new URL(url.trim()) } catch { return `Il link di ${CANALI[canale].label} non è un indirizzo.` }
  if (u.protocol !== 'https:') return `Il link di ${CANALI[canale].label} deve iniziare con https://.`
  if (url.trim().length > 2000) return `Il link di ${CANALI[canale].label} è troppo lungo.`
  const host = u.hostname.toLowerCase()
  const ammessi: readonly string[] = CANALI[canale].host
  if (!ammessi.some(h => host === h || host.endsWith(`.${h}`))) {
    return `Il link non è di ${CANALI[canale].label} (${ammessi.join(', ')}).`
  }
  return null
}

/** Serve un link per canale: tranne la story, che sparisce in un giorno. */
export const servonoLink = (format: string) => format !== 'story'

/**
 * Si può passare a questo stato? `null` = sì, altrimenti il motivo. Il database
 * ricontrolla la regola dei link (`social_guard_content`).
 */
export function puoPassareA(
  c: { format: string; channels: string[]; links: string[] },
  nuovo: StatoSocial,
): string | null {
  if (nuovo !== 'pubblicato' || !servonoLink(c.format)) return null
  const mancano = c.channels.filter(ch => !c.links.includes(ch))
  if (!mancano.length) return null
  return `Per segnarlo pubblicato serve il link del post su ${mancano.map(ch => isCanale(ch) ? CANALI[ch].label : ch).join(', ')}.`
}

/**
 * Cose da guardare, non errori: si salva lo stesso. Una didascalia lunga per X
 * si accorcia lì, e un carosello con una foto sola forse è un post.
 */
export function avvisi(
  c: { channels: string[]; format: string; caption: string | null },
  media: { kind: string }[],
): string[] {
  const out: string[] = []
  const lunghezza = c.caption?.length ?? 0
  for (const ch of c.channels) {
    if (!isCanale(ch)) continue
    if (lunghezza > CANALI[ch].limite) out.push(`La didascalia supera i ${CANALI[ch].limite.toLocaleString('it-IT')} caratteri di ${CANALI[ch].label}.`)
  }
  if (c.format === 'carosello' && media.length > 0 && media.length < 2) out.push('Un carosello con una sola creatività è un post.')
  if (c.format === 'carosello' && media.length > 20) out.push('Oltre 20 slide non entrano in un carosello.')
  if ((c.format === 'reel' || c.format === 'video') && media.length > 0 && !media.some(m => m.kind === 'video')) {
    out.push(`Un ${FORMATI[c.format as Formato].toLowerCase()} senza video: manca la clip.`)
  }
  return out
}

/* ── Mesi e giorni ──────────────────────────────────────────────────────── */

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

export const isMese = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
export const meseDi = (giorno: string) => giorno.slice(0, 7)

export function meseDopo(mese: string, n = 1): string {
  const [a, m] = mese.split('-').map(Number)
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

/** Il mese come intervallo di giorni, con la fine esclusa: `{ dal: '2026-11-01', al: '2026-12-01' }`. */
export const intervalloMese = (mese: string) => ({ dal: `${mese}-01`, al: `${meseDopo(mese)}-01` })

/** I 42 giorni della griglia del mese, da lunedì a domenica; la fine è esclusa. */
export function intervalloGriglia(mese: string) {
  const giorni = grigliaMese(`${mese}-01`)
  return { giorni, dal: giorni[0], al: giornoDopo(giorni[giorni.length - 1]) }
}

export function etichettaMese(mese: string): string {
  const [a, m] = mese.split('-').map(Number)
  return `${MESI[m - 1]} ${a}`
}

/** «gio 12 nov», dalla stringa: niente `Date` locale, quindi niente fuso. */
export function dataBreve(giorno: string): string {
  const d = new Date(`${giorno}T12:00:00Z`)
  return `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()].slice(0, 3)}`
}

/* ── Elenchi ────────────────────────────────────────────────────────────── */

type Ordinabile = { planned_date: string; planned_time: string | null; title: string }

/** Giorno, poi ora — chi non ha ora va in fondo alla giornata — poi tema. */
export function ordinaContenuti<T extends Ordinabile>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    a.planned_date.localeCompare(b.planned_date)
    || (a.planned_time ?? '99:99').localeCompare(b.planned_time ?? '99:99')
    || a.title.localeCompare(b.title, 'it'))
}

export function raggruppaPerGiorno<T extends Ordinabile>(lista: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const c of ordinaContenuti(lista)) out.set(c.planned_date, [...(out.get(c.planned_date) ?? []), c])
  return out
}

/** In ritardo: il giorno è passato e non è né uscito né annullato. */
export const inRitardo = (c: { planned_date: string; status: string }, oggi: string) =>
  c.planned_date < oggi && !isChiuso(c.status)

export type Riepilogo = { totale: number; perStato: Record<StatoSocial, number>; inRitardo: number }

/** I conteggi di un insieme di contenuti. Gli annullati non contano nel totale. */
export function riepilogo(lista: { planned_date: string; status: string }[], oggi: string): Riepilogo {
  const perStato = Object.fromEntries(STATI_ELENCO.map(s => [s, 0])) as Record<StatoSocial, number>
  let ritardo = 0
  for (const c of lista) {
    if (isStato(c.status)) perStato[c.status]++
    if (inRitardo(c, oggi)) ritardo++
  }
  return { totale: lista.length - perStato.annullato, perStato, inRitardo: ritardo }
}

/**
 * Una settimana scoperta: nei prossimi sette giorni, da oggi, il progetto non
 * ha niente in uscita. Su un progetto continuativo vuol dire che il pubblico
 * non vede niente, e di solito che qualcuno se ne accorge troppo tardi.
 */
export function settimanaScoperta(lista: { planned_date: string; status: string }[], oggi: string): boolean {
  const fine = giornoDopo(oggi, 7)
  return !lista.some(c => c.status !== 'annullato' && c.planned_date >= oggi && c.planned_date < fine)
}

/* ── «I miei» ───────────────────────────────────────────────────────────────
   `manager_id` da solo non basta: su nove progetti social attivi cinque non ce
   l'hanno. È mio un progetto che gestisco, di cui sono membro, dove ho una task
   assegnata o un contenuto in carico. */

export function progettiMiei(input: {
  userId: string
  progetti: { id: string; manager_id: string | null }[]
  membri: { project_id: string; profile_id: string }[]
  assegnati: string[]
  responsabili: { project_id: string; owner_id: string | null }[]
}): Set<string> {
  const ids = new Set(input.progetti.map(p => p.id))
  const miei = new Set<string>()
  for (const p of input.progetti) if (p.manager_id === input.userId) miei.add(p.id)
  for (const m of input.membri) if (m.profile_id === input.userId && ids.has(m.project_id)) miei.add(m.project_id)
  for (const id of input.assegnati) if (ids.has(id)) miei.add(id)
  for (const r of input.responsabili) if (r.owner_id === input.userId && ids.has(r.project_id)) miei.add(r.project_id)
  return miei
}

/**
 * Si parte da «solo i miei» se se ne ha almeno uno: chi lavora sul social apre
 * la pagina sui suoi clienti, chi non ne ha vede tutto. Lo dicono i dati, non un
 * nome o un reparto scritto nel codice.
 */
export const soloMieiDiPartenza = (nMiei: number) => nMiei > 0

/* ── Il PED del mese ────────────────────────────────────────────────────────
   Le milestone dei progetti social si chiamano a mano «M2 · PED Novembre 2026».
   Per proporre quella giusta a un contenuto nuovo si cerca il mese nel titolo,
   poi la scadenza dentro il mese. */

const senzaAccenti = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function suggerisciMilestone(
  milestones: { id: string; title: string; due_date: string | null }[],
  mese: string,
): string | null {
  const [a, m] = mese.split('-').map(Number)
  const nome = MESI[m - 1]
  const perTitolo = milestones.find(ms => {
    const t = senzaAccenti(ms.title)
    return t.includes(nome) && t.includes(String(a))
  })
  if (perTitolo) return perTitolo.id
  return milestones.find(ms => ms.due_date && meseDi(ms.due_date) === mese)?.id ?? null
}

/* ── Creatività ─────────────────────────────────────────────────────────── */

/** Quante creatività per contenuto: un carosello arriva a venti. */
export const SOCIAL_MEDIA_MAX = 20
export const SOCIAL_MEDIA_MAX_BYTES = MATERIAL_MAX_BYTES

export type SocialMediaKind = 'immagine' | 'video' | 'documento'

/**
 * Immagini, video e PDF (il carosello di LinkedIn): solo quello che si vede
 * nel browser. Un `.psd` è un file di lavoro, non una creatività da pubblicare.
 */
export function socialMediaKind(mime: string | null | undefined, name: string): SocialMediaKind | null {
  const kind = previewKind(mime, name)
  if (kind === 'image') return 'immagine'
  if (kind === 'video') return 'video'
  if (kind === 'pdf' && materialKind(mime, name) === 'documento') return 'documento'
  return null
}

/** Perché questa creatività non si carica. `null` = si carica. */
export function rejectSocialMedia(input: { name: string; mime: string | null; size: number }): string | null {
  const base = rejectMaterial(input)
  if (base) return base
  if (!socialMediaKind(input.mime, input.name)) return 'Si caricano immagini (JPG, PNG, WebP, GIF), video (MP4, MOV, WebM) e PDF.'
  return null
}

export const socialMediaHref = (id: string) => `/api/social/media/${id}`
export const socialThumbHref = (id: string) => `/api/social/media/${id}/miniatura`
/** La miniatura sta accanto all'originale, e se ne va con lui. */
export const socialThumbKey = (id: string) => `social/miniature/${id}.webp`
