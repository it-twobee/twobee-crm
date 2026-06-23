import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const { email, role } = await request.json()

  if (!email || !role) {
    return NextResponse.json({ error: 'Email e ruolo richiesti' }, { status: 400 })
  }

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
    data: { role, full_name: email.split('@')[0] },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggiorna il ruolo nel profilo (il trigger crea il profilo automaticamente)
  await supabase.from('profiles').update({ role }).eq('email', email)

  return NextResponse.json({ success: true, user: data.user })
}
