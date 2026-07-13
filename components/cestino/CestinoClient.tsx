'use client'

import { useState, useTransition } from 'react'
import { Trash2, RotateCcw, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/utils'
import { restoreTask, purgeTask } from '@/app/actions/tasks-trash'
import type { TrashedTask } from '@/lib/types/trash'

export function CestinoClient({ initialTasks }: { initialTasks: TrashedTask[] }) {
  const [tasks, setTasks] = useState<TrashedTask[]>(initialTasks)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const restore = (id: string) => {
    setBusy(id)
    startTransition(async () => {
      const res = await restoreTask(id)
      setBusy(null)
      if ('error' in res) { toast.error(res.error); return }
      setTasks(prev => prev.filter(t => t.id !== id))
      toast.success('Task ripristinata')
    })
  }

  const purge = (id: string) => {
    setBusy(id)
    startTransition(async () => {
      const res = await purgeTask(id)
      setBusy(null); setConfirmPurge(null)
      if ('error' in res) { toast.error(res.error); return }
      setTasks(prev => prev.filter(t => t.id !== id))
      toast.success('Eliminata definitivamente')
    })
  }

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-gold-text" aria-hidden="true" />
          Cestino
        </h1>
        <p className="text-text-tertiary text-sm mt-0.5">
          Task eliminate. Puoi ripristinarle o eliminarle in via definitiva. Le task ripristinate
          tornano dove si trovavano.
        </p>
      </header>

      {tasks.length === 0 ? (
        <div className="text-center py-20 text-text-tertiary text-sm">
          Il cestino è vuoto.
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map(t => (
            <li key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{t.title || 'Senza titolo'}</p>
                <p className="text-2xs text-text-tertiary truncate">
                  {t.project_name ? `${t.project_name} · ` : ''}
                  eliminata {t.deleted_at ? timeAgo(t.deleted_at) : ''}
                  {t.deleted_by_name ? ` da ${t.deleted_by_name}` : ''}
                </p>
              </div>

              <button
                onClick={() => restore(t.id)}
                disabled={busy === t.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-gold-text border border-border hover:border-gold/30 transition-colors disabled:opacity-50"
              >
                {busy === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Ripristina
              </button>

              {confirmPurge === t.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => purge(t.id)} disabled={busy === t.id}
                    className="px-2.5 py-1.5 rounded-lg bg-error text-on-gold text-xs font-semibold disabled:opacity-50">
                    Elimina davvero
                  </button>
                  <button onClick={() => setConfirmPurge(null)} aria-label="Annulla"
                    className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <button onClick={() => setConfirmPurge(t.id)} aria-label="Elimina definitivamente"
                  className="p-1.5 rounded-lg text-text-tertiary hover:text-error border border-border transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
