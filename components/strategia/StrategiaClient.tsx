'use client'

import { useState } from 'react'
import {
  Target, Map, FileText, Plus, X, Loader2, Edit2, Trash2,
  ChevronDown, CheckCircle2, AlertTriangle, Zap, Flag,
  TrendingUp, BookOpen, Pin,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type {
  Objective, KeyResult, RoadmapItem, StrategicNote,
  OkrStatus, KrStatus, RoadmapStatus, RoadmapPriority, StrategicNoteType, Profile,
} from '@/lib/types/database'

interface ObjectiveWithKRs extends Objective {
  key_results: KeyResult[]
}

interface Props {
  objectives: ObjectiveWithKRs[]
  roadmap: RoadmapItem[]
  notes: StrategicNote[]
  profiles: Profile[]
  currentUserId: string
  isAdmin: boolean
}

type Tab = 'okr' | 'roadmap' | 'note'

const ic = 'w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50'

const OKR_STATUS: Record<OkrStatus, { label: string; color: string; bg: string }> = {
  attivo:      { label: 'Attivo',      color: 'text-gold',    bg: 'bg-gold/10' },
  completato:  { label: 'Completato',  color: 'text-success', bg: 'bg-success/10' },
  abbandonato: { label: 'Abbandonato', color: 'text-[#444]',  bg: 'bg-[#1A1A1A]' },
}
const KR_STATUS: Record<KrStatus, { label: string; color: string }> = {
  in_corso:    { label: 'In corso',    color: 'text-white' },
  completato:  { label: 'Completato',  color: 'text-success' },
  a_rischio:   { label: 'A rischio',   color: 'text-error' },
  abbandonato: { label: 'Abbandonato', color: 'text-[#444]' },
}
const ROAD_STATUS: Record<RoadmapStatus, { label: string; color: string; bg: string }> = {
  pianificato: { label: 'Pianificato', color: 'text-text-secondary', bg: 'bg-[#2A2A2A]' },
  in_corso:    { label: 'In corso',    color: 'text-gold',    bg: 'bg-gold/10' },
  completato:  { label: 'Completato',  color: 'text-success', bg: 'bg-success/10' },
  bloccato:    { label: 'Bloccato',    color: 'text-error',   bg: 'bg-error/10' },
  rinviato:    { label: 'Rinviato',    color: 'text-warning', bg: 'bg-warning/10' },
}
const ROAD_PRIORITY: Record<RoadmapPriority, { label: string; color: string }> = {
  critica: { label: 'Critica', color: 'text-error' },
  alta:    { label: 'Alta',    color: 'text-warning' },
  media:   { label: 'Media',   color: 'text-white' },
  bassa:   { label: 'Bassa',   color: 'text-text-secondary' },
}
const NOTE_TYPE: Record<StrategicNoteType, { label: string; icon: React.ReactNode; color: string }> = {
  nota:           { label: 'Nota',            icon: <FileText className="w-3.5 h-3.5" />,   color: 'text-text-secondary' },
  verbale:        { label: 'Verbale',         icon: <BookOpen className="w-3.5 h-3.5" />,   color: 'text-blue-400' },
  decisione:      { label: 'Decisione',       icon: <Zap className="w-3.5 h-3.5" />,        color: 'text-gold' },
  retrospettiva:  { label: 'Retrospettiva',   icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'text-purple-400' },
}
const AREAS = ['commerciale', 'operativa', 'brand', 'hr', 'tech', 'prodotto']
const AREA_COLOR: Record<string, string> = {
  commerciale: '#F5C800', operativa: '#10B981', brand: '#EC4899',
  hr: '#A855F7', tech: '#3B82F6', prodotto: '#F97316',
}

function calcOkrProgress(krs: KeyResult[]) {
  if (!krs.length) return 0
  const sum = krs.map(kr => {
    if (!kr.target_value || kr.target_value === 0) return kr.status === 'completato' ? 100 : 0
    return Math.min(100, Math.round((kr.current_value / kr.target_value) * 100))
  })
  return Math.round(sum.reduce((a, b) => a + b, 0) / sum.length)
}

function ProgressRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const r = (size / 2) - 4
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct >= 80 ? '#22C55E' : pct >= 50 ? '#F5C800' : '#EF4444'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#2A2A2A" strokeWidth="3.5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 + 4} textAnchor="middle" fill={color} fontSize="10" fontWeight="bold">{pct}%</text>
    </svg>
  )
}

function OkrModal({ obj, profiles, currentUserId, onClose, onSaved }: {
  obj?: ObjectiveWithKRs | null; profiles: Profile[]; currentUserId: string
  onClose: () => void; onSaved: (o: ObjectiveWithKRs) => void
}) {
  const currentQ = (() => { const n = new Date(); return `${n.getFullYear()}-Q${Math.ceil((n.getMonth() + 1) / 3)}` })()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: obj?.title ?? '',
    description: obj?.description ?? '',
    quarter: obj?.quarter ?? currentQ,
    area: obj?.area ?? 'commerciale',
    owner_id: obj?.owner_id ?? currentUserId,
    status: obj?.status ?? 'attivo' as OkrStatus,
  })
  const [krs, setKrs] = useState<Partial<KeyResult>[]>(obj?.key_results ?? [{ title: '', target_value: undefined, unit: '%', status: 'in_corso' }])

  const addKr = () => setKrs(p => [...p, { title: '', target_value: undefined, unit: '%', status: 'in_corso' }])
  const removeKr = (i: number) => setKrs(p => p.filter((_, idx) => idx !== i))
  const updateKr = (i: number, field: string, value: string | number) => setKrs(p => p.map((kr, idx) => idx === i ? { ...kr, [field]: value } : kr))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title) { toast.error('Titolo obbligatorio'); return }
    setLoading(true)
    const supabase = createClient()
    const payload = { ...form, created_by: currentUserId, description: form.description || null, owner_id: form.owner_id || null }
    const result = obj
      ? await supabase.from('objectives').update(payload).eq('id', obj.id).select().single()
      : await supabase.from('objectives').insert(payload).select().single()
    if (result.error) { setLoading(false); toast.error(result.error.message); return }
    const objId = result.data.id
    // Upsert key results
    const krPayloads = krs.filter(kr => kr.title).map(kr => ({
      objective_id: objId, title: kr.title!, target_value: kr.target_value ?? null,
      current_value: kr.current_value ?? 0, unit: kr.unit ?? '%',
      status: kr.status ?? 'in_corso', notes: (kr as any).notes ?? null,
    }))
    let savedKrs: KeyResult[] = []
    if (krPayloads.length) {
      const { data } = await supabase.from('key_results').insert(krPayloads).select()
      savedKrs = (data ?? []) as KeyResult[]
    }
    setLoading(false)
    toast.success(obj ? 'Obiettivo aggiornato' : 'Obiettivo creato')
    onSaved({ ...result.data, key_results: savedKrs } as ObjectiveWithKRs)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#161616] border border-[#2A2A2A] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] sticky top-0 bg-[#161616]">
          <h2 className="text-base font-bold text-white">{obj ? 'Modifica obiettivo' : 'Nuovo obiettivo (OKR)'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Obiettivo *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={ic}
              placeholder="es. Aumentare la retention clienti del 20%" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} className={`${ic} resize-none`} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Trimestre</label>
              <input value={form.quarter} onChange={e => setForm(p => ({ ...p, quarter: e.target.value }))} className={ic} placeholder="2025-Q2" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Area</label>
              <select value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} className={ic}>
                {AREAS.map(a => <option key={a} value={a} className="capitalize">{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Owner</label>
              <select value={form.owner_id} onChange={e => setForm(p => ({ ...p, owner_id: e.target.value }))} className={ic}>
                <option value="">— Nessuno —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name.split(' ')[0]}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-secondary">Key Results</label>
              <button type="button" onClick={addKr} className="text-xs text-gold hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Aggiungi KR</button>
            </div>
            {krs.map((kr, i) => (
              <div key={i} className="bg-[#111] border border-[#2A2A2A] rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <input value={kr.title ?? ''} onChange={e => updateKr(i, 'title', e.target.value)}
                    placeholder={`KR ${i + 1}: es. Churn rate < 5%`} className="flex-1 bg-transparent text-xs text-white outline-none border-b border-[#2A2A2A] pb-1" />
                  <button type="button" onClick={() => removeKr(i)}><X className="w-3.5 h-3.5 text-text-secondary" /></button>
                </div>
                <div className="flex gap-2">
                  <input type="number" value={kr.target_value ?? ''} onChange={e => updateKr(i, 'target_value', parseFloat(e.target.value))}
                    placeholder="Target" className="w-20 bg-transparent text-xs text-white outline-none border-b border-[#2A2A2A] pb-1" />
                  <select value={kr.unit ?? '%'} onChange={e => updateKr(i, 'unit', e.target.value)}
                    className="bg-transparent text-xs text-text-secondary outline-none border-b border-[#2A2A2A] pb-1">
                    {['%', '€', 'n', 'ore', 'clienti', 'ticket'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#2A2A2A] rounded-lg text-sm text-text-secondary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-black font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}{obj ? 'Aggiorna' : 'Crea OKR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NoteModal({ note, currentUserId, profiles, onClose, onSaved }: {
  note?: StrategicNote | null; currentUserId: string; profiles: Profile[]
  onClose: () => void; onSaved: (n: StrategicNote) => void
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: note?.title ?? '',
    content: note?.content ?? '',
    type: note?.type ?? 'nota' as StrategicNoteType,
    date: note?.date ?? new Date().toISOString().slice(0, 10),
    pinned: note?.pinned ?? false,
    tags: note?.tags?.join(', ') ?? '',
  })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title) { toast.error('Titolo obbligatorio'); return }
    setLoading(true)
    const supabase = createClient()
    const payload = {
      title: form.title, content: form.content || null, type: form.type,
      date: form.date, pinned: form.pinned, created_by: currentUserId,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    const result = note
      ? await supabase.from('strategic_notes').update(payload).eq('id', note.id).select().single()
      : await supabase.from('strategic_notes').insert(payload).select().single()
    setLoading(false)
    if (result.error) { toast.error(result.error.message); return }
    toast.success(note ? 'Nota aggiornata' : 'Nota salvata')
    onSaved(result.data as StrategicNote)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#161616] border border-[#2A2A2A] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] sticky top-0 bg-[#161616]">
          <h2 className="text-base font-bold text-white">{note ? 'Modifica nota' : 'Nuova nota strategica'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Titolo *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={ic} placeholder="es. Decisione: lancio nuovo pacchetto Q3" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as StrategicNoteType }))} className={ic}>
                {(Object.entries(NOTE_TYPE) as [StrategicNoteType, { label: string }][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Data</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className={ic} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Contenuto / Verbale</label>
            <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              rows={6} className={`${ic} resize-none text-xs font-mono`} placeholder="Markdown supportato..." />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Tag (virgola separati)</label>
            <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} className={ic} placeholder="es. pricing, team, q2" />
          </div>
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={form.pinned} onChange={e => setForm(p => ({ ...p, pinned: e.target.checked }))} className="accent-gold" />
            <Pin className="w-3.5 h-3.5" /> Fissa in cima
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#2A2A2A] rounded-lg text-sm text-text-secondary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-black font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}{note ? 'Aggiorna' : 'Salva nota'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function StrategiaClient({ objectives: initialObjs, roadmap: initialRoadmap, notes: initialNotes, profiles, currentUserId, isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>('okr')
  const [objectives, setObjectives] = useState(initialObjs)
  const [roadmap, setRoadmap] = useState(initialRoadmap)
  const [notes, setNotes] = useState(initialNotes)
  const [showOkrModal, setShowOkrModal] = useState(false)
  const [editingOkr, setEditingOkr] = useState<ObjectiveWithKRs | null>(null)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [editingNote, setEditingNote] = useState<StrategicNote | null>(null)
  const [expandedOkr, setExpandedOkr] = useState<string | null>(null)
  const [filterQuarter, setFilterQuarter] = useState<string>('current')
  const [filterArea, setFilterArea] = useState<string>('tutti')

  const currentQ = (() => { const n = new Date(); return `${n.getFullYear()}-Q${Math.ceil((n.getMonth() + 1) / 3)}` })()
  const quarters = Array.from(new Set(objectives.map(o => o.quarter))).sort().reverse()

  const filteredObjs = objectives.filter(o =>
    (filterQuarter === 'current' ? o.quarter === currentQ : filterQuarter === 'tutti' || o.quarter === filterQuarter) &&
    (filterArea === 'tutti' || o.area === filterArea)
  )

  const updateKrValue = async (krId: string, objId: string, value: number) => {
    const supabase = createClient()
    await supabase.from('key_results').update({ current_value: value, updated_at: new Date().toISOString() }).eq('id', krId)
    setObjectives(p => p.map(o => o.id === objId
      ? { ...o, key_results: o.key_results.map(kr => kr.id === krId ? { ...kr, current_value: value } : kr) }
      : o
    ))
  }

  const updateRoadmapStatus = async (id: string, status: RoadmapStatus) => {
    const supabase = createClient()
    const updates: Partial<RoadmapItem> = { status }
    if (status === 'completato') updates.completed_at = new Date().toISOString()
    await supabase.from('roadmap_items').update(updates).eq('id', id)
    setRoadmap(p => p.map(r => r.id === id ? { ...r, ...updates } : r))
  }

  const togglePin = async (note: StrategicNote) => {
    const supabase = createClient()
    await supabase.from('strategic_notes').update({ pinned: !note.pinned }).eq('id', note.id)
    setNotes(p => p.map(n => n.id === note.id ? { ...n, pinned: !n.pinned } : n))
  }

  const totalObjs = filteredObjs.length
  const completedObjs = filteredObjs.filter(o => calcOkrProgress(o.key_results) === 100).length
  const avgProgress = totalObjs > 0 ? Math.round(filteredObjs.reduce((s, o) => s + calcOkrProgress(o.key_results), 0) / totalObjs) : 0

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Strategia</h1>
          <p className="text-text-secondary text-sm mt-0.5">OKR, roadmap e decisioni dell'azienda</p>
        </div>
        <div className="flex gap-2">
          {tab === 'okr' && (
            <button onClick={() => { setEditingOkr(null); setShowOkrModal(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-black text-sm font-bold rounded-lg hover:bg-yellow-400">
              <Plus className="w-4 h-4" /> Nuovo OKR
            </button>
          )}
          {tab === 'note' && (
            <button onClick={() => { setEditingNote(null); setShowNoteModal(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-black text-sm font-bold rounded-lg hover:bg-yellow-400">
              <Plus className="w-4 h-4" /> Nuova nota
            </button>
          )}
          {tab === 'roadmap' && isAdmin && (
            <button onClick={async () => {
              const title = prompt('Titolo milestone:')
              if (!title) return
              const supabase = createClient()
              const { data } = await supabase.from('roadmap_items').insert({
                title, area: 'prodotto', status: 'pianificato', priority: 'media', created_by: currentUserId,
              }).select().single()
              if (data) setRoadmap(p => [...p, data as RoadmapItem])
            }} className="flex items-center gap-2 px-4 py-2 bg-gold text-black text-sm font-bold rounded-lg hover:bg-yellow-400">
              <Plus className="w-4 h-4" /> Aggiungi milestone
            </button>
          )}
        </div>
      </div>

      {/* KPI OKR */}
      {tab === 'okr' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
            <p className="text-xs text-text-secondary mb-1">Obiettivi {filterQuarter === 'current' ? currentQ : filterQuarter}</p>
            <p className="text-2xl font-black text-white">{totalObjs}</p>
          </div>
          <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
            <p className="text-xs text-text-secondary mb-1">Completati</p>
            <p className="text-2xl font-black text-success">{completedObjs}/{totalObjs}</p>
          </div>
          <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
            <p className="text-xs text-text-secondary mb-1">Progresso medio</p>
            <p className={`text-2xl font-black ${avgProgress >= 70 ? 'text-success' : avgProgress >= 40 ? 'text-warning' : 'text-error'}`}>{avgProgress}%</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-1 gap-1">
          {([
            { key: 'okr', label: 'OKR', icon: <Target className="w-3.5 h-3.5" /> },
            { key: 'roadmap', label: 'Roadmap', icon: <Map className="w-3.5 h-3.5" /> },
            { key: 'note', label: 'Note strategiche', icon: <FileText className="w-3.5 h-3.5" /> },
          ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.key ? 'bg-gold text-black' : 'text-text-secondary hover:text-white'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        {tab === 'okr' && (
          <>
            <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value)}
              className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
              <option value="current">{currentQ} (corrente)</option>
              <option value="tutti">Tutti i trimestri</option>
              {quarters.filter(q => q !== currentQ).map(q => <option key={q} value={q}>{q}</option>)}
            </select>
            <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
              className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
              <option value="tutti">Tutte le aree</option>
              {AREAS.map(a => <option key={a} value={a} className="capitalize">{a}</option>)}
            </select>
          </>
        )}
      </div>

      {/* ── OKR ── */}
      {tab === 'okr' && (
        <div className="space-y-3">
          {filteredObjs.length === 0 && (
            <div className="text-center py-12">
              <Target className="w-10 h-10 text-[#2A2A2A] mx-auto mb-2" />
              <p className="text-sm text-text-secondary">Nessun obiettivo per {filterQuarter === 'current' ? currentQ : 'questo filtro'}</p>
              <button onClick={() => setShowOkrModal(true)} className="mt-3 text-xs text-gold hover:underline">Crea il primo OKR →</button>
            </div>
          )}
          {filteredObjs.map(obj => {
            const progress = calcOkrProgress(obj.key_results)
            const sc = OKR_STATUS[obj.status]
            const isExp = expandedOkr === obj.id
            const owner = profiles.find(p => p.id === obj.owner_id)
            return (
              <div key={obj.id} className={`bg-surface border rounded-xl overflow-hidden transition-colors ${isExp ? 'border-gold/30' : 'border-[#2A2A2A]'}`}>
                <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedOkr(isExp ? null : obj.id)}>
                  <ProgressRing pct={progress} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {obj.area && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize"
                          style={{ color: AREA_COLOR[obj.area] ?? '#888', background: (AREA_COLOR[obj.area] ?? '#888') + '20' }}>
                          {obj.area}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sc.color} ${sc.bg}`}>{sc.label}</span>
                      <span className="text-[10px] text-text-secondary">{obj.quarter}</span>
                      {owner && <span className="text-[10px] text-text-secondary">→ {owner.full_name.split(' ')[0]}</span>}
                    </div>
                    <p className="text-sm font-bold text-white">{obj.title}</p>
                    {obj.description && !isExp && <p className="text-xs text-text-secondary mt-0.5 truncate">{obj.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-text-secondary">{obj.key_results.length} KR</span>
                    {isAdmin && (
                      <button onClick={e => { e.stopPropagation(); setEditingOkr(obj); setShowOkrModal(true) }}
                        className="p-1 text-text-secondary hover:text-gold"><Edit2 className="w-3.5 h-3.5" /></button>
                    )}
                    <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${isExp ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {isExp && (
                  <div className="border-t border-[#2A2A2A] px-5 py-4 space-y-3">
                    {obj.description && <p className="text-xs text-text-secondary">{obj.description}</p>}
                    {obj.key_results.length === 0 && <p className="text-xs text-[#444]">Nessun Key Result definito</p>}
                    {obj.key_results.map(kr => {
                      const krPct = kr.target_value ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100)) : (kr.status === 'completato' ? 100 : 0)
                      const krc = KR_STATUS[kr.status]
                      return (
                        <div key={kr.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-white font-medium flex-1">{kr.title}</p>
                            <span className={`text-[10px] font-bold ${krc.color}`}>{krc.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${krPct}%`, background: krPct >= 80 ? '#22C55E' : krPct >= 50 ? '#F5C800' : '#EF4444' }} />
                            </div>
                            {kr.target_value ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <input type="number" defaultValue={kr.current_value}
                                  onBlur={e => updateKrValue(kr.id, obj.id, parseFloat(e.target.value))}
                                  className="w-14 bg-transparent text-xs text-gold text-right outline-none border-b border-[#2A2A2A]" />
                                <span className="text-xs text-text-secondary">/ {kr.target_value}{kr.unit}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-text-secondary">{krPct}%</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── ROADMAP ── */}
      {tab === 'roadmap' && (
        <div className="space-y-2">
          {AREAS.map(area => {
            const items = roadmap.filter(r => r.area === area)
            if (!items.length) return null
            return (
              <div key={area} className="space-y-1.5">
                <div className="flex items-center gap-2 pt-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: AREA_COLOR[area] ?? '#666' }} />
                  <span className="text-xs font-bold uppercase tracking-wider capitalize" style={{ color: AREA_COLOR[area] ?? '#888' }}>{area}</span>
                  <span className="text-xs text-text-secondary">{items.length} item</span>
                </div>
                {items.map(item => {
                  const sc = ROAD_STATUS[item.status]
                  const pc = ROAD_PRIORITY[item.priority]
                  const owner = profiles.find(p => p.id === item.owner_id)
                  const overdue = item.due_date && new Date(item.due_date) < new Date() && item.status !== 'completato'
                  return (
                    <div key={item.id} className="bg-surface border border-[#2A2A2A] rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sc.color} ${sc.bg}`}>{sc.label}</span>
                          <span className={`text-[10px] font-bold ${pc.color}`}>{pc.label}</span>
                          {overdue && <span className="text-[10px] text-error font-bold">⚠ Scaduta</span>}
                        </div>
                        <p className={`text-sm font-semibold mt-0.5 ${item.status === 'completato' ? 'line-through text-text-secondary' : 'text-white'}`}>{item.title}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-text-secondary">
                          {item.due_date && <span className={overdue ? 'text-error' : ''}>{new Date(item.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                          {owner && <span>→ {owner.full_name.split(' ')[0]}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {(Object.keys(ROAD_STATUS) as RoadmapStatus[]).filter(s => s !== item.status).slice(0, 2).map(s => (
                          <button key={s} onClick={() => updateRoadmapStatus(item.id, s)}
                            className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${ROAD_STATUS[s].color} ${ROAD_STATUS[s].bg} opacity-60 hover:opacity-100`}>
                            {ROAD_STATUS[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {roadmap.length === 0 && (
            <div className="text-center py-12 text-text-secondary text-sm">
              <Map className="w-10 h-10 text-[#2A2A2A] mx-auto mb-2" />
              Nessuna milestone in roadmap
            </div>
          )}
        </div>
      )}

      {/* ── NOTE ── */}
      {tab === 'note' && (
        <div className="space-y-3">
          {[...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.date).getTime() - new Date(a.date).getTime()).map(note => {
            const nt = NOTE_TYPE[note.type]
            return (
              <div key={note.id} className={`bg-surface border rounded-xl p-5 ${note.pinned ? 'border-gold/30' : 'border-[#2A2A2A]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={nt.color}>{nt.icon}</span>
                      <span className={`text-xs font-bold ${nt.color}`}>{nt.label}</span>
                      <span className="text-xs text-text-secondary">{new Date(note.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      {note.pinned && <Pin className="w-3 h-3 text-gold" />}
                    </div>
                    <p className="text-sm font-bold text-white">{note.title}</p>
                    {note.content && (
                      <p className="text-xs text-text-secondary mt-2 whitespace-pre-line line-clamp-4">{note.content}</p>
                    )}
                    {note.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {note.tags.map(t => (
                          <span key={t} className="text-[10px] px-2 py-0.5 bg-[#2A2A2A] text-text-secondary rounded-full">#{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => togglePin(note)} className={`p-1.5 rounded-lg hover:bg-[#2A2A2A] ${note.pinned ? 'text-gold' : 'text-text-secondary'}`}>
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { setEditingNote(note); setShowNoteModal(true) }} className="p-1.5 text-text-secondary hover:text-gold">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          {notes.length === 0 && (
            <div className="text-center py-12 text-text-secondary text-sm">
              <FileText className="w-10 h-10 text-[#2A2A2A] mx-auto mb-2" />
              Nessuna nota strategica ancora
            </div>
          )}
        </div>
      )}

      {showOkrModal && (
        <OkrModal
          obj={editingOkr} profiles={profiles} currentUserId={currentUserId}
          onClose={() => { setShowOkrModal(false); setEditingOkr(null) }}
          onSaved={o => {
            setObjectives(p => {
              const exists = p.find(x => x.id === o.id)
              return exists ? p.map(x => x.id === o.id ? o : x) : [o, ...p]
            })
          }}
        />
      )}
      {showNoteModal && (
        <NoteModal
          note={editingNote} currentUserId={currentUserId} profiles={profiles}
          onClose={() => { setShowNoteModal(false); setEditingNote(null) }}
          onSaved={n => {
            setNotes(p => {
              const exists = p.find(x => x.id === n.id)
              return exists ? p.map(x => x.id === n.id ? n : x) : [n, ...p]
            })
          }}
        />
      )}
    </div>
  )
}
