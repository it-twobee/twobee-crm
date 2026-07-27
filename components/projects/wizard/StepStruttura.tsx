'use client'

import { useMemo } from 'react'
import {
  Plus, Trash2, FolderTree, Flag, CheckSquare, Repeat, ChevronDown,
  Wand2, CalendarRange, Eye, EyeOff,
} from 'lucide-react'
import { StepHead, Segmented, inputCls, Avatar, Empty } from '@/components/shared/formkit'
import {
  workstreamName, milestoneName, taskName, isConform, type NamingCtx,
} from '@/lib/project-naming'
import {
  nk, countTree, FREQUENCIES, FREQ_LABEL,
  type WWorkstream, type WMilestone, type WTask, type Person,
} from './types'

/** riscrive tutto l'albero secondo la convention (idempotente) */
export function applyNaming(structure: WWorkstream[], ctx: NamingCtx): WWorkstream[] {
  return structure.map(w => ({
    ...w,
    name: workstreamName(ctx, w.name),
    milestones: w.milestones.map((m, j) => ({
      ...m,
      title: milestoneName(j, m.title),
      tasks: m.tasks.map(t => ({ ...t, title: taskName(j, t.title) })),
    })),
  }))
}

/** quante righe non seguono la convention */
export function offConventionCount(structure: WWorkstream[], ctx: NamingCtx): number {
  let n = 0
  structure.forEach(w => {
    if (!isConform(w.name, workstreamName(ctx, w.name))) n++
    w.milestones.forEach((m, j) => {
      if (!isConform(m.title, milestoneName(j, m.title))) n++
      m.tasks.forEach(t => { if (!isConform(t.title, taskName(j, t.title))) n++ })
    })
  })
  return n
}

/** distribuisce le scadenze delle milestone di consegna fra inizio e fine progetto */
export function spreadDueDates(structure: WWorkstream[], start: string, end: string): WWorkstream[] {
  const s = new Date(start + 'T00:00:00').getTime()
  const e = new Date(end + 'T00:00:00').getTime()
  const targets: { w: number; m: number }[] = []
  structure.forEach((w, wi) => w.milestones.forEach((m, mi) => {
    if (m.milestone_type === 'delivery') targets.push({ w: wi, m: mi })
  }))
  if (!targets.length || e <= s) return structure
  const step = (e - s) / targets.length
  const next = structure.map(w => ({ ...w, milestones: w.milestones.map(m => ({ ...m })) }))
  targets.forEach((t, i) => {
    next[t.w].milestones[t.m].due_date = new Date(s + step * (i + 1)).toISOString().slice(0, 10)
  })
  return next
}

export function StepStruttura({
  structure, setStructure, team, ctx, startDate, targetEnd,
}: {
  structure: WWorkstream[]
  setStructure: React.Dispatch<React.SetStateAction<WWorkstream[]>>
  team: Person[]
  ctx: NamingCtx
  startDate: string
  targetEnd: string
}) {
  const counts = useMemo(() => countTree(structure), [structure])
  const off = useMemo(() => offConventionCount(structure, ctx), [structure, ctx])

  const updWs = (key: string, fn: (w: WWorkstream) => WWorkstream) =>
    setStructure(s => s.map(w => w.key === key ? fn(w) : w))
  const updMs = (wk: string, mk: string, fn: (m: WMilestone) => WMilestone) =>
    updWs(wk, w => ({ ...w, milestones: w.milestones.map(m => m.key === mk ? fn(m) : m) }))
  const updTask = (wk: string, mk: string, tk: string, fn: (t: WTask) => WTask) =>
    updMs(wk, mk, m => ({ ...m, tasks: m.tasks.map(t => t.key === tk ? fn(t) : t) }))

  const addWs = () => setStructure(s => [...s, {
    key: nk(), name: workstreamName(ctx, 'Nuovo workstream'), workstream_type: 'project',
    owner_id: null, visibility: 'internal', milestones: [], recurring: [],
  }])
  const addMs = (wk: string) => updWs(wk, w => ({
    ...w,
    milestones: [...w.milestones, {
      key: nk(), title: milestoneName(w.milestones.length, 'Nuova milestone'),
      milestone_type: 'delivery', due_date: null, owner_id: w.owner_id, visibility: w.visibility, tasks: [],
    }],
  }))
  const addTask = (wk: string, mk: string, msIndex: number) => updMs(wk, mk, m => ({
    ...m, tasks: [...m.tasks, { key: nk(), title: taskName(msIndex, 'Nuova task'), assignee_id: null, due_date: null, visibility: m.visibility }],
  }))
  const addRec = (wk: string) => updWs(wk, w => ({
    ...w, recurring: [...w.recurring, {
      key: nk(), title: 'Nuova attività ricorrente', frequency: 'weekly', owner_role: null,
      owner_id: w.owner_id, priority: 'media', visibility: w.visibility, estimated_hours: null,
    }],
  }))

  const canSpread = !!startDate && !!targetEnd && targetEnd > startDate && counts.ms > 0

  return (
    <div>
      <StepHead title="L'albero del lavoro"
        hint="Workstream → milestone → task. Le date qui finiscono dritte nel calendario milestone." />

      <div className="flex items-center gap-2 flex-wrap mb-3 p-2.5 rounded-xl bg-surface-active">
        <Stat icon={<FolderTree className="w-3.5 h-3.5 text-gold-text" />} n={counts.ws} label="workstream" />
        <Stat icon={<Flag className="w-3.5 h-3.5 text-info" />} n={counts.ms} label="milestone" />
        <Stat icon={<CheckSquare className="w-3.5 h-3.5 text-text-secondary" />} n={counts.tk} label="task" />
        {counts.rc > 0 && <Stat icon={<Repeat className="w-3.5 h-3.5 text-success" />} n={counts.rc} label="ricorrenti" />}
        <div className="ml-auto flex items-center gap-1.5">
          {canSpread && (
            <button type="button" onClick={() => setStructure(s => spreadDueDates(s, startDate, targetEnd))}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface text-2xs font-semibold text-text-secondary hover:text-text-primary">
              <CalendarRange className="w-3.5 h-3.5" />Distribuisci scadenze
            </button>
          )}
          {off > 0 && (
            <button type="button" onClick={() => setStructure(s => applyNaming(s, ctx))}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gold text-on-gold text-2xs font-semibold press">
              <Wand2 className="w-3.5 h-3.5" />Riallinea {off}
            </button>
          )}
        </div>
      </div>

      {structure.length === 0 ? (
        <Empty>Nessun workstream. Aggiungine uno qui sotto, o torna al passo Template.</Empty>
      ) : (
        <div className="space-y-2.5">
          {structure.map(w => {
            const wsOff = !isConform(w.name, workstreamName(ctx, w.name))
            return (
              <div key={w.key} className="border border-border rounded-xl overflow-hidden bg-background/30">
                <div className="flex items-center gap-2 p-2.5 bg-surface">
                  <button type="button" onClick={() => updWs(w.key, x => ({ ...x, collapsed: !x.collapsed }))}
                    aria-label={w.collapsed ? 'Espandi' : 'Comprimi'} className="text-text-tertiary hover:text-text-primary shrink-0">
                    <ChevronDown className={`w-4 h-4 transition-transform ${w.collapsed ? '-rotate-90' : ''}`} />
                  </button>
                  <FolderTree className="w-4 h-4 text-gold-text shrink-0" />
                  <input value={w.name} onChange={e => updWs(w.key, x => ({ ...x, name: e.target.value }))}
                    aria-label="Nome workstream"
                    className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />
                  {wsOff && <OffBadge onFix={() => updWs(w.key, x => ({ ...x, name: workstreamName(ctx, x.name) }))} />}
                  <VisToggle value={w.visibility} onChange={v => updWs(w.key, x => ({ ...x, visibility: v }))} />
                  <button type="button" onClick={() => setStructure(s => s.filter(x => x.key !== w.key))}
                    aria-label="Elimina workstream" className="text-text-tertiary hover:text-error shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!w.collapsed && (
                  <div className="p-2.5 space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-44">
                        <Segmented ariaLabel="Tipo workstream" value={w.workstream_type}
                          onChange={v => updWs(w.key, x => ({ ...x, workstream_type: v }))}
                          options={[{ value: 'project', label: 'Una tantum' }, { value: 'recurring', label: 'Continuativa' }]} />
                      </div>
                      <OwnerSelect team={team} value={w.owner_id} label="Responsabile"
                        onChange={v => updWs(w.key, x => ({ ...x, owner_id: v }))} />
                    </div>

                    {w.recurring.map(r => (
                      <div key={r.key} className="flex items-center gap-2 pl-4">
                        <Repeat className="w-3.5 h-3.5 text-success shrink-0" />
                        <input value={r.title} aria-label="Titolo ricorrente"
                          onChange={e => updWs(w.key, x => ({ ...x, recurring: x.recurring.map(y => y.key === r.key ? { ...y, title: e.target.value } : y) }))}
                          className="flex-1 min-w-0 bg-transparent text-sm text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />
                        <select value={r.frequency} aria-label="Frequenza"
                          onChange={e => updWs(w.key, x => ({ ...x, recurring: x.recurring.map(y => y.key === r.key ? { ...y, frequency: e.target.value } : y) }))}
                          className="text-2xs bg-background border border-border rounded-lg px-1.5 py-1 text-text-secondary shrink-0">
                          {FREQUENCIES.map(f => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                        </select>
                        <button type="button" onClick={() => updWs(w.key, x => ({ ...x, recurring: x.recurring.filter(y => y.key !== r.key) }))}
                          aria-label="Elimina ricorrente" className="text-text-tertiary hover:text-error shrink-0"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}

                    {w.milestones.map((m, mi) => {
                      const msOff = !isConform(m.title, milestoneName(mi, m.title))
                      return (
                        <div key={m.key} className="pl-4 rounded-lg border border-border/60 p-2 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Flag className={`w-3.5 h-3.5 shrink-0 ${m.milestone_type === 'system' ? 'text-text-tertiary' : 'text-info'}`} />
                            <input value={m.title} aria-label="Titolo milestone"
                              onChange={e => updMs(w.key, m.key, x => ({ ...x, title: e.target.value }))}
                              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />
                            {msOff && <OffBadge onFix={() => updMs(w.key, m.key, x => ({ ...x, title: milestoneName(mi, x.title) }))} />}
                            <input type="date" value={m.due_date ?? ''} aria-label="Scadenza milestone"
                              onChange={e => updMs(w.key, m.key, x => ({ ...x, due_date: e.target.value || null }))}
                              className={`text-2xs bg-background border rounded-lg px-1.5 py-1 shrink-0 ${
                                m.due_date ? 'border-border text-text-primary' : 'border-border-interactive text-text-tertiary'
                              }`} />
                            <OwnerSelect team={team} value={m.owner_id} label="Owner milestone" compact
                              onChange={v => updMs(w.key, m.key, x => ({ ...x, owner_id: v }))} />
                            <button type="button" onClick={() => updWs(w.key, x => ({ ...x, milestones: x.milestones.filter(y => y.key !== m.key) }))}
                              aria-label="Elimina milestone" className="text-text-tertiary hover:text-error shrink-0"><Trash2 className="w-3 h-3" /></button>
                          </div>

                          {m.tasks.map(t => (
                            <div key={t.key} className="flex items-center gap-2 pl-5">
                              <CheckSquare className="w-3 h-3 text-text-tertiary shrink-0" />
                              <input value={t.title} aria-label="Titolo task"
                                onChange={e => updTask(w.key, m.key, t.key, x => ({ ...x, title: e.target.value }))}
                                className="flex-1 min-w-0 bg-transparent text-sm text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />
                              <input type="date" value={t.due_date ?? ''} aria-label="Scadenza task"
                                onChange={e => updTask(w.key, m.key, t.key, x => ({ ...x, due_date: e.target.value || null }))}
                                className="text-2xs bg-background border border-border rounded-lg px-1.5 py-1 text-text-tertiary shrink-0" />
                              <OwnerSelect team={team} value={t.assignee_id} label="Assegnatario" compact
                                onChange={v => updTask(w.key, m.key, t.key, x => ({ ...x, assignee_id: v }))} />
                              <button type="button" onClick={() => updMs(w.key, m.key, x => ({ ...x, tasks: x.tasks.filter(y => y.key !== t.key) }))}
                                aria-label="Elimina task" className="text-text-tertiary hover:text-error shrink-0"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addTask(w.key, m.key, mi)}
                            className="ml-5 flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text">
                            <Plus className="w-3 h-3" />Task
                          </button>
                        </div>
                      )
                    })}

                    <div className="flex items-center gap-3 pl-4">
                      <button type="button" onClick={() => addMs(w.key)}
                        className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-gold-text">
                        <Plus className="w-3 h-3" />Milestone
                      </button>
                      <button type="button" onClick={() => addRec(w.key)}
                        className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-gold-text">
                        <Plus className="w-3 h-3" />Ricorrente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button type="button" onClick={addWs}
        className="mt-3 flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:opacity-80">
        <Plus className="w-3.5 h-3.5" />Workstream
      </button>
    </div>
  )
}

function Stat({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <span className="flex items-center gap-1 text-2xs text-text-secondary">
      {icon}<span className="tabular font-semibold text-text-primary">{n}</span>{label}
    </span>
  )
}

function OffBadge({ onFix }: { onFix: () => void }) {
  return (
    <button type="button" onClick={onFix} title="Nome fuori convention — clicca per riallinearlo"
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-warning-dim text-warning text-2xs font-semibold shrink-0">
      <Wand2 className="w-3 h-3" />
    </button>
  )
}

function VisToggle({ value, onChange }: { value: 'internal' | 'client_visible'; onChange: (v: 'internal' | 'client_visible') => void }) {
  const on = value === 'client_visible'
  return (
    <button type="button" onClick={() => onChange(on ? 'internal' : 'client_visible')}
      aria-pressed={on} title={on ? 'Visibile al cliente' : 'Solo interno'}
      className={`shrink-0 ${on ? 'text-info' : 'text-text-tertiary hover:text-text-secondary'}`}>
      {on ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
    </button>
  )
}

function OwnerSelect({
  team, value, onChange, label, compact,
}: { team: Person[]; value: string | null; onChange: (v: string | null) => void; label: string; compact?: boolean }) {
  const person = team.find(p => p.id === value)
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      {person && <Avatar name={person.full_name} url={person.avatar_url} size={compact ? 18 : 22} />}
      <select value={value ?? ''} onChange={e => onChange(e.target.value || null)} aria-label={label}
        className={`bg-background border border-border rounded-lg text-text-secondary ${compact ? 'text-2xs px-1.5 py-1 max-w-[104px]' : 'text-2xs px-2 py-1.5'}`}>
        <option value="">{compact ? '—' : label}</option>
        {team.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
    </span>
  )
}
