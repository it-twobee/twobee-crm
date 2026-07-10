'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import {
  Hammer, Pencil, Zap, Trash2, Plus, X, Copy, Check, Loader2,
  ChevronDown, ChevronRight, Sparkles, ScanSearch, FlaskConical,
  ArrowRight, Database, LayoutDashboard, Users, FolderKanban,
  MessageSquare, ShoppingCart, Cpu, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  OsTask, createOsTask, updateOsTask, deleteOsTask, completeOsTask,
  setNextStep, acceptAiTask,
} from '@/app/actions/os-tasks'

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  costruire:   { label: 'Costruire',   color: 'var(--color-success)', icon: <Hammer  className="w-3 h-3" /> },
  modificare:  { label: 'Modificare',  color: 'var(--color-info)', icon: <Pencil  className="w-3 h-3" /> },
  ottimizzare: { label: 'Ottimizzare', color: 'var(--color-warning)', icon: <Zap     className="w-3 h-3" /> },
  eliminare:   { label: 'Eliminare',   color: 'var(--color-error)', icon: <Trash2  className="w-3 h-3" /> },
}

const PRIORITY: Record<string, { label: string; color: string }> = {
  critica: { label: 'CRITICA', color: 'var(--color-error)' },
  alta:    { label: 'ALTA',    color: 'var(--color-gold-text)' },
  media:   { label: 'MEDIA',   color: 'var(--color-warning)' },
  bassa:   { label: 'BASSA',   color: '#555' },
}

const SECTION: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  db:          { label: 'DB / Migration', color: 'var(--color-accent)', icon: <Database        className="w-3 h-3" /> },
  dashboard:   { label: 'Dashboard',      color: 'var(--color-gold-text)', icon: <LayoutDashboard className="w-3 h-3" /> },
  clienti:     { label: 'Clienti',        color: 'var(--color-info)', icon: <Users           className="w-3 h-3" /> },
  progetti:    { label: 'Progetti',       color: 'var(--color-warning)', icon: <FolderKanban    className="w-3 h-3" /> },
  chat:        { label: 'Chat',           color: 'var(--color-success)', icon: <MessageSquare   className="w-3 h-3" /> },
  commerciale: { label: 'Commerciale',    color: 'var(--color-accent)', icon: <ShoppingCart    className="w-3 h-3" /> },
  dev:         { label: 'Dev / OS',       color: '#888',    icon: <Cpu             className="w-3 h-3" /> },
}

const SECTION_ORDER = ['db','dashboard','clienti','progetti','chat','commerciale','dev']

// ─── Prompt Modal ─────────────────────────────────────────────────────────────

function PromptModal({ task, onClose }: { task: OsTask; onClose: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/os/generate-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task }),
    })
      .then(r => r.json())
      .then(({ prompt: p }) => { setPrompt(p ?? ''); setLoading(false) })
      .catch(() => { setPrompt('Errore nel generare il prompt.'); setLoading(false) })
  }, [task])

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-background)', border: '1px solid #1A1A1A' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4" style={{ color: 'var(--color-gold-text)' }} />
            <span className="text-sm font-black text-text-primary">Prompt per Claude Code</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} disabled={loading}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
              style={{
                background: copied ? 'rgba(34,197,94,0.1)' : 'var(--color-gold-dim)',
                border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'var(--color-gold-dim)'}`,
                color: copied ? 'var(--color-success)' : 'var(--color-gold-text)',
              }}>
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copiato!' : 'Copia'}
            </button>
            <button onClick={onClose} style={{ color: '#444' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#888')}
              onMouseLeave={e => (e.currentTarget.style.color = '#444')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Context bar */}
        <div className="flex items-center gap-2 px-5 py-2 border-b flex-wrap"
          style={{ borderColor: '#111', background: '#080808' }}>
          {(() => {
            const sec = SECTION[task.section]
            const cat = CATEGORY[task.category]
            return sec ? (
              <span className="flex items-center gap-1 text-2xs font-black px-1.5 py-0.5 rounded"
                style={{ background: `color-mix(in srgb, ${sec.color} 8%, transparent)`, color: sec.color }}>
                {sec.icon} {sec.label}
              </span>
            ) : null
          })()}
          <span className="text-2xs font-black px-1.5 py-0.5 rounded"
            style={{ background: (CATEGORY[task.category]?.color ?? '#555') + '15', color: CATEGORY[task.category]?.color }}>
            {CATEGORY[task.category]?.label ?? task.category}
          </span>
          <span className="text-2xs font-black" style={{ color: PRIORITY[task.priority]?.color ?? '#555' }}>
            {PRIORITY[task.priority]?.label ?? task.priority}
          </span>
          <span className="text-2xs font-semibold text-text-primary truncate">{task.title}</span>
        </div>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48 gap-2" style={{ color: '#333' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Lettura file in corso…</span>
            </div>
          ) : (
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              className="w-full resize-none outline-none p-5 text-xs font-mono leading-relaxed"
              style={{ background: '#080808', color: '#aaa', height: '60vh' }}
            />
          )}
        </div>

        <div className="px-5 py-2 border-t text-2xs" style={{ borderColor: '#111', color: '#222' }}>
          Modifica il prompt prima di copiarlo · I file vengono letti dal progetto in tempo reale
        </div>
      </div>
    </div>
  )
}

// ─── Add Task Modal ────────────────────────────────────────────────────────────

function AddTaskModal({ onAdd, onClose, defaultSection }: {
  onAdd: (t: OsTask) => void
  onClose: () => void
  defaultSection?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    category: 'costruire' as OsTask['category'],
    priority: 'media' as OsTask['priority'],
    section: defaultSection ?? 'dashboard',
    title: '', description: '', file_paths: '', related_files: '',
    effort_days: '', notes: '',
  })

  const handleSubmit = () => {
    if (!form.title.trim()) return
    startTransition(async () => {
      try {
        const task = await createOsTask({
          category: form.category, priority: form.priority, section: form.section,
          title: form.title.trim(),
          description: form.description.trim() || null,
          file_paths: form.file_paths.split('\n').map(s => s.trim()).filter(Boolean),
          related_files: form.related_files.split('\n').map(s => s.trim()).filter(Boolean),
          effort_days: form.effort_days ? Number(form.effort_days) : null,
          notes: form.notes.trim() || null,
          status: 'aperto',
        })
        if (task) {
          onAdd(task)
          onClose()
          toast.success('Task aggiunto')
        } else {
          toast.error('Errore nel salvataggio del task')
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore nel salvataggio del task')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-background)', border: '1px solid var(--color-gold-dim)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-surface)' }}>
          <span className="text-sm font-black text-text-primary">Nuovo task</span>
          <button onClick={onClose} style={{ color: '#444' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Titolo *"
            className="w-full text-sm bg-transparent outline-none text-text-primary placeholder-text-tertiary pb-2"
            style={{ borderBottom: '1px solid #1A1A1A' }}
          />

          {/* Section */}
          <div>
            <p className="text-2xs font-bold uppercase mb-1.5" style={{ color: '#333' }}>Sezione</p>
            <div className="flex gap-1 flex-wrap">
              {SECTION_ORDER.map(k => {
                const v = SECTION[k]
                return (
                  <button key={k} onClick={() => setForm(f => ({ ...f, section: k }))}
                    className="flex items-center gap-1 text-2xs font-bold px-2 py-1 rounded-lg transition-all"
                    style={{
                      background: form.section === k ? `color-mix(in srgb, ${v.color} 8%, transparent)` : '#111',
                      border: `1px solid ${form.section === k ? `color-mix(in srgb, ${v.color} 25%, transparent)` : 'var(--color-surface)'}`,
                      color: form.section === k ? v.color : '#333',
                    }}>
                    {v.icon} {v.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xs font-bold uppercase mb-1.5" style={{ color: '#333' }}>Categoria</p>
              <div className="flex gap-1 flex-wrap">
                {Object.entries(CATEGORY).map(([k, v]) => (
                  <button key={k} onClick={() => setForm(f => ({ ...f, category: k as OsTask['category'] }))}
                    className="text-2xs font-bold px-2 py-1 rounded-lg transition-all"
                    style={{
                      background: form.category === k ? `color-mix(in srgb, ${v.color} 8%, transparent)` : '#111',
                      border: `1px solid ${form.category === k ? `color-mix(in srgb, ${v.color} 25%, transparent)` : 'var(--color-surface)'}`,
                      color: form.category === k ? v.color : '#333',
                    }}>{v.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-2xs font-bold uppercase mb-1.5" style={{ color: '#333' }}>Priorità</p>
              <div className="flex gap-1 flex-wrap">
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <button key={k} onClick={() => setForm(f => ({ ...f, priority: k as OsTask['priority'] }))}
                    className="text-2xs font-bold px-2 py-1 rounded-lg transition-all"
                    style={{
                      background: form.priority === k ? `color-mix(in srgb, ${v.color} 8%, transparent)` : '#111',
                      border: `1px solid ${form.priority === k ? `color-mix(in srgb, ${v.color} 25%, transparent)` : 'var(--color-surface)'}`,
                      color: form.priority === k ? v.color : '#333',
                    }}>{v.label}</button>
                ))}
              </div>
            </div>
          </div>

          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Descrizione tecnica…" rows={3}
            className="w-full text-xs bg-transparent outline-none resize-none placeholder-text-tertiary"
            style={{ color: '#666', border: '1px solid #1A1A1A', borderRadius: 8, padding: '8px 10px' }}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xs font-bold uppercase mb-1" style={{ color: '#333' }}>File da modificare (uno per riga)</p>
              <textarea value={form.file_paths} onChange={e => setForm(f => ({ ...f, file_paths: e.target.value }))}
                placeholder={'components/dashboard/Widget.tsx\napp/actions/foo.ts'} rows={3}
                className="w-full text-2xs font-mono bg-transparent outline-none resize-none placeholder-text-tertiary"
                style={{ color: '#555', border: '1px solid #1A1A1A', borderRadius: 8, padding: '6px 10px' }}
              />
            </div>
            <div>
              <p className="text-2xs font-bold uppercase mb-1" style={{ color: '#333' }}>Dipendenze (uno per riga)</p>
              <textarea value={form.related_files} onChange={e => setForm(f => ({ ...f, related_files: e.target.value }))}
                placeholder={'lib/types/database.ts\ncomponents/shared/X.tsx'} rows={3}
                className="w-full text-2xs font-mono bg-transparent outline-none resize-none placeholder-text-tertiary"
                style={{ color: '#555', border: '1px solid #1A1A1A', borderRadius: 8, padding: '6px 10px' }}
              />
            </div>
            <div>
              <p className="text-2xs font-bold uppercase mb-1" style={{ color: '#333' }}>Effort (giorni)</p>
              <input type="number" value={form.effort_days}
                onChange={e => setForm(f => ({ ...f, effort_days: e.target.value }))}
                placeholder="1.5" className="w-full text-xs bg-transparent outline-none"
                style={{ color: '#666', border: '1px solid #1A1A1A', borderRadius: 8, padding: '6px 10px' }}
              />
            </div>
            <div>
              <p className="text-2xs font-bold uppercase mb-1" style={{ color: '#333' }}>Note</p>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Contesto…" className="w-full text-xs bg-transparent outline-none"
                style={{ color: '#666', border: '1px solid #1A1A1A', borderRadius: 8, padding: '6px 10px' }}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="text-xs px-4 py-1.5 rounded-xl"
            style={{ background: '#111', color: '#444', border: '1px solid #1A1A1A' }}>Annulla</button>
          <button onClick={handleSubmit} disabled={isPending || !form.title.trim()}
            className="text-xs font-bold px-4 py-1.5 rounded-xl transition-all"
            style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)',
              color: 'var(--color-gold-text)', opacity: !form.title.trim() ? 0.5 : 1 }}>
            {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Aggiungi'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, isExpanded, isNext, onToggle, onPrompt, onComplete, onDelete, onUncomplete }: {
  task: OsTask; isExpanded: boolean; isNext: boolean
  onToggle: () => void; onPrompt: () => void; onComplete: () => void
  onDelete: () => void; onUncomplete: () => void
}) {
  const catCfg = CATEGORY[task.category] ?? CATEGORY.costruire
  const priCfg = PRIORITY[task.priority] ?? PRIORITY.media
  const secCfg = SECTION[task.section]
  const done = task.status === 'completato'

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{
        border: `1px solid ${isNext ? 'var(--color-gold-dim)' : done ? 'var(--color-background)' : '#111'}`,
        background: isNext ? 'var(--color-gold-dim)' : done ? '#080808' : 'var(--color-background)',
      }}>
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={onToggle}>
        <span style={{ color: 'var(--color-border)' }} className="shrink-0">
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>

        {/* Category */}
        <span className="flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded shrink-0"
          style={{ background: `color-mix(in srgb, ${catCfg.color} 6%, transparent)`, color: done ? '#333' : catCfg.color }}>
          {catCfg.icon} {catCfg.label}
        </span>

        {/* Priority */}
        <span className="text-[8px] font-black shrink-0" style={{ color: done ? '#222' : priCfg.color }}>
          {priCfg.label}
        </span>

        {/* Title */}
        <span className="flex-1 text-2xs font-semibold truncate"
          style={{ color: done ? '#333' : '#ccc', textDecoration: done ? 'line-through' : 'none' }}>
          {isNext && <span className="mr-1.5" style={{ color: 'var(--color-gold-text)' }}>⭐</span>}
          {task.title}
        </span>

        {/* Effort */}
        {task.effort_days && (
          <span className="text-2xs shrink-0" style={{ color: 'var(--color-border)' }}>{task.effort_days}d</span>
        )}

        {/* AI badge */}
        {task.ai_suggested && (
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ background: 'rgba(168,85,247,0.1)', color: 'var(--color-accent)', border: '1px solid rgba(168,85,247,0.2)' }}>
            AI
          </span>
        )}

        {/* Status dot */}
        <div className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: done ? 'var(--color-success)' : 'var(--color-surface)' }} />
      </div>

      {/* Expanded */}
      {isExpanded && (
        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: '#111' }}>
          {task.description && (
            <p className="text-2xs leading-relaxed" style={{ color: '#555' }}>{task.description}</p>
          )}

          {(task.file_paths?.length ?? 0) > 0 && (
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-border)' }}>
                File da modificare
              </p>
              <div className="flex flex-wrap gap-1.5">
                {task.file_paths!.map(f => (
                  <span key={f} className="text-2xs font-mono px-2 py-0.5 rounded-md"
                    style={{ background: '#111', color: 'var(--color-info)', border: '1px solid #1A1A1A' }}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {(task.related_files?.length ?? 0) > 0 && (
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-border)' }}>
                Dipendenze (non rompere)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {task.related_files!.map(f => (
                  <span key={f} className="text-2xs font-mono px-2 py-0.5 rounded-md"
                    style={{ background: '#111', color: '#555', border: '1px solid #1A1A1A' }}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {task.notes && (
            <p className="text-2xs italic" style={{ color: '#333' }}>{task.notes}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {!done && (
              <button onClick={e => { e.stopPropagation(); onPrompt() }}
                className="flex items-center gap-1.5 text-2xs font-bold px-3 py-1.5 rounded-xl transition-all"
                style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)', color: 'var(--color-gold-text)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gold-dim)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-gold-dim)')}>
                <ArrowRight className="w-3 h-3" />
                Genera Prompt
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); done ? onUncomplete() : onComplete() }}
              className="flex items-center gap-1.5 text-2xs font-bold px-3 py-1.5 rounded-xl transition-all"
              style={{
                background: done ? 'rgba(85,85,85,0.1)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${done ? 'var(--color-border)' : 'rgba(34,197,94,0.2)'}`,
                color: done ? '#444' : 'var(--color-success)',
              }}>
              <Check className="w-3 h-3" />
              {done ? 'Riapri' : 'Segna completato'}
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              className="ml-auto text-2xs px-2.5 py-1.5 rounded-xl transition-colors"
              style={{ color: 'var(--color-border)', border: '1px solid #111' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-border)'; e.currentTarget.style.borderColor = '#111' }}>
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ section, count, effort, onAddTask }: {
  section: string; count: number; effort: number; onAddTask: () => void
}) {
  const cfg = SECTION[section] ?? { label: section, color: '#555', icon: null }
  return (
    <div className="flex items-center gap-2 pt-4 pb-1 first:pt-0">
      <div className="flex items-center gap-1.5">
        <span style={{ color: cfg.color }}>{cfg.icon}</span>
        <span className="text-2xs font-black uppercase tracking-[0.12em]" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
      </div>
      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
        style={{ background: `color-mix(in srgb, ${cfg.color} 6%, transparent)`, color: cfg.color }}>
        {count}
      </span>
      {effort > 0 && (
        <span className="text-[8px]" style={{ color: 'var(--color-border)' }}>{effort}d</span>
      )}
      <div className="flex-1 h-px" style={{ background: `color-mix(in srgb, ${cfg.color} 8%, transparent)` }} />
      <button onClick={onAddTask}
        className="flex items-center gap-1 text-[8px] px-2 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
        style={{ color: cfg.color, border: `1px solid color-mix(in srgb, ${cfg.color} 13%, transparent)` }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
        <Plus className="w-2.5 h-2.5" /> Task
      </button>
    </div>
  )
}

// ─── Proposed Items Panel ─────────────────────────────────────────────────────

function ProposedPanel({ items, onAccept, onDismiss, onClose }: {
  items: Partial<OsTask>[]
  onAccept: (item: Partial<OsTask>) => void
  onDismiss: (i: number) => void
  onClose: () => void
}) {
  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanSearch className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs font-black text-text-primary">Suggerimenti AI dal codebase</span>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(168,85,247,0.1)', color: 'var(--color-accent)' }}>
            {items.length}
          </span>
        </div>
        <button onClick={onClose} style={{ color: '#444' }}><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => {
          const secCfg = SECTION[item.section ?? 'dev']
          const catCfg = CATEGORY[item.category ?? 'costruire']
          const priCfg = PRIORITY[item.priority ?? 'media']
          return (
            <div key={i} className="flex items-start gap-3 rounded-lg p-3"
              style={{ background: 'var(--color-background)', border: '1px solid #111' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  {secCfg && (
                    <span className="flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded"
                      style={{ background: `color-mix(in srgb, ${secCfg.color} 7%, transparent)`, color: secCfg.color }}>
                      {secCfg.icon} {secCfg.label}
                    </span>
                  )}
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded"
                    style={{ background: `color-mix(in srgb, ${catCfg.color} 7%, transparent)`, color: catCfg.color }}>{catCfg.label}</span>
                  <span className="text-[8px] font-black" style={{ color: priCfg.color }}>{priCfg.label}</span>
                </div>
                <p className="text-2xs font-semibold text-text-primary mb-0.5">{item.title}</p>
                {item.description && (
                  <p className="text-2xs leading-relaxed" style={{ color: '#444' }}>{item.description}</p>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => onAccept(item)}
                  className="text-2xs font-bold px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: 'var(--color-success)' }}>
                  + Aggiungi
                </button>
                <button onClick={() => onDismiss(i)}
                  className="text-2xs px-2.5 py-1 rounded-lg"
                  style={{ background: '#111', border: '1px solid #1A1A1A', color: '#333' }}>
                  Ignora
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TwoBeeOSClient({ tasks: initial }: { tasks: OsTask[] }) {
  const [tasks, setTasks]             = useState(initial)
  const [filterCat, setFilterCat]     = useState('')
  const [filterPri, setFilterPri]     = useState('')
  const [filterSec, setFilterSec]     = useState('')
  const [showDone, setShowDone]       = useState(false)
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [promptTask, setPromptTask]   = useState<OsTask | null>(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [addSection, setAddSection]   = useState<string | undefined>()
  const [proposed, setProposed]       = useState<Partial<OsTask>[] | null>(null)
  const [analyzing, setAnalyzing]     = useState(false)
  const [suggesting, setSuggesting]   = useState(false)
  const [proposing, setProposing]     = useState(false)
  const [showIdeaInput, setShowIdeaInput] = useState(false)
  const [ideaPrompt, setIdeaPrompt]   = useState('')
  const [groupBy, setGroupBy]         = useState<'section' | 'category'>('section')
  const [nextReason, setNextReason]   = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  // Stats
  const counts = useMemo(() => {
    const open = tasks.filter(t => t.status === 'aperto')
    const sectionCounts: Record<string, number> = {}
    for (const t of open) sectionCounts[t.section] = (sectionCounts[t.section] ?? 0) + 1
    return {
      costruire:   open.filter(t => t.category === 'costruire').length,
      modificare:  open.filter(t => t.category === 'modificare').length,
      ottimizzare: open.filter(t => t.category === 'ottimizzare').length,
      eliminare:   open.filter(t => t.category === 'eliminare').length,
      done:        tasks.filter(t => t.status === 'completato').length,
      total:       open.length,
      bySection:   sectionCounts,
    }
  }, [tasks])

  const nextTask = tasks.find(t => t.is_next_step && t.status === 'aperto')

  // Filtered list
  const filtered = useMemo(() => tasks.filter(t => {
    if (!showDone && t.status === 'completato') return false
    if (filterCat && t.category !== filterCat) return false
    if (filterPri && t.priority !== filterPri) return false
    if (filterSec && t.section !== filterSec) return false
    return true
  }), [tasks, filterCat, filterPri, filterSec, showDone])

  // Grouped by section or category (flat when section filter active)
  const grouped = useMemo(() => {
    if (filterSec) return null
    const map: Record<string, OsTask[]> = {}
    for (const t of filtered) {
      const key = groupBy === 'category' ? t.category : t.section
      if (!map[key]) map[key] = []
      map[key].push(t)
    }
    return map
  }, [filtered, filterSec, groupBy])

  const migrationNeeded = initial.length === 0

  // Handlers
  const handleComplete = (id: string) => startTransition(async () => {
    try {
      await completeOsTask(id)
      setTasks(prev => prev.map(t => t.id === id
        ? { ...t, status: 'completato', completed_at: new Date().toISOString(), is_next_step: false }
        : t))
      if (expanded === id) setExpanded(null)
    } catch { toast.error('Errore nel completare il task') }
  })

  const handleUncomplete = (id: string) => startTransition(async () => {
    try {
      await updateOsTask(id, { status: 'aperto', completed_at: null })
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'aperto', completed_at: null } : t))
    } catch { toast.error('Errore nel riaprire il task') }
  })

  const handleDelete = (id: string) => startTransition(async () => {
    try {
      await deleteOsTask(id)
      setTasks(prev => prev.filter(t => t.id !== id))
      toast.success('Task eliminato')
    } catch { toast.error('Errore nell\'eliminazione') }
  })

  const handleSuggestNext = async () => {
    setSuggesting(true)
    setNextReason(null)
    const open = tasks.filter(t => t.status === 'aperto')
    try {
      const res = await fetch('/api/os/suggest-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: open.map(t => ({ id: t.id, title: t.title, category: t.category, priority: t.priority, description: t.description })) }),
      })
      const { taskId, reason } = await res.json()
      if (taskId) {
        await setNextStep(taskId)
        setTasks(prev => prev.map(t => ({ ...t, is_next_step: t.id === taskId })))
        setNextReason(reason ?? null)
        setExpanded(taskId)
        setFilterCat('')
        setFilterPri('')
        setFilterSec('')
        setShowDone(false)
      }
    } catch { toast.error('Errore nella chiamata AI') }
    finally { setSuggesting(false) }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/os/analyze-codebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ existingTasks: initial.map(t => ({ title: t.title })) }),
      })
      const { suggestions, error } = await res.json()
      if (error) { toast.error('Errore analisi AI: ' + error); return }
      setProposed(suggestions ?? [])
      if ((suggestions ?? []).length === 0) toast.info('Nessun nuovo suggerimento trovato')
    } catch { toast.error('Errore nella chiamata AI') }
    finally { setAnalyzing(false) }
  }

  const handleAcceptProposed = (item: Partial<OsTask>) => startTransition(async () => {
    try {
      const task = await acceptAiTask({ ...item, section: item.section ?? 'dev' })
      if (task) {
        setTasks(prev => [task, ...prev])
        setProposed(prev => prev?.filter(i => i !== item) ?? null)
        toast.success('Task aggiunto')
      } else {
        toast.error('Errore nel salvataggio del task')
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore nel salvataggio del task') }
  })

  const handleClearNext = () => startTransition(async () => {
    try {
      await setNextStep(null)
      setTasks(prev => prev.map(t => ({ ...t, is_next_step: false })))
      setNextReason(null)
    } catch { toast.error('Errore nel rimuovere il next step') }
  })

  const handleProposeIdeas = async () => {
    if (!ideaPrompt.trim()) return
    setProposing(true)
    try {
      const res = await fetch('/api/os/propose-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: ideaPrompt, existingTasks: tasks.map(t => ({ title: t.title })) }),
      })
      const { suggestions, error } = await res.json()
      if (error) { toast.error('Errore AI: ' + error); return }
      setProposed(suggestions ?? [])
      setShowIdeaInput(false)
      setIdeaPrompt('')
      if ((suggestions ?? []).length === 0) toast.info('Nessuna proposta generata')
    } catch { toast.error('Errore nella chiamata AI') }
    finally { setProposing(false) }
  }

  const openAdd = (section?: string) => {
    setAddSection(section)
    setShowAdd(true)
  }

  const anyFilter = !!(filterCat || filterPri || filterSec)

  // Total effort for a set of tasks
  const totalEffort = (arr: OsTask[]) =>
    arr.filter(t => t.status === 'aperto').reduce((s, t) => s + (t.effort_days ?? 0), 0)

  const renderTaskRow = (task: OsTask) => (
    <TaskRow
      key={task.id}
      task={task}
      isExpanded={expanded === task.id}
      isNext={!!task.is_next_step && task.status === 'aperto'}
      onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
      onPrompt={() => setPromptTask(task)}
      onComplete={() => handleComplete(task.id)}
      onUncomplete={() => handleUncomplete(task.id)}
      onDelete={() => handleDelete(task.id)}
    />
  )

  return (
    <div className="space-y-4">
      {/* Migration banner */}
      {migrationNeeded && (
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-error)' }} />
          <div className="min-w-0">
            <p className="text-xs font-black text-text-primary mb-1">Migration necessaria</p>
            <p className="text-2xs leading-relaxed" style={{ color: '#666' }}>
              La tabella <code className="text-2xs px-1 rounded" style={{ background: 'var(--color-surface)', color: 'var(--color-error)' }}>os_tasks</code> non esiste ancora in produzione.
              Esegui <strong className="text-text-primary">046_os_tasks.sql</strong> via Supabase Dashboard → SQL Editor, poi ricarica la pagina.
            </p>
            <div className="mt-2 rounded-lg px-3 py-1.5 font-mono text-2xs select-all"
              style={{ background: 'var(--color-background)', color: 'var(--color-accent)', border: '1px solid #1A1A1A' }}>
              supabase/migrations/046_os_tasks.sql
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={handleSuggestNext} disabled={suggesting || counts.total === 0}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all"
          style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)',
            color: suggesting ? '#444' : 'var(--color-gold-text)' }}>
          {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {suggesting ? 'Analisi…' : 'Cosa faccio adesso?'}
        </button>

        <button onClick={handleAnalyze} disabled={analyzing}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all"
          style={{ background: 'var(--color-background)', border: '1px solid #1A1A1A', color: analyzing ? '#444' : 'var(--color-accent)' }}>
          {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
          {analyzing ? 'Scan…' : 'Analizza codebase'}
        </button>

        <button onClick={() => { setShowIdeaInput(v => !v); setIdeaPrompt('') }}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl ml-auto transition-all"
          style={{
            background: showIdeaInput ? 'var(--color-gold-dim)' : 'var(--color-background)',
            border: `1px solid ${showIdeaInput ? 'var(--color-gold-dim)' : 'var(--color-surface)'}`,
            color: showIdeaInput ? 'var(--color-gold-text)' : '#555',
          }}>
          <FlaskConical className="w-3.5 h-3.5" /> Proponi idee
        </button>
      </div>

      {/* Idea input panel */}
      {showIdeaInput && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)' }}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--color-gold-text)' }} />
            <p className="text-xs font-bold" style={{ color: 'var(--color-gold-text)' }}>Cosa vuoi costruire o implementare?</p>
          </div>
          <textarea
            value={ideaPrompt}
            onChange={e => setIdeaPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleProposeIdeas() }}
            placeholder="es. timesheet per tracciare ore per cliente, widget pipeline vendite, notifiche Slack per task in scadenza…"
            rows={3}
            autoFocus
            className="w-full text-xs rounded-lg px-3 py-2.5 outline-none resize-none"
            style={{ background: 'var(--color-background)', border: '1px solid #1A1A1A', color: '#CCC', lineHeight: 1.6 }}
          />
          <div className="flex items-center gap-2">
            <button onClick={handleProposeIdeas} disabled={proposing || !ideaPrompt.trim()}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: proposing || !ideaPrompt.trim() ? 'var(--color-background)' : 'var(--color-gold-dim)',
                border: `1px solid ${proposing || !ideaPrompt.trim() ? '#111' : 'var(--color-gold-dim)'}`,
                color: proposing || !ideaPrompt.trim() ? '#333' : 'var(--color-gold-text)',
              }}>
              {proposing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
              {proposing ? 'Generazione…' : 'Genera 5 proposte'}
            </button>
            <span className="text-2xs" style={{ color: 'var(--color-border)' }}>⌘↵</span>
            <button onClick={() => openAdd()}
              className="ml-auto text-2xs underline-offset-2 underline"
              style={{ color: 'var(--color-border)' }}>
              aggiungi manuale
            </button>
            <button onClick={() => { setShowIdeaInput(false); setIdeaPrompt('') }}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--color-border)' }} />
            </button>
          </div>
        </div>
      )}

      {/* Category stats */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).map(cat => {
          const cfg = CATEGORY[cat]
          const count = counts[cat as keyof typeof counts] as number
          return (
            <button key={cat} onClick={() => setFilterCat(filterCat === cat ? '' : cat)}
              className="rounded-xl p-3 text-left transition-all"
              style={{
                background: filterCat === cat ? `color-mix(in srgb, ${cfg.color} 6%, transparent)` : 'var(--color-background)',
                border: `1px solid ${filterCat === cat ? `color-mix(in srgb, ${cfg.color} 19%, transparent)` : '#111'}`,
              }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span style={{ color: cfg.color }}>{cfg.icon}</span>
                <span className="text-2xs font-black uppercase tracking-widest"
                  style={{ color: filterCat === cat ? cfg.color : '#333' }}>{cfg.label}</span>
              </div>
              <p className="text-2xl font-black" style={{ color: filterCat === cat ? cfg.color : '#888' }}>{count}</p>
            </button>
          )
        })}
      </div>

      {/* Next step */}
      {nextTask && (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)' }}>
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-gold-text)' }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-2xs font-black uppercase tracking-widest" style={{ color: 'var(--color-gold-text)' }}>
                  Prossimo step
                </p>
                {SECTION[nextTask.section] && (
                  <span className="flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `color-mix(in srgb, ${SECTION[nextTask.section].color} 7%, transparent)`, color: SECTION[nextTask.section].color }}>
                    {SECTION[nextTask.section].icon} {SECTION[nextTask.section].label}
                  </span>
                )}
              </div>
              <p className="text-sm font-black text-text-primary mb-1">{nextTask.title}</p>
              {nextReason && <p className="text-2xs" style={{ color: '#555' }}>{nextReason}</p>}
              {!nextReason && nextTask.description && (
                <p className="text-2xs line-clamp-2" style={{ color: '#444' }}>{nextTask.description}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button onClick={() => setPromptTask(nextTask)}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl whitespace-nowrap"
                style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)', color: 'var(--color-gold-text)' }}>
                <ArrowRight className="w-3 h-3" /> Genera Prompt
              </button>
              <button onClick={handleClearNext}
                className="text-2xs text-center px-3 py-1 rounded-xl"
                style={{ background: '#111', border: '1px solid #1A1A1A', color: '#333' }}>
                Rimuovi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proposed */}
      {proposed && proposed.length > 0 && (
        <ProposedPanel
          items={proposed}
          onAccept={handleAcceptProposed}
          onDismiss={i => setProposed(prev => prev?.filter((_, idx) => idx !== i) ?? null)}
          onClose={() => setProposed(null)}
        />
      )}

      {/* Section pills + filters */}
      <div className="space-y-2">
        {/* Section pills */}
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterSec('')}
            className="flex items-center gap-1 text-2xs font-bold px-2.5 py-1 rounded-lg transition-all"
            style={{
              background: !filterSec ? 'var(--color-surface)' : 'var(--color-background)',
              border: `1px solid ${!filterSec ? 'var(--color-border)' : '#111'}`,
              color: !filterSec ? '#888' : '#333',
            }}>
            Tutte le sezioni
          </button>
          {SECTION_ORDER.map(sec => {
            const cfg = SECTION[sec]
            const c = counts.bySection[sec] ?? 0
            if (c === 0 && !filterSec && !showDone) return null
            return (
              <button key={sec} onClick={() => setFilterSec(filterSec === sec ? '' : sec)}
                className="flex items-center gap-1.5 text-2xs font-bold px-2.5 py-1 rounded-lg transition-all"
                style={{
                  background: filterSec === sec ? `color-mix(in srgb, ${cfg.color} 7%, transparent)` : 'var(--color-background)',
                  border: `1px solid ${filterSec === sec ? `color-mix(in srgb, ${cfg.color} 21%, transparent)` : '#111'}`,
                  color: filterSec === sec ? cfg.color : '#333',
                }}>
                <span style={{ color: filterSec === sec ? cfg.color : '#333' }}>{cfg.icon}</span>
                {cfg.label}
                {c > 0 && <span className="text-[8px] opacity-60">{c}</span>}
              </button>
            )
          })}
        </div>

        {/* Category + Priority + Done toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--color-background)', border: '1px solid #111' }}>
            {['', ...Object.keys(CATEGORY)].map(cat => (
              <button key={cat} onClick={() => setFilterCat(cat)}
                className="text-2xs font-bold px-2 py-1 rounded-md transition-all"
                style={{
                  background: filterCat === cat ? 'var(--color-surface)' : 'transparent',
                  color: filterCat === cat ? (cat ? CATEGORY[cat]?.color : '#888') : '#333',
                  border: filterCat === cat ? '1px solid #2A2A2A' : '1px solid transparent',
                }}>
                {cat ? CATEGORY[cat].label : 'Cat.'}
              </button>
            ))}
          </div>

          <select value={filterPri} onChange={e => setFilterPri(e.target.value)}
            className="text-2xs font-bold px-2 py-1.5 rounded-lg outline-none"
            style={{ background: 'var(--color-background)', color: filterPri ? PRIORITY[filterPri]?.color : '#333', border: '1px solid #111' }}>
            <option value="">Priorità</option>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {anyFilter && (
            <button onClick={() => { setFilterCat(''); setFilterPri(''); setFilterSec('') }}
              className="text-2xs px-2 py-1 rounded-lg flex items-center gap-1"
              style={{ background: '#111', color: '#555', border: '1px solid #1A1A1A' }}>
              <X className="w-2.5 h-2.5" /> Reset
            </button>
          )}

          {/* Group by toggle */}
          <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--color-background)', border: '1px solid #111' }}>
            {(['section', 'category'] as const).map(v => (
              <button key={v} onClick={() => setGroupBy(v)}
                className="text-2xs font-bold px-2 py-1 rounded-md transition-all"
                style={{
                  background: groupBy === v ? 'var(--color-surface)' : 'transparent',
                  color: groupBy === v ? '#888' : '#333',
                  border: groupBy === v ? '1px solid #2A2A2A' : '1px solid transparent',
                }}>
                {v === 'section' ? 'Sezione' : 'Tipologia'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto cursor-pointer" onClick={() => setShowDone(v => !v)}>
            <div className="w-7 h-4 rounded-full relative transition-colors"
              style={{ background: showDone ? 'rgba(34,197,94,0.3)' : '#111', border: '1px solid ' + (showDone ? 'rgba(34,197,94,0.4)' : 'var(--color-surface)') }}>
              <div className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                style={{ background: showDone ? 'var(--color-success)' : 'var(--color-border)', left: showDone ? 14 : 2 }} />
            </div>
            <span className="text-2xs" style={{ color: '#333' }}>
              Completati {counts.done > 0 && `(${counts.done})`}
            </span>
          </div>
        </div>
      </div>

      {/* Task list — grouped or flat */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 rounded-xl" style={{ border: '1px dashed #111' }}>
          <p className="text-xs" style={{ color: '#222' }}>
            {anyFilter
              ? 'Nessun task per questo filtro.'
              : 'Board vuota — aggiungi un task o analizza il codebase.'}
          </p>
        </div>
      ) : grouped ? (
        <div className="space-y-1">
          {(groupBy === 'section' ? SECTION_ORDER : Object.keys(CATEGORY))
            .filter(key => grouped[key]?.length > 0)
            .map(key => (
              <div key={key}>
                {groupBy === 'section' ? (
                  <SectionHeader
                    section={key}
                    count={grouped[key].filter(t => t.status === 'aperto').length}
                    effort={totalEffort(grouped[key])}
                    onAddTask={() => openAdd(key)}
                  />
                ) : (
                  <div className="flex items-center gap-2 px-1 py-2 mt-2">
                    <span style={{ color: CATEGORY[key].color }}>{CATEGORY[key].icon}</span>
                    <span className="text-2xs font-black uppercase tracking-widest"
                      style={{ color: CATEGORY[key].color }}>{CATEGORY[key].label}</span>
                    <span className="text-2xs font-bold" style={{ color: '#333' }}>
                      {grouped[key].filter(t => t.status === 'aperto').length}
                    </span>
                    <span className="text-2xs" style={{ color: '#222' }}>
                      {totalEffort(grouped[key])}d
                    </span>
                    <div className="flex-1 h-px" style={{ background: `color-mix(in srgb, ${CATEGORY[key].color} 8%, transparent)` }} />
                    <button onClick={() => openAdd()}
                      className="text-2xs font-bold flex items-center gap-0.5 transition-opacity opacity-30 hover:opacity-70"
                      style={{ color: CATEGORY[key].color }}>
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
                <div className="space-y-1.5">
                  {grouped[key].map(renderTaskRow)}
                </div>
              </div>
            ))}
          {/* Tasks with unknown sections */}
          {Object.keys(grouped).filter(s => !SECTION_ORDER.includes(s)).map(sec => (
            <div key={sec}>
              <SectionHeader
                section={sec}
                count={grouped[sec].filter(t => t.status === 'aperto').length}
                effort={totalEffort(grouped[sec])}
                onAddTask={() => openAdd(sec)}
              />
              <div className="space-y-1.5">{grouped[sec].map(renderTaskRow)}</div>
            </div>
          ))}
        </div>
      ) : (
        // Flat list (section filter active)
        <div className="space-y-1.5">{filtered.map(renderTaskRow)}</div>
      )}

      {/* Footer */}
      {filtered.length > 0 && (
        <p className="text-2xs text-center pb-2" style={{ color: 'var(--color-surface)' }}>
          {counts.total} aperti · {counts.done} completati ·{' '}
          {totalEffort(tasks.filter(t => t.status === 'aperto'))}d di effort stimato
        </p>
      )}

      {/* Modals */}
      {promptTask && <PromptModal task={promptTask} onClose={() => setPromptTask(null)} />}
      {showAdd && (
        <AddTaskModal
          defaultSection={addSection}
          onAdd={task => setTasks(prev => [task, ...prev])}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
