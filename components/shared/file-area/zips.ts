'use client'

import { isZipName, mimeFromName } from '@/lib/portal/materials'
import { joinPath } from '@/lib/portal/explorer'
import type { PickedFile } from './uploads'

/* §421 — Uno zip caricato si apre, sempre, e diventa una cartella col suo nome.
   Lo si apre **nel browser**: ogni file che ne esce passa dalla stessa rotta di
   caricamento, con le stesse guard, la stessa quota e lo stesso elenco dei tipi
   ammessi. Aprirlo sul server avrebbe voluto dire una seconda porta con regole
   sue, e i controlli su zip bomb e percorsi scritti due volte.

   Lo zip si legge ad accesso casuale sul `File` (zip.js): l'indice sta in
   fondo, e da lì si arriva a ogni file senza tenere in memoria il resto. I file
   si estraggono uno alla volta, quando tocca a loro (`file` è una funzione).
   Uno zip dentro uno zip resta un file: aprirli tutti vorrebbe dire non sapere
   più dove si finisce. */
export function zipFolderName(name: string): string {
  return name.replace(/\.zip$/i, '').trim() || 'zip'
}

const UNREADABLE = 'Questo zip non si apre: forse è rovinato, o compresso in un formato che non leggiamo. Estrailo sul computer e carica la cartella.'

export async function expandZips(picked: PickedFile[]): Promise<PickedFile[]> {
  if (!picked.some(p => !p.error && isZipName(p.name))) return picked
  const zip = await import('@zip.js/zip.js')
  // Niente worker e niente WebAssembly da servire: la decompressione del browser basta.
  zip.configure({ useWebWorkers: false, useCompressionStream: true })
  const out: PickedFile[] = []
  for (const p of picked) {
    if (p.error || !isZipName(p.name)) { out.push(p); continue }
    let base: string | null
    try { base = joinPath(p.dir, zipFolderName(p.name)) } catch (e) {
      out.push({ ...p, error: e instanceof Error ? e.message : 'Percorso non valido.' }); continue
    }
    try {
      const source = typeof p.file === 'function' ? await p.file() : p.file
      const entries = await new zip.ZipReader(new zip.BlobReader(source)).getEntries()
      if (entries.some(entry => entry.encrypted)) {
        out.push({ ...p, error: 'Lo zip è protetto da password: estrailo sul computer e carica la cartella.' }); continue
      }
      const files = entries.filter(entry => !entry.directory)
      if (!files.length) { out.push({ ...p, error: 'Lo zip è vuoto.' }); continue }
      for (const entry of files) {
        const parts = entry.filename.replace(/\\/g, '/').split('/').filter(Boolean)
        const name = parts.pop() ?? entry.filename
        const type = mimeFromName(name) ?? ''
        let dir: string | null = base
        let error: string | undefined
        try { dir = joinPath(base, parts.join('/')) } catch (e) { error = e instanceof Error ? e.message : 'Percorso non valido.' }
        out.push({
          name, size: entry.uncompressedSize, type, dir, error, fromZip: p.name,
          file: async () => {
            if (!entry.getData) throw new Error(UNREADABLE)
            const blob = await entry.getData(new zip.BlobWriter(type || 'application/octet-stream'))
            return new File([blob], name, { type })
          },
        })
      }
    } catch { out.push({ ...p, error: UNREADABLE }) }
  }
  return out
}
