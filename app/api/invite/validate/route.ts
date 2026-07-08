import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token mancante' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: invite, error } = await supabase
    .from('invitations')
    .select('email, app_role, area, job_title, accepted_at, expires_at')
    .eq('token', token)
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: 'Invito non trovato' }, { status: 404 })
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: 'Invito già utilizzato' }, { status: 410 })
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invito scaduto', expired: true }, { status: 410 })
  }

  return NextResponse.json({
    email: invite.email,
    app_role: invite.app_role,
    area: invite.area,
    job_title: invite.job_title,
  })
}
