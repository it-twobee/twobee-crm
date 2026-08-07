import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DocumentiClient } from '@/components/documenti/DocumentiClient'

export const revalidate = 0

export default async function DocumentiPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const [docsRes, clientsRes] = await Promise.all([
    supabase.from('documents').select(`
      id, name, file_url, file_type, created_at, client_id,
      uploader:profiles!documents_uploaded_by_fkey(id, full_name, avatar_url),
      client:clients(id, company_name)
    `).order('created_at', { ascending: false }).limit(500),
    supabase.from('clients').select('id, company_name').order('company_name'),
  ])

  return (
    <DocumentiClient
      documents={(docsRes.data ?? []) as unknown as Parameters<typeof DocumentiClient>[0]['documents']}
      clients={(clientsRes.data ?? []) as unknown as { id: string; company_name: string }[]}
    />
  )
}
