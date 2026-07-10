'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

const BUCKET = 'payslips'
const SIGNED_URL_TTL = 60 // secondi: il link serve solo per il download immediato

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
 * Restituisce un link firmato a scadenza breve per scaricare una busta paga.
 * L'autorizzazione è ricontrollata qui: le RLS proteggono la riga, ma il file
 * nello storage no — chi conosce il path potrebbe scaricarlo altrimenti.
 */
export async function getPayslipUrl(payslipId: string): Promise<{ url: string } | { error: string }> {
  const actor = await currentActor()
  if (!actor) return { error: 'Non autenticato' }

  const sb = await createClient()
  const { data: row, error } = await sb
    .from('payslips').select('id, profile_id, file_path').eq('id', payslipId).single()

  if (error || !row) return { error: 'Busta paga non trovata' }
  if (row.profile_id !== actor.userId && !actor.isAdmin) return { error: 'Non autorizzato' }

  const { data, error: signErr } = await createAdminClient()
    .storage.from(BUCKET).createSignedUrl(row.file_path, SIGNED_URL_TTL)

  if (signErr || !data) return { error: 'Impossibile generare il link di download' }
  return { url: data.signedUrl }
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

  const admin = createAdminClient()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const path = `${profileId}/${year}-${String(month).padStart(2, '0')}.${ext}`

  const { error: upErr } = await admin.storage.from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' })
  if (upErr) return { error: `Upload fallito: ${upErr.message}` }

  const { error: dbErr } = await admin.from('payslips').upsert({
    profile_id: profileId,
    year, month,
    file_path: path,
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
  if (row?.file_path) await admin.storage.from(BUCKET).remove([row.file_path])

  const { error } = await admin.from('payslips').delete().eq('id', payslipId)
  if (error) return { error: error.message }

  revalidatePath('/workspace/buste-paga')
  return { ok: true }
}
