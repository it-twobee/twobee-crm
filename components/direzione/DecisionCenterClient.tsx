'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Scale, Plus, X, Loader2, Check, Archive, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Trash2,
} from 'lucide-react'
import type { Decision, DecisionStatus, DecisionPriority, DecisionOption } from '@/lib/types/database'

const PRIORITY_STYLE: Record<DecisionPriority, { color: string; label: string }> = {
  critica: { color: 'var(--color-error)', label: 'Critica' },
  alta:    { color: 'var(--color-orange)', label: 'Alta' },
  media:   { color: 'var(--color-gold-text)', label: 'Media' },
  bassa:   { color: 'var(--color-info)', label: 'Bassa' },
}

export function DecisionCenterClient({ decisions: initial, currentUserId }: {
  decisions: Decision[]
  currentUserId: string
}) {
  const [decisions, setDecisions] = useState(initial)
  const [showNew, setShowNew] = useState(false)
  const [deciding, setDeciding] = useState<Decision | null>(null)

  // 'in_revisione' esiste nello schema (044): senza questo filtro sparirebbe dalla UI
  const open = decisions.filter(d => d.status === 'aperta' || d.status === 'in_revisione')
  const decided = decisions.filter(d => d.status === 'decisa')
  const archived = decisions.filter(d => d.status === 'archiviata')

  const archive = async (d: Decision) => {
    const { error } = await createClient().from('decisions')
      .update({ status: 'archiviata' } as never).eq('id', d.id)
    if (error) { toast.error(error.message); return }
    setDecisions(prev => prev.map(x => x.id === d.id ? { ...x, status: 'archiviata' as DecisionStatus } : x))
  }

  const remove = async (d: Decision) => {
    const { error } = await createClient().from('decisions').delete().eq('id', d.id)
    if (error) { toast.error(error.message); return }
    setDecisions(prev => prev.filter(x => x.id !== d.id))
    toast.success('Decisione eliminata')
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Scale className="w-5 h-5 text-gold-text" />
            Decision Center
          </h1>
          <p className="text-text-tertiary text-sm mt-0.5">
            {open.length} decision{open.length === 1 ? 'e' : 'i'} in attesa · {decided.length} pres{decided.length === 1 ? 'a' : 'e'}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuova decisione
        </button>
      </div>

      {open.length === 0 && decided.length === 0 && archived.length === 0 && (
        <div className="text-center py-20 text-text-tertiary text-sm">
          Nessuna decisione registrata. Inizia aggiungendo la prima.
        </div>
      )}

      {open.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> Da decidere
          </h2>
          {open.map(d => (
            <DecisionCard key={d.id} decision={d}
              onDecide={() => setDeciding(d)} onArchive={() => archive(d)} onDelete={() => remove(d)} />
          ))}
        </section>
      )}

      {decided.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
            <Check className="w-3.5 h-3.5" /> Decise
          </h2>
          {decided.map(d => (
            <DecisionCard key={d.id} decision={d} onArchive={() => archive(d)} onDelete={() => remove(d)} />
          ))}
        </section>
      )}

      {archived.length > 0 && (
        <section className="space-y-2 opacity-60">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
            <Archive className="w-3.5 h-3.5" /> Archiviate
          </h2>
          {archived.map(d => (
            <DecisionCard key={d.id} decision={d} onDelete={() => remove(d)} />
          ))}
        </section>
      )}

      {showNew && (
        <NewDecisionModal
          currentUserId={currentUserId}
          onClose={() => setShowNew(false)}
          onCreated={d => { setDecisions(prev => [d, ...prev]); setShowNew(false) }}
        />
      )}

      {deciding && (
        <DecideModal
          decision={deciding}
          onClose={() => setDeciding(null)}
          onDecided={d => {
            setDecisions(prev => prev.map(x => x.id === d.id ? d : x))
            setDeciding(null)
          }}
        />
      )}
    </div>
  )
}

function DecisionCard({ decision: d, onDecide, onArchive, onDelete }: {
  decision: Decision
  onDecide?: () => void
  onArchive?: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const priority = PRIORITY_STYLE[d.priority]
  const isOverdue = d.status !== 'decisa' && d.status !== 'archiviata' && d.due_date && d.due_date < new Date().toISOString().slice(0, 10)
  const options = (d.options ?? []) as DecisionOption[]

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: priority.color }} title={`Priorità ${priority.label}`} />
        <div className="flex-1 min-w-0">
          <p className="text-text-primary text-sm font-medium truncate">{d.title}</p>
          <div className="flex items-center gap-2 mt-0.5 text-2xs text-text-tertiary">
            {d.area && <span>{d.area}</span>}
            {d.due_date && (
              <span className={isOverdue ? 'text-error flex items-center gap-1' : ''}>
                {isOverdue && <AlertTriangle className="w-3 h-3" />}
                entro {new Date(d.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {d.decided_at && <span className="text-success/60">decisa il {new Date(d.decided_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>}
          </div>
        </div>
        {(d.status === 'aperta' || d.status === 'in_revisione') && onDecide && (
          <button
            onClick={e => { e.stopPropagation(); onDecide() }}
            className="px-3 py-1.5 bg-gold/10 text-gold-text text-xs font-semibold rounded-lg hover:bg-gold/20 transition-colors shrink-0"
          >
            Decidi
          </button>
        )}
        {expanded ? <ChevronUp className="w-4 h-4 text-text-tertiary shrink-0" /> : <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-3 text-sm">
          {d.context && (
            <div>
              <p className="text-2xs uppercase tracking-wider text-text-tertiary font-bold mb-1">Contesto</p>
              <p className="text-text-secondary whitespace-pre-wrap">{d.context}</p>
            </div>
          )}
          {options.length > 0 && (
            <div>
              <p className="text-2xs uppercase tracking-wider text-text-tertiary font-bold mb-1.5">Opzioni</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {options.map((o, i) => (
                  <div key={i} className={`rounded-lg border p-3 ${d.outcome === o.label ? 'border-gold/40 bg-gold/5' : 'border-border bg-background'}`}>
                    <p className="text-text-primary font-medium text-xs mb-1.5 flex items-center gap-1.5">
                      {d.outcome === o.label && <Check className="w-3 h-3 text-gold-text" />}
                      {o.label}
                    </p>
                    {o.pros && <p className="text-success/60 text-2xs">+ {o.pros}</p>}
                    {o.cons && <p className="text-error/60 text-2xs">− {o.cons}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.rationale && (
            <div>
              <p className="text-2xs uppercase tracking-wider text-text-tertiary font-bold mb-1">Motivazione</p>
              <p className="text-text-secondary whitespace-pre-wrap">{d.rationale}</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {d.status !== 'archiviata' && onArchive && (
              <button onClick={onArchive} className="flex items-center gap-1 px-2.5 py-1 text-xs text-text-tertiary hover:text-text-secondary bg-surface rounded-lg transition-colors">
                <Archive className="w-3 h-3" /> Archivia
              </button>
            )}
            <button onClick={onDelete} className="flex items-center gap-1 px-2.5 py-1 text-xs text-error/50 hover:text-error bg-surface rounded-lg transition-colors">
              <Trash2 className="w-3 h-3" /> Elimina
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NewDecisionModal({ currentUserId, onClose, onCreated }: {
  currentUserId: string
  onClose: () => void
  onCreated: (d: Decision) => void
}) {
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [area, setArea] = useState('')
  const [priority, setPriority] = useState<DecisionPriority>('media')
  const [dueDate, setDueDate] = useState('')
  const [options, setOptions] = useState<DecisionOption[]>([{ label: '', pros: '', cons: '' }, { label: '', pros: '', cons: '' }])
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) { toast.error('Titolo obbligatorio'); return }
    setSaving(true)
    const cleanOptions = options.filter(o => o.label.trim())
    const { data, error } = await createClient().from('decisions').insert({
      title: title.trim(),
      context: context.trim() || null,
      area: area.trim() || null,
      priority,
      due_date: dueDate || null,
      options: cleanOptions,
      created_by: currentUserId,
    } as never).select().single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Decisione registrata')
    onCreated(data as Decision)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Nuova decisione</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-text-tertiary text-xs mb-1.5 block">Cosa va deciso? *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Es. Assumere una nuova risorsa digital?"
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          </div>
          <div>
            <label className="text-text-tertiary text-xs mb-1.5 block">Contesto</label>
            <textarea value={context} onChange={e => setContext(e.target.value)} rows={2}
              placeholder="Perché serve decidere, cosa è in gioco…"
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40 resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-text-tertiary text-xs mb-1.5 block">Priorità</label>
              <select value={priority} onChange={e => setPriority(e.target.value as DecisionPriority)}
                className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none">
                <option value="critica">Critica</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
            </div>
            <div>
              <label className="text-text-tertiary text-xs mb-1.5 block">Area</label>
              <input value={area} onChange={e => setArea(e.target.value)} placeholder="Es. Team"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
            </div>
            <div>
              <label className="text-text-tertiary text-xs mb-1.5 block">Entro</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none [color-scheme:dark]" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-text-tertiary text-xs">Opzioni sul tavolo</label>
              <button onClick={() => setOptions([...options, { label: '', pros: '', cons: '' }])}
                className="text-xs text-gold-text/60 hover:text-gold-text">+ opzione</button>
            </div>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="bg-background border border-border rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <input value={o.label} onChange={e => setOptions(options.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      placeholder={`Opzione ${i + 1}`}
                      className="flex-1 bg-transparent border-b border-border px-1 py-1 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
                    {options.length > 2 && (
                      <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-text-tertiary hover:text-error">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={o.pros} onChange={e => setOptions(options.map((x, j) => j === i ? { ...x, pros: e.target.value } : x))}
                      placeholder="Pro" className="bg-transparent text-xs text-success/70 px-1 py-1 focus:outline-none placeholder:text-text-tertiary" />
                    <input value={o.cons} onChange={e => setOptions(options.map((x, j) => j === i ? { ...x, cons: e.target.value } : x))}
                      placeholder="Contro" className="bg-transparent text-xs text-error/70 px-1 py-1 focus:outline-none placeholder:text-text-tertiary" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button onClick={save} disabled={saving || !title.trim()}
            className="flex-1 py-2.5 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Registra decisione'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-text-tertiary text-sm rounded-xl hover:text-text-primary transition-colors">Annulla</button>
        </div>
      </div>
    </div>
  )
}

function DecideModal({ decision, onClose, onDecided }: {
  decision: Decision
  onClose: () => void
  onDecided: (d: Decision) => void
}) {
  const options = (decision.options ?? []) as DecisionOption[]
  const [choice, setChoice] = useState('')
  const [customChoice, setCustomChoice] = useState('')
  const [rationale, setRationale] = useState('')
  const [saving, setSaving] = useState(false)

  const finalChoice = choice === '__custom__' ? customChoice.trim() : choice

  const save = async () => {
    if (!finalChoice) { toast.error('Scegli o scrivi la decisione'); return }
    setSaving(true)
    const decidedAt = new Date().toISOString()
    const { error } = await createClient().from('decisions').update({
      outcome: finalChoice,
      rationale: rationale.trim() || null,
      status: 'decisa',
      decided_at: decidedAt,
    } as never).eq('id', decision.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Decisione presa')
    onDecided({ ...decision, outcome: finalChoice, rationale: rationale.trim() || null, status: 'decisa', decided_at: decidedAt })
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">{decision.title}</h2>
          <p className="text-text-tertiary text-xs mt-0.5">Registra la decisione presa</p>
        </div>
        <div className="p-5 space-y-3">
          {options.map((o, i) => (
            <button key={i} onClick={() => setChoice(o.label)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                choice === o.label ? 'border-gold/50 bg-gold/10 text-text-primary' : 'border-border bg-background text-text-secondary hover:border-border'
              }`}>
              {o.label}
            </button>
          ))}
          <button onClick={() => setChoice('__custom__')}
            className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
              choice === '__custom__' ? 'border-gold/50 bg-gold/10 text-text-primary' : 'border-border bg-background text-text-tertiary hover:border-border'
            }`}>
            Altra decisione…
          </button>
          {choice === '__custom__' && (
            <input value={customChoice} onChange={e => setCustomChoice(e.target.value)} autoFocus
              placeholder="Scrivi la decisione"
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          )}
          <textarea value={rationale} onChange={e => setRationale(e.target.value)} rows={2}
            placeholder="Perché? (motivazione, opzionale)"
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40 resize-none" />
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button onClick={save} disabled={saving || !finalChoice}
            className="flex-1 py-2.5 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Conferma decisione'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-text-tertiary text-sm rounded-xl hover:text-text-primary transition-colors">Annulla</button>
        </div>
      </div>
    </div>
  )
}
