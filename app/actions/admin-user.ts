'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await supabase.from('profiles').select('email,app_role').eq('id', user.id).single()
  if (!profile) throw new Error('Profilo non trovato')
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile.email) || profile.app_role === 'admin'
  if (!isAdmin) throw new Error('Accesso negato')
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
