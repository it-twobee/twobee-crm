'use client'

import { useState, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, Flag, Check, X, Plus, Loader2,
  Tag, Filter, Users, Layers, MoreHorizontal,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PRESET_TAGS, getTagColor } from '@/lib/reparti-constants'
import type { Profile } from '@/lib/types/database'
import type { ExtTask, ExtSprint } from '@/components/projects/SprintMilestoneBoardSection'
import type { DeptProject } from '@/app/(dashboard)/reparti/[dept]/page'

// ─── Tag pill ─────────────────────────────────────────────────────────────────
function TagPill({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  const color = getTagColor(tag)
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-2xs font-bold"
      style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 19%, transparent)` }}>
      #{tag}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove() }} className="hover:opacity-70">
          <X className="w-2 h-2" />
        </button>
      )}
    </span>
  )
}

// ─── Tag editor popup ─────────────────────────────────────────────────────────
function TagEditor({ currentTags, onSave, onClose }: {
  currentTags: string[]; onSave: (tags: string[]) => void; onClose: () => void
}) {
  const [tags, setTags] = useState<string[]>(currentTags)
  const [custom, setCustom] = useState('')

  const toggle = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const addCustom = () => {
    const v = custom.trim().toLowerCase().replace(/\s+/g, '-').replace(/^#+/, '')
    if (v && !tags.includes(v)) setTags(p => [...p, v])
    setCustom('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl p-4 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-text-primary">Tag</span>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PRESET_TAGS.map(t => (
            <button key={t.id} onClick={() => toggle(t.id)}
              className={`px-2 py-1 rounded-full text-2xs font-bold border transition-all ${tags.includes(t.id) ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
              style={{ background: `color-mix(in srgb, ${t.color} 13%, transparent)`, color: t.color, borderColor: `color-mix(in srgb, ${t.color} 25%, transparent)` }}>
              #{t.id}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-3">
          <input value={custom} onChange={e => setCustom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCustom() }}
            placeholder="Tag custom…"
            className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none placeholder:text-text-tertiary" />
          <button onClick={addCustom} className="px-2 py-1.5 bg-surface rounded-lg text-text-secondary hover:text-text-primary">
            <Plus className="w-3 h-3" />
          </button>
        </div>
        {tags.filter(t => !PRESET_TAGS.find(p => p.id === t)).map(t => (
          <span key={t} className="inline-flex items-center gap-1 mr-1 mb-1 px-1.5 py-0.5 rounded-full text-2xs font-bold bg-surface-active text-text-secondary">
            #{t}<button onClick={() => setTags(p => p.filter(x => x !== t))}><X className="w-2 h-2" /></button>
          </span>
        ))}
        <button onClick={() => { onSave(tags); onClose() }}
          className="w-full mt-2 py-2 bg-gold text-on-gold text-xs font-black rounded-xl hover:bg-gold/90">
          Applica
        </button>
      </div>
    </div>
  )
}

// ─── Task row ─────────────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = { alta: 'var(--color-error)', media: 'var(--color-warning)', bassa: 'var(--color-text-tertiary)' }

function TaskRow({ task, profiles, projectName, allTasks, onUpdate, selected, onSelect }: {
  task: ExtTask; profiles: Profile[]; projectName: string
  allTasks: ExtTask[]; onUpdate: (t: ExtTask) => void
  selected: boolean; onSelect: (id: string, v: boolean) => void
}) {
  const [showTagEditor, setShowTagEditor] = useState(false)
  const isDone    = task.status === 'completato'
  const isOver    = !isDone && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)
  const assignee  = profiles.find(p => p.id === task.assignee_id)
  const tags      = (task.tags ?? []) as string[]

  const toggleDone = async () => {
    const next = isDone ? 'da_fare' : 'completato'
    onUpdate({ ...task, status: next })
    await createClient().from('tasks').update({ status: next }).eq('id', task.id)
  }

  const saveTags = async (newTags: string[]) => {
    onUpdate({ ...task, tags: newTags })
    await createClient().from('tasks').update({ tags: newTags } as never).eq('id', task.id)
    toast.success('Tag salvati')
  }

  return (
    <div className={`group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background transition-colors ${selected ? 'bg-gold/5 ring-1 ring-gold/20' : ''}`}>
      <input type="checkbox" checked={selected} onChange={e => onSelect(task.id, e.target.checked)}
        className="w-3 h-3 accent-gold shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />

      <button onClick={toggleDone}
        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${isDone ? 'bg-success border-success' : 'border-border hover:border-border-strong'}`}>
        {isDone && <Check className="w-2.5 h-2.5 text-on-gold" />}
      </button>

      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[task.priority] ?? 'var(--color-border)' }} />

      <span className={`flex-1 text-sm truncate ${isDone ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>
        {task.title}
      </span>

      {/* Tags inline */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {tags.slice(0, 3).map(t => <TagPill key={t} tag={t} />)}
        {tags.length > 3 && <span className="text-2xs text-text-tertiary">+{tags.length - 3}</span>}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 ml-1 shrink-0">
        <span className="text-2xs text-text-tertiary hidden md:block">{projectName}</span>
        {task.due_date && (
          <span className={`text-2xs ${isOver ? 'text-error font-bold' : 'text-text-tertiary'}`}>
            {new Date(task.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
          </span>
        )}
        {assignee && (
          <div className="w-5 h-5 rounded-full bg-info/20 border border-info/30 flex items-center justify-center text-[8px] font-black text-info">
            {assignee.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
        )}

        <div className="hidden group-hover:flex items-center gap-0.5">
          <button onClick={() => setShowTagEditor(true)}
            className="p-1 rounded text-text-tertiary hover:text-gold-text hover:bg-gold/10 transition-colors" title="Gestisci tag">
            <Tag className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showTagEditor && (
        <TagEditor currentTags={tags} onSave={saveTags} onClose={() => setShowTagEditor(false)} />
      )}
    </div>
  )
}

// ─── Milestone block ──────────────────────────────────────────────────────────
function MilestoneBlock({ milestone, tasks, profiles, projectName, allTasks, onUpdateTask, selectedIds, onSelect }: {
  milestone: ExtTask; tasks: ExtTask[]; profiles: Profile[]; projectName: string
  allTasks: ExtTask[]; onUpdateTask: (t: ExtTask) => void
  selectedIds: Set<string>; onSelect: (id: string, v: boolean) => void
}) {
  const [open, setOpen] = useState(true)
  const isDone = milestone.status === 'completato'
  const done = tasks.filter(t => t.status === 'completato').length
  const milColor = isDone ? 'var(--color-success)' : 'var(--color-gold-text)'

  return (
    <div className="mb-1">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-background rounded-lg transition-colors group">
        {open ? <ChevronDown className="w-3 h-3 text-text-tertiary" /> : <ChevronRight className="w-3 h-3 text-text-tertiary" />}
        <Flag className="w-3 h-3 shrink-0" style={{ color: milColor }} fill={isDone ? milColor : 'none'} />
        <span className={`text-xs font-semibold flex-1 text-left ${isDone ? 'line-through text-text-tertiary' : 'text-text-secondary'}`}>{milestone.title}</span>
        {tasks.length > 0 && (
          <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: done === tasks.length ? '#22C55E18' : 'var(--color-surface)', color: done === tasks.length ? 'var(--color-success)' : '#444' }}>
            {done}/{tasks.length}
          </span>
        )}
        {milestone.due_date && (
          <span className="text-2xs text-text-tertiary hidden sm:block">
            {new Date(milestone.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </button>
      {open && tasks.map(t => (
        <TaskRow key={t.id} task={t} profiles={profiles} projectName={projectName}
          allTasks={allTasks} onUpdate={onUpdateTask}
          selected={selectedIds.has(t.id)} onSelect={onSelect} />
      ))}
    </div>
  )
}

// ─── Sprint block ─────────────────────────────────────────────────────────────
function SprintBlock({ sprint, allTasks, profiles, projectName, onUpdateTask, selectedIds, onSelect, sprintIndex }: {
  sprint: ExtSprint; allTasks: ExtTask[]; profiles: Profile[]; projectName: string
  onUpdateTask: (t: ExtTask) => void; selectedIds: Set<string>
  onSelect: (id: string, v: boolean) => void; sprintIndex: number
}) {
  const [open, setOpen] = useState(true)

  const milestones = allTasks
    .filter(t => t.is_milestone && t.sprint_id === sprint.id && !t.is_client_task)
    .sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)))

  const directTasks = allTasks
    .filter(t => !t.is_milestone && t.sprint_id === sprint.id && !t.milestone_id && !t.parent_id && !t.is_client_task)
    .sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)))

  const isActive  = sprint.status === 'in_corso'
  const isDone    = sprint.status === 'completato'
  const allSprintTasks = allTasks.filter(t => !t.is_milestone && t.sprint_id === sprint.id && !t.parent_id && !t.is_client_task)
  const done = allSprintTasks.filter(t => t.status === 'completato').length
  const pct  = allSprintTasks.length ? Math.round((done / allSprintTasks.length) * 100) : 0

  const accentColor = isDone ? 'var(--color-success)' : isActive ? 'var(--color-gold-text)' : 'var(--color-border-strong)'
  const borderColor = isDone ? '#22C55E20' : isActive ? '#F5C80020' : 'var(--color-surface)'

  return (
    <div className="rounded-xl mb-3 overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer" style={{ background: isActive ? '#F5C80006' : 'var(--color-background)' }}
        onClick={() => setOpen(o => !o)}>
        <div className="w-5 h-5 rounded flex items-center justify-center text-2xs font-black shrink-0"
          style={{ background: `color-mix(in srgb, ${accentColor} 9%, transparent)`, color: accentColor }}>
          {sprintIndex + 1}
        </div>
        <span className={`text-xs font-bold flex-1 ${isDone ? 'text-success' : isActive ? 'text-text-primary' : 'text-text-tertiary'}`}>
          {sprint.name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 w-14">
            <div className="flex-1 h-1 bg-background rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accentColor }} />
            </div>
            <span className="text-2xs font-bold" style={{ color: accentColor }}>{pct}%</span>
          </div>
          <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: `color-mix(in srgb, ${accentColor} 7%, transparent)`, color: accentColor }}>
            {sprint.status === 'in_corso' ? 'Attivo' : sprint.status === 'completato' ? 'Fatto' : 'Piano'}
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />}
        </div>
      </div>

      {open && (
        <div className="px-2 pb-2 pt-1 bg-background">
          {milestones.map(m => {
            const mTasks = allTasks.filter(t => !t.is_milestone && t.milestone_id === m.id && !t.parent_id && !t.is_client_task)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            return (
              <MilestoneBlock key={m.id} milestone={m} tasks={mTasks} profiles={profiles}
                projectName={projectName} allTasks={allTasks} onUpdateTask={onUpdateTask}
                selectedIds={selectedIds} onSelect={onSelect} />
            )
          })}
          {directTasks.map(t => (
            <TaskRow key={t.id} task={t} profiles={profiles} projectName={projectName}
              allTasks={allTasks} onUpdate={onUpdateTask}
              selected={selectedIds.has(t.id)} onSelect={onSelect} />
          ))}
          {milestones.length === 0 && directTasks.length === 0 && (
            <p className="text-2xs text-text-tertiary text-center py-4">Nessuna task in questo sprint</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function BoardTeam({ projects, profiles }: { projects: DeptProject[]; profiles: Profile[] }) {
  const [allTasks, setAllTasks] = useState<(ExtTask & { _projectId: string; _projectName: string })[]>(
    projects.flatMap(p => p.tasks.map(t => ({ ...t, _projectId: p.id, _projectName: p.name })))
  )
  const [filterProject, setFilterProject]   = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [filterTags, setFilterTags]         = useState<string[]>([])
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set())
  const [showBulkTag, setShowBulkTag]       = useState(false)

  const updateTask = (updated: ExtTask) =>
    setAllTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))

  const onSelect = (id: string, v: boolean) =>
    setSelectedIds(prev => { const n = new Set(prev); v ? n.add(id) : n.delete(id); return n })

  const bulkSaveTags = async (tags: string[]) => {
    const ids = Array.from(selectedIds)
    setAllTasks(prev => prev.map(t => ids.includes(t.id) ? { ...t, tags } : t))
    await createClient().from('tasks').update({ tags } as never).in('id', ids)
    toast.success(`Tag applicati a ${ids.length} task`)
    setSelectedIds(new Set())
    setShowBulkTag(false)
  }

  // Only active sprints + tasks without sprint
  const activeSprints = useMemo(() => {
    const seenProjects = new Set<string>()
    const result: Array<{ project: DeptProject; sprint: ExtSprint; idx: number }> = []
    projects.forEach(p => {
      p.sprints.filter(s => s.status === 'in_corso').forEach((s, i) => {
        if (!seenProjects.has(p.id)) seenProjects.add(p.id)
        result.push({ project: p, sprint: s, idx: i })
      })
    })
    return result
  }, [projects])

  const unsprintedByProject = useMemo(() =>
    projects.map(p => ({
      project: p,
      tasks: allTasks.filter(t => t._projectId === p.id && !t.sprint_id && !t.is_milestone && !t.parent_id && !t.is_client_task),
    })).filter(x => x.tasks.length > 0),
  [allTasks, projects])

  // Active tag filters
  const activeTagFilters = filterTags

  const filteredSprints = activeSprints.filter(({ project, sprint }) => {
    if (filterProject !== 'all' && project.id !== filterProject) return false
    if (filterAssignee !== 'all') {
      const sprintTasks = allTasks.filter(t => t._projectId === project.id && t.sprint_id === sprint.id)
      if (!sprintTasks.some(t => t.assignee_id === filterAssignee)) return false
    }
    if (activeTagFilters.length > 0) {
      const sprintTasks = allTasks.filter(t => t._projectId === project.id && t.sprint_id === sprint.id)
      if (!sprintTasks.some(t => activeTagFilters.every(tag => (t.tags ?? []).includes(tag)))) return false
    }
    return true
  })

  const allUsedTags = useMemo(() => {
    const tags = new Set<string>()
    allTasks.forEach(t => (t.tags ?? []).forEach(tag => tags.add(tag)))
    return Array.from(tags)
  }, [allTasks])

  const totalActive = activeSprints.length
  const totalTasks  = allTasks.filter(t => !t.is_milestone && !t.parent_id && !t.is_client_task && (
    activeSprints.some(({ project, sprint }) => t._projectId === project.id && t.sprint_id === sprint.id)
  )).length
  const doneTasks   = allTasks.filter(t => !t.is_milestone && !t.parent_id && !t.is_client_task && t.status === 'completato' && (
    activeSprints.some(({ project, sprint }) => t._projectId === project.id && t.sprint_id === sprint.id)
  )).length

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-text-tertiary">
        <span><strong className="text-text-primary">{totalActive}</strong> sprint attivi</span>
        <span><strong className="text-text-primary">{doneTasks}/{totalTasks}</strong> task completate</span>
        {selectedIds.size > 0 && (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-gold-text font-bold">{selectedIds.size} selezionate</span>
            <button onClick={() => setShowBulkTag(true)}
              className="flex items-center gap-1 px-2 py-1 bg-gold/10 border border-gold/30 text-gold-text rounded-lg text-2xs font-bold hover:bg-gold/20">
              <Tag className="w-3 h-3" /> Applica tag
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-text-tertiary hover:text-text-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-text-tertiary shrink-0" />

        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-secondary focus:outline-none">
          <option value="all">Tutti i progetti</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-secondary focus:outline-none">
          <option value="all">Tutti i membri</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>

        {/* Tag filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {allUsedTags.map(tag => {
            const active = activeTagFilters.includes(tag)
            const color = getTagColor(tag)
            return (
              <button key={tag} onClick={() => setFilterTags(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])}
                className={`px-2 py-1 rounded-full text-2xs font-bold border transition-all ${active ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
                style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 25%, transparent)` }}>
                #{tag}
              </button>
            )
          })}
          {PRESET_TAGS.filter(t => !allUsedTags.includes(t.id)).slice(0, 4).map(t => (
            <button key={t.id} onClick={() => setFilterTags(prev => [...prev, t.id])}
              className="px-2 py-1 rounded-full text-2xs font-bold border opacity-20 hover:opacity-50 transition-all"
              style={{ background: `color-mix(in srgb, ${t.color} 13%, transparent)`, color: t.color, borderColor: `color-mix(in srgb, ${t.color} 25%, transparent)` }}>
              #{t.id}
            </button>
          ))}
        </div>
      </div>

      {/* Sprint blocks */}
      {filteredSprints.length === 0 && unsprintedByProject.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <Layers className="w-8 h-8 text-text-tertiary" />
          <p className="text-text-tertiary text-sm">Nessuno sprint attivo nel reparto</p>
          <p className="text-2xs text-text-tertiary">Avvia uno sprint in un progetto per vederlo qui</p>
        </div>
      ) : (
        <>
          {filteredSprints.map(({ project, sprint, idx }) => (
            <div key={`${project.id}-${sprint.id}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-2xs font-bold text-text-tertiary uppercase tracking-wider">{project.name}</span>
                <span className="text-2xs text-text-tertiary">{project.client_name ?? ''}</span>
              </div>
              <SprintBlock
                sprint={sprint}
                allTasks={allTasks.filter(t => t._projectId === project.id)}
                profiles={profiles}
                projectName={project.name}
                onUpdateTask={updateTask}
                selectedIds={selectedIds}
                onSelect={onSelect}
                sprintIndex={idx}
              />
            </div>
          ))}

          {/* Unsprointed tasks */}
          {unsprintedByProject
            .filter(x => filterProject === 'all' || x.project.id === filterProject)
            .map(({ project, tasks }) => (
              <div key={project.id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-2xs font-bold text-text-tertiary uppercase tracking-wider">{project.name}</span>
                  <span className="text-2xs text-text-tertiary px-1.5 py-0.5 bg-surface rounded">senza sprint</span>
                </div>
                <div className="bg-background border border-border rounded-xl px-2 py-2 mb-3">
                  {tasks
                    .filter(t => filterAssignee === 'all' || t.assignee_id === filterAssignee)
                    .filter(t => activeTagFilters.length === 0 || activeTagFilters.every(tag => (t.tags ?? []).includes(tag)))
                    .map(t => (
                      <TaskRow key={t.id} task={t} profiles={profiles} projectName={project.name}
                        allTasks={allTasks} onUpdate={updateTask}
                        selected={selectedIds.has(t.id)} onSelect={onSelect} />
                    ))}
                </div>
              </div>
            ))}
        </>
      )}

      {/* Bulk tag editor */}
      {showBulkTag && (
        <TagEditor
          currentTags={[]}
          onSave={bulkSaveTags}
          onClose={() => setShowBulkTag(false)}
        />
      )}
    </div>
  )
}
