import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PersonalDocsClient } from '@/components/workspace/personal/PersonalDocsClient'
import { SetupNotice } from '@/components/workspace/SetupNotice'
import type { PersonalDocument } from '@/lib/types/database'

export const revalidate = 0

export default async function DocumentiPersonaliPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  // Owner-only: mai i documenti di un collega, nemmeno per un admin che passa di qui.
  const { data, error } = await sb
    .from('personal_documents')
    .select('*')
    .eq('profile_id', user.id)
    .order('expires_at', { ascending: true, nullsFirst: false })

  if (error?.code === 'PGRST205') {
    return <SetupNotice table="personal_documents" migration="089_personal_documents.sql" bucket="personal-documents" />
  }

  return <PersonalDocsClient documents={(data ?? []) as PersonalDocument[]} profileId={user.id} />
}
