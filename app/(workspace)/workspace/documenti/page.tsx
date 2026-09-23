import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { isMissingPortalSchema } from '@/lib/portal/model'
import { DocumentiClient } from '@/components/documenti/DocumentiClient'
import type { DocMaterial } from '@/components/documenti/DocumentiClient'

export const revalidate = 0

export default async function WorkspaceDocumentiPage() {
  const { user } = await getViewer()
  if (!user) redirect('/login')
  const supabase = await createClient()

  // RLS filtra per visibility (operations_visible, client_visible, shared_in_report)
  const [docsRes, clientsRes, materialsRes] = await Promise.all([
    supabase.from('documents').select(`
      id, name, file_url, file_type, created_at, client_id,
      uploader:profiles!documents_uploaded_by_fkey(id, full_name, avatar_url),
      client:clients(id, company_name)
    `).order('created_at', { ascending: false }).limit(500),
    supabase.from('clients_workspace').select('id, company_name').order('company_name'),
    supabase.from('portal_materials')
      .select('id, client_id, project_id, name, mime, size, kind, path, source, uploaded_by, uploaded_by_name, created_at, archived_at')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(2000),
  ])

  /* §213 — l'elenco delle aziende passa da `clients_workspace`, ma la RLS di
     `documents` e `portal_materials` non sa niente di `workspace_hidden`: senza
     questo filtro un file di GAV Sistemi comparirebbe qui col nome sopra. */
  const allowed = new Set((clientsRes.data ?? []).map(c => c.id as string))
  const materials = (isMissingPortalSchema(materialsRes.error) ? [] : (materialsRes.data ?? []))
    .filter(m => allowed.has(m.client_id as string))
  const documents = (docsRes.data ?? []).filter(d => !d.client_id || allowed.has(d.client_id as string))

  return (
    <DocumentiClient voce="documenti"
      documents={documents as unknown as Parameters<typeof DocumentiClient>[0]['documents']}
      materials={materials as unknown as DocMaterial[]}
      clients={(clientsRes.data ?? []) as unknown as { id: string; company_name: string }[]}
    />
  )
}
