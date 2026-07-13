// Costanti e tipi dello storage — SAFE lato client (nessuna dipendenza server/S3).
// I componenti client importano SOLO da qui; il provider S3 vive in ./s3.

export const STORAGE_FOLDERS = [
  'clients',      // allegati interni legati a un cliente
  'payslips',     // buste paga (sensibile)
  'personal',     // documenti personali dipendenti (sensibile)
  'best_ideas',   // best-ideas / allegati riservati (sensibile)
  'chat',         // allegati chat
  'knowledge',    // knowledge base
  'misc',         // generico
] as const

export type StorageFolder = (typeof STORAGE_FOLDERS)[number]

/** Cartelle con dati sensibili: leggibili SOLO dall'owner o da un admin. */
export const SENSITIVE_FOLDERS: StorageFolder[] = ['payslips', 'personal', 'best_ideas']

export const FOLDER_LABELS: Record<StorageFolder, string> = {
  clients: 'Allegati cliente',
  payslips: 'Buste paga',
  personal: 'Documenti personali',
  best_ideas: 'Best ideas',
  chat: 'Allegati chat',
  knowledge: 'Knowledge',
  misc: 'Generico',
}

export function isStorageFolder(v: string): v is StorageFolder {
  return (STORAGE_FOLDERS as readonly string[]).includes(v)
}

/** Metadati di un file (riga tabella public.files). */
export interface StorageFile {
  id: string
  bucket: string
  object_key: string
  folder: StorageFolder
  entity_type: string | null
  entity_id: string | null
  name: string
  mime: string | null
  size: number | null
  uploaded_by: string | null
  created_at: string
}

/** Dimensione file leggibile (KB/MB). */
export function humanSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
