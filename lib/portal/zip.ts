/* §421 — Gli zip dell'area file. Logica pura: come si chiamano i file dentro lo
   zip che si scarica, e come si chiama lo zip. Un nome che su Windows non si
   può creare è un file che l'estrazione salta senza dirlo; due file con lo
   stesso nome sono uno che sovrascrive l'altro. */

/** Un segmento di percorso che si può creare su Windows, macOS e Linux. */
export function safeSegment(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    // Windows toglie punti e spazi in fondo, e un nome che finisce così non si riapre.
    .replace(/[. ]+$/g, '')
    .trim()
  const name = cleaned || '_'
  // I nomi riservati di Windows non si creano, nemmeno con un'estensione.
  return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(name) ? `_${name}` : name
}

/** `nome (2).ext`: il secondo file con lo stesso nome non cancella il primo. */
function numbered(name: string, n: number): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`
}

type Entry = { id: string; name: string; path: string | null }

/**
 * Il nome di ogni file dentro lo zip, relativo alla cartella che si scarica.
 * `base` è la cartella (`''` = tutto lo spazio); `prefix` è la cartella radice
 * dello zip, di solito il nome della cartella scaricata. I file fuori da
 * `base` non entrano. Dentro lo zip i confronti fra nomi ignorano le maiuscole,
 * perché Windows e macOS li considerano lo stesso file.
 */
export function zipEntryNames(files: Entry[], base: string, prefix = ''): Map<string, string> {
  const baseParts = base.split('/').filter(Boolean)
  const taken = new Set<string>()
  const out = new Map<string, string>()
  const ordered = [...files].sort((a, b) => `${a.path ?? ''}/${a.name}`.localeCompare(`${b.path ?? ''}/${b.name}`, 'it') || a.id.localeCompare(b.id))
  for (const file of ordered) {
    const parts = (file.path ?? '').split('/').filter(Boolean)
    if (baseParts.some((segment, i) => parts[i] !== segment)) continue
    const dirs = [...prefix.split('/').filter(Boolean), ...parts.slice(baseParts.length)].map(safeSegment)
    const name = safeSegment(file.name)
    let candidate = [...dirs, name].join('/')
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = [...dirs, numbered(name, n)].join('/')
    taken.add(candidate.toLowerCase())
    out.set(file.id, candidate)
  }
  return out
}

/** Le cartelle vuote dentro lo zip, perché anche il vuoto è un'organizzazione. */
export function zipEmptyFolders(folders: string[], files: Entry[], base: string, prefix = ''): string[] {
  const baseParts = base.split('/').filter(Boolean)
  const used = new Set(files.map(f => (f.path ?? '').split('/').filter(Boolean).join('/')))
  const out = new Set<string>()
  for (const folder of folders) {
    const parts = folder.split('/').filter(Boolean)
    if (parts.length <= baseParts.length || baseParts.some((segment, i) => parts[i] !== segment)) continue
    // Una cartella con dentro un file, anche in fondo, c'è già nello zip.
    if (Array.from(used).some(p => p === folder || p.startsWith(`${folder}/`))) continue
    out.add([...prefix.split('/').filter(Boolean), ...parts.slice(baseParts.length)].map(safeSegment).join('/'))
  }
  return Array.from(out).sort()
}

/** «Azienda – Cartella.zip»: si riconosce nella cartella Download fra altri dieci. */
export function zipFileName(company: string, folder: string): string {
  const parts = [company, folder].map(p => safeSegment(p.trim())).filter(p => p && p !== '_')
  return `${parts.join(' – ') || 'file'}.zip`
}

/** L'intestazione per un nome con accenti: `filename*` per chi la legge, `filename` ASCII per chi no. */
export function attachmentHeader(name: string): string {
  const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}
