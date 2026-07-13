'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { putObject, deleteObject, buildObjectKey } from '@/lib/storage/s3'
import { revalidatePath } from 'next/cache'

// Documenti personali: metadati nella tabella `personal_documents`, file opzionale
// su MinIO interno (bucket `twobee-crm`, prefisso `personal/`). Owner o admin.
// Download via proxy autenticato /api/personal-documents/:id/download.

async function currentActor() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await sb
    .from('profiles').select('id, email, app_role, role').eq('id', user.id).single()
  const isAdmin =
    isSuperAdminRaw(profile?.email, profile?.app_role) ||
    isAdminRole(profile?.app_role) ||
    profile?.role === 'admin'
  return { userId: user.id, isAdmin }
}

/** Crea un documento personale (metadati + file opzionale). Owner o admin. */
export async function upsertPersonalDoc(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const actor = await currentActor()
  if (!actor) return { error: 'Non autenticato' }

  const profileId = String(formData.get('profile_id') ?? '') || actor.userId
  if (profileId !== actor.userId && !actor.isAdmin) return { error: 'Non autorizzato' }

  const label = String(formData.get('label') ?? '').trim()
  const docType = String(formData.get('doc_type') ?? '').trim()
  const expiresAt = String(formData.get('expires_at') ?? '') || null
  const reminder = Number(formData.get('reminder_days_before') ?? 30)
  const file = formData.get('file')

  if (!label) return { error: 'Il nome del documento è obbligatorio' }

  let filePath: string | null = null
  let fileName: string | null = null
  if (file instanceof File && file.size > 0) {
    const key = buildObjectKey('personal', file.name, profileId)
    try {
      await putObject(key, Buffer.from(await file.arrayBuffer()), file.type || 'application/octet-stream')
    } catch (e) {
      return { error: `Upload fallito: ${(e as Error).message}` }
    }
    filePath = key
    fileName = file.name
  }

  const { error } = await createAdminClient().from('personal_documents').insert({
    profile_id: profileId,
    doc_type: docType || 'Altro',
    label,
    file_path: filePath,
    file_name: fileName,
    expires_at: expiresAt,
    reminder_days_before: Number.isFinite(reminder) ? reminder : 30,
    created_by: actor.userId,
  } as never)

  if (error) {
    if (filePath) { try { await deleteObject(filePath) } catch {} }
    return { error: error.message }
  }

  revalidatePath('/workspace/documenti-personali')
  return { ok: true }
}

/** URL del proxy di download (se il documento ha un file). Owner o admin. */
export async function getPersonalDocUrl(id: string): Promise<{ url: string } | { error: string }> {
  const actor = await currentActor()
  if (!actor) return { error: 'Non autenticato' }
  const { data: row } = await createAdminClient()
    .from('personal_documents').select('profile_id, file_path').eq('id', id).single()
  if (!row || !row.file_path) return { error: 'Nessun file allegato' }
  if (row.profile_id !== actor.userId && !actor.isAdmin) return { error: 'Non autorizzato' }
  return { url: `/api/personal-documents/${id}/download` }
}

/** Elimina un documento personale (riga + eventuale file). Owner o admin. */
export async function deletePersonalDoc(id: string): Promise<{ ok: true } | { error: string }> {
  const actor = await currentActor()
  if (!actor) return { error: 'Non autenticato' }

  const admin = createAdminClient()
  const { data: row } = await admin.from('personal_documents').select('profile_id, file_path').eq('id', id).single()
  if (!row) return { error: 'Documento non trovato' }
  if (row.profile_id !== actor.userId && !actor.isAdmin) return { error: 'Non autorizzato' }

  if (row.file_path) { try { await deleteObject(row.file_path as string) } catch {} }
  const { error } = await admin.from('personal_documents').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/workspace/documenti-personali')
  return { ok: true }
}
