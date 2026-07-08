import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar'
import type { AppRole } from '@/lib/types/database'

const WORKSPACE_ROLES: AppRole[] = ['manager', 'senior', 'junior', 'stage', 'freelance']

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, app_role')
    .eq('id', user.id)
    .single()

  if (!profile || !WORKSPACE_ROLES.includes(profile.app_role as AppRole)) {
    redirect('/dashboard')
  }

  const [sectionsRes, permsRes] = await Promise.all([
    supabase.from('workspace_sections').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('workspace_section_permissions')
      .select('section_id, can_view')
      .eq('app_role', profile.app_role),
  ])

  const permMap = new Map((permsRes.data ?? []).map((p: { section_id: string; can_view: boolean }) => [p.section_id, p.can_view]))
  const visibleSections = (sectionsRes.data ?? []).filter((s: { id: string }) => permMap.get(s.id) === true)

  return (
    <div className="flex h-screen bg-[#111111] overflow-hidden">
      <WorkspaceSidebar
        sections={visibleSections}
        profile={{
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          app_role: profile.app_role as AppRole | null,
        }}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
