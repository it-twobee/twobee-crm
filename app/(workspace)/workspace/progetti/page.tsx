import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Briefcase, FolderKanban } from 'lucide-react'

export const revalidate = 0

const STATUS_TONE: Record<string, string> = {
  draft: 'text-text-tertiary', active: 'text-success', on_hold: 'text-warning',
  completed: 'text-info', archived: 'text-text-tertiary',
}

export default async function WorkspaceProgettiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'team' && profile?.role !== 'admin') redirect('/workspace')

  // RLS scope: team interni vedono tutti i progetti, esterni solo i propri
  const { data: projects } = await supabase
    .from('projects').select('id, name, status, area, service_type, client_id')
    .is('deleted_at', null).order('created_at', { ascending: false })
  const { data: clients } = await supabase.from('clients').select('id, company_name, display_name')

  const clientName = (id: string) => {
    const c = (clients ?? []).find(x => x.id === id)
    return (c?.display_name || c?.company_name) ?? '—'
  }
  const rows = projects ?? []

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Progetti</h1>
        <p className="text-sm text-text-secondary mt-1">{rows.length} progetti</p>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <FolderKanban className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Nessun progetto assegnato.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {rows.map(p => (
            <Link key={p.id} href={`/workspace/progetti/${p.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors">
              <Briefcase className="w-4 h-4 text-gold-text shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">{p.name}</div>
                <div className="text-2xs text-text-tertiary">{clientName(p.client_id)} · {p.area} · {p.service_type}</div>
              </div>
              <span className={`text-2xs font-semibold ${STATUS_TONE[p.status] ?? 'text-text-tertiary'}`}>{p.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
