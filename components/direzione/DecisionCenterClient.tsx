'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Scale, Plus, X, Loader2, Check, Archive, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Trash2,
} from 'lucide-react'
import type { Decision, DecisionStatus, DecisionImpact, DecisionOption } from '@/lib/types/database'

const IMPACT_STYLE: Record<DecisionImpact, { color: string; label: string }> = {
  alto: { color: '#EF4444', label: 'Alto impatto' },
  medio: { color: '#F5C800', label: 'Medio impatto' },
  basso: { color: '#3B82F6', label: 'Basso impatto' },
}

export function DecisionCenterClient({ decisions: initial, currentUserId }: {
  decisions: Decision[]
  currentUserId: string
}) {
  const [decisions, setDecisions] = useState(initial)
  const [showNew, setShowNew] = useState(false)
  const [deciding, setDeciding] = useState<Decision | null>(null)

  const open = decisions.filter(d => d.status === 'aperta')
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
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-[#F5C800]" />
            Decision Center
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            {open.length} decision{open.length === 1 ? 'e' : 'i'} in attesa · {decided.length} pres{decided.length === 1 ? 'a' : 'e'}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#F5C800] text-black text-sm font-semibold rounded-xl hover:bg-[#F5C800]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuova decisione
        </button>
      </div>

      {open.length === 0 && decided.length === 0 && archived.length === 0 && (
        <div className="text-center py-20 text-white/30 text-sm">
          Nessuna decisione registrata. Inizia aggiungendo la prima.
        </div>
      )}

      {open.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
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
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
            <Check className="w-3.5 h-3.5" /> Decise
          </h2>
          {decided.map(d => (
            <DecisionCard key={d.id} decision={d} onArchive={() => archive(d)} onDelete={() => remove(d)} />
          ))}
        </section>
      )}

      {archived.length > 0 && (
        <section className="space-y-2 opacity-60">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
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
  const impact = IMPACT_STYLE[d.impact]
  const isOverdue = d.status === 'aperta' && d.due_date && d.due_date < new Date().toISOString().slice(0, 10)
  const options = (d.options ?? []) as DecisionOption[]

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: impact.color }} title={impact.label} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{d.title}</p>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/30">
            {d.area && <span>{d.area}</span>}
            {d.due_date && (
              <span className={isOverdue ? 'text-red-400 flex items-center gap-1' : ''}>
                {isOverdue && <AlertTriangle className="w-3 h-3" />}
                entro {new Date(d.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {d.decided_at && <span className="text-green-400/60">decisa il {new Date(d.decided_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>}
          </div>
        </div>
        {d.status === 'aperta' && onDecide && (
          <button
            onClick={e => { e.stopPropagation(); onDecide() }}
            className="px-3 py-1.5 bg-[#F5C800]/10 text-[#F5C800] text-xs font-semibold rounded-lg hover:bg-[#F5C800]/20 transition-colors shrink-0"
          >
            Decidi
          </button>
        )}
        {expanded ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[#222] space-y-3 text-sm">
          {d.context && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 font-bold mb-1">Contesto</p>
              <p className="text-white/60 whitespace-pre-wrap">{d.context}</p>
            </div>
          )}
          {options.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 font-bold mb-1.5">Opzioni</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {options.map((o, i) => (
                  <div key={i} className={`rounded-lg border p-3 ${d.decision === o.label ? 'border-[#F5C800]/40 bg-[#F5C800]/5' : 'border-[#2A2A2A] bg-[#111]'}`}>
                    <p className="text-white font-medium text-xs mb-1.5 flex items-center gap-1.5">
                      {d.decision === o.label && <Check className="w-3 h-3 text-[#F5C800]" />}
                      {o.label}
                    </p>
                    {o.pros && <p className="text-green-400/60 text-[11px]">+ {o.pros}</p>}
                    {o.cons && <p className="text-red-400/60 text-[11px]">− {o.cons}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.rationale && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 font-bold mb-1">Motivazione</p>
              <p className="text-white/60 whitespace-pre-wrap">{d.rationale}</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {d.status !== 'archiviata' && onArchive && (
              <button onClick={onArchive} className="flex items-center gap-1 px-2.5 py-1 text-xs text-white/40 hover:text-white/70 bg-white/5 rounded-lg transition-colors">
                <Archive className="w-3 h-3" /> Archivia
              </button>
            )}
            <button onClick={onDelete} className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-400/50 hover:text-red-400 bg-white/5 rounded-lg transition-colors">
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
  const [impact, setImpact] = useState<DecisionImpact>('medio')
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
      impact,
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-sm font-bold text-white">Nuova decisione</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-white/40 text-xs mb-1.5 block">Cosa va deciso? *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Es. Assumere una nuova risorsa digital?"
              className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800]/40" />
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1.5 block">Contesto</label>
            <textarea value={context} onChange={e => setContext(e.target.value)} rows={2}
              placeholder="Perché serve decidere, cosa è in gioco…"
              className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800]/40 resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-white/40 text-xs mb-1.5 block">Impatto</label>
              <select value={impact} onChange={e => setImpact(e.target.value as DecisionImpact)}
                className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
                <option value="alto">Alto</option>
                <option value="medio">Medio</option>
                <option value="basso">Basso</option>
              </select>
            </div>
            <div>
              <label className="text-white/40 text-xs mb-1.5 block">Area</label>
              <input value={area} onChange={e => setArea(e.target.value)} placeholder="Es. Team"
                className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800]/40" />
            </div>
            <div>
              <label className="text-white/40 text-xs mb-1.5 block">Entro</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none [color-scheme:dark]" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-white/40 text-xs">Opzioni sul tavolo</label>
              <button onClick={() => setOptions([...options, { label: '', pros: '', cons: '' }])}
                className="text-xs text-[#F5C800]/60 hover:text-[#F5C800]">+ opzione</button>
            </div>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="bg-[#111] border border-[#2A2A2A] rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <input value={o.label} onChange={e => setOptions(options.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      placeholder={`Opzione ${i + 1}`}
                      className="flex-1 bg-transparent border-b border-[#2A2A2A] px-1 py-1 text-sm text-white focus:outline-none focus:border-[#F5C800]/40" />
                    {options.length > 2 && (
                      <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-white/20 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={o.pros} onChange={e => setOptions(options.map((x, j) => j === i ? { ...x, pros: e.target.value } : x))}
                      placeholder="Pro" className="bg-transparent text-xs text-green-400/70 px-1 py-1 focus:outline-none placeholder:text-white/20" />
                    <input value={o.cons} onChange={e => setOptions(options.map((x, j) => j === i ? { ...x, cons: e.target.value } : x))}
                      placeholder="Contro" className="bg-transparent text-xs text-red-400/70 px-1 py-1 focus:outline-none placeholder:text-white/20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[#1A1A1A] flex gap-2">
          <button onClick={save} disabled={saving || !title.trim()}
            className="flex-1 py-2.5 bg-[#F5C800] text-black text-sm font-semibold rounded-xl hover:bg-[#F5C800]/90 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Registra decisione'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-white/40 text-sm rounded-xl hover:text-white transition-colors">Annulla</button>
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
      decision: finalChoice,
      rationale: rationale.trim() || null,
      status: 'decisa',
      decided_at: decidedAt,
    } as never).eq('id', decision.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Decisione presa')
    onDecided({ ...decision, decision: finalChoice, rationale: rationale.trim() || null, status: 'decisa', decided_at: decidedAt })
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-sm font-bold text-white">{decision.title}</h2>
          <p className="text-white/30 text-xs mt-0.5">Registra la decisione presa</p>
        </div>
        <div className="p-5 space-y-3">
          {options.map((o, i) => (
            <button key={i} onClick={() => setChoice(o.label)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                choice === o.label ? 'border-[#F5C800]/50 bg-[#F5C800]/10 text-white' : 'border-[#2A2A2A] bg-[#111] text-white/60 hover:border-[#3A3A3A]'
              }`}>
              {o.label}
            </button>
          ))}
          <button onClick={() => setChoice('__custom__')}
            className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
              choice === '__custom__' ? 'border-[#F5C800]/50 bg-[#F5C800]/10 text-white' : 'border-[#2A2A2A] bg-[#111] text-white/40 hover:border-[#3A3A3A]'
            }`}>
            Altra decisione…
          </button>
          {choice === '__custom__' && (
            <input value={customChoice} onChange={e => setCustomChoice(e.target.value)} autoFocus
              placeholder="Scrivi la decisione"
              className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800]/40" />
          )}
          <textarea value={rationale} onChange={e => setRationale(e.target.value)} rows={2}
            placeholder="Perché? (motivazione, opzionale)"
            className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800]/40 resize-none" />
        </div>
        <div className="px-5 py-4 border-t border-[#1A1A1A] flex gap-2">
          <button onClick={save} disabled={saving || !finalChoice}
            className="flex-1 py-2.5 bg-[#F5C800] text-black text-sm font-semibold rounded-xl hover:bg-[#F5C800]/90 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Conferma decisione'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-white/40 text-sm rounded-xl hover:text-white transition-colors">Annulla</button>
        </div>
      </div>
    </div>
  )
}
