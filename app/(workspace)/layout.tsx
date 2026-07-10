import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar'
import { isSuperAdminRaw, isAdminRole, isWorkspaceRole } from '@/lib/permissions'
import type { AppRole } from '@/lib/types/database'

// group_key/group_order arrivano dalla migration 087: opzionali finché non è
// applicata, la sidebar ha un fallback per chiave.
type WorkspaceSectionRow = {
  id: string; key: string; label: string; route: string; icon: string; sort_order: number
  group_key?: string | null; group_order?: number | null
}

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, app_role, email')
    .eq('id', user.id)
    .single()

  const isSuperAdmin = isSuperAdminRaw(profile?.email, profile?.app_role)
  const isAdminLevel = isSuperAdmin || isAdminRole(profile?.app_role)
  const isWorkspaceUser = isWorkspaceRole(profile?.app_role)

  if (!profile || (!isWorkspaceUser && !isAdminLevel)) {
    redirect('/dashboard')
  }

  const [sectionsRes, permsRes] = await Promise.all([
    supabase.from('workspace_sections').select('*').eq('is_active', true).order('sort_order'),
    isAdminLevel
      ? supabase.from('workspace_section_permissions').select('section_id, can_view').eq('can_view', true)
      : supabase.from('workspace_section_permissions').select('section_id, can_view').eq('app_role', profile.app_role),
  ])

  let visibleSections: typeof sectionsRes.data
  if (isAdminLevel) {
    // Admin/super_admin vede tutte le sezioni attive
    visibleSections = sectionsRes.data ?? []
  } else {
    const permMap = new Map((permsRes.data ?? []).map((p: { section_id: string; can_view: boolean }) => [p.section_id, p.can_view]))
    visibleSections = (sectionsRes.data ?? []).filter((s: { id: string }) => permMap.get(s.id) === true)

    // Sezioni universali: ogni membro deve vedere il proprio Profilo, anche se
    // in tabella mancano i permessi (la 079 non li ha seminati per 'profilo').
    const present = new Set((visibleSections ?? []).map((s: { key: string }) => s.key))
    const universal = (sectionsRes.data ?? []).filter((s: { key: string }) => ['profilo'].includes(s.key) && !present.has(s.key))
    visibleSections = [...(visibleSections ?? []), ...universal]
  }

  // Sezioni disattivate nel workspace: Chat (resta solo il Customer Care) e la
  // vista Task globale (le task si gestiscono da "Le mie attività" e dai progetti).
  // Nascondo le voci a monte; le rotte reindirizzano comunque.
  const HIDDEN_WORKSPACE_KEYS = ['chat', 'task']
  visibleSections = (visibleSections ?? []).filter((s: { key: string }) => !HIDDEN_WORKSPACE_KEYS.includes(s.key))

  // Workload: visibile a tutti nel workspace. Iniettata come fallback se la
  // migration 095 non è ancora stata applicata, così la voce compare subito.
  if (!(visibleSections ?? []).some((s: { key: string }) => s.key === 'workload')) {
    visibleSections = [
      ...(visibleSections ?? []),
      { id: 'synthetic-workload', key: 'workload', label: 'Workload', route: '/workspace/workload', icon: 'Gauge', sort_order: 7, group_key: 'lavori', group_order: 1 },
    ]
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <WorkspaceSidebar
        sections={(visibleSections ?? []) as WorkspaceSectionRow[]}
        isSuperAdmin={isSuperAdmin}
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
