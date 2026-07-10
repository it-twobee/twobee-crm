'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS, coarseRole, isAdminRole } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import type { AppRole } from '@/lib/types/database'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await supabase.from('profiles').select('email,app_role').eq('id', user.id).single()
  if (!profile) throw new Error('Profilo non trovato')
  const isSuper = SUPER_ADMIN_EMAILS.includes(profile.email) || profile.app_role === 'super_admin'
  const isAdmin = isSuper || profile.app_role === 'admin'
  if (!isAdmin) throw new Error('Accesso negato')
  return { callerId: user.id, isSuper }
}

// Promuove/cambia il ruolo (e i dati) di un utente. Allinea app_role + role così
// il suo portale workspace si aggiorna con sezioni, requisiti e responsabilità.
export async function adminUpdateUserProfile(userId: string, fields: {
  appRole?: AppRole; area?: string | null; jobTitle?: string | null
  competencies?: string[]; isActive?: boolean
}) {
  const { callerId, isSuper } = await assertAdmin()
  const admin = createAdminClient()

  const updates: Record<string, unknown> = {}
  if (fields.appRole) {
    // Anti-escalation: solo il super admin assegna ruoli amministrativi.
    if (isAdminRole(fields.appRole) && !isSuper)
      throw new Error('Solo il super admin può assegnare ruoli amministrativi')
    // Nessuno può declassare sé stesso (evita di perdere l'accesso admin per sbaglio).
    if (userId === callerId && coarseRole(fields.appRole) !== 'admin')
      throw new Error('Non puoi cambiare il tuo ruolo amministrativo')
    updates.app_role = fields.appRole
    updates.role = coarseRole(fields.appRole)
  }
  if (fields.area !== undefined) updates.area = fields.area
  if (fields.jobTitle !== undefined) updates.job_title = fields.jobTitle
  if (fields.competencies !== undefined) updates.competencies = fields.competencies
  if (fields.isActive !== undefined) updates.is_active = fields.isActive

  const { error } = await admin.from('profiles').update(updates as never).eq('id', userId)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
  revalidatePath('/workspace')
  return { role: updates.role as string | undefined }
}

export async function adminChangeUserEmail(userId: string, newEmail: string) {
  await assertAdmin()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { email: newEmail })
  if (error) throw new Error(error.message)
  // Aggiorna anche profiles
  await admin.from('profiles').update({ email: newEmail }).eq('id', userId)
}

export async function adminChangeUserName(userId: string, fullName: string) {
  await assertAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('id', userId)
  if (error) throw new Error(error.message)
}

export async function adminSendPasswordReset(email: string) {
  await assertAdmin()
  // Usa client normale per inviare reset email — non richiede admin key
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/reset-password`,
  })
  if (error) throw new Error(error.message)
}
