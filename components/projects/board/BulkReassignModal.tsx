'use client'

import { useState } from 'react'
import { UserCheck, X, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AssigneePicker } from '@/components/tasks/AssigneePicker'
import { bulkSetTaskAssignees } from '@/app/actions/task-assignees'
import type { Profile } from '@/lib/types/database'
import type { ExtTask } from './types'

// ─── Bulk Reassign Modal ──────────────────────────────────────────────────────
export function BulkReassignModal({ tasks, profiles, onClose, onDone }: {
  tasks: ExtTask[]
  profiles: Profile[]
  onClose: () => void
  onDone: (ids: string[], assigneeId: string | null) => void
}) {
  const [selected, setSelected] = useState<string[]>(tasks.map(t => t.id))
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const confirm = async () => {
    if (assigneeIds.length === 0 || selected.length === 0) return
    setSaving(true)
    const res = await bulkSetTaskAssignees(selected, assigneeIds)
    setSaving(false)
    if ('error' in res) { toast.error(res.error); return }
    toast.success(`${selected.length} task riassegnat${selected.length === 1 ? 'a' : 'e'}`)
    onDone(selected, res.primaryId)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-gold-text" />
              Riassegna task
            </h2>
            <p className="text-text-tertiary text-xs mt-0.5">{selected.length} di {tasks.length} selezionate</p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Assignee picker — una o più risorse; la prima è la primaria */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <label className="text-text-tertiary text-xs mb-1.5 block">Assegna a</label>
          <AssigneePicker profiles={profiles} value={assigneeIds} onChange={setAssigneeIds} />
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-tertiary text-xs">Task disponibili</span>
            <button
              onClick={() => setSelected(selected.length === tasks.length ? [] : tasks.map(t => t.id))}
              className="text-xs text-gold-text/60 hover:text-gold-text transition-colors"
            >
              {selected.length === tasks.length ? 'Deseleziona tutte' : 'Seleziona tutte'}
            </button>
          </div>
          {tasks.map(t => {
            const isSelected = selected.includes(t.id)
            const assignee = profiles.find(p => p.id === t.assignee_id)
            return (
              <button
                key={t.id}
                onClick={() => toggle(t.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  isSelected ? 'bg-gold/5 border border-gold/20' : 'bg-surface border border-border hover:border-border/80'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-gold border-gold' : 'border-border'
                }`}>
                  {isSelected && <Check className="w-2.5 h-2.5 text-on-gold" />}
                </div>
                <span className="text-text-primary text-sm flex-1 truncate">{t.title}</span>
                {assignee && (
                  <span className="text-text-tertiary text-xs shrink-0">{assignee.full_name.split(' ')[0]}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
          <button
            onClick={confirm}
            disabled={assigneeIds.length === 0 || selected.length === 0 || saving}
            className="flex-1 py-2.5 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Riassegna ${selected.length} task`}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-text-tertiary text-sm rounded-xl hover:text-text-primary transition-colors">
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
