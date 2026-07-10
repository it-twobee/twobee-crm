'use client'

import { useState, useMemo } from 'react'
import {
  Phone, Users, Mail, Presentation, MapPin, MessageSquare,
  FileText, HelpCircle, Plus, Star, Check,
  AlertCircle, Clock, Loader2, Edit2, Trash2, X,
  TrendingUp, TrendingDown, Minus, CalendarDays, Package,
  NotebookPen, Smile, Meh, Frown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { ClientInteraction, InteractionType, InteractionOutcome, Profile, Client, ClientKpi } from '@/lib/types/database'

// ── CONFIG ────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<InteractionType, { label: string; icon: React.ReactNode; color: string }> = {
  call:      { label: 'Chiamata',   icon: <Phone className="w-3.5 h-3.5" />,         color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  meeting:   { label: 'Meeting',    icon: <Users className="w-3.5 h-3.5" />,         color: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  email:     { label: 'Email',      icon: <Mail className="w-3.5 h-3.5" />,          color: 'bg-surface text-text-secondary border-border' },
  demo:      { label: 'Demo',       icon: <Presentation className="w-3.5 h-3.5" />,  color: 'bg-gold/15 text-gold border-gold/20' },
  visit:     { label: 'Visita',     icon: <MapPin className="w-3.5 h-3.5" />,        color: 'bg-green-500/15 text-green-400 border-green-500/20' },
  slack:     { label: 'Slack',      icon: <MessageSquare className="w-3.5 h-3.5" />, color: 'bg-surface text-text-secondary border-border' },
  proposta:  { label: 'Proposta',   icon: <FileText className="w-3.5 h-3.5" />,      color: 'bg-warning/15 text-warning border-warning/20' },
  altro:     { label: 'Altro',      icon: <HelpCircle className="w-3.5 h-3.5" />,    color: 'bg-surface text-text-secondary border-border' },
}

const OUTCOME_CONFIG: Record<InteractionOutcome, { label: string; icon: React.ReactNode; color: string }> = {
  positivo:   { label: 'Positivo',   icon: <Check className="w-3 h-3" />,       color: 'text-success' },
  neutro:     { label: 'Neutro',     icon: <Clock className="w-3 h-3" />,        color: 'text-text-secondary' },
  negativo:   { label: 'Negativo',   icon: <AlertCircle className="w-3 h-3" />, color: 'text-error' },
  da_seguire: { label: 'Da seguire', icon: <Star className="w-3 h-3" />,         color: 'text-warning' },
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── SENTIMENT ─────────────────────────────────────────────────────
function SentimentBadge({ score }: { score: number }) {
  if (score >= 0.6) return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-green-400">
      <Smile className="w-4 h-4" /> Positivo
    </span>
  )
  if (score <= 0.35) return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
      <Frown className="w-4 h-4" /> Critico
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-text-secondary">
      <Meh className="w-4 h-4" /> Neutro
    </span>
  )
}

function SentimentPanel({ interactions, client }: { interactions: ClientInteraction[]; client: Client }) {
  const score = useMemo(() => {
    const recent = interactions.slice(0, 10)
    if (recent.length === 0) return 0.5
    const weights = { positivo: 1, neutro: 0.5, negativo: 0, da_seguire: 0.7 }
    return recent.reduce((s, i) => s + (weights[i.outcome] ?? 0.5), 0) / recent.length
  }, [interactions])

  const riskTrend = client.risk_trend
  const pct = Math.round(score * 100)

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-text-tertiary">Sentiment cliente</p>
        <SentimentBadge score={score} />
      </div>

      {/* Bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1A1A1A' }}>
        <div className="h-full rounded-full transition-all" style={{
          width: `${pct}%`,
          background: pct >= 60 ? '#22C55E' : pct <= 35 ? '#EF4444' : '#F59E0B',
        }} />
      </div>

      <div className="flex items-center justify-between text-[9px] text-text-tertiary">
        <span>Basato sulle ultime {Math.min(interactions.length, 10)} interazioni</span>
        {riskTrend && (
          <span className="flex items-center gap-1">
            {riskTrend === 'migliora' && <TrendingUp className="w-3 h-3 text-green-400" />}
            {riskTrend === 'peggiora' && <TrendingDown className="w-3 h-3 text-red-400" />}
            {riskTrend === 'stabile'  && <Minus className="w-3 h-3 text-text-secondary" />}
            <span className={
              riskTrend === 'migliora' ? 'text-green-400' :
              riskTrend === 'peggiora' ? 'text-red-400' : 'text-text-secondary'
            }>
              KPI {riskTrend}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

// ── NOTE STORICHE ─────────────────────────────────────────────────
function NoteStoriche({ clientId, initialNotes, isAdmin }: { clientId: string; initialNotes: string | null; isAdmin: boolean }) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const { error } = await createClient().from('clients').update({ notes }).eq('id', clientId)
    setSaving(false)
    if (error) { toast.error('Errore nel salvataggio'); return }
    toast.success('Note salvate')
    setEditing(false)
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <NotebookPen className="w-3.5 h-3.5 text-text-tertiary" />
          <p className="text-[10px] font-black uppercase tracking-widest text-text-tertiary">Note storiche</p>
        </div>
        {isAdmin && !editing && (
          <button onClick={() => setEditing(true)} className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1">
            <Edit2 className="w-3 h-3" /> Modifica
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={5}
            placeholder="Note sulla relazione, storia del cliente, contesto chiave per il team..."
            className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40 resize-none leading-relaxed"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-text-tertiary border border-border rounded-lg hover:text-text-primary transition-colors">
              Annulla
            </button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 text-xs font-bold bg-gold text-black rounded-lg hover:bg-yellow-400 transition-colors flex items-center gap-1.5 disabled:opacity-40">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Salva
            </button>
          </div>
        </>
      ) : (
        notes
          ? <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{notes}</p>
          : <p className="text-xs text-text-tertiary italic">{isAdmin ? 'Nessuna nota. Clicca Modifica per aggiungerne.' : 'Nessuna nota.'}</p>
      )}
    </div>
  )
}

// ── CONTRACT TIMELINE ──────────────────────────────────────────────
interface SystemEvent {
  date: string
  label: string
  icon: React.ReactNode
  color: string
  description?: string
}

function buildSystemEvents(client: Client, hideEconomics: boolean): SystemEvent[] {
  const events: SystemEvent[] = []

  if (client.contract_start) {
    events.push({
      date: client.contract_start,
      label: 'Inizio contratto',
      icon: <CalendarDays className="w-3.5 h-3.5" />,
      color: 'bg-gold/20 border-gold/30 text-gold',
      description: hideEconomics ? `Package: ${client.package}` : `Package: ${client.package} · MRR: €${client.mrr.toLocaleString('it-IT')}`,
    })
  }

  if (client.contract_end) {
    events.push({
      date: client.contract_end,
      label: 'Scadenza contratto',
      icon: <CalendarDays className="w-3.5 h-3.5" />,
      color: 'bg-red-500/15 border-red-500/20 text-red-400',
      description: 'Data di scadenza prevista',
    })
  }

  return events.sort((a, b) => b.date.localeCompare(a.date))
}

function SystemEventItem({ event }: { event: SystemEvent }) {
  return (
    <div className="relative pl-8 pb-6 last:pb-0">
      <div className="absolute left-[13px] top-6 bottom-0 w-px bg-surface last:hidden group-last:hidden" />
      <div className={`absolute left-0 top-1 w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${event.color}`}>
        {event.icon}
      </div>
      <div className="bg-surface border border-border rounded-xl p-3.5">
        <p className="text-xs font-bold text-text-primary mb-0.5">{event.label}</p>
        <p className="text-[10px] text-text-tertiary">{fmtDateShort(event.date)}</p>
        {event.description && <p className="text-[10px] text-text-secondary mt-1">{event.description}</p>}
      </div>
    </div>
  )
}

// ── FORM NUOVA INTERAZIONE ─────────────────────────────────────────
interface FormProps {
  clientId: string
  allProfiles: Profile[]
  currentProfile: Profile
  onSaved: (i: ClientInteraction) => void
  onCancel: () => void
  editing?: ClientInteraction
}

function InteractionForm({ clientId, allProfiles, currentProfile, onSaved, onCancel, editing }: FormProps) {
  const [type, setType]               = useState<InteractionType>(editing?.type ?? 'call')
  const [title, setTitle]             = useState(editing?.title ?? '')
  const [summary, setSummary]         = useState(editing?.summary ?? '')
  const [outcome, setOutcome]         = useState<InteractionOutcome>(editing?.outcome ?? 'neutro')
  const [isMilestone, setIsMilestone] = useState(editing?.is_milestone ?? false)
  const [conductedBy, setConductedBy] = useState<string>(editing?.conducted_by ?? currentProfile.id)
  const [date, setDate]               = useState<string>(editing?.date ? editing.date.slice(0, 16) : new Date().toISOString().slice(0, 16))
  const [saving, setSaving]           = useState(false)

  const save = async () => {
    if (!title.trim()) { toast.error('Inserisci un titolo'); return }
    setSaving(true)
    const sb = createClient()
    const payload = {
      client_id: clientId, type, title: title.trim(), summary: summary.trim() || null,
      outcome, is_milestone: isMilestone, conducted_by: conductedBy || null,
      created_by: currentProfile.id, date: new Date(date).toISOString(),
    }
    if (editing) {
      const { data, error } = await sb.from('client_interactions').update(payload).eq('id', editing.id)
        .select('*, conductor:profiles!client_interactions_conducted_by_fkey(id, full_name, avatar_url)').single()
      setSaving(false)
      if (error) { toast.error('Errore nel salvataggio'); return }
      toast.success('Interazione aggiornata')
      onSaved(data as ClientInteraction)
    } else {
      const { data, error } = await sb.from('client_interactions').insert(payload)
        .select('*, conductor:profiles!client_interactions_conducted_by_fkey(id, full_name, avatar_url)').single()
      setSaving(false)
      if (error) { toast.error('Errore nel salvataggio'); return }
      toast.success('Interazione registrata')
      onSaved(data as ClientInteraction)
    }
  }

  return (
    <div className="bg-surface border border-gold/20 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-text-primary">{editing ? 'Modifica interazione' : 'Nuova interazione'}</p>
        <button onClick={onCancel} className="text-text-secondary hover:text-text-primary transition-colors"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TYPE_CONFIG) as InteractionType[]).map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${type === t ? TYPE_CONFIG[t].color : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}>
            {TYPE_CONFIG[t].icon} {TYPE_CONFIG[t].label}
          </button>
        ))}
        <button onClick={() => setIsMilestone(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ml-auto ${isMilestone ? 'border-gold/30 bg-gold/10 text-gold' : 'border-border text-text-tertiary hover:text-text-secondary'}`}>
          <Star className="w-3 h-3" /> Milestone
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Data e ora</label>
          <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
        </div>
        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Referente interno</label>
          <select value={conductedBy} onChange={e => setConductedBy(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40">
            {allProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Titolo / Oggetto</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="es. Prima call conoscitiva, Presentazione proposta Growth..."
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40" />
      </div>

      <div>
        <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Note / Riassunto</label>
        <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
          placeholder="Cosa è stato discusso, decisioni prese, prossimi step..."
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40 resize-none" />
      </div>

      <div>
        <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1.5 block">Esito</label>
        <div className="flex gap-2">
          {(Object.keys(OUTCOME_CONFIG) as InteractionOutcome[]).map(o => (
            <button key={o} onClick={() => setOutcome(o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                outcome === o ? `border-border bg-surface ${OUTCOME_CONFIG[o].color}` : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}>
              {OUTCOME_CONFIG[o].icon} {OUTCOME_CONFIG[o].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary border border-border rounded-lg transition-colors">
          Annulla
        </button>
        <button onClick={save} disabled={saving || !title.trim()}
          className="px-4 py-2 text-sm font-bold bg-gold text-black rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-40 flex items-center gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {editing ? 'Aggiorna' : 'Registra'}
        </button>
      </div>
    </div>
  )
}

// ── TIMELINE ITEM ─────────────────────────────────────────────────
function TimelineItem({ item, isAdmin, onEdit, onDelete }: {
  item: ClientInteraction; isAdmin: boolean
  onEdit: (i: ClientInteraction) => void
  onDelete: (id: string) => void
}) {
  const tc = TYPE_CONFIG[item.type]
  const oc = OUTCOME_CONFIG[item.outcome]
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`relative pl-8 pb-6 last:pb-0 group ${item.is_milestone ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}>
      <div className="absolute left-[13px] top-6 bottom-0 w-px bg-surface-active last:hidden group-last:hidden" />
      <div className={`absolute left-0 top-1 w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${
        item.is_milestone ? 'bg-gold/20 border-gold/40 text-gold' : tc.color
      }`}>
        {item.is_milestone ? <Star className="w-3.5 h-3.5" /> : tc.icon}
      </div>

      <div className={`bg-surface border rounded-xl p-4 transition-colors ${item.is_milestone ? 'border-gold/20' : 'border-border hover:border-border'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {item.is_milestone && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-gold bg-gold/10 border border-gold/20 px-1.5 py-0.5 rounded">
                  Milestone
                </span>
              )}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${tc.color}`}>{tc.label}</span>
              <span className={`flex items-center gap-1 text-[10px] font-medium ${oc.color}`}>
                {oc.icon} {oc.label}
              </span>
            </div>
            <p className="text-sm font-semibold text-text-primary leading-snug">{item.title}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-secondary">
              <span>{fmtDate(item.date)}</span>
              {item.conductor && (
                <span className="flex items-center gap-1">
                  <div className="w-3.5 h-3.5 rounded-full bg-gold/20 flex items-center justify-center text-[7px] font-black text-gold overflow-hidden shrink-0">
                    {(item.conductor as Profile).avatar_url
                      ? <img src={(item.conductor as Profile).avatar_url!} className="w-full h-full object-cover rounded-full" alt="" />
                      : (item.conductor as Profile).full_name[0]}
                  </div>
                  {(item.conductor as Profile).full_name}
                </span>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg hover:bg-surface text-text-secondary hover:text-text-primary transition-colors">
                <Edit2 className="w-3 h-3" />
              </button>
              <button onClick={() => onDelete(item.id)} className="p-1.5 rounded-lg hover:bg-surface text-text-secondary hover:text-error transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {item.summary && (
          <>
            {!expanded && item.summary.length > 120 ? (
              <button onClick={() => setExpanded(true)} className="mt-2 text-xs text-text-secondary hover:text-text-secondary text-left transition-colors line-clamp-2">
                {item.summary}
                <span className="text-gold ml-1">Leggi tutto</span>
              </button>
            ) : (
              <p className="mt-2 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{item.summary}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────
interface Props {
  clientId: string
  client: Client
  interactions: ClientInteraction[]
  allProfiles: Profile[]
  currentProfile: Profile
  isAdmin: boolean
  hideEconomics?: boolean
}

export function RelazioneTab({ clientId, client, interactions: initial, allProfiles, currentProfile, isAdmin, hideEconomics = false }: Props) {
  const [items, setItems]           = useState<ClientInteraction[]>(initial)
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<ClientInteraction | undefined>()
  const [filterType, setFilterType] = useState<InteractionType | 'tutti'>('tutti')
  const [onlyMilestones, setOnlyMilestones] = useState(false)
  const [activeSection, setActiveSection]   = useState<'timeline' | 'note' | 'contratto'>('timeline')

  const systemEvents = useMemo(() => buildSystemEvents(client, hideEconomics), [client, hideEconomics])

  const filtered = items.filter(i => {
    if (onlyMilestones && !i.is_milestone) return false
    if (filterType !== 'tutti' && i.type !== filterType) return false
    return true
  })

  const handleSaved = (i: ClientInteraction) => {
    setItems(prev => {
      const exists = prev.find(x => x.id === i.id)
      if (exists) return prev.map(x => x.id === i.id ? i : x).sort((a, b) => b.date.localeCompare(a.date))
      return [i, ...prev].sort((a, b) => b.date.localeCompare(a.date))
    })
    setShowForm(false)
    setEditing(undefined)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questa interazione?')) return
    const { error } = await createClient().from('client_interactions').delete().eq('id', id)
    if (error) { toast.error('Errore'); return }
    setItems(prev => prev.filter(i => i.id !== id))
    toast.success('Interazione eliminata')
  }

  const stats = {
    total: items.length,
    milestones: items.filter(i => i.is_milestone).length,
    positivi: items.filter(i => i.outcome === 'positivo').length,
    da_seguire: items.filter(i => i.outcome === 'da_seguire').length,
  }

  const tabs = [
    { key: 'timeline', label: `Interazioni (${stats.total})` },
    ...(hideEconomics ? [] : [{ key: 'contratto', label: 'Contratto' }] as const),
    { key: 'note', label: 'Note storiche' },
  ] as const

  return (
    <div className="space-y-5 w-full">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-text-primary mb-0.5">Relazione Commerciale</h2>
          <p className="text-xs text-text-secondary">
            {stats.total} interazioni · {stats.milestones} milestone · {stats.positivi} esiti positivi
            {stats.da_seguire > 0 && <span className="text-warning ml-1">· {stats.da_seguire} da seguire</span>}
          </p>
        </div>
        {isAdmin && activeSection === 'timeline' && !showForm && !editing && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-gold text-black text-sm font-bold rounded-lg hover:bg-yellow-400 transition-colors shrink-0">
            <Plus className="w-4 h-4" /> Registra
          </button>
        )}
      </div>

      {/* Sentiment */}
      <SentimentPanel interactions={items} client={client} />

      {/* Sub-tabs */}
      <div className="flex gap-0.5 rounded-lg border border-border bg-surface p-0.5 w-full overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveSection(t.key)}
            className={`flex-1 min-w-0 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${
              activeSection === t.key ? 'bg-surface text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TIMELINE INTERAZIONI ── */}
      {activeSection === 'timeline' && (
        <>
          {(showForm || editing) && (
            <InteractionForm
              clientId={clientId} allProfiles={allProfiles}
              currentProfile={currentProfile} editing={editing}
              onSaved={handleSaved}
              onCancel={() => { setShowForm(false); setEditing(undefined) }}
            />
          )}

          {items.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center rounded-lg border border-border overflow-hidden bg-surface">
                <button onClick={() => setFilterType('tutti')}
                  className={`h-7 px-3 text-[11px] font-bold border-r border-border transition-all ${filterType === 'tutti' ? 'bg-surface text-text-primary' : 'text-text-secondary hover:text-text-secondary'}`}>
                  Tutti
                </button>
                {(Object.keys(TYPE_CONFIG) as InteractionType[]).filter(t => items.some(i => i.type === t)).map(t => (
                  <button key={t} onClick={() => setFilterType(t === filterType ? 'tutti' : t)}
                    className={`h-7 px-3 text-[11px] font-bold border-r border-border last:border-r-0 transition-all ${filterType === t ? 'bg-surface text-text-primary' : 'text-text-secondary hover:text-text-secondary'}`}>
                    {TYPE_CONFIG[t].label}
                  </button>
                ))}
              </div>
              <button onClick={() => setOnlyMilestones(v => !v)}
                className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-bold border transition-all ${onlyMilestones ? 'border-gold/30 bg-gold/10 text-gold' : 'border-border text-text-secondary hover:text-text-secondary'}`}>
                <Star className="w-3 h-3" /> Solo milestone
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-text-secondary">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{items.length === 0 ? 'Nessuna interazione registrata' : 'Nessun risultato per i filtri selezionati'}</p>
              {items.length === 0 && isAdmin && (
                <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-gold hover:text-yellow-400 transition-colors">
                  Registra la prima interazione →
                </button>
              )}
            </div>
          ) : (
            <div className="pt-2">
              {filtered.map(item => (
                <TimelineItem key={item.id} item={item} isAdmin={isAdmin}
                  onEdit={i => { setEditing(i); setShowForm(false) }}
                  onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── CONTRATTO ── */}
      {!hideEconomics && activeSection === 'contratto' && (
        <div className="space-y-4">
          {/* Info contratto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Package', value: client.package, icon: <Package className="w-3.5 h-3.5" /> },
              { label: 'MRR', value: `€${client.mrr.toLocaleString('it-IT')}`, icon: <TrendingUp className="w-3.5 h-3.5" /> },
              { label: 'Inizio contratto', value: client.contract_start ? fmtDateShort(client.contract_start) : '—', icon: <CalendarDays className="w-3.5 h-3.5" /> },
              { label: 'Scadenza', value: client.contract_end ? fmtDateShort(client.contract_end) : '—', icon: <CalendarDays className="w-3.5 h-3.5" /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="rounded-xl p-3.5" style={{ background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
                <div className="flex items-center gap-1.5 mb-1.5" style={{ color: '#444' }}>
                  {icon}
                  <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
                </div>
                <p className="text-sm font-bold text-text-primary">{value}</p>
              </div>
            ))}
          </div>

          {/* Timeline eventi di sistema */}
          {systemEvents.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-text-tertiary mb-3">Eventi chiave</p>
              <div className="pt-1">
                {systemEvents.map((e, i) => <SystemEventItem key={i} event={e} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── NOTE STORICHE ── */}
      {activeSection === 'note' && (
        <NoteStoriche clientId={clientId} initialNotes={client.notes} isAdmin={isAdmin} />
      )}
    </div>
  )
}
