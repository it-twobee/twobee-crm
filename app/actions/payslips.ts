'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { putObject, deleteObject } from '@/lib/storage/s3'
import { revalidatePath } from 'next/cache'

// I file delle buste paga vivono su MinIO interno (bucket `twobee-crm`, prefisso
// `payslips/`), NON esposto: il download passa dal proxy autenticato
// /api/payslips/:id/download (niente signed URL pubblici).

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

/**
 * URL del proxy di download per una busta paga. L'autorizzazione (propria o admin)
 * è ricontrollata sia qui sia nella route: le RLS proteggono la riga, il proxy il file.
 */
export async function getPayslipUrl(payslipId: string): Promise<{ url: string } | { error: string }> {
  const actor = await currentActor()
  if (!actor) return { error: 'Non autenticato' }

  const sb = await createClient()
  const { data: row, error } = await sb
    .from('payslips').select('id, profile_id').eq('id', payslipId).single()

  if (error || !row) return { error: 'Busta paga non trovata' }
  if (row.profile_id !== actor.userId && !actor.isAdmin) return { error: 'Non autorizzato' }

  return { url: `/api/payslips/${payslipId}/download` }
}

/** Carica una busta paga per un dipendente. Solo admin. */
export async function uploadPayslip(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const actor = await currentActor()
  if (!actor) return { error: 'Non autenticato' }
  if (!actor.isAdmin) return { error: 'Solo gli admin possono caricare buste paga' }

  const profileId = String(formData.get('profile_id') ?? '')
  const year = Number(formData.get('year'))
  const month = Number(formData.get('month'))
  const file = formData.get('file')

  if (!profileId || !year || !month) return { error: 'Dati mancanti' }
  if (!(file instanceof File) || file.size === 0) return { error: 'File mancante' }
  if (month < 1 || month > 12) return { error: 'Mese non valido' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const key = `payslips/${profileId}/${year}-${String(month).padStart(2, '0')}.${ext}`

  try {
    await putObject(key, Buffer.from(await file.arrayBuffer()), file.type || 'application/pdf')
  } catch (e) {
    return { error: `Upload fallito: ${(e as Error).message}` }
  }

  const { error: dbErr } = await createAdminClient().from('payslips').upsert({
    profile_id: profileId,
    year, month,
    file_path: key,
    file_name: file.name,
    uploaded_by: actor.userId,
  } as never, { onConflict: 'profile_id,year,month' })

  if (dbErr) return { error: dbErr.message }

  revalidatePath('/workspace/buste-paga')
  return { ok: true }
}

/** Elimina una busta paga (riga + file). Solo admin. */
export async function deletePayslip(payslipId: string): Promise<{ ok: true } | { error: string }> {
  const actor = await currentActor()
  if (!actor?.isAdmin) return { error: 'Non autorizzato' }

  const admin = createAdminClient()
  const { data: row } = await admin.from('payslips').select('file_path').eq('id', payslipId).single()
  if (row?.file_path) { try { await deleteObject(row.file_path as string) } catch {} }

  const { error } = await admin.from('payslips').delete().eq('id', payslipId)
  if (error) return { error: error.message }

  revalidatePath('/workspace/buste-paga')
  return { ok: true }
}
