import 'server-only'
import { canGovernProjects } from '@/lib/permissions'
import { getCaller, type Caller } from '@/lib/storage/guard'
import { canWriteStorage, isStorageUuid } from '@/lib/storage/access'
import { dirittiSocial } from '@/lib/social'

/* §467 — La porta delle creatività social, per le rotte `/api/social/media/**`.
   Non è un file `'use server'` di proposito: le guard non devono diventare
   endpoint. Ruolo, poi riga letta con la RLS, poi diritto sul contenuto:
   nessuna rotta arriva a MinIO prima di tutti e tre. */

export type SocialContentGate = {
  id: string; client_id: string; project_id: string
  owner_id: string | null; created_by: string | null
}

export type SocialGate<T> =
  | { ok: true; caller: Caller; governa: boolean; content: SocialContentGate; row: T }
  | { ok: false; status: number; error: string }

const CONTENT_COLUMNS = 'id, client_id, project_id, owner_id, created_by'

export async function requireSocialContent(contentId: string, write: boolean): Promise<SocialGate<null>> {
  const caller = await getCaller()
  if (!caller) return { ok: false, status: 401, error: 'Non autorizzato' }
  if (!isStorageUuid(contentId)) return { ok: false, status: 404, error: 'Contenuto non trovato' }
  // La RLS decide chi lo vede: un esterno vede solo i suoi progetti (148).
  const read = await caller.session.from('social_contents').select(CONTENT_COLUMNS).eq('id', contentId).maybeSingle()
  if (read.error) return { ok: false, status: 503, error: 'Contenuto non disponibile' }
  if (!read.data) return { ok: false, status: 404, error: 'Contenuto non trovato' }
  const content = read.data as SocialContentGate
  const governa = canGovernProjects({ role: caller.role, app_role: caller.appRole })
  if (write) {
    if (!canWriteStorage(caller)) return { ok: false, status: 403, error: 'Accesso in sola lettura' }
    if (!dirittiSocial({ governa, userId: caller.userId, contenuto: content }).modifica) {
      return { ok: false, status: 403, error: 'Lo modifica chi governa i progetti o chi ha il contenuto in carico.' }
    }
  }
  return { ok: true, caller, governa, content, row: null }
}

export type SocialMediaRow = { id: string; content_id: string; name: string; mime: string | null; size: number; kind: string }

export async function requireSocialMedia(mediaId: string, write: boolean): Promise<SocialGate<SocialMediaRow>> {
  const caller = await getCaller()
  if (!caller) return { ok: false, status: 401, error: 'Non autorizzato' }
  if (!isStorageUuid(mediaId)) return { ok: false, status: 404, error: 'File non trovato' }
  const media = await caller.session.from('social_content_media')
    .select('id, content_id, name, mime, size, kind').eq('id', mediaId).maybeSingle()
  // Un errore di lettura non è un «non esiste».
  if (media.error) return { ok: false, status: 503, error: 'File non disponibile' }
  if (!media.data) return { ok: false, status: 404, error: 'File non trovato' }
  const gate = await requireSocialContent(media.data.content_id, write)
  if (!gate.ok) return gate
  return { ...gate, row: media.data as SocialMediaRow }
}
