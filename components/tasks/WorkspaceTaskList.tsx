'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Profile, Task } from '@/lib/types/database'
import { TaskDrawer, type DrawerTask } from './TaskDrawer'

// 4i: le liste task della dashboard workspace aprono lo stesso TaskDrawer
// condiviso (§6.1). Il task ridotto della dashboard viene idratato al click.
type Row = {
  id: string; title: string; status: string; due_date: string | null
  project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
}

export function WorkspaceTaskList({ tasks, statusColorMap, profiles, canEdit = true }: {
  tasks: Row[]
  statusColorMap: Record<string, string>
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  canEdit?: boolean
}) {
  const [rows, setRows] = useState<Row[]>(tasks)
  const [selected, setSelected] = useState<DrawerTask | null>(null)
  const [initialAssignees, setInitialAssignees] = useState<string[]>([])
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const open = async (r: Row) => {
    if (loadingId) return
    setLoadingId(r.id)
    const sb = createClient()
    const [{ data: full }, { data: asg }] = await Promise.all([
      sb.from('tasks').select('*').eq('id', r.id).single(),
      sb.from('task_assignees').select('profile_id, is_primary_owner').eq('task_id', r.id),
    ])
    setLoadingId(null)
    if (!full) { toast.error('Task non trovata'); return }
    const ids = (asg ?? [])
      .sort((a, b) => (b.is_primary_owner ? 1 : 0) - (a.is_primary_owner ? 1 : 0))
      .map(a => a.profile_id)
    setInitialAssignees(ids.length ? ids : ((full as Task).assignee_id ? [(full as Task).assignee_id!] : []))
    setSelected({ ...(full as Task), project: r.project })
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {rows.map(t => (
          <div key={t.id} onClick={() => open(t)} role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(t) } }}
            className={cn('flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface border border-border hover:border-border-strong cursor-pointer transition-colors', loadingId === t.id && 'opacity-60')}>
            <span className={cn('text-xs w-16 shrink-0', statusColorMap[t.status] ?? 'text-text-tertiary')}>
              {t.status === 'da_fare' ? 'Da fare' : t.status === 'in_corso' ? 'In corso' : 'Revisione'}
            </span>
            <span className="text-text-primary text-sm truncate flex-1">{t.title}</span>
            {t.project && (
              <Link href={`/workspace/progetti/${t.project.id}`} onClick={e => e.stopPropagation()}
                className="text-text-tertiary hover:text-text-secondary text-xs truncate max-w-[120px] shrink-0 transition-colors">
                {t.project.name}
              </Link>
            )}
            {t.due_date && (
              <span className="text-text-tertiary text-xs shrink-0">
                {new Date(t.due_date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-scrim" onClick={() => setSelected(null)} />
          <div className="relative z-10 flex h-full">
            <TaskDrawer
              task={selected}
              profiles={profiles}
              canEdit={canEdit}
              initialAssignees={initialAssignees}
              onClose={() => setSelected(null)}
              onPatched={patch => {
                setSelected(prev => (prev ? { ...prev, ...patch } as DrawerTask : prev))
                setRows(prev => prev.map(r => r.id === selected.id
                  ? {
                      ...r,
                      ...(patch.title !== undefined ? { title: patch.title as string } : {}),
                      ...(patch.status !== undefined ? { status: patch.status as string } : {}),
                      ...(patch.due_date !== undefined ? { due_date: patch.due_date as string | null } : {}),
                    }
                  : r))
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
