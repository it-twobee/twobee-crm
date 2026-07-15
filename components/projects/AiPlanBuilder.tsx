'use client'

import { useState, useEffect } from 'react'
import { Sparkles, X, Loader2, Zap, Flag, Trash2, Plus, GripVertical, UserCheck } from 'lucide-react'
import type { Profile } from '@/lib/types/database'

// Builder del Piano AI, condiviso tra la pagina progetto e il "+ Crea" (piano da brief).
// UI pura + stato locale: riceve un piano (bozza AI), lo rende modificabile
// (aggiungi/elimina/riordina, date, risorse) e restituisce la versione confermata.
export interface AiPlanTask      { title: string; priority: string; suggested_role?: string; due_date?: string; assignee_id?: string }
export interface AiPlanMilestone { title: string; tasks: AiPlanTask[]; due_date?: string; assignee_id?: string }
export interface AiPlanSprint    { name: string; duration_weeks: number; milestones: AiPlanMilestone[] }

const PRIORITY_COLORS: Record<string, string> = { alta: 'var(--color-error)', media: 'var(--color-warning)', bassa: 'var(--color-text-tertiary)' }
const PRIORITY_LABELS: Record<string, string> = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }

export function AiPlanBuilder({ plan, loading, error, profiles, currentUserId, kind, onClose, onRegenerate, onAccept, accent }: {
  plan: AiPlanSprint[] | null; loading: boolean; error: string; accent: string
  profiles: Profile[]; currentUserId: string; kind?: string | null
  onClose: () => void; onAccept: (p: AiPlanSprint[]) => void; onRegenerate: () => void
}) {
  // Il piano è una BOZZA di lavoro: il PM aggiunge sprint/milestone/task, sposta le
  // date suggerite e assegna le risorse. `draft` è la fonte di verità; alla conferma
  // viene creato esattamente ciò che resta nella bozza.
  const [draft, setDraft] = useState<AiPlanSprint[]>([])

  // Risorse assegnabili: solo lo staff interno (esclude founder/admin e le risorse esterne).
  const assignable = profiles.filter(p => ['manager', 'senior', 'junior', 'stage'].includes((p.app_role ?? '') as string))
  const suggestFor = (role?: string) => assignable.find(p => p.app_role === role)?.id ?? ''
  const iso = (base: Date, days: number) => new Date(base.getTime() + days * 86400000).toISOString().slice(0, 10)

  useEffect(() => {
    if (!plan) { setDraft([]); return }
    const today = new Date()
    let weekOffset = 0
    const enriched = plan.map(sp => {
      const startDays = weekOffset * 7
      const dur = sp.duration_weeks || 2
      weekOffset += dur
      const nMil = Math.max(1, sp.milestones.length)
      const milestones = sp.milestones.map((m, mi) => {
        const mDue = iso(today, startDays + Math.ceil((mi + 1) / nMil * dur * 7))
        const tasks = m.tasks.map(t => ({ ...t, due_date: mDue, assignee_id: suggestFor(t.suggested_role) }))
        return { ...m, due_date: mDue, assignee_id: '', tasks }
      })
      return { ...sp, milestones }
    })
    setDraft(enriched)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  // ── Updater immutabili ──
  const patchSprint    = (si: number, patch: Partial<AiPlanSprint>) => setDraft(d => d.map((s, i) => i === si ? { ...s, ...patch } : s))
  const patchMilestone = (si: number, mi: number, patch: Partial<AiPlanMilestone>) => setDraft(d => d.map((s, i) => i !== si ? s : { ...s, milestones: s.milestones.map((m, j) => j === mi ? { ...m, ...patch } : m) }))
  const patchTask      = (si: number, mi: number, ti: number, patch: Partial<AiPlanTask>) => setDraft(d => d.map((s, i) => i !== si ? s : { ...s, milestones: s.milestones.map((m, j) => j !== mi ? m : { ...m, tasks: m.tasks.map((t, k) => k === ti ? { ...t, ...patch } : t) }) }))

  const addSprint    = () => setDraft(d => [...d, { name: `Sprint ${d.length + 1}`, duration_weeks: 2, milestones: [] }])
  const addMilestone = (si: number) => setDraft(d => d.map((s, i) => i !== si ? s : { ...s, milestones: [...s.milestones, { title: 'Nuova milestone', tasks: [], due_date: '', assignee_id: '' }] }))
  const addTask      = (si: number, mi: number) => setDraft(d => d.map((s, i) => i !== si ? s : { ...s, milestones: s.milestones.map((m, j) => j !== mi ? m : { ...m, tasks: [...m.tasks, { title: 'Nuova task', priority: 'media', due_date: m.due_date, assignee_id: '' }] }) }))

  const dropSprint    = (si: number) => setDraft(d => renumberSprints(d.filter((_, i) => i !== si)))
  const dropMilestone = (si: number, mi: number) => setDraft(d => d.map((s, i) => i !== si ? s : { ...s, milestones: s.milestones.filter((_, j) => j !== mi) }))
  const dropTask      = (si: number, mi: number, ti: number) => setDraft(d => d.map((s, i) => i !== si ? s : { ...s, milestones: s.milestones.map((m, j) => j !== mi ? m : { ...m, tasks: m.tasks.filter((_, k) => k !== ti) }) }))

  // ── Riordino drag & drop (index-based) ──
  // Gli sprint hanno la numerazione nel nome ("Sprint N — Tema"): riordinando si
  // aggiorna in automatico. Milestone e task non hanno numeri: cambia solo l'ordine.
  const [drag, setDrag] = useState<{ level: 'sprint' | 'milestone' | 'task'; si: number; mi?: number; ti?: number } | null>(null)
  const move = <T,>(arr: T[], from: number, to: number) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a }
  const renumberSprints = (arr: AiPlanSprint[]) => arr.map((s, i) =>
    /^\s*sprint\s+\d+/i.test(s.name) ? { ...s, name: s.name.replace(/^\s*sprint\s+\d+/i, `Sprint ${i + 1}`) } : s)

  const reorderSprint    = (from: number, to: number) => { if (from !== to) setDraft(d => renumberSprints(move(d, from, to))) }
  const reorderMilestone = (si: number, from: number, to: number) => { if (from !== to) setDraft(d => d.map((s, i) => i !== si ? s : { ...s, milestones: move(s.milestones, from, to) })) }
  const reorderTask      = (si: number, mi: number, from: number, to: number) => { if (from !== to) setDraft(d => d.map((s, i) => i !== si ? s : { ...s, milestones: s.milestones.map((m, j) => j !== mi ? m : { ...m, tasks: move(m.tasks, from, to) }) })) }

  const dropOnSprint    = (to: number) => { if (drag?.level === 'sprint') reorderSprint(drag.si, to); setDrag(null) }
  const dropOnMilestone = (si: number, to: number) => { if (drag?.level === 'milestone' && drag.si === si) reorderMilestone(si, drag.mi!, to); setDrag(null) }
  const dropOnTask      = (si: number, mi: number, to: number) => { if (drag?.level === 'task' && drag.si === si && drag.mi === mi) reorderTask(si, mi, drag.ti!, to); setDrag(null) }

  const total = draft.reduce((a, s) => a + 1 + s.milestones.reduce((b, m) => b + 1 + m.tasks.length, 0), 0)

  const dateCls = 'text-2xs bg-background border border-border-interactive rounded px-1.5 py-1 text-text-primary focus:outline-none focus:border-gold shrink-0'
  const nameCls = 'flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-border focus:border-gold px-0.5 py-0.5 focus:outline-none'

  const PeopleSelect = ({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) => (
    <div className="flex items-center gap-1 shrink-0">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="text-2xs bg-background border border-border-interactive rounded px-1.5 py-1 text-text-primary focus:outline-none focus:border-gold max-w-[116px]"
        title={hint ? `Suggerito: ${hint}` : undefined}>
        <option value="">— Nessuno</option>
        {assignable.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'Senza nome'}</option>)}
      </select>
      <button onClick={() => onChange(currentUserId)} title="Assegna a me" aria-label="Assegna a me"
        className="p-1 rounded text-text-tertiary hover:text-gold-text hover:bg-gold/10 transition-colors">
        <UserCheck className="w-3.5 h-3.5" />
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
          <Sparkles className="w-4 h-4 text-gold-text" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-text-primary">Piano AI — pianifica e assegna</h2>
            <p className="text-2xs text-text-tertiary">Aggiungi elementi, conferma o sposta le date, assegna le risorse, poi crea.</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi"><X className="w-4 h-4 text-text-tertiary hover:text-text-primary" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="w-10 h-10 text-gold-text animate-spin" />
              <p className="text-sm text-text-tertiary">L&apos;AI sta analizzando il brief…</p>
            </div>
          )}
          {error && !loading && <p className="text-sm text-error p-4 bg-error/10 rounded-xl">{error}</p>}

          {!loading && draft.length > 0 && (
            <div className="space-y-3">
              {draft.map((s, si) => (
                <div key={si}
                  onDragOver={e => { if (drag?.level === 'sprint') e.preventDefault() }}
                  onDrop={e => { e.preventDefault(); dropOnSprint(si) }}
                  className={`border border-gold/20 rounded-xl overflow-hidden bg-background ${drag?.level === 'sprint' && drag.si === si ? 'opacity-50' : ''}`}>
                  {/* Sprint */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface">
                    <span draggable onDragStart={() => setDrag({ level: 'sprint', si })} onDragEnd={() => setDrag(null)}
                      className="shrink-0 cursor-grab text-text-tertiary hover:text-text-secondary" title="Trascina per riordinare">
                      <GripVertical className="w-3.5 h-3.5" />
                    </span>
                    <Zap className="w-3.5 h-3.5 text-gold-text shrink-0" />
                    <input value={s.name} onChange={e => patchSprint(si, { name: e.target.value })}
                      className={`${nameCls} text-sm font-bold text-text-primary`} />
                    <div className="flex items-center gap-1 shrink-0 text-2xs text-text-tertiary">
                      <input type="number" min={1} max={12} value={s.duration_weeks}
                        onChange={e => patchSprint(si, { duration_weeks: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-12 text-2xs bg-background border border-border-interactive rounded px-1.5 py-1 text-text-primary focus:outline-none focus:border-gold" />
                      sett.
                    </div>
                    <button onClick={() => dropSprint(si)} aria-label="Elimina sprint" title="Elimina sprint"
                      className="shrink-0 p-1 rounded text-text-tertiary hover:text-error hover:bg-error-dim transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {s.milestones.map((m, mi) => (
                    <div key={mi}
                      onDragOver={e => { if (drag?.level === 'milestone' && drag.si === si) e.preventDefault() }}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); dropOnMilestone(si, mi) }}
                      className={`px-3 py-2 border-b border-border last:border-0 ${drag?.level === 'milestone' && drag.si === si && drag.mi === mi ? 'opacity-50' : ''}`}>
                      {/* Milestone */}
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span draggable onDragStart={() => setDrag({ level: 'milestone', si, mi })} onDragEnd={() => setDrag(null)}
                          className="shrink-0 cursor-grab text-text-tertiary hover:text-text-secondary" title="Trascina per riordinare">
                          <GripVertical className="w-3 h-3" />
                        </span>
                        <Flag className="w-3 h-3 text-gold-text shrink-0" />
                        <input value={m.title} onChange={e => patchMilestone(si, mi, { title: e.target.value })}
                          className={`${nameCls} text-xs font-bold text-text-primary`} />
                        <input type="date" value={m.due_date ?? ''} onChange={e => patchMilestone(si, mi, { due_date: e.target.value })} className={dateCls} />
                        <PeopleSelect value={m.assignee_id ?? ''} onChange={v => patchMilestone(si, mi, { assignee_id: v })} />
                        <button onClick={() => dropMilestone(si, mi)} aria-label="Elimina milestone" title="Elimina milestone"
                          className="shrink-0 p-1 rounded text-text-tertiary hover:text-error hover:bg-error-dim transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Task */}
                      <div className="pl-5 space-y-1">
                        {m.tasks.map((t, ti) => (
                          <div key={ti}
                            onDragOver={e => { if (drag?.level === 'task' && drag.si === si && drag.mi === mi) e.preventDefault() }}
                            onDrop={e => { e.preventDefault(); e.stopPropagation(); dropOnTask(si, mi, ti) }}
                            className={`flex items-center gap-1.5 flex-wrap ${drag?.level === 'task' && drag.si === si && drag.mi === mi && drag.ti === ti ? 'opacity-50' : ''}`}>
                            <span draggable onDragStart={() => setDrag({ level: 'task', si, mi, ti })} onDragEnd={() => setDrag(null)}
                              className="shrink-0 cursor-grab text-text-tertiary hover:text-text-secondary" title="Trascina per riordinare">
                              <GripVertical className="w-3 h-3" />
                            </span>
                            <select value={t.priority} onChange={e => patchTask(si, mi, ti, { priority: e.target.value })}
                              aria-label="Priorità"
                              className="text-2xs bg-background border border-border-interactive rounded px-1 py-1 text-text-primary focus:outline-none focus:border-gold shrink-0"
                              style={{ color: PRIORITY_COLORS[t.priority] ?? 'var(--color-text-secondary)' }}>
                              {['alta', 'media', 'bassa'].map(p => <option key={p} value={p} className="text-text-primary">{PRIORITY_LABELS[p]}</option>)}
                            </select>
                            <input value={t.title} onChange={e => patchTask(si, mi, ti, { title: e.target.value })}
                              className={`${nameCls} text-2xs text-text-secondary`} />
                            <input type="date" value={t.due_date ?? ''} onChange={e => patchTask(si, mi, ti, { due_date: e.target.value })} className={dateCls} />
                            <PeopleSelect value={t.assignee_id ?? ''} onChange={v => patchTask(si, mi, ti, { assignee_id: v })} hint={t.suggested_role} />
                            <button onClick={() => dropTask(si, mi, ti)} aria-label="Elimina task" title="Elimina task"
                              className="shrink-0 p-0.5 rounded text-text-tertiary hover:text-error transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => addTask(si, mi)}
                          className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text transition-colors mt-0.5">
                          <Plus className="w-3 h-3" /> Aggiungi task
                        </button>
                      </div>
                    </div>
                  ))}

                  <button onClick={() => addMilestone(si)}
                    className="w-full flex items-center gap-1 text-2xs font-semibold text-text-tertiary hover:text-gold-text transition-colors px-4 py-2 border-t border-border">
                    <Plus className="w-3 h-3" /> Aggiungi milestone
                  </button>
                </div>
              ))}

              <button onClick={addSprint}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-gold-text border border-dashed border-border hover:border-gold/40 rounded-xl py-2.5 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Aggiungi sprint
              </button>
            </div>
          )}

          {!loading && !error && draft.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-text-tertiary">Nessun elemento nel piano.</p>
              <button onClick={addSprint} className="flex items-center gap-1.5 text-sm font-semibold text-gold-text">
                <Plus className="w-4 h-4" /> Aggiungi il primo sprint
              </button>
            </div>
          )}
        </div>

        {!loading && (
          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button onClick={onRegenerate}
              className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary border border-border px-4 py-2.5 rounded-xl transition-colors">
              <Sparkles className="w-3.5 h-3.5" /> Rigenera
            </button>
            <button onClick={() => onAccept(draft)} disabled={!total}
              className="flex-1 py-2.5 font-bold rounded-xl text-sm bg-gold text-on-gold disabled:opacity-40 transition-colors">
              Crea piano ({total} elementi)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
