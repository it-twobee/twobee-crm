'use client'

import { useCallback, useRef, useState } from 'react'
import { folderPathOf, humanBytes, isZipName, rejectMaterial } from '@/lib/portal/materials'
import { extensionBadge, isJunkFile, joinPath } from '@/lib/portal/explorer'
import { expandZips } from './zips'

/* §416 — Caricare nell'area file: dai bottoni, o trascinando file e cartelle
   dal computer. Ogni file porta con sé la cartella da cui arriva, relativa al
   punto in cui lo si è lasciato cadere, e finisce **nella cartella che si sta
   guardando**, non più sempre nella radice. */
export type PickedFile = {
  name: string
  size: number
  type: string
  dir: string | null
  /** Il file, o come ottenerlo quando tocca a lui: uno che esce da uno zip si estrae solo allora (§421). */
  file: File | (() => Promise<File>)
  /** Lo zip da cui arriva, per dirlo nel riepilogo. */
  fromZip?: string
  error?: string
}

const picked = (file: File, dir: string | null, error?: string): PickedFile =>
  ({ name: file.name, size: file.size, type: file.type, dir, file, ...(error ? { error } : {}) })

export function pickedFromInput(list: FileList): PickedFile[] {
  return Array.from(list).map(file => {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    try { return picked(file, folderPathOf(relative)) }
    catch (e) { return picked(file, null, e instanceof Error ? e.message : 'Percorso non valido.') }
  })
}

/**
 * Le voci vanno prese **subito**, dentro il gestore del drop: finito l'evento,
 * il browser svuota il `DataTransfer`. Per questo la funzione legge le voci
 * prima del primo `await`, e chi la chiama non deve aspettare niente prima.
 */
export function pickedFromDrop(transfer: DataTransfer): Promise<PickedFile[]> {
  const items = Array.from(transfer.items ?? []).filter(item => item.kind === 'file')
  const entries = items.map(item => item.webkitGetAsEntry?.() ?? null)
  const loose = items.map(item => item.getAsFile())
  if (!entries.some(Boolean)) return Promise.resolve(Array.from(transfer.files).map(file => picked(file, null)))
  return (async () => {
    const out: PickedFile[] = []
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (entry) await walk(entry, [], out)
      else if (loose[i]) out.push(picked(loose[i]!, null))
    }
    return out
  })()
}

async function walk(entry: FileSystemEntry, parents: string[], out: PickedFile[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push(picked(file, parents.length ? parents.join('/') : null))
    return
  }
  if (!entry.isDirectory) return
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  // `readEntries` restituisce le voci a blocchi (cento in Chrome): si chiede finché torna vuoto.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    for (const child of batch) await walk(child, [...parents, entry.name], out)
  }
}

export type UploadJob = {
  key: string
  name: string
  size: number
  path: string | null
  /** Il tiro a cui appartiene (§468): un file, una cartella, uno zip, o tutta la scelta quando i pezzi sono troppi. */
  group: string
  /** `mira`: scelto ma non ancora partito — aspetta il suo tiro nel canestro. */
  status: 'mira' | 'attesa' | 'invio' | 'fatto' | 'errore' | 'annullato'
  loaded: number
  error?: string
}

/** Il cartellino del file: l'estensione, anche per chi arriva da uno zip («foto.jpg (da archivio.zip)»). */
export const jobBadge = (job: Pick<UploadJob, 'name'>) => extensionBadge(job.name.replace(/ \(da [^)]*\)$/, '')) ?? 'FILE'

const PARALLEL = 3
/** Oltre questi tiri la scelta parte in un pallone solo: trecento file non sono una partita. */
const MAX_GROUPS = 8

function groupOf(item: PickedFile, index: number) {
  if (item.fromZip) return `zip:${item.fromZip}`
  if (item.dir) return `dir:${item.dir.split('/')[0]}`
  return `file:${index}`
}

/**
 * La coda dei caricamenti: tre alla volta, un totale da leggere, gli errori tenuti insieme.
 * §468 — `prepare` mette i file in mano (`mira`) senza mandarli; `launch` li fa partire,
 * uno per tiro. `start` fa le due cose insieme: è il trascinamento, che non passa dal canestro.
 */
export function useUploads({ clientId, onFinished }: { clientId: string; onFinished: () => void }) {
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [opening, setOpening] = useState(false)
  const requests = useRef(new Map<string, XMLHttpRequest>())
  const pending = useRef(new Map<string, { job: UploadJob; file: PickedFile['file'] }>())
  const queue = useRef<string[]>([])
  const running = useRef(0)
  const client = useRef(clientId)
  client.current = clientId
  const finished = useRef(onFinished)
  finished.current = onFinished

  const patch = (key: string, change: Partial<UploadJob>) =>
    setJobs(list => list.map(job => job.key === key ? { ...job, ...change } : job))

  const send = (job: UploadJob, file: File) => new Promise<void>(resolve => {
    const params = new URLSearchParams({ client: client.current })
    if (job.path) params.set('percorso', job.path)
    const request = new XMLHttpRequest()
    requests.current.set(job.key, request)
    request.open('POST', `/api/area-cliente/file?${params}`)
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    request.setRequestHeader('x-file-name', encodeURIComponent(file.name).replace(/%20/g, ' '))
    request.setRequestHeader('x-idempotency-key', crypto.randomUUID())
    request.upload.onprogress = e => { if (e.lengthComputable) patch(job.key, { loaded: e.loaded }) }
    const done = (change: Partial<UploadJob>) => { requests.current.delete(job.key); patch(job.key, change); resolve() }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return done({ status: 'fatto', loaded: job.size })
      let message = 'Caricamento non riuscito. Riprova.'
      try { message = JSON.parse(request.responseText)?.error ?? message } catch { /* non JSON */ }
      done({ status: 'errore', error: message })
    }
    request.onerror = () => done({ status: 'errore', error: 'Connessione interrotta durante il caricamento.' })
    request.onabort = () => done({ status: 'annullato' })
    patch(job.key, { status: 'invio' })
    request.send(file)
  })

  // La coda si svuota da sé: ogni tiro aggiunge, e chi finisce prende il prossimo.
  const pump = () => {
    while (running.current < PARALLEL && queue.current.length) {
      const key = queue.current.shift()!
      const item = pending.current.get(key)
      if (!item) continue
      pending.current.delete(key)
      running.current += 1
      void (async () => {
        let file: File | null = null
        try { file = typeof item.file === 'function' ? await item.file() : item.file }
        catch { patch(key, { status: 'errore', error: 'Questo file dello zip non si estrae: estrailo sul computer.' }) }
        if (file) await send(item.job, file)
        running.current -= 1
        if (!running.current && !queue.current.length) finished.current()
        else pump()
      })()
    }
  }

  /** Prepara la scelta senza mandarla: ritorna i file che possono partire. */
  const prepare = useCallback(async (chosen: PickedFile[], target: string, spaceLeft?: number): Promise<string[]> => {
    const zips = chosen.some(item => isZipName(item.name))
    if (zips) setOpening(true)
    const expanded = await expandZips(chosen).finally(() => setOpening(false))
    const ready: { job: UploadJob; file: PickedFile['file'] }[] = []
    const next: UploadJob[] = []
    expanded.forEach((item, index) => {
      if (isJunkFile(item.name, item.dir)) return
      const key = crypto.randomUUID()
      let path: string | null = null
      let error = item.error ?? null
      if (!error) {
        try { path = joinPath(target, item.dir) } catch (e) { error = e instanceof Error ? e.message : 'Percorso non valido.' }
      }
      error ??= rejectMaterial({ name: item.name, mime: item.type || null, size: item.size })
      const label = item.fromZip ? `${item.name} (da ${item.fromZip})` : item.name
      const job: UploadJob = { key, name: label, size: item.size, path, group: groupOf(item, index), status: error ? 'errore' : 'mira', loaded: 0, ...(error ? { error } : {}) }
      next.push(job)
      if (!error) ready.push({ job, file: item.file })
    })
    if (new Set(next.map(job => job.group)).size > MAX_GROUPS) next.forEach(job => { job.group = 'tutti' })
    // Lo spazio si guarda prima di cominciare: scoprirlo a metà vuol dire mezza cartella caricata.
    const needed = ready.reduce((sum, item) => sum + item.job.size, 0)
    const full = spaceLeft !== undefined && needed > spaceLeft
    if (full) next.forEach(job => {
      if (job.status !== 'mira') return
      job.status = 'errore'
      job.error = `Lo spazio dell’azienda non basta: servono ${humanBytes(needed)}, restano ${humanBytes(Math.max(0, spaceLeft ?? 0))}.`
    })
    else ready.forEach(item => pending.current.set(item.job.key, item))
    // Chi sta ancora salendo resta in elenco; il riepilogo del giro prima no.
    setJobs(list => [...list.filter(job => job.status === 'attesa' || job.status === 'invio'), ...next])
    return full ? [] : ready.map(item => item.job.key)
  }, [])

  /** Fa partire questi file: quelli entrati nel canestro, o tutti con «Carica senza tirare». */
  const launch = useCallback((keys: string[]) => {
    const wanted = keys.filter(key => pending.current.has(key) && !queue.current.includes(key))
    if (!wanted.length) return
    setJobs(list => list.map(job => job.status === 'mira' && wanted.includes(job.key) ? { ...job, status: 'attesa' } : job))
    queue.current.push(...wanted)
    pump()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(async (chosen: PickedFile[], target: string, spaceLeft?: number) => {
    launch(await prepare(chosen, target, spaceLeft))
  }, [prepare, launch])

  /** Chi era in mano e non è partito non esiste: chiudere la finestra non carica niente. */
  const discard = useCallback(() => {
    pending.current.forEach((_, key) => { if (!queue.current.includes(key)) pending.current.delete(key) })
    setJobs(list => list.filter(job => job.status !== 'mira'))
  }, [])

  const cancel = useCallback(() => {
    const dropped = queue.current
    queue.current = []
    dropped.forEach(key => pending.current.delete(key))
    setJobs(list => list.map(job => dropped.includes(job.key) ? { ...job, status: 'annullato' } : job))
    requests.current.forEach(request => request.abort())
  }, [])

  const dismiss = useCallback(() => setJobs(list => list.filter(job => job.status === 'mira')), [])

  const sent = jobs.filter(job => job.status !== 'mira')
  const active = sent.some(job => job.status === 'attesa' || job.status === 'invio')
  const totals = sent.reduce((sum, job) => {
    if (job.status === 'errore' && !job.loaded) return { ...sum, failed: sum.failed + 1 }
    return {
      ...sum,
      bytes: sum.bytes + job.size,
      loaded: sum.loaded + (job.status === 'fatto' ? job.size : job.loaded),
      done: sum.done + (job.status === 'fatto' ? 1 : 0),
      failed: sum.failed + (job.status === 'errore' ? 1 : 0),
      cancelled: sum.cancelled + (job.status === 'annullato' ? 1 : 0),
    }
  }, { bytes: 0, loaded: 0, done: 0, failed: 0, cancelled: 0 })

  return { jobs, active: active || opening, opening, totals, prepare, launch, start, discard, cancel, dismiss }
}
