import { isAdminRole, isWorkspaceRole } from '@/lib/permissions'
import { SENSITIVE_FOLDERS, isStorageFolder } from './shared'
import type { StorageFile, StorageFolderRow } from './shared'

export type StorageActor = { userId: string; role: string | null; appRole: string | null; active: boolean }
export type StorageContext = Pick<StorageFile, 'folder' | 'entity_type' | 'entity_id'>

export function isStorageStaff(actor: StorageActor) {
  return actor.active && ((actor.role === 'admin' && isAdminRole(actor.appRole))
    || (actor.role === 'team' && (isWorkspaceRole(actor.appRole) || actor.appRole === 'viewer')))
}

export function isStorageAdmin(actor: StorageActor) {
  return isStorageStaff(actor) && actor.role === 'admin'
}

export function canWriteStorage(actor: StorageActor) {
  return isStorageStaff(actor) && actor.appRole !== 'viewer'
}

export function canReadFile(actor: StorageActor, file: Pick<StorageFile, 'folder' | 'uploaded_by'>) {
  return isStorageStaff(actor) && isStorageFolder(file.folder) && (isStorageAdmin(actor)
    || file.uploaded_by === actor.userId || !SENSITIVE_FOLDERS.includes(file.folder))
}

export function canDeleteFile(actor: StorageActor, file: Pick<StorageFile, 'uploaded_by'>) {
  return canWriteStorage(actor) && (isStorageAdmin(actor) || file.uploaded_by === actor.userId)
}

export function canReadFolder(actor: StorageActor, folder: Pick<StorageFolderRow, 'folder' | 'created_by'>) {
  return canReadFile(actor, { folder: folder.folder, uploaded_by: folder.created_by })
}

export function canManageFolder(actor: StorageActor, folder: Pick<StorageFolderRow, 'created_by'>) {
  return canDeleteFile(actor, { uploaded_by: folder.created_by })
}

export function sameStorageContext(a: StorageContext, b: StorageContext) {
  return a.folder === b.folder && a.entity_type === b.entity_type && a.entity_id === b.entity_id
}

export function isStorageUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function parseStorageContext(folder: unknown, entityType: unknown, entityId: unknown): StorageContext | null {
  if (typeof folder !== 'string' || !isStorageFolder(folder)) return null
  const type = entityType === '' || entityType == null ? null : entityType
  const id = entityId === '' || entityId == null ? null : entityId
  if ((type === null) !== (id === null)) return null
  if (type !== null && (typeof type !== 'string' || !['client', 'project', 'profile', 'feedback', 'channel'].includes(type) || !isStorageUuid(id))) return null
  if (folder === 'clients' && type !== 'client') return null
  if (folder === 'feedback' && type !== 'feedback') return null
  return { folder, entity_type: type as string | null, entity_id: id as string | null }
}

export function canShareFile(actor: StorageActor, file: Pick<StorageFile, 'folder' | 'entity_type' | 'uploaded_by'>) {
  // Un link anonimo sopravviverebbe alla revoca dell'accesso azienda/progetto.
  return canDeleteFile(actor, file) && ['misc', 'knowledge', 'feedback'].includes(file.folder)
    && (file.entity_type === null || file.entity_type === 'feedback')
}

export function validStorageObject(file: Pick<StorageFile, 'folder' | 'bucket' | 'object_key'>, bucket: string) {
  return isStorageFolder(file.folder) && file.bucket === bucket && file.object_key.startsWith(`${file.folder}/`)
    && !file.object_key.split('/').some(part => part === '..' || part === '.')
}

export function fileResponseHeaders(name: string, mime: string | null | undefined, length?: number) {
  const contentType = mime || 'application/octet-stream'
  const inline = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|text\/plain|audio\/[\w.+-]+|video\/[\w.+-]+)$/i.test(contentType)
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(name)}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Referrer-Policy': 'no-referrer',
  })
  if (length !== undefined) headers.set('Content-Length', String(length))
  return headers
}
