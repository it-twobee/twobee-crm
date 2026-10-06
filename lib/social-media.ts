import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildObjectKey, deleteObject, putObjectStream, StorageTooLarge, S3_BUCKET } from '@/lib/storage/s3'
import { humanBytes } from '@/lib/portal/materials'
import { SOCIAL_MEDIA_MAX, SOCIAL_MEDIA_MAX_BYTES, rejectSocialMedia, socialMediaKind, socialThumbKey } from '@/lib/social'

/* §467 — Il caricamento di una creatività: lo stesso giro dei materiali
   (`lib/portal/upload.ts`). Prima i byte, poi la riga `files`, poi quella del
   media; se un passo fallisce si torna indietro, così non resta un metadato
   che punta al vuoto né un oggetto che nessuno elenca. */
export type SocialUpload = {
  contentId: string
  projectId: string
  actorId: string
  name: string
  mime: string | null
  body: ReadableStream<Uint8Array>
  idempotencyKey: string
  /** Client col service role e l'attore nell'header. */
  db: SupabaseClient
}
export type SocialUploadResult =
  | { ok: true; id: string; repeated: boolean }
  | { ok: false; status: number; error: string }

export async function storeSocialMedia(input: SocialUpload): Promise<SocialUploadResult> {
  const existing = await input.db.from('social_content_media').select('id')
    .eq('content_id', input.contentId).eq('idempotency_key', input.idempotencyKey).maybeSingle()
  if (existing.error) return { ok: false, status: 503, error: 'Non è stato possibile caricare il file. Riprova.' }
  if (existing.data) return { ok: true, id: existing.data.id, repeated: true }

  const count = await input.db.from('social_content_media').select('id', { count: 'exact', head: true }).eq('content_id', input.contentId)
  if (count.error) return { ok: false, status: 503, error: 'Non è stato possibile caricare il file. Riprova.' }
  if ((count.count ?? 0) >= SOCIAL_MEDIA_MAX) {
    return { ok: false, status: 409, error: `Un contenuto ha al massimo ${SOCIAL_MEDIA_MAX} creatività.` }
  }

  const key = buildObjectKey('social', input.name, input.projectId)
  let size: number
  try {
    ({ size } = await putObjectStream(key, input.body, { contentType: input.mime ?? undefined, limitBytes: SOCIAL_MEDIA_MAX_BYTES }))
  } catch (error) {
    if (error instanceof StorageTooLarge) {
      return { ok: false, status: 413, error: `Il file supera ${humanBytes(SOCIAL_MEDIA_MAX_BYTES)}.` }
    }
    return { ok: false, status: 502, error: 'Storage non disponibile' }
  }

  const rollback = async () => { try { await deleteObject(key) } catch { /* oggetto già assente */ } }
  const late = rejectSocialMedia({ name: input.name, mime: input.mime, size })
  if (late) { await rollback(); return { ok: false, status: 400, error: late } }

  const file = await input.db.from('files').insert({
    bucket: S3_BUCKET, object_key: key, folder: 'social', folder_id: null,
    entity_type: 'project', entity_id: input.projectId,
    name: input.name, mime: input.mime, size, uploaded_by: input.actorId,
  }).select('id').single()
  if (file.error || !file.data) {
    await rollback()
    return { ok: false, status: 500, error: 'Non è stato possibile salvare il file. Riprova.' }
  }

  const last = await input.db.from('social_content_media').select('sort_order')
    .eq('content_id', input.contentId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const media = await input.db.from('social_content_media').insert({
    content_id: input.contentId, file_id: file.data.id, storage_key: key,
    name: input.name, mime: input.mime, size, kind: socialMediaKind(input.mime, input.name)!,
    sort_order: (last.data?.sort_order ?? -1) + 1,
    uploaded_by: input.actorId, idempotency_key: input.idempotencyKey,
  }).select('id').single()
  if (media.error || !media.data) {
    await input.db.from('files').delete().eq('id', file.data.id)
    await rollback()
    return { ok: false, status: 500, error: 'Non è stato possibile registrare il file. Riprova.' }
  }
  return { ok: true, id: media.data.id, repeated: false }
}

/**
 * Toglie i byte e le righe `files` di creatività la cui riga è già andata.
 * Non si ferma al primo errore: restituisce quante ne restano orfane, perché
 * un oggetto rimasto su MinIO si dichiara, non si nasconde.
 */
export async function removeSocialObjects(
  db: SupabaseClient,
  items: { id: string; storage_key: string; file_id: string | null }[],
): Promise<number> {
  let orfani = 0
  for (const m of items) {
    try { await deleteObject(m.storage_key) } catch { orfani++ }
    try { await deleteObject(socialThumbKey(m.id)) } catch { /* la miniatura può non esserci mai stata */ }
    if (m.file_id) {
      const gone = await db.from('files').delete().eq('id', m.file_id)
      if (gone.error) orfani++
    }
  }
  return orfani
}
