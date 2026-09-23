import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildObjectKey, deleteObject, putObjectStream, StorageTooLarge, S3_BUCKET } from '@/lib/storage/s3'
import { MATERIAL_MAX_BYTES, MATERIAL_QUOTA_BYTES, humanBytes, materialKind, quotaLeft, rejectMaterial } from './materials'

/* §398 — Il caricamento nell'area di un cliente, uno solo per tutti e due i
   versi: lo carichi tu dal portale o lo carichiamo noi da Documenti, e le
   regole — quota, limite, tipi, ritorno indietro — vivono qui. Una regola
   scritta due volte non è una regola. */
export type MaterialUpload = {
  clientId: string
  actorId: string
  actorName: string
  source: 'cliente' | 'team'
  name: string
  mime: string | null
  body: ReadableStream<Uint8Array>
  idempotencyKey: string
  path: string | null
  projectId: string | null
  activityId: string | null
  /** Client di sessione o di servizio: legge quota e idempotenza. */
  admin: SupabaseClient
  /** Client con l'attore nell'header: scrive la riga del materiale. */
  actor: SupabaseClient
}
export type UploadResult =
  | { ok: true; id: string; repeated: boolean; leftBytes: number }
  | { ok: false; status: number; error: string }

export async function storeMaterial(input: MaterialUpload): Promise<UploadResult> {
  const existing = await input.admin.from('portal_materials').select('id')
    .eq('uploaded_by', input.actorId).eq('idempotency_key', input.idempotencyKey).maybeSingle()
  if (existing.error) return { ok: false, status: 503, error: 'Non è stato possibile caricare il file. Riprova.' }
  if (existing.data) return { ok: true, id: existing.data.id, repeated: true, leftBytes: 0 }

  // La quota è dell'azienda e conta tutto: i suoi file e i nostri.
  const usedBytes = await usedMaterialBytes(input.admin, input.clientId)
  if (usedBytes === null) return { ok: false, status: 503, error: 'Non è stato possibile verificare lo spazio. Riprova.' }
  const left = quotaLeft(usedBytes)
  if (left <= 0) {
    return { ok: false, status: 507, error: `Lo spazio dell’azienda è pieno (${humanBytes(MATERIAL_QUOTA_BYTES)}). Elimina qualcosa oppure scrivici.` }
  }

  const key = buildObjectKey('materiali', input.name, input.clientId)
  let size: number
  try {
    ({ size } = await putObjectStream(key, input.body, {
      contentType: input.mime ?? undefined, limitBytes: Math.min(MATERIAL_MAX_BYTES, left),
    }))
  } catch (error) {
    if (error instanceof StorageTooLarge) {
      return {
        ok: false, status: 413,
        error: left < MATERIAL_MAX_BYTES
          ? `Nello spazio dell’azienda restano ${humanBytes(left)}.`
          : `Il file supera ${humanBytes(MATERIAL_MAX_BYTES)}. Per un girato lungo, mandaci il link.`,
      }
    }
    return { ok: false, status: 502, error: 'Storage non disponibile' }
  }

  const rollback = async () => { try { await deleteObject(key) } catch { /* oggetto già assente */ } }
  const late = rejectMaterial({ name: input.name, mime: input.mime, size })
  if (late) { await rollback(); return { ok: false, status: 400, error: late } }

  const file = await input.admin.from('files').insert({
    bucket: S3_BUCKET, object_key: key, folder: 'materiali', folder_id: null,
    entity_type: 'client', entity_id: input.clientId,
    name: input.name, mime: input.mime, size, uploaded_by: input.actorId,
  }).select('id').single()
  if (file.error || !file.data) {
    await rollback()
    return { ok: false, status: 500, error: 'Non è stato possibile salvare il file. Riprova.' }
  }

  const material = await input.actor.from('portal_materials').insert({
    client_id: input.clientId, project_id: input.projectId, file_id: file.data.id, storage_key: key,
    name: input.name, mime: input.mime, size, kind: materialKind(input.mime, input.name)!,
    source: input.source, path: input.path,
    uploaded_by: input.actorId, uploaded_by_name: input.actorName,
    activity_id: input.activityId, idempotency_key: input.idempotencyKey,
  }).select('id').single()
  if (material.error || !material.data) {
    // Niente metadato orfano: il file non è mai esistito, per nessuno.
    await input.admin.from('files').delete().eq('id', file.data.id)
    await rollback()
    const denied = material.error?.code === '42501'
    return {
      ok: false, status: denied ? 403 : 500,
      error: denied ? 'Il tuo accesso non consente di caricare qui.' : 'Non è stato possibile registrare il file. Riprova.',
    }
  }
  return { ok: true, id: material.data.id, repeated: false, leftBytes: quotaLeft(usedBytes + size) }
}

const PAGE = 1000

/* A pagine: PostgREST taglia a mille righe, e una somma sulle prime mille
   diceva «c'è spazio» a un'azienda che l'aveva finito. `null` = non lo so. */
export async function usedMaterialBytes(db: SupabaseClient, clientId: string): Promise<number | null> {
  // §413 — la somma la fa il database (254); senza la migration, a pagine.
  const summed = await db.rpc('portal_material_usage', { p_client: clientId })
  if (!summed.error && summed.data != null && Number.isFinite(Number(summed.data))) return Number(summed.data)
  let total = 0
  for (let from = 0; ; from += PAGE) {
    const page = await db.from('portal_materials').select('id, size')
      .eq('client_id', clientId).is('deleted_at', null).order('id').range(from, from + PAGE - 1)
    if (page.error) return null
    const rows = page.data ?? []
    total += rows.reduce((sum, row) => sum + Number(row.size ?? 0), 0)
    if (rows.length < PAGE) return total
  }
}
