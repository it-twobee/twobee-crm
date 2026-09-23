'use client'

import { useCallback, useRef, useState } from 'react'
import { folderPathOf, humanBytes, isZipName, rejectMaterial } from '@/lib/portal/materials'
import { isJunkFile, joinPath } from '@/lib/portal/explorer'
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
  status: 'attesa' | 'invio' | 'fatto' | 'errore' | 'annullato'
  loaded: number
  error?: string
}

const PARALLEL = 3

/** La coda dei caricamenti: tre alla volta, un totale da leggere, gli errori tenuti insieme. */
export function useUploads({ clientId, onFinished }: { clientId: string; onFinished: () => void }) {
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [opening, setOpening] = useState(false)
  const requests = useRef(new Map<string, XMLHttpRequest>())
  const stopped = useRef(false)

  const patch = (key: string, change: Partial<UploadJob>) =>
    setJobs(list => list.map(job => job.key === key ? { ...job, ...change } : job))

  const send = (job: UploadJob, file: File) => new Promise<void>(resolve => {
    const params = new URLSearchParams({ client: clientId })
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

  const start = useCallback(async (chosen: PickedFile[], target: string, spaceLeft?: number) => {
    stopped.current = false
    const zips = chosen.some(item => isZipName(item.name))
    if (zips) { setJobs([]); setOpening(true) }
    const expanded = await expandZips(chosen).finally(() => setOpening(false))
    const queue: { job: UploadJob; file: PickedFile['file'] }[] = []
    const next: UploadJob[] = []
    for (const item of expanded) {
      if (isJunkFile(item.name, item.dir)) continue
      const key = crypto.randomUUID()
      let path: string | null = null
      let error = item.error ?? null
      if (!error) {
        try { path = joinPath(target, item.dir) } catch (e) { error = e instanceof Error ? e.message : 'Percorso non valido.' }
      }
      error ??= rejectMaterial({ name: item.name, mime: item.type || null, size: item.size })
      const label = item.fromZip ? `${item.name} (da ${item.fromZip})` : item.name
      const job: UploadJob = { key, name: label, size: item.size, path, status: error ? 'errore' : 'attesa', loaded: 0, ...(error ? { error } : {}) }
      next.push(job)
      if (!error) queue.push({ job, file: item.file })
    }
    if (!next.length) { setJobs([]); return }
    // Lo spazio si guarda prima di cominciare: scoprirlo a metà vuol dire mezza cartella caricata.
    const needed = queue.reduce((sum, item) => sum + item.job.size, 0)
    if (spaceLeft !== undefined && needed > spaceLeft) {
      setJobs(next.map(job => job.status === 'attesa'
        ? { ...job, status: 'errore', error: `Lo spazio dell’azienda non basta: servono ${humanBytes(needed)}, restano ${humanBytes(Math.max(0, spaceLeft))}.` }
        : job))
      return
    }
    setJobs(next)
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        if (stopped.current) { patch(item.job.key, { status: 'annullato' }); continue }
        let file: File
        try { file = typeof item.file === 'function' ? await item.file() : item.file }
        catch { patch(item.job.key, { status: 'errore', error: 'Questo file dello zip non si estrae: estrailo sul computer.' }); continue }
        await send(item.job, file)
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker))
    onFinished()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, onFinished])

  const cancel = useCallback(() => {
    stopped.current = true
    requests.current.forEach(request => request.abort())
  }, [])

  const dismiss = useCallback(() => setJobs([]), [])

  const active = jobs.some(job => job.status === 'attesa' || job.status === 'invio')
  const totals = jobs.reduce((sum, job) => {
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

  return { jobs, active: active || opening, opening, totals, start, cancel, dismiss }
}
