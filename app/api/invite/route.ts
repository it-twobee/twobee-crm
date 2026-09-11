import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { coarseRole } from '@/lib/permissions'
import type { AppRole } from '@/lib/types/database'

/* §329 — il ruolo arrivava dal corpo della richiesta e finiva **verbatim** in
   `profiles.role` e in `user_metadata.role`, che il trigger `handle_new_user`
   ricopia nella stessa colonna. `profiles.role` è il ruolo di autorizzazione
   (`get_my_role()` per la RLS, il middleware per il portale): non è un campo
   che un corpo JSON possa scegliere. Qui si accetta un `app_role` dell'elenco
   chiuso e il ruolo grosso lo deriva `coarseRole`, come in `/api/invite/accept`
   e nel cambio ruolo admin — una mappa sola, come dice il manuale. */
const APP_ROLES: AppRole[] = [
  'super_admin', 'founder', 'admin', 'manager', 'senior', 'junior',
  'stage', 'freelance', 'partner', 'viewer', 'client', 'guest',
]

export async function POST(request: Request) {
  const { email, role: appRoleRaw } = await request.json()

  if (!email || !appRoleRaw) {
    return NextResponse.json({ error: 'Email e ruolo richiesti' }, { status: 400 })
  }
  if (!APP_ROLES.includes(appRoleRaw as AppRole)) {
    return NextResponse.json({ error: 'Ruolo non valido' }, { status: 400 })
  }
  const appRole = appRoleRaw as AppRole
  const role = coarseRole(appRole)

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]) } catch {}
          })
        },
      },
    }
  )

  // Verifica che chi chiama sia admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Permesso negato' }, { status: 403 })
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: email.split('@')[0], app_role: appRole },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggiorna il ruolo nel profilo (il trigger crea il profilo automaticamente)
  await supabase.from('profiles').update({ role, app_role: appRole }).eq('email', email)

  return NextResponse.json({ success: true, user: data.user })
}
