import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DocumentiClient } from '@/components/documenti/DocumentiClient'

export const revalidate = 0

export default async function WorkspaceDocumentiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS filtra automaticamente per visibility (operations_visible, client_visible, shared_in_report)
  const [docsRes, clientsRes, projectsRes] = await Promise.all([
    supabase.from('documents').select(`
      id, name, file_url, file_type, created_at, client_id, project_id,
      uploader:profiles!documents_uploaded_by_fkey(id, full_name, avatar_url),
      client:clients(id, company_name),
      project:projects(id, name)
    `).order('created_at', { ascending: false }).limit(200),
    supabase.from('clients').select('id, company_name').order('company_name'),
    supabase.from('projects').select('id, name, client_id').order('name'),
  ])

  return (
    <DocumentiClient
      documents={(docsRes.data ?? []) as unknown as Parameters<typeof DocumentiClient>[0]['documents']}
      clients={(clientsRes.data ?? []) as unknown as { id: string; company_name: string }[]}
      projects={(projectsRes.data ?? []) as unknown as { id: string; name: string; client_id: string }[]}
    />
  )
}
