import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // I token stanno in google_credentials (deny-all): solo il service role li tocca.
  const admin = createAdminClient()
  await admin.from('google_credentials').delete().eq('profile_id', user.id)
  await admin.from('profiles').update({ google_connected: false } as never).eq('id', user.id)

  return NextResponse.json({ ok: true })
}
