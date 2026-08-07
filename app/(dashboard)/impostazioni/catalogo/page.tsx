import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { isSuperAdminRaw } from '@/lib/permissions'
import { CatalogoClient } from '@/components/impostazioni/CatalogoClient'
import type { ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode } from '@/lib/types/database'

export const revalidate = 0

export default async function CatalogoPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const profile = await getSessionProfile()
  if (!isSuperAdminRaw(profile?.email, profile?.app_role)) redirect('/dashboard')

  const [{ data: services }, { data: templates }, { data: nodes }] = await Promise.all([
    supabase.from('service_catalog').select('*').order('area').order('sort_order'),
    supabase.from('project_templates').select('*').order('service_type').order('sort_order'),
    supabase.from('project_template_nodes').select('*').order('sort_order'),
  ])

  return (
    <CatalogoClient
      services={(services ?? []) as ServiceCatalogEntry[]}
      templates={(templates ?? []) as ProjectTemplate[]}
      nodes={(nodes ?? []) as ProjectTemplateNode[]}
    />
  )
}
