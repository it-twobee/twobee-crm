import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { token, fullName, password } = await request.json()

  if (!token || !fullName || !password) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'La password deve avere almeno 6 caratteri' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: invite, error: invError } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .single()

  if (invError || !invite) {
    return NextResponse.json({ error: 'Invito non trovato' }, { status: 404 })
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: 'Invito già utilizzato' }, { status: 410 })
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invito scaduto' }, { status: 410 })
  }

  // Controlla se l'utente esiste già in auth
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === invite.email)

  if (existingUser) {
    return NextResponse.json({ error: 'Un account con questa email esiste già. Accedi dalla pagina di login.' }, { status: 409 })
  }

  // Crea utente in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      app_role: invite.app_role,
    },
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Errore creazione account' }, { status: 500 })
  }

  // Mapping app_role → role per compatibilità con il sistema RLS esistente
  const roleMap: Record<string, string> = {
    super_admin: 'admin',
    founder: 'admin',
    admin: 'admin',
    manager: 'team',
    senior: 'team',
    junior: 'team',
    stage: 'team',
    freelance: 'team',
    partner: 'guest',
    viewer: 'team',
    client: 'client',
    guest: 'guest',
  }

  // Aggiorna profilo (il trigger handle_new_user dovrebbe già averlo creato)
  await supabase.from('profiles').upsert({
    id: authData.user.id,
    email: invite.email,
    full_name: fullName,
    role: roleMap[invite.app_role] ?? 'team',
    app_role: invite.app_role,
    area: invite.area,
    job_title: invite.job_title,
    is_active: true,
  }, { onConflict: 'id' })

  // Segna invito come accettato
  await supabase.from('invitations').update({
    accepted_at: new Date().toISOString(),
  }).eq('id', invite.id)

  return NextResponse.json({ success: true })
}
