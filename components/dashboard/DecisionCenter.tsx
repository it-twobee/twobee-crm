'use client'
import { useState, useTransition, useEffect } from 'react'
import { CheckCircle2, Circle, Clock, Archive, Plus, X } from 'lucide-react'
import { createDecision, updateDecisionStatus } from '@/app/actions/decisions'

export interface Decision {
  id: string
  title: string
  context: string | null
  status: string
  priority: string
  outcome: string | null
  decided_at: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; next: string }> = {
  aperta:       { label: 'Aperta',       icon: <Circle        className="w-3 h-3" />, color: 'var(--color-gold-text)', next: 'in_revisione' },
  in_revisione: { label: 'In revisione', icon: <Clock         className="w-3 h-3" />, color: 'var(--color-info)', next: 'decisa' },
  decisa:       { label: 'Decisa',       icon: <CheckCircle2  className="w-3 h-3" />, color: 'var(--color-success)', next: 'archiviata' },
  archiviata:   { label: 'Archiviata',   icon: <Archive       className="w-3 h-3" />, color: '#333',    next: 'aperta' },
}

const PRIORITY_COLOR: Record<string, string> = {
  bassa: '#444', media: 'var(--color-warning)', alta: 'var(--color-gold-text)', critica: 'var(--color-error)',
}

export function DecisionCenter({ decisions: initial }: { decisions: Decision[] }) {
  const [decisions, setDecisions]   = useState(initial)
  const [showAdd, setShowAdd]       = useState(false)
  const [newTitle, setNewTitle]     = useState('')
  const [newContext, setNewContext] = useState('')
  const [newPriority, setNewPriority] = useState('media')
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setDecisions(initial) }, [initial])

  const handleAdd = () => {
    if (!newTitle.trim()) return
    startTransition(async () => {
      const result = await createDecision({ title: newTitle, context: newContext || null, priority: newPriority })
      if (result?.decision) {
        setDecisions(prev => [result.decision as Decision, ...prev])
        setNewTitle('')
        setNewContext('')
        setNewPriority('media')
        setShowAdd(false)
      }
    })
  }

  const handleStatus = (id: string, nextStatus: string) => {
    startTransition(async () => {
      await updateDecisionStatus(id, nextStatus)
      setDecisions(prev => prev.map(d => d.id === id ? { ...d, status: nextStatus } : d))
    })
  }

  const open   = decisions.filter(d => ['aperta', 'in_revisione'].includes(d.status))
  const closed = decisions.filter(d => ['decisa', 'archiviata'].includes(d.status))

  return (
    <div className="p-3 h-full overflow-auto flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-2xs font-bold px-2 py-0.5 rounded-md" style={{ background: 'var(--color-surface)', color: 'var(--color-gold-text)' }}>
          {open.length} aperte
        </span>
        <span className="text-2xs px-2 py-0.5 rounded-md" style={{ background: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>
          {closed.length} chiuse
        </span>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="ml-auto flex items-center gap-1 text-2xs font-bold px-2.5 py-1.5 rounded-lg transition-all"
          style={{
            background: showAdd ? 'var(--color-gold-dim)' : 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: showAdd ? 'var(--color-gold-text)' : 'var(--color-text-secondary)',
          }}>
          {showAdd ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {showAdd ? 'Annulla' : 'Aggiungi'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl p-3 flex flex-col gap-2 shrink-0" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-gold-dim)' }}>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Titolo decisione..."
            className="w-full text-xs bg-transparent outline-none placeholder-text-tertiary text-text-primary pb-2"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          />
          <textarea
            value={newContext}
            onChange={e => setNewContext(e.target.value)}
            placeholder="Contesto (opzionale)..."
            rows={2}
            className="w-full text-2xs bg-transparent outline-none placeholder-text-tertiary resize-none"
            style={{ color: 'var(--color-text-secondary)' }}
          />
          <div className="flex items-center gap-2">
            <select
              value={newPriority}
              onChange={e => setNewPriority(e.target.value)}
              className="text-2xs rounded-md px-2 py-1 outline-none"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              <option value="bassa">Bassa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Critica</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={isPending || !newTitle.trim()}
              className="ml-auto text-2xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: 'var(--color-gold-dim)',
                border: '1px solid var(--color-gold-dim)',
                color: 'var(--color-gold-text)',
                opacity: !newTitle.trim() || isPending ? 0.5 : 1,
              }}>
              Salva
            </button>
          </div>
        </div>
      )}

      {/* Open decisions */}
      {open.length === 0 && !showAdd && (
        <p className="text-2xs text-center py-2" style={{ color: 'var(--color-text-tertiary)' }}>Nessuna decisione aperta</p>
      )}
      <div className="space-y-1.5">
        {open.map(d => {
          const st = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.aperta
          return (
            <div key={d.id} className="rounded-lg p-2.5 flex items-start gap-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <button
                onClick={() => handleStatus(d.id, st.next)}
                disabled={isPending}
                className="mt-0.5 shrink-0 transition-opacity hover:opacity-70"
                style={{ color: st.color }}>
                {st.icon}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-2xs font-semibold text-text-primary leading-tight">{d.title}</p>
                {d.context && (
                  <p className="text-2xs mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>{d.context}</p>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <span className="text-2xs font-bold" style={{ color: PRIORITY_COLOR[d.priority] ?? 'var(--color-text-tertiary)' }}>
                  {d.priority}
                </span>
                <span className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>{st.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Closed decisions */}
      {closed.length > 0 && (
        <div className="space-y-1 mt-1">
          <p className="text-2xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>Recenti chiuse</p>
          {closed.slice(0, 3).map(d => {
            const st = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.archiviata
            return (
              <div key={d.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <span style={{ color: st.color }}>{st.icon}</span>
                <p className="text-2xs flex-1 truncate" style={{ color: 'var(--color-text-tertiary)' }}>{d.title}</p>
                <span className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>{st.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
