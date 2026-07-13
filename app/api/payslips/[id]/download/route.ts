import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { getObject } from '@/lib/storage/s3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/payslips/:id/download — proxy autenticato (propria busta o admin).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { data: profile } = await sb.from('profiles').select('email, app_role, role').eq('id', user.id).single()
  const isAdmin =
    isSuperAdminRaw(profile?.email, profile?.app_role) ||
    isAdminRole(profile?.app_role) ||
    profile?.role === 'admin'

  const admin = createAdminClient()
  const { data: row } = await admin.from('payslips')
    .select('profile_id, file_path, file_name').eq('id', params.id).single()
  if (!row || !row.file_path) return NextResponse.json({ error: 'Busta paga non trovata' }, { status: 404 })
  if (row.profile_id !== user.id && !isAdmin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  let obj
  try {
    obj = await getObject(row.file_path as string)
  } catch (e) {
    return NextResponse.json({ error: 'Storage non disponibile: ' + (e as Error).message }, { status: 502 })
  }

  const headers = new Headers({
    'Content-Type': obj.contentType || 'application/pdf',
    'Content-Disposition': `inline; filename="${encodeURIComponent((row.file_name as string) || 'busta-paga.pdf')}"`,
    'Cache-Control': 'private, no-store',
  })
  if (obj.contentLength) headers.set('Content-Length', String(obj.contentLength))
  return new Response(obj.body, { headers })
}
