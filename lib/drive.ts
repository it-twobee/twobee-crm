// Conversione link Google Drive → URL embeddabili in webview (iframe).
// Nessuna API/OAuth: si usano i link di condivisione e gli endpoint /preview pubblici.

export type DriveKind = 'folder' | 'file' | 'doc' | 'sheet' | 'slide'

export function isDriveUrl(url: string | null | undefined): boolean {
  return !!url && /(?:drive|docs)\.google\.com/.test(url)
}

export function driveKind(url: string): DriveKind | null {
  if (!isDriveUrl(url)) return null
  if (/\/folders\//.test(url))         return 'folder'
  if (/document\/d\//.test(url))       return 'doc'
  if (/spreadsheets\/d\//.test(url))   return 'sheet'
  if (/presentation\/d\//.test(url))   return 'slide'
  return 'file'
}

function extractId(url: string): string | null {
  const m = url.match(/\/(?:folders|d)\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}

export function driveEmbedUrl(url: string): string | null {
  const kind = driveKind(url)
  const id = kind ? extractId(url) : null
  if (!kind || !id) return null
  switch (kind) {
    case 'folder': return `https://drive.google.com/embeddedfolderview?id=${id}#grid`
    case 'doc':    return `https://docs.google.com/document/d/${id}/preview`
    case 'sheet':  return `https://docs.google.com/spreadsheets/d/${id}/preview`
    case 'slide':  return `https://docs.google.com/presentation/d/${id}/preview`
    default:       return `https://drive.google.com/file/d/${id}/preview`
  }
}

export const DRIVE_KIND_LABEL: Record<DriveKind, string> = {
  folder: 'Cartella', file: 'File', doc: 'Documento', sheet: 'Foglio', slide: 'Presentazione',
}
