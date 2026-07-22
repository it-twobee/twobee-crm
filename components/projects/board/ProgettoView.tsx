'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Layers, Plus, Check, X, Loader2, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { softDeleteTask } from '@/app/actions/tasks-trash'
import { notifyTasksDeleted } from '@/lib/task-undo'
import { toast } from 'sonner'
import type { Client, Project, Profile } from '@/lib/types/database'
import { Section } from '../project-shared'
import { TaskDrawer } from '@/components/tasks/TaskDrawer'
import { createPhase, reorderPhases } from '@/app/actions/project-phases'
import { BriefPanel } from './BriefPanel'
import { WorkstreamBlock } from './WorkstreamBlock'
import { BulkReassignModal } from './BulkReassignModal'
import { useDragReorder } from './useDragReorder'
import type { ExtTask, Milestone, Workstream } from './types'

/**
 * Board di progetto sulla gerarchia V2:
 *   Progetto → Area di lavoro → Milestone → Task
 *
 * Aree di lavoro e milestone si caricano qui lato client invece di arrivare
 * come prop: così le pagine server (admin e workspace) restano invariate e la
 * stessa board serve entrambi i portali.
 *
 * IL GANTT È TEMPORANEAMENTE FUORI: ProjectGantt scrive con renameSprint/
 * renameMilestone, che puntano a `sprints` e a `tasks.is_milestone`. Alimentarlo
 * con dati V2 farebbe scrivere le rinomine nella tabella sbagliata. Va riadattato
 * insieme al Workload, che lo condivide.
 */
export function ProgettoView({ project, client, allTasks, profiles, currentUserId, isAdmin, accent, onUpdateTasks }: {
  project: Project; client: Client; allTasks: ExtTask[]
  profiles: Profile[]; currentUserId: string; isAdmin: boolean; accent: string
  onUpdateTasks: (t: ExtTask[]) => void
}) {
  const [workstreams, setWorkstreams] = useState<Workstream[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)

  const [addingWs, setAddWs] = useState(false)
  const [wsDraft, setWsDraft] = useState('')
  const [savingWs, setSavingWs] = useState(false)
  const wsAddRef = useRef<HTMLInputElement>(null)

  const [showReassign, setShowReassign] = useState(false)
  const [drawerTask, setDrawerTask] = useState<ExtTask | null>(null)
  const [focusIds, setFocusIds] = useState<string[]>([])

  const load = useCallback(async () => {
    const sb = createClient()
    const [w, m] = await Promise.all([
      sb.from('project_workstreams').select('*').eq('project_id', project.id).order('position'),
      sb.from('workstream_milestones').select('*').eq('project_id', project.id).order('sort_order'),
    ])
    setWorkstreams((w.data ?? []) as unknown as Workstream[])
    setMilestones((m.data ?? []) as unknown as Milestone[])
    setLoading(false)
  }, [project.id])

  useEffect(() => { load() }, [load])

  // Arrivo da "+ Crea": ?focus=<id>&kind=<workstream|milestone|task> apre gli
  // antenati e ci scrolla. Parte solo a dati caricati, altrimenti non c'è DOM.
  useEffect(() => {
    if (loading) return
    const params = new URLSearchParams(window.location.search)
    const focus = params.get('focus')
    const kind = params.get('kind')
    if (!focus || !kind) return

    const ids = [focus]
    if (kind === 'milestone') {
      const ws = milestones.find(m => m.id === focus)?.workstream_id
      if (ws) ids.push(ws)
    }
    if (kind === 'task') {
      const t = allTasks.find(x => x.id === focus)
      if (t?.milestone_id) ids.push(t.milestone_id)
      if (t?.workstream_id) ids.push(t.workstream_id)
    }
    setFocusIds(ids)
    const timer = setTimeout(() => {
      document.getElementById(`${kind}-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 220)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const sorted = [...workstreams].sort((a, b) => a.position - b.position)

  const wsDrag = useDragReorder<Workstream>(
    () => sorted,
    updated => setWorkstreams(updated.map((w, i) => ({ ...w, position: i }))),
    updated => reorderPhases(project.id, updated.map(w => w.id)),
  )

  const addWorkstream = async () => {
    if (!wsDraft.trim()) return
    setSavingWs(true)
    const r = await createPhase(project.id, { name: wsDraft.trim(), position: workstreams.length })
    setSavingWs(false)
    if (!r.ok) { toast.error(r.error); return }
    setWsDraft(''); setAddWs(false)
    load()
    toast.success('Area di lavoro creata')
  }

  const patchWs = (id: string, patch: Partial<Workstream>) =>
    setWorkstreams(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w))

  const removeWs = (id: string) => {
    setWorkstreams(prev => prev.filter(w => w.id !== id))
    // Le task restano: perdono solo il collegamento (ON DELETE SET NULL).
    onUpdateTasks(allTasks.map(t => t.workstream_id === id ? { ...t, workstream_id: null } : t))
  }

  const addMilestone = (m: Milestone) => setMilestones(prev => [...prev, m])
  const patchMilestone = (id: string, patch: Partial<Milestone>) =>
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  const removeMilestone = (id: string) => {
    setMilestones(prev => prev.filter(m => m.id !== id))
    onUpdateTasks(allTasks.map(t => t.milestone_id === id ? { ...t, milestone_id: null } : t))
  }
  const reorderMs = (ordered: Milestone[]) =>
    setMilestones(prev => prev.map(m => {
      const i = ordered.findIndex(o => o.id === m.id)
      return i >= 0 ? { ...m, sort_order: i } : m
    }))

  // Task senza area di lavoro: legacy o create fuori dalla board. Vanno
  // segnalate, non nascoste, o sparirebbero dal progetto senza spiegazione.
  const orphans = allTasks.filter(t => !t.workstream_id && !t.parent_id)

  return (
    <div>
      {drawerTask && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" onClick={() => setDrawerTask(null)}>
          <div className="absolute inset-y-0 right-0 flex" onClick={e => e.stopPropagation()}>
            <TaskDrawer
              task={drawerTask}
              profiles={profiles}
              canEdit={isAdmin}
              onClose={() => setDrawerTask(null)}
              onPatched={p => {
                onUpdateTasks(allTasks.map(t => t.id === drawerTask.id ? { ...t, ...p } as ExtTask : t))
                setDrawerTask(prev => prev ? { ...prev, ...p } as ExtTask : null)
              }}
              onDelete={async () => {
                await softDeleteTask(drawerTask.id)
                notifyTasksDeleted(drawerTask.id)
                onUpdateTasks(allTasks.filter(t => t.id !== drawerTask.id))
                setDrawerTask(null)
                toast.success('Eliminata')
              }}
            />
          </div>
        </div>
      )}

      {showReassign && (
        <BulkReassignModal
          tasks={allTasks}
          profiles={profiles}
          onClose={() => setShowReassign(false)}
          onDone={(ids, assigneeId) => {
            onUpdateTasks(allTasks.map(t => ids.includes(t.id) ? { ...t, assignee_id: assigneeId } : t))
            setShowReassign(false)
          }}
        />
      )}

      <BriefPanel project={project} client={client} isAdmin={isAdmin} accent={accent}
        profiles={profiles} currentUserId={currentUserId}
        workstreamsCount={workstreams.length}
        tasksCount={allTasks.length} />

      <Section title="Aree di lavoro" icon={<Layers className="w-3.5 h-3.5" />}
        count={sorted.length} accent={accent}
        right={
          <button onClick={() => setShowReassign(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs text-text-tertiary hover:text-text-secondary hover:bg-surface border border-transparent hover:border-border transition-colors">
            <UserCheck className="w-3 h-3" /> Riassegna
          </button>
        }
      >
        <div className="p-3">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
            </div>
          )}

          {!loading && sorted.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${accent} 6%, transparent)` }}>
                <Layers className="w-6 h-6" style={{ color: `color-mix(in srgb, ${accent} 31%, transparent)` }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-tertiary">Nessuna area di lavoro</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {isAdmin
                    ? "Un'area di lavoro è un filone del progetto: più aree corrono in parallelo."
                    : 'Il piano di progetto non è ancora stato definito'}
                </p>
              </div>
            </div>
          )}

          {!loading && sorted.map((w, i) => (
            <WorkstreamBlock key={w.id} workstream={w} index={i}
              allTasks={allTasks} milestones={milestones} profiles={profiles}
              isAdmin={isAdmin} projectId={project.id} accent={accent}
              focusIds={focusIds} onOpenDrawer={setDrawerTask}
              onUpdateTasks={onUpdateTasks}
              onPatched={patchWs}
              onDeleted={removeWs}
              onMilestoneAdded={addMilestone}
              onMilestonePatched={patchMilestone}
              onMilestoneDeleted={removeMilestone}
              onMilestonesReordered={reorderMs}
              dragHandlers={wsDrag}
            />
          ))}

          {!loading && orphans.length > 0 && (
            <div className="border border-dashed border-warning/40 rounded-2xl px-3 py-2.5 mb-3">
              <p className="text-2xs text-warning font-bold uppercase tracking-wider">
                Fuori dalle aree di lavoro · {orphans.length}
              </p>
              <p className="text-2xs text-text-tertiary mt-0.5">
                Task senza area di lavoro: assegnale dal drawer della task o da «Le mie attività».
              </p>
            </div>
          )}

          {isAdmin && !loading && (addingWs ? (
            <div className="flex items-center gap-2 px-4 py-3 border border-dashed border-border rounded-2xl">
              <Layers className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
              <input ref={wsAddRef} value={wsDraft} onChange={e => setWsDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addWorkstream(); if (e.key === 'Escape') { setAddWs(false); setWsDraft('') } }}
                placeholder="Nome area di lavoro… es. Produzione contenuti"
                aria-label="Nome area di lavoro"
                className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-tertiary" autoFocus />
              <button onClick={addWorkstream} disabled={savingWs || !wsDraft.trim()} aria-label="Conferma" className="p-1 text-success disabled:opacity-40">
                {savingWs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { setAddWs(false); setWsDraft('') }} aria-label="Annulla" className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => { setAddWs(true); setTimeout(() => wsAddRef.current?.focus(), 30) }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-text-tertiary hover:text-text-secondary border border-dashed border-border rounded-2xl transition-colors">
              <Plus className="w-4 h-4" /> Nuova area di lavoro
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}
