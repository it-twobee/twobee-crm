/* §397 — Lo spazio file del cliente. Logica pura: tipi ammessi, limiti, quota
   e Range, cioè le regole che devono valere uguali nella rotta e nella pagina.
   Un limite scoperto a caricamento fallito è il modo peggiore di dirlo. */

/** 1 GB per file: sotto ci sta un video di qualche minuto in buona qualità. */
export const MATERIAL_MAX_BYTES = 1024 * 1024 * 1024
/** Tetto per azienda, oltre il quale si chiede prima di continuare a riempire. */
export const MATERIAL_QUOTA_BYTES = 20 * 1024 * 1024 * 1024

export const MATERIAL_KINDS = {
  immagine: 'Immagine', video: 'Video', audio: 'Audio', documento: 'Documento',
} as const
export type MaterialKind = keyof typeof MATERIAL_KINDS

/* Elenco chiuso: un tipo che non è qui non si carica. Gli eseguibili e i
   contenuti attivi non entrano nemmeno se qualcuno li rinomina, perché si
   guarda il tipo dichiarato e l'estensione insieme. */
const DOCUMENT_TYPES = [
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed',
]
/* I file sorgente di chi fa grafica: il browser non sa che tipo siano — un
   `.afdesign` arriva come `application/octet-stream` e un `.psd` si presenta
   come `image/…`, che è peggio, perché poi l'anteprima proverebbe a disegnarlo.
   Si riconoscono dall'estensione, e restano documenti: non si aprono nel
   browser, si scaricano. (§399) */
const DESIGN_EXTENSIONS = [
  'afdesign', 'afphoto', 'afpub', 'psd', 'psb', 'ai', 'eps', 'indd', 'sketch', 'xd', 'fig',
]
const BLOCKED_EXTENSIONS = [
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'sh', 'jar', 'app', 'deb', 'rpm',
  'html', 'htm', 'svg', 'xhtml', 'js', 'mjs', 'php', 'phtml',
]

export function materialKind(mime: string | null | undefined, name?: string): MaterialKind | null {
  const type = (mime ?? '').toLowerCase().split(';')[0].trim()
  // L'estensione prima del tipo dichiarato: è l'unica cosa affidabile su questi.
  if (name && DESIGN_EXTENSIONS.includes(extensionOf(name))) return 'documento'
  if (type.startsWith('image/') && type !== 'image/svg+xml') return 'immagine'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (DOCUMENT_TYPES.includes(type)) return 'documento'
  return null
}

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

/** Perché questo file non si può caricare. `null` = si può. */
export function rejectMaterial(input: { name: string; mime: string | null; size: number }): string | null {
  const name = (input?.name ?? '').trim()
  if (!name || name.length > 240) return 'Il nome del file manca o è troppo lungo.'
  if (BLOCKED_EXTENSIONS.includes(extensionOf(name))) return 'Questo tipo di file non è ammesso nel portale.'
  if (!Number.isFinite(input.size) || input.size <= 0) return 'Il file è vuoto.'
  if (input.size > MATERIAL_MAX_BYTES) return `Il file supera ${humanBytes(MATERIAL_MAX_BYTES)}. Per un girato lungo, mandaci il link.`
  if (!materialKind(input.mime, name)) return 'Ammettiamo immagini, video, audio, documenti e file di progetto. Questo tipo no.'
  return null
}

export function quotaLeft(used: number, quota = MATERIAL_QUOTA_BYTES): number {
  return Math.max(0, quota - Math.max(0, used))
}

/** Sopra il 90% conviene dirlo prima, non al caricamento che fallisce. */
export function quotaWarning(used: number, quota = MATERIAL_QUOTA_BYTES): string | null {
  if (quota <= 0) return null
  if (used >= quota) return 'Lo spazio è pieno: elimina qualcosa oppure scrivici.'
  if (used / quota >= 0.9) return `Resta poco spazio: ${humanBytes(quotaLeft(used, quota))} su ${humanBytes(quota)}.`
  return null
}

export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'n/d'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024, unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  // Un decimale solo quando aggiunge qualcosa: «1 GB», non «1.0 GB».
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[unit]}`
}

export type ByteRange = { start: number; end: number }

/**
 * `Range: bytes=…` secondo RFC 7233, per il solo caso che serve: un intervallo.
 * `null` = servi tutto. `'invalid'` = 416, perché rispondere 200 a un player
 * che ha chiesto un pezzo fuori dal file lo manda in loop.
 */
export function parseRange(header: string | null | undefined, size: number): ByteRange | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || !Number.isFinite(size) || size <= 0) return 'invalid'
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return 'invalid'
  let start: number, end: number
  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (suffix <= 0) return 'invalid'
    start = Math.max(0, size - suffix); end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd ? Number(rawEnd) : size - 1
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) return 'invalid'
  return { start, end: Math.min(end, size - 1) }
}

/* Quello che il browser **disegna davvero**. Elenco chiuso e corto apposta: una
   miniatura promessa e non mostrata è peggio di nessuna miniatura, e un `.psd`
   con tipo `image/vnd.adobe.photoshop` diventerebbe un rettangolo rotto. */
const RENDERABLE = {
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/webm'],
} as const

export type RenderableKind = keyof typeof RENDERABLE | null

export function renderableKind(mime: string | null | undefined, name?: string): RenderableKind {
  if (name && DESIGN_EXTENSIONS.includes(extensionOf(name))) return null
  const type = (mime ?? '').toLowerCase().split(';')[0].trim()
  for (const kind of Object.keys(RENDERABLE) as (keyof typeof RENDERABLE)[]) {
    if ((RENDERABLE[kind] as readonly string[]).includes(type)) return kind
  }
  return null
}

export function materialDownloadHref(id: string): string {
  return `/api/portale/materiali/${id}`
}

export function materialThumbHref(id: string): string {
  return `/api/portale/materiali/${id}/miniatura`
}

/** §401 — la miniatura sta accanto all'originale, e se ne va con lui. */
export function thumbObjectKey(id: string): string {
  return `materiali/miniature/${id}.webp`
}

/* ── Cartelle (§398) ───────────────────────────────────────────────────────
   Il percorso viaggia col file: `brand/logo/logo.svg` arriva dal browser
   quando si carica una cartella intera. L'albero si ricostruisce da qui,
   quindi non esistono cartelle fantasma e non c'è un albero da tenere
   integro — ma un percorso è pur sempre testo che arriva da fuori. */
export const PATH_MAX = 400
export const PATH_DEPTH = 10
const SEGMENT_MAX = 120

export function normalizePath(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string') throw new Error('Percorso della cartella non valido.')
  const segments = raw.replace(/\\/g, '/').split('/').map(s => s.trim()).filter(Boolean)
  if (!segments.length) return null
  if (segments.length > PATH_DEPTH) throw new Error(`Le cartelle sono annidate troppo in profondità (massimo ${PATH_DEPTH}).`)
  for (const segment of segments) {
    if (segment === '.' || segment === '..') throw new Error('Percorso della cartella non valido.')
    if (segment.length > SEGMENT_MAX) throw new Error('Il nome di una cartella è troppo lungo.')
    // Caratteri che nei nomi di cartella non hanno mai un buon motivo.
    if (/[\u0000-\u001f\u007f]/.test(segment)) throw new Error('Percorso della cartella non valido.')
  }
  const path = segments.join('/')
  if (path.length > PATH_MAX) throw new Error('Il percorso della cartella è troppo lungo.')
  return path
}

/** Il percorso di una cartella caricata dal browser: `webkitRelativePath` meno il file. */
export function folderPathOf(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null
  const parts = relativePath.replace(/\\/g, '/').split('/')
  parts.pop()
  return normalizePath(parts.join('/'))
}

export type MaterialFolder<T> = { name: string; path: string; folders: MaterialFolder<T>[]; files: T[] }

/** Albero dalla sola lista dei percorsi. Le cartelle intermedie nascono da sole. */
export function buildMaterialTree<T extends { path?: string | null }>(items: T[]): MaterialFolder<T> {
  const root: MaterialFolder<T> = { name: '', path: '', folders: [], files: [] }
  for (const item of items) {
    let node = root
    for (const segment of (item.path ?? '').split('/').filter(Boolean)) {
      const path = node.path ? `${node.path}/${segment}` : segment
      let next = node.folders.find(f => f.name === segment)
      if (!next) { next = { name: segment, path, folders: [], files: [] }; node.folders.push(next) }
      node = next
    }
    node.files.push(item)
  }
  const sort = (node: MaterialFolder<T>) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name, 'it'))
    node.folders.forEach(sort)
  }
  sort(root)
  return root
}

export function countTree<T>(node: MaterialFolder<T>): number {
  return node.files.length + node.folders.reduce((sum, f) => sum + countTree(f), 0)
}
