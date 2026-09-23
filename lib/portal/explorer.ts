/* §416 — L'esploratore dell'area file di un cliente. Logica pura: cosa c'è in
   una cartella, in che ordine, cosa trova una ricerca. Sta qui e non nei
   componenti perché la stessa domanda — «cosa c'è in Brand/Loghi?» — ha una
   risposta sola, che si prova a macchina.

   Il percorso resta la verità del file (§398): una cartella è il prefisso dei
   percorsi dei file che contiene. */
import { extensionOf, normalizePath } from './materials'

export type ClientMaterial = {
  id: string; client_id: string; project_id: string | null; name: string; mime: string | null
  size: number; kind: string; path: string | null; source: 'cliente' | 'team'
  /* §419 — l'id può mancare: quando un account viene eliminato la chiave esterna
     lo slega e il file resta al cliente. Il **nome** resta scritto accanto dal
     giorno del caricamento, quindi l'autore si legge lo stesso — con la sua
     avvertenza. Un file senza autore sarebbe stato peggio del file di prima. */
  uploaded_by: string | null; uploaded_by_name: string; created_at: string; archived_at: string | null
}

/**
 * Chi ha caricato, e se è ancora dei nostri (§419).
 *
 * Il nome da solo direbbe che la persona c'è: chi legge una lista di file non ha
 * modo di sapere che quell'account è stato eliminato, e finirebbe per cercarlo
 * in rubrica. L'avvertenza è corta di proposito — serve a fermare la ricerca,
 * non a raccontare una storia.
 */
export function autoreTesto(m: Pick<ClientMaterial, 'uploaded_by' | 'uploaded_by_name'>): string {
  return m.uploaded_by ? m.uploaded_by_name : `${m.uploaded_by_name} (non più nel sistema)`
}

/** I due spazi dell'area: quello che ha caricato il cliente, e il nostro. */
export type Space = 'team' | 'cliente'
export const SPACE_LABEL: Record<Space, string> = { team: 'Nostri', cliente: 'Dal cliente' }

export type SortKey = 'data' | 'nome' | 'dimensione'
export type SortDir = 'asc' | 'desc'
/** Il verso che ci si aspetta al primo clic: i più recenti, i nomi dalla A, i più pesanti. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = { data: 'desc', nome: 'asc', dimensione: 'desc' }

type Item = { id: string; name: string; path: string | null; size: number; created_at: string }

export type FolderSummary = {
  name: string
  path: string
  /** File dentro, a ogni profondità. */
  count: number
  size: number
  /** L'ultimo caricamento dentro: una cartella «recente» è una cartella in cui è arrivato qualcosa. */
  latest: string | null
}

export type Listing<T> = { folders: FolderSummary[]; files: T[] }

const segments = (path: string | null | undefined) => (path ?? '').split('/').filter(Boolean)

export function joinPath(base: string | null | undefined, child: string | null | undefined): string | null {
  const parts = [...segments(base), ...segments(child)]
  return parts.length ? normalizePath(parts.join('/')) : null
}

export function parentPath(path: string | null | undefined): string {
  return segments(path).slice(0, -1).join('/')
}

export function lastSegment(path: string | null | undefined): string {
  return segments(path).pop() ?? ''
}

/** Il file sta in questa cartella, o in una delle sue sottocartelle. */
export function isInside(filePath: string | null | undefined, folder: string): boolean {
  const own = segments(filePath).join('/')
  if (!folder) return true
  return own === folder || own.startsWith(`${folder}/`)
}

export type Crumb = { name: string; path: string }

export function crumbsOf(path: string | null | undefined): Crumb[] {
  const parts = segments(path)
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))
}

/**
 * Cosa c'è in una cartella: le sottocartelle dirette, con quanto contengono a
 * ogni profondità, e i file che stanno proprio lì. `extraFolders` sono le
 * cartelle che esistono anche vuote: entrano con zero file.
 */
export function listFolder<T extends Item>(items: T[], path: string, extraFolders: string[] = []): Listing<T> {
  const here = segments(path)
  const depth = here.length
  const folders = new Map<string, FolderSummary>()
  const files: T[] = []
  const touch = (name: string) => {
    const full = [...here, name].join('/')
    let entry = folders.get(name)
    if (!entry) { entry = { name, path: full, count: 0, size: 0, latest: null }; folders.set(name, entry) }
    return entry
  }
  for (const item of items) {
    const own = segments(item.path)
    if (own.length < depth || here.some((s, i) => own[i] !== s)) continue
    if (own.length === depth) { files.push(item); continue }
    const entry = touch(own[depth])
    entry.count += 1
    entry.size += Number(item.size) || 0
    if (!entry.latest || item.created_at > entry.latest) entry.latest = item.created_at
  }
  for (const folder of extraFolders) {
    const own = segments(folder)
    if (own.length <= depth || here.some((s, i) => own[i] !== s)) continue
    touch(own[depth])
  }
  return { folders: Array.from(folders.values()), files }
}

const collator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' })

export function sortFiles<T extends Item>(files: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...files].sort((a, b) => {
    const primary = key === 'nome' ? collator.compare(a.name, b.name)
      : key === 'dimensione' ? (Number(a.size) || 0) - (Number(b.size) || 0)
        : a.created_at.localeCompare(b.created_at)
    // A parità, il nome: due ordinamenti uguali devono dare la stessa lista.
    return (primary * sign) || collator.compare(a.name, b.name) || a.id.localeCompare(b.id)
  })
}

export function sortFolders(folders: FolderSummary[], key: SortKey, dir: SortDir): FolderSummary[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...folders].sort((a, b) => {
    // Una cartella vuota non ha un ultimo caricamento: va in fondo, in tutti e due i versi.
    if (key === 'data' && !a.latest !== !b.latest) return a.latest ? -1 : 1
    const primary = key === 'nome' ? collator.compare(a.name, b.name)
      : key === 'dimensione' ? a.size - b.size
        : (a.latest ?? '').localeCompare(b.latest ?? '')
    return (primary * sign) || collator.compare(a.name, b.name)
  })
}

/** Senza accenti e senza maiuscole: «perché» si trova scrivendo «perche». */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export type FolderHit = { space: Space; path: string; name: string; count: number }
export type SearchResult<T> = { folders: FolderHit[]; files: T[] }

/**
 * Cerca nei nomi di file e cartelle di **tutti e due** gli spazi. Tutte le
 * parole devono comparire, in qualunque ordine: «logo bianco» trova
 * «Logo_Bianco_2025.png». Una cartella si trova dal suo nome, non dal percorso:
 * cercare «brand» non deve restituire ogni file che sta sotto Brand.
 */
export function searchMaterials<T extends Item & { source: Space }>(
  items: T[], query: string, extraFolders: { space: Space; path: string }[] = [],
): SearchResult<T> {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (!words.length) return { folders: [], files: [] }
  const matches = (text: string) => { const folded = foldText(text); return words.every(w => folded.includes(w)) }

  const files = items.filter(item => matches(item.name))
  const counts = new Map<string, FolderHit>()
  const add = (space: Space, path: string, withFile: boolean) => {
    const parts = segments(path)
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/')
      const id = `${space}:${prefix}`
      let hit = counts.get(id)
      if (!hit) { hit = { space, path: prefix, name: parts[i - 1], count: 0 }; counts.set(id, hit) }
      if (withFile) hit.count += 1
    }
  }
  for (const item of items) add(item.source, item.path ?? '', true)
  for (const folder of extraFolders) add(folder.space, folder.path, false)
  const folders = Array.from(counts.values()).filter(hit => matches(hit.name))
    .sort((a, b) => collator.compare(a.path, b.path) || a.space.localeCompare(b.space))
  return { folders, files }
}

/** L'etichetta sulla casella di un file senza miniatura: PSD, AI, PDF, ZIP. */
export function extensionBadge(name: string): string | null {
  const ext = extensionOf(name)
  if (!ext || ext.length > 5 || !/^[a-z0-9]+$/.test(ext)) return null
  return ext.toUpperCase()
}

/** Quanto pesa e quanti sono: la riga sotto il nome di una cartella. */
export function folderLine(folder: Pick<FolderSummary, 'count'>): string {
  if (!folder.count) return 'Vuota'
  return folder.count === 1 ? '1 file' : `${folder.count} file`
}

/* I file che un sistema operativo semina da solo: nessuno li ha scelti, e in
   un'area condivisa sono rumore. Si saltano in silenzio, perché nessuno li
   cercherà mai. */
const JUNK_FILES = ['.ds_store', 'thumbs.db', 'desktop.ini', '.localized']
const JUNK_FOLDERS = ['__macosx', '.git', '.svn']

export function isJunkFile(name: string, dir: string | null | undefined): boolean {
  if (JUNK_FILES.includes(name.toLowerCase()) || name.startsWith('._')) return true
  return segments(dir).some(s => JUNK_FOLDERS.includes(s.toLowerCase()))
}

/* ── Organizzare (§413) ─────────────────────────────────────────────────────
   Le stesse regole che il database ricontrolla: qui servono a dirlo prima,
   nella finestra, invece che dopo, con un errore. */

/** Il nome di una cartella: un segmento solo, senza barre e senza risalite. */
export function folderNameError(raw: string): string | null {
  const name = raw.trim()
  if (!name) return 'Scrivi un nome.'
  if (name.length > 120) return 'Il nome è troppo lungo (massimo 120 caratteri).'
  if (/[/\\]/.test(name)) return 'Il nome di una cartella non può contenere barre.'
  if (name === '.' || name === '..') return 'Nome non valido.'
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'Nome non valido.'
  return null
}

/** Nome ed estensione separati: si rinomina il primo, il secondo resta. */
export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: '' }
}

/** Il nuovo nome di un file, o perché non va. Si rinomina il nome, non il tipo. */
export function renameFile(oldName: string, base: string): { name: string } | { error: string } {
  const clean = base.trim()
  if (!clean) return { error: 'Scrivi un nome.' }
  if (/[/\\]/.test(clean)) return { error: 'Il nome di un file non può contenere barre.' }
  if (/[\u0000-\u001f\u007f]/.test(clean)) return { error: 'Nome non valido.' }
  const name = `${clean}${splitName(oldName).ext}`
  if (name.length > 240) return { error: 'Il nome è troppo lungo.' }
  return { name }
}

/**
 * Dove finisce una cartella spostata dentro un'altra (`''` = la radice), o
 * perché non si può: dentro sé stessa, o dove è già.
 */
export function folderMoveTarget(from: string, toParent: string): { path: string } | { error: string } {
  const name = lastSegment(from)
  if (!from || !name) return { error: 'Cartella non valida.' }
  if (isInside(toParent, from)) return { error: 'Una cartella non va dentro sé stessa.' }
  if (parentPath(from) === segments(toParent).join('/')) return { error: 'È già lì.' }
  try {
    const path = joinPath(toParent, name)
    return path ? { path } : { error: 'Cartella non valida.' }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Percorso non valido.' } }
}

/** Il nuovo percorso di una cartella rinominata: stesso padre, nome nuovo. */
export function folderRenameTarget(from: string, newName: string): { path: string } | { error: string } {
  const error = folderNameError(newName)
  if (error) return { error }
  try {
    const path = joinPath(parentPath(from), newName.trim())
    if (!path) return { error: 'Cartella non valida.' }
    return path === from ? { error: 'Il nome è lo stesso.' } : { path }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Percorso non valido.' } }
}

/** Tutte le cartelle di uno spazio, per il selettore di «Sposta in…». */
export function allFolders(items: { path: string | null }[], extraFolders: string[] = []): string[] {
  const out = new Set<string>()
  for (const p of [...items.map(i => i.path ?? ''), ...extraFolders]) {
    const parts = segments(p)
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'))
  }
  return Array.from(out).sort((a, b) => collator.compare(a, b))
}
