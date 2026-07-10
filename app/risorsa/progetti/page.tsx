import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { classifyUser } from '@/lib/resource'
import { FolderKanban, ExternalLink } from 'lucide-react'

export const revalidate = 0

export default async function RisorsaProgettiPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  const { kind } = await classifyUser(sb, user.id)
  const isExternal = kind === 'resource'

  const { data: myTasks } = await sb.from('tasks')
    .select('id, title, status, due_date, project_id, project:projects(id, name, status, client_id, clients(company_name))')
    .eq('assignee_id', user.id).order('due_date', { ascending: true, nullsFirst: false })

  // Raggruppa i miei task per progetto
  const byProject = new Map<string, { id: string; name: string; status: string; client: string | null; tasks: any[] }>()
  for (const t of (myTasks ?? []) as any[]) {
    const p = t.project
    if (!p) continue
    if (!byProject.has(p.id)) {
      byProject.set(p.id, {
        id: p.id, name: p.name, status: p.status,
        // Le risorse esterne non vedono il contesto cliente (regola §7)
        client: isExternal ? null : (p.clients?.company_name ?? null),
        tasks: [],
      })
    }
    if (t.status !== 'completato') byProject.get(p.id)!.tasks.push(t)
  }
  const projects = Array.from(byProject.values())

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 space-y-4">
      <h1 className="text-xl font-black text-text-primary">I miei progetti</h1>

      {projects.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <FolderKanban className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary text-sm">Nessun progetto assegnato.</p>
          <p className="text-text-tertiary text-xs mt-1">Vedrai qui i progetti su cui hai attività assegnate.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => (
            <div key={p.id} className="bg-surface border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.status === 'attivo' ? '#22C55E' : '#555' }} />
                <p className="text-sm font-bold text-text-primary flex-1">{p.name}</p>
                {p.client && <span className="text-[10px] text-text-secondary">{p.client}</span>}
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-surface text-text-secondary capitalize">{p.status}</span>
              </div>
              {p.tasks.length === 0 ? (
                <p className="text-[10px] text-text-tertiary px-1">Nessuna attività aperta</p>
              ) : (
                <div className="space-y-1">
                  {p.tasks.slice(0, 5).map(t => (
                    <Link key={t.id} href="/risorsa/attivita" className="flex items-center gap-2 px-1 py-1 rounded hover:bg-overlay/[0.03]">
                      <span className="w-1 h-1 rounded-full bg-[#3B82F6] shrink-0" />
                      <span className="flex-1 text-xs text-text-secondary truncate">{t.title}</span>
                      {t.due_date && <span className="text-[9px] text-text-tertiary">{new Date(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>}
                    </Link>
                  ))}
                  {p.tasks.length > 5 && <p className="text-[9px] text-text-tertiary px-1">+{p.tasks.length - 5} altre</p>}
                </div>
              )}
              {!isExternal && p.client && (
                <Link href={`/clienti/${(myTasks as any[]).find(t => t.project?.id === p.id)?.project?.client_id}/progetto/${p.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-[10px] text-text-secondary hover:text-gold">
                  Apri progetto completo <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
