'use client'

import { useState, useEffect } from 'react'
import { Plus, Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Task } from '@/lib/types/database'

interface Subtask extends Task {
  children?: Task[]
}

interface SubtaskListProps {
  parentTaskId: string
  depth?: number
}

export function SubtaskList({ parentTaskId, depth = 1 }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('parent_task_id', parentTaskId)
        .order('created_at')
      setSubtasks((data ?? []) as Subtask[])
      setLoading(false)
    }
    load()
  }, [parentTaskId])

  const addSubtask = async () => {
    if (!newTitle.trim()) return
    const supabase = createClient()
    const { data: parent } = await supabase.from('tasks').select('project_id').eq('id', parentTaskId).single()
    const { data, error } = await supabase.from('tasks').insert({
      title: newTitle.trim(),
      parent_task_id: parentTaskId,
      project_id: parent?.project_id,
      depth,
      status: 'da_fare',
      priority: 'media',
    }).select().single()
    if (error) { toast.error('Errore'); return }
    setSubtasks((prev) => [...prev, data as Subtask])
    setNewTitle('')
    setAdding(false)
    toast.success('Subtask aggiunta')
  }

  const toggleStatus = async (task: Subtask) => {
    const newStatus = task.status === 'completato' ? 'da_fare' : 'completato'
    const supabase = createClient()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    setSubtasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  if (loading) return null

  return (
    <div className={`mt-2 ${depth === 1 ? 'ml-4' : 'ml-6'}`}>
      {/* Linea verticale */}
      <div className="border-l border-border pl-3 space-y-1">
        {subtasks.map((sub) => (
          <div key={sub.id}>
            <div className="flex items-center gap-2 py-1 group">
              {/* Expand toggle (solo per depth 1) */}
              {depth === 1 && (
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [sub.id]: !p[sub.id] }))}
                  className="text-text-secondary hover:text-text-primary transition-colors w-4"
                >
                  {expanded[sub.id]
                    ? <ChevronDown className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />
                  }
                </button>
              )}

              {/* Checkbox */}
              <button
                onClick={() => toggleStatus(sub)}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  sub.status === 'completato'
                    ? 'bg-success border-success'
                    : 'border-border hover:border-gold'
                }`}
              >
                {sub.status === 'completato' && <Check className="w-2.5 h-2.5 text-on-gold" />}
              </button>

              <span className={`text-sm flex-1 ${sub.status === 'completato' ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
                {sub.title}
              </span>

              {/* Priority dot */}
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                sub.priority === 'alta' ? 'bg-error' : sub.priority === 'media' ? 'bg-warning' : 'bg-success'
              }`} />
            </div>

            {/* Sub-subtask (depth 2) */}
            {depth === 1 && expanded[sub.id] && (
              <SubtaskList parentTaskId={sub.id} depth={2} />
            )}
          </div>
        ))}

        {/* Aggiungi subtask */}
        {depth <= 2 && (
          adding ? (
            <div className="flex items-center gap-2 py-1">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSubtask()
                  if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
                }}
                placeholder={depth === 1 ? 'Titolo subtask...' : 'Titolo sub-subtask...'}
                className="flex-1 bg-background border border-gold rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
              />
              <button onClick={addSubtask} className="text-xs text-gold-text hover:underline">Aggiungi</button>
              <button onClick={() => { setAdding(false); setNewTitle('') }} className="text-xs text-text-secondary hover:text-text-primary">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-gold-text transition-colors py-1"
            >
              <Plus className="w-3 h-3" />
              {depth === 1 ? 'Aggiungi subtask' : 'Aggiungi sub-subtask'}
            </button>
          )
        )}
      </div>
    </div>
  )
}
