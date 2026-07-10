'use client'

import { useState } from 'react'
import {
  Users, Calendar, Star, ClipboardList, Plus, Check, X,
  Loader2, ChevronDown, Award, TrendingUp, Clock, AlertTriangle,
  User, Briefcase, Mail, Phone, Edit2, Network, Contact,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Organigramma } from '@/components/hr/Organigramma'
import { ResourceProfilesTab } from '@/components/hr/ResourceProfilesTab'
import type {
  Profile, TeamLeave, PerformanceReview, LeaveType, LeaveStatus, LegacyContractType, OrgUnit, OrgMember, ResourceProfile,
} from '@/lib/types/database'

interface Props {
  profiles: Profile[]
  leaves: TeamLeave[]
  reviews: PerformanceReview[]
  orgUnits: OrgUnit[]
  orgMembers: OrgMember[]
  resourceProfiles: ResourceProfile[]
  currentUserId: string
  isAdmin: boolean
}

type Tab = 'team' | 'ferie' | 'performance' | 'organigramma' | 'risorse'

const ic = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/50'

const LEAVE_LABELS: Record<LeaveType, { label: string; color: string; bg: string }> = {
  ferie:        { label: 'Ferie',        color: 'text-info',  bg: 'bg-info/10' },
  permesso:     { label: 'Permesso',     color: 'text-warning',   bg: 'bg-warning/10' },
  malattia:     { label: 'Malattia',     color: 'text-error',     bg: 'bg-error/10' },
  straordinario:{ label: 'Straord.',     color: 'text-accent',bg: 'bg-accent/10' },
  altro:        { label: 'Altro',        color: 'text-text-secondary', bg: 'bg-surface-active' },
}
const STATUS_LABELS: Record<LeaveStatus, { label: string; color: string }> = {
  in_attesa: { label: 'In attesa', color: 'text-warning' },
  approvato:  { label: 'Approvato', color: 'text-success' },
  rifiutato:  { label: 'Rifiutato', color: 'text-error' },
}
const CONTRACT_LABELS: Record<LegacyContractType, string> = {
  dipendente: 'Dipendente', collaboratore: 'Collaboratore',
  partita_iva: 'P.IVA', stage: 'Stage',
}
const ROLE_COLORS: Record<string, string> = {
  super_admin: 'text-gold-text', admin: 'text-accent', manager: 'text-info',
  senior: 'text-text-primary', junior: 'text-text-secondary', viewer: 'text-text-tertiary', client: 'text-text-tertiary',
}
const AREA_COLORS: Record<string, string> = {
  Growth: 'var(--color-gold-text)', Digital: 'var(--color-info)', Strategy: 'var(--color-accent)', Operations: 'var(--color-success)', Design: 'var(--color-accent)',
}

function avatar(p: Profile) {
  if (p.avatar_url) return <img src={p.avatar_url} className="w-full h-full object-cover rounded-full" alt="" />
  const initials = p.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return <span className="text-sm font-black text-gold-text">{initials}</span>
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (!value) return null
  const pct = (value / 5) * 100
  const color = value >= 4 ? 'var(--color-success)' : value >= 3 ? 'var(--color-gold-text)' : 'var(--color-error)'
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-secondary w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-active rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold text-text-primary w-4">{value}</span>
    </div>
  )
}

function LeaveModal({ profiles, currentUserId, onClose, onSaved }: {
  profiles: Profile[]; currentUserId: string; onClose: () => void; onSaved: (l: TeamLeave) => void
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    user_id: currentUserId,
    type: 'ferie' as LeaveType,
    start_date: '',
    end_date: '',
    notes: '',
  })

  const days = form.start_date && form.end_date
    ? Math.max(0, Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1)
    : 0

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.start_date || !form.end_date) { toast.error('Date obbligatorie'); return }
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('team_leaves').insert({
      ...form, days_count: days, status: 'in_attesa',
    }).select().single()
    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success('Richiesta inviata')
    onSaved(data as TeamLeave)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Nuova richiesta</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Membro</label>
            <select value={form.user_id} onChange={e => setForm(p => ({ ...p, user_id: e.target.value }))} className={ic}>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Tipo</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as LeaveType }))} className={ic}>
              {(Object.entries(LEAVE_LABELS) as [LeaveType, { label: string }][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Dal</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Al</label>
              <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className={ic} />
            </div>
          </div>
          {days > 0 && <p className="text-xs text-gold-text font-bold">{days} giorno{days !== 1 ? 'i' : ''}</p>}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Note</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2} className={`${ic} resize-none`} placeholder="Motivo opzionale..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Invia richiesta
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ReviewModal({ reviewee, currentUserId, quarter, existing, onClose, onSaved }: {
  reviewee: Profile; currentUserId: string; quarter: string
  existing?: PerformanceReview | null; onClose: () => void; onSaved: (r: PerformanceReview) => void
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    score_quality: existing?.score_quality ?? 3,
    score_speed: existing?.score_speed ?? 3,
    score_communication: existing?.score_communication ?? 3,
    score_initiative: existing?.score_initiative ?? 3,
    strengths: existing?.strengths ?? '',
    improvements: existing?.improvements ?? '',
    goals_next_quarter: existing?.goals_next_quarter ?? '',
    overall_note: existing?.overall_note ?? '',
  })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const payload = { ...form, reviewee_id: reviewee.id, reviewer_id: currentUserId, quarter }
    const result = existing
      ? await supabase.from('performance_reviews').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('performance_reviews').insert(payload).select().single()
    setLoading(false)
    if (result.error) { toast.error(result.error.message); return }
    toast.success('Review salvata')
    onSaved(result.data as PerformanceReview)
    onClose()
  }

  const slider = (label: string, key: keyof Pick<typeof form, 'score_quality'|'score_speed'|'score_communication'|'score_initiative'>) => (
    <div className="space-y-1">
      <div className="flex justify-between">
        <label className="text-xs text-text-secondary">{label}</label>
        <span className="text-xs font-bold text-gold-text">{form[key]}/5</span>
      </div>
      <input type="range" min={1} max={5} value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: parseInt(e.target.value) }))}
        className="w-full accent-gold" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface">
          <div>
            <h2 className="text-base font-bold text-text-primary">Performance Review</h2>
            <p className="text-xs text-text-secondary">{reviewee.full_name} · {quarter}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div className="space-y-3">
            {slider('Qualità del lavoro', 'score_quality')}
            {slider('Velocità di esecuzione', 'score_speed')}
            {slider('Comunicazione', 'score_communication')}
            {slider('Iniziativa / Proattività', 'score_initiative')}
          </div>
          {([['Punti di forza', 'strengths'], ['Aree di miglioramento', 'improvements'], ['Obiettivi prossimo trimestre', 'goals_next_quarter'], ['Note generali', 'overall_note']] as [string, keyof typeof form][]).map(([label, key]) => (
            <div key={key}>
              <label className="block text-xs text-text-secondary mb-1">{label}</label>
              <textarea value={form[key] as string} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                rows={2} className={`${ic} resize-none text-xs`} />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Salva review
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function HRClient({ profiles, leaves: initialLeaves, reviews: initialReviews, orgUnits, orgMembers, resourceProfiles, currentUserId, isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>('team')
  const [leaves, setLeaves] = useState(initialLeaves)
  const [reviews, setReviews] = useState(initialReviews)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<Profile | null>(null)
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null)

  const currentQuarter = (() => {
    const now = new Date()
    return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`
  })()

  const approveLeave = async (id: string, status: 'approvato' | 'rifiutato') => {
    const supabase = createClient()
    await supabase.from('team_leaves').update({
      status, approved_by: currentUserId, approved_at: new Date().toISOString(),
    }).eq('id', id)
    setLeaves(p => p.map(l => l.id === id ? { ...l, status, approved_by: currentUserId, approved_at: new Date().toISOString() } : l))
    toast.success(status === 'approvato' ? 'Richiesta approvata' : 'Richiesta rifiutata')
  }

  const teamProfiles = profiles.filter(p => p.app_role !== 'client')
  const pending = leaves.filter(l => l.status === 'in_attesa')
  const totalLeaveDays = leaves.filter(l => l.status === 'approvato' && l.type === 'ferie' && new Date(l.start_date).getFullYear() === new Date().getFullYear()).reduce((s, l) => s + l.days_count, 0)
  const avgScore = (() => {
    const qs = reviews.filter(r => r.quarter === currentQuarter)
    if (!qs.length) return null
    const scores = qs.map(r => ((r.score_quality ?? 0) + (r.score_speed ?? 0) + (r.score_communication ?? 0) + (r.score_initiative ?? 0)) / 4)
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
  })()

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary">HR & Team</h1>
          <p className="text-text-secondary text-sm mt-0.5">{teamProfiles.length} membri del team</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowLeaveModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-bold rounded-lg hover:bg-gold/90">
            <Plus className="w-4 h-4" /> Richiesta assenza
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Membri attivi', v: teamProfiles.filter(p => p.is_active).length, c: 'text-text-primary', icon: <Users className="w-4 h-4 text-gold-text" /> },
          { l: 'Assenze in attesa', v: pending.length, c: pending.length > 0 ? 'text-warning' : 'text-success', icon: <Clock className="w-4 h-4 text-warning" /> },
          { l: 'Giorni ferie approvati', v: `${totalLeaveDays}gg`, c: 'text-info', icon: <Calendar className="w-4 h-4 text-info" /> },
          { l: `Score medio ${currentQuarter}`, v: avgScore ?? '—', c: avgScore ? (parseFloat(avgScore) >= 4 ? 'text-success' : parseFloat(avgScore) >= 3 ? 'text-warning' : 'text-error') : 'text-text-secondary', icon: <Star className="w-4 h-4 text-gold-text" /> },
        ].map(k => (
          <div key={k.l} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">{k.icon}<p className="text-xs text-text-secondary">{k.l}</p></div>
            <p className={`text-2xl font-black ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-surface border border-border rounded-xl p-1 gap-1 w-fit">
        {([
          { key: 'team', label: 'Team', icon: <Users className="w-3.5 h-3.5" /> },
          { key: 'ferie', label: `Assenze${pending.length > 0 ? ` (${pending.length})` : ''}`, icon: <Calendar className="w-3.5 h-3.5" /> },
          { key: 'performance', label: 'Performance', icon: <Star className="w-3.5 h-3.5" /> },
          { key: 'organigramma', label: 'Organigramma', icon: <Network className="w-3.5 h-3.5" /> },
          { key: 'risorse', label: 'Risorse', icon: <Contact className="w-3.5 h-3.5" /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.key ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TEAM ── */}
      {tab === 'team' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teamProfiles.map(p => {
            const isExpanded = expandedProfile === p.id
            const myReview = reviews.find(r => r.reviewee_id === p.id && r.quarter === currentQuarter)
            const avgMy = myReview
              ? (((myReview.score_quality ?? 0) + (myReview.score_speed ?? 0) + (myReview.score_communication ?? 0) + (myReview.score_initiative ?? 0)) / 4).toFixed(1)
              : null
            const myLeaves = leaves.filter(l => l.user_id === p.id && l.status === 'approvato' && l.type === 'ferie' && new Date(l.start_date).getFullYear() === new Date().getFullYear())
            const totalDays = myLeaves.reduce((s, l) => s + l.days_count, 0)

            return (
              <div key={p.id} className={`bg-surface border rounded-xl overflow-hidden transition-colors ${isExpanded ? 'border-gold/30' : 'border-border'}`}>
                <div className="p-5 cursor-pointer" onClick={() => setExpandedProfile(isExpanded ? null : p.id)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {avatar(p)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-text-primary">{p.full_name}</p>
                        <p className={`text-xs font-semibold capitalize ${ROLE_COLORS[p.app_role] ?? 'text-text-secondary'}`}>{p.app_role.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!p.is_active && <span className="text-2xs text-error bg-error/10 px-2 py-0.5 rounded-full font-bold">Inattivo</span>}
                      <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-secondary">
                    {p.area && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: AREA_COLORS[p.area] ?? '#666' }} />
                        {p.area}
                      </span>
                    )}
                    {p.job_title && <span>{p.job_title}</span>}
                  </div>
                  {avgMy && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-surface-active rounded-full overflow-hidden">
                        <div className="h-full bg-gold rounded-full" style={{ width: `${(parseFloat(avgMy) / 5) * 100}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gold-text">{avgMy}/5</span>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-5 space-y-4">
                    {p.email && <div className="flex items-center gap-2 text-xs text-text-secondary"><Mail className="w-3.5 h-3.5" />{p.email}</div>}
                    {p.phone && <div className="flex items-center gap-2 text-xs text-text-secondary"><Phone className="w-3.5 h-3.5" />{p.phone}</div>}
                    {p.competencies?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.competencies.map(c => (
                          <span key={c} className="text-2xs px-2 py-0.5 bg-surface-active text-text-secondary rounded-full">{c}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 text-xs text-text-secondary">
                      <span>Ferie {new Date().getFullYear()}: <strong className="text-text-primary">{totalDays}gg</strong></span>
                    </div>
                    {myReview && (
                      <div className="space-y-2">
                        <ScoreBar label="Qualità" value={myReview.score_quality} />
                        <ScoreBar label="Velocità" value={myReview.score_speed} />
                        <ScoreBar label="Comunicazione" value={myReview.score_communication} />
                        <ScoreBar label="Iniziativa" value={myReview.score_initiative} />
                        {myReview.strengths && <p className="text-xs text-text-secondary pt-1">✓ {myReview.strengths}</p>}
                      </div>
                    )}
                    {isAdmin && (
                      <button onClick={() => setReviewTarget(p)}
                        className="w-full py-2 bg-surface border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary hover:border-gold/30 transition-colors flex items-center justify-center gap-1">
                        <Edit2 className="w-3 h-3" /> {myReview ? 'Aggiorna review' : 'Scrivi review'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── FERIE & PERMESSI ── */}
      {tab === 'ferie' && (
        <div className="space-y-3">
          {leaves.length === 0 && (
            <div className="text-center py-12 text-text-secondary text-sm">Nessuna richiesta ancora</div>
          )}
          {[...leaves].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(leave => {
            const member = profiles.find(p => p.id === leave.user_id)
            const lc = LEAVE_LABELS[leave.type]
            const sc = STATUS_LABELS[leave.status]
            return (
              <div key={leave.id} className="bg-surface border border-border rounded-xl px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-xs font-black text-gold-text overflow-hidden">
                      {member ? avatar(member) : '?'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-text-primary">{member?.full_name ?? 'Sconosciuto'}</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lc.color} ${lc.bg}`}>{lc.label}</span>
                        <span className={`text-xs font-bold ${sc.color}`}>{sc.label}</span>
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {new Date(leave.start_date).toLocaleDateString('it-IT')} → {new Date(leave.end_date).toLocaleDateString('it-IT')} · <strong className="text-text-primary">{leave.days_count}gg</strong>
                        {leave.notes && <span> · {leave.notes}</span>}
                      </p>
                    </div>
                  </div>
                  {isAdmin && leave.status === 'in_attesa' && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => approveLeave(leave.id, 'approvato')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-success/10 text-success text-xs font-bold rounded-lg hover:bg-success/20">
                        <Check className="w-3.5 h-3.5" /> Approva
                      </button>
                      <button onClick={() => approveLeave(leave.id, 'rifiutato')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-error/10 text-error text-xs font-bold rounded-lg hover:bg-error/20">
                        <X className="w-3.5 h-3.5" /> Rifiuta
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── PERFORMANCE ── */}
      {tab === 'performance' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <p className="text-sm text-text-secondary">Trimestre corrente: <span className="text-gold-text font-bold">{currentQuarter}</span></p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamProfiles.map(p => {
              const review = reviews.find(r => r.reviewee_id === p.id && r.quarter === currentQuarter)
              const avg = review
                ? (((review.score_quality ?? 0) + (review.score_speed ?? 0) + (review.score_communication ?? 0) + (review.score_initiative ?? 0)) / 4).toFixed(1)
                : null
              return (
                <div key={p.id} className="bg-surface border border-border rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-xs font-black text-gold-text overflow-hidden">
                        {avatar(p)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-text-primary">{p.full_name}</p>
                        <p className="text-xs text-text-secondary capitalize">{p.app_role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {avg
                        ? <span className={`text-lg font-black ${parseFloat(avg) >= 4 ? 'text-success' : parseFloat(avg) >= 3 ? 'text-warning' : 'text-error'}`}>{avg}<span className="text-xs text-text-secondary">/5</span></span>
                        : <span className="text-xs text-text-tertiary">Non valutato</span>
                      }
                      {isAdmin && (
                        <button onClick={() => setReviewTarget(p)} className="p-1.5 text-text-secondary hover:text-gold-text">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {review ? (
                    <div className="space-y-2">
                      <ScoreBar label="Qualità" value={review.score_quality} />
                      <ScoreBar label="Velocità" value={review.score_speed} />
                      <ScoreBar label="Comunicazione" value={review.score_communication} />
                      <ScoreBar label="Iniziativa" value={review.score_initiative} />
                      {review.strengths && <p className="text-xs text-text-secondary border-t border-border pt-2">💪 {review.strengths}</p>}
                      {review.improvements && <p className="text-xs text-text-secondary">📈 {review.improvements}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-text-tertiary">Nessuna review per {currentQuarter}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ORGANIGRAMMA ── */}
      {tab === 'organigramma' && (
        <Organigramma profiles={profiles} units={orgUnits} members={orgMembers} isAdmin={isAdmin} />
      )}

      {/* ── RISORSE ── */}
      {tab === 'risorse' && (
        <ResourceProfilesTab profiles={profiles} initialResourceProfiles={resourceProfiles} />
      )}

      {showLeaveModal && (
        <LeaveModal
          profiles={teamProfiles} currentUserId={currentUserId}
          onClose={() => setShowLeaveModal(false)}
          onSaved={l => setLeaves(p => [l, ...p])}
        />
      )}

      {reviewTarget && (
        <ReviewModal
          reviewee={reviewTarget} currentUserId={currentUserId} quarter={currentQuarter}
          existing={reviews.find(r => r.reviewee_id === reviewTarget.id && r.quarter === currentQuarter)}
          onClose={() => setReviewTarget(null)}
          onSaved={r => {
            setReviews(p => {
              const exists = p.find(x => x.id === r.id)
              return exists ? p.map(x => x.id === r.id ? r : x) : [...p, r]
            })
            setReviewTarget(null)
          }}
        />
      )}
    </div>
  )
}
