'use client'

import { useState, useRef } from 'react'
import {
  CheckSquare, FileText, Calendar,
  Users, MessageSquare, BarChart3, ChevronRight,
  Phone, Users2, Mail, Presentation, MapPin, HelpCircle, Star,
  Check, AlertCircle, Clock, AlertTriangle, ChevronDown, ChevronUp,
  Brain, Loader2, ArrowRight, FolderKanban, Flag,
  Plus, Pencil, Trash2, X, Upload, Sparkles, Layers,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CalendarAgenda } from '@/components/shared/CalendarAgenda'
import type { Client, Task, Invoice, ClientKpi, Project, Sprint, MeetingNote, Profile, ClientInteraction, InteractionType, InteractionOutcome } from '@/lib/types/database'
import type { Workstream, Milestone } from '@/components/projects/board/types'

const TYPE_ICON: Record<InteractionType, React.ReactNode> = {
  call:     <Phone className="w-3 h-3" />,
  meeting:  <Users2 className="w-3 h-3" />,
  email:    <Mail className="w-3 h-3" />,
  demo:     <Presentation className="w-3 h-3" />,
  visit:    <MapPin className="w-3 h-3" />,
  slack:    <MessageSquare className="w-3 h-3" />,
  proposta: <FileText className="w-3 h-3" />,
  altro:    <HelpCircle className="w-3 h-3" />,
}
const TYPE_LABEL: Record<InteractionType, string> = {
  call: 'Call', meeting: 'Meeting', email: 'Email', demo: 'Demo',
  visit: 'Visita', slack: 'Slack', proposta: 'Proposta', altro: 'Altro',
}
const OUTCOME_ICON: Record<InteractionOutcome, React.ReactNode> = {
  positivo:   <Check className="w-2.5 h-2.5" />,
  neutro:     <Clock className="w-2.5 h-2.5" />,
  negativo:   <AlertCircle className="w-2.5 h-2.5" />,
  da_seguire: <Star className="w-2.5 h-2.5" />,
}
const OUTCOME_COLOR: Record<InteractionOutcome, string> = {
  positivo: 'text-success', neutro: 'text-text-secondary',
  negativo: 'text-error',   da_seguire: 'text-warning',
}

interface Props {
  client: Client
  tasks: Task[]
  invoices: Invoice[]
  kpis: ClientKpi[]
  projects: Project[]
  workstreams: Workstream[]
  milestones: Milestone[]
  meetings: MeetingNote[]
  allProfiles: Profile[]
  teamMembers: Profile[]
  interactions: ClientInteraction[]
  isAdmin: boolean
  openTickets: number
  onTabChange?: (tab: number) => void
  /** Portale operativo: oscura MRR, fatture, ricavi e "da incassare" */
  hideEconomics?: boolean
}

function scoreChecks(checks: { actual: number | null; target: number | null; lowerIsBetter?: boolean }[]): number {
  const valid = checks.filter(c => c.actual != null && c.target != null && c.target! > 0)
  if (!valid.length) return 50
  const scores = valid.map(c => {
    const pct = c.lowerIsBetter
      ? (c.target! / c.actual!) * 100
      : (c.actual! / c.target!) * 100
    if (pct >= 100) return 100
    if (pct >= 85)  return 80
    if (pct >= 70)  return 55
    if (pct >= 50)  return 30
    return 10
  })
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

function calcGrowthHealth(kpi: ClientKpi | undefined, client: Client): number {
  if (!kpi) return 0
  return scoreChecks([
    { actual: kpi.roas,               target: client.target_roas },
    { actual: kpi.revenue_attributed, target: client.target_revenue_monthly },
    { actual: kpi.leads_generated,    target: client.target_leads_monthly },
    { actual: kpi.conversion_rate,    target: client.target_conv_rate },
    { actual: kpi.ctr,                target: client.target_ctr },
  ])
}

function calcDigitalHealth(kpi: ClientKpi | undefined): number {
  if (!kpi) return 0
  const checks: { ok: boolean }[] = []
  if (kpi.uptime != null)         checks.push({ ok: kpi.uptime >= 99 })
  if (kpi.bounce_rate != null)    checks.push({ ok: kpi.bounce_rate <= 55 })
  if (kpi.organic_sessions != null && kpi.organic_sessions > 0) checks.push({ ok: true })
  if (kpi.active_users != null && kpi.active_users > 0)         checks.push({ ok: true })
  if (kpi.email_open_rate != null) checks.push({ ok: kpi.email_open_rate >= 20 })
  if (!checks.length) return 50
  const pct = checks.filter(c => c.ok).length / checks.length
  if (pct >= 0.8) return 85
  if (pct >= 0.6) return 65
  if (pct >= 0.4) return 45
  return 25
}

// ─── ProgettiAttivi ────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 52 }: { pct: number; size?: number }) {
  const cx = size / 2, r = cx - 5
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct >= 75 ? 'var(--color-success)' : pct >= 40 ? 'var(--color-gold-text)' : pct > 0 ? 'var(--color-error)' : 'var(--color-border-strong)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#2A2A2A" strokeWidth="4" />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={cx} y={cx + 4} textAnchor="middle" fill={color} fontSize="11" fontWeight="900">{pct}%</text>
    </svg>
  )
}

function ProgettoCard({ project, tasks, workstreams, milestones, kpis, clientId, onEdit, onDelete, hideEconomics = false }: {
  project: Project; tasks: Task[]; workstreams: Workstream[]; milestones: Milestone[]; kpis: ClientKpi[]; clientId: string
  onEdit: () => void; onDelete: () => void; hideEconomics?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const projTasks   = tasks.filter(t => t.project_id === project.id)
  const done        = projTasks.filter(t => t.status === 'completato').length
  const open        = projTasks.filter(t => t.status !== 'completato').length
  const overdue     = projTasks.filter(t => t.status !== 'completato' && t.due_date && new Date(t.due_date) < new Date()).length
  const projMilestones = milestones.filter(m => m.project_id === project.id)
  const doneMilestones = projMilestones.filter(m => m.status === 'completata').length
  const projWorkstreams = workstreams.filter(w => w.project_id === project.id)
  // La prossima consegna: più utile dello "sprint in corso" che indicava solo il tempo.
  const nextMilestone = projMilestones
    .filter(m => m.status !== 'completata' && m.expected_date)
    .sort((a, b) => (a.expected_date ?? '').localeCompare(b.expected_date ?? ''))[0] ?? null
  const pct         = projTasks.length ? Math.round(done / projTasks.length * 100) : 0
  const projKpis    = kpis.filter(k => k.project_id === project.id)
  const lastKpi     = projKpis[0] ?? null
  const isG         = project.project_kind === 'growth'
  const title       = project.name.includes(' – ') ? project.name.split(' – ').slice(1).join(' – ') : project.name

  const generateAi = async () => {
    setAiLoading(true)
    const res = await fetch('/api/ai/project-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, tasks: projTasks, sprints: [], kpis: projKpis }),
    })
    const data = await res.json()
    setAiSummary(data.summary ?? 'Nessuna analisi disponibile.')
    setAiLoading(false)
  }

  return (
    <div className={`rounded-xl border transition-all duration-200 ${expanded ? 'bg-gold/5 border-gold/30' : 'bg-surface border-border hover:border-gold/20'}`}>
      {/* Header card */}
      <div onClick={() => setExpanded(e => !e)} className="w-full text-left p-4 cursor-pointer">
        <div className="flex items-center gap-4">
          <ProgressRing pct={pct} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-bold text-text-primary">{title}</span>
              <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border ${
                project.status === 'attivo' ? 'bg-success/10 text-success border-success/20' : 'bg-surface-active text-text-secondary border-border-strong'
              }`}>{project.status === 'attivo' ? 'Attivo' : project.status}</span>
              {project.project_kind && (
                <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border ${
                  isG ? 'bg-gold/10 text-gold-text border-gold/25' : 'bg-info/10 text-info border-info/25'
                }`}>{isG ? '📈 Growth' : '💻 Digital'}</span>
              )}
              {nextMilestone && (
                <span className="text-2xs text-gold-text bg-gold/10 border border-gold/20 px-1.5 py-0.5 rounded font-semibold">
                  Prossima: {nextMilestone.title}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
              {open > 0
                ? <span className={overdue > 0 ? 'text-error font-semibold' : ''}>{open} task aperte{overdue > 0 ? ` · ${overdue} scadute` : ''}</span>
                : projTasks.length > 0 ? <span className="text-success font-semibold">✓ Tutto completato</span>
                : <span>Nessuna task ancora</span>}
              {projWorkstreams.length > 0 && (
                <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{projWorkstreams.length} aree di lavoro</span>
              )}
              {projMilestones.length > 0 && (
                <span className="flex items-center gap-1"><Flag className="w-3 h-3" />{doneMilestones}/{projMilestones.length} milestone</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={e => { e.stopPropagation(); onEdit() }}
              className="p-1.5 text-text-secondary hover:text-text-primary border border-border hover:border-border-strong rounded-lg transition-colors"
              title="Modifica">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1.5 text-text-secondary hover:text-error border border-border hover:border-error/40 rounded-lg transition-colors"
              title="Elimina">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {expanded ? <ChevronUp className="w-4 h-4 text-gold-text ml-1" /> : <ChevronDown className="w-4 h-4 text-text-secondary ml-1" />}
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gold/10 p-4 space-y-4">

          {/* Numeri macro */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-background rounded-lg p-3">
              <p className="text-2xs text-text-secondary mb-1">Progresso</p>
              <p className="text-lg font-black text-gold-text">{pct}%</p>
              <p className="text-2xs text-text-secondary">{done}/{projTasks.length} task</p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-2xs text-text-secondary mb-1">Milestone</p>
              <p className="text-lg font-black text-text-primary">{doneMilestones}/{milestones.length}</p>
              <p className={`text-2xs ${doneMilestones === milestones.length && milestones.length > 0 ? 'text-success' : 'text-text-secondary'}`}>
                {milestones.length === 0 ? 'Nessuna' : doneMilestones === milestones.length ? 'Tutte ✓' : 'In corso'}
              </p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-2xs text-text-secondary mb-1">Task scadute</p>
              <p className={`text-lg font-black ${overdue > 0 ? 'text-error' : 'text-success'}`}>{overdue}</p>
              <p className="text-2xs text-text-secondary">{overdue === 0 ? 'Nessuna ✓' : 'Richiede attenzione'}</p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-2xs text-text-secondary mb-1">{isG ? 'KPI principale' : 'Uptime'}</p>
              {lastKpi ? (
                <>
                  <p className="text-lg font-black text-text-primary">
                    {isG
                      ? (lastKpi.roas != null ? `${lastKpi.roas}×` : lastKpi.leads_generated != null ? String(lastKpi.leads_generated) : '—')
                      : (lastKpi.uptime != null ? `${lastKpi.uptime}%` : lastKpi.organic_sessions != null ? lastKpi.organic_sessions.toLocaleString('it-IT') : '—')}
                  </p>
                  <p className="text-2xs text-text-secondary">{isG ? 'ROAS / Lead' : 'Uptime / Sessioni'}</p>
                </>
              ) : (
                <p className="text-lg font-black text-text-tertiary">—</p>
              )}
            </div>
          </div>

          {/* AI Summary */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2 text-text-secondary">
                <Brain className="w-3.5 h-3.5" />
                <span className="text-2xs font-bold uppercase tracking-wider">Analisi AI fase progettuale</span>
              </div>
              {!aiSummary && (
                <button onClick={generateAi} disabled={aiLoading}
                  className="text-xs text-gold-text hover:text-gold-text font-semibold disabled:opacity-50 flex items-center gap-1.5">
                  {aiLoading ? <><Loader2 className="w-3 h-3 animate-spin" />Analisi...</> : 'Genera →'}
                </button>
              )}
              {aiSummary && (
                <button onClick={() => setAiSummary(null)} className="text-2xs text-text-secondary hover:text-text-primary">Rigenera</button>
              )}
            </div>
            <div className="px-4 py-3">
              {aiSummary ? (
                <p className="text-sm text-text-primary leading-relaxed">{aiSummary}</p>
              ) : (
                <p className="text-xs text-text-secondary">
                  {aiLoading ? 'Sto analizzando task, aree di lavoro e KPI del progetto...' : 'Un riassunto AI della fase attuale: cosa è completato, dove siete bloccati, prossimi passi critici.'}
                </p>
              )}
            </div>
          </div>

          {/* CTA pagina progetto */}
          <Link
            href={hideEconomics ? `/workspace/progetti/${project.id}` : `/clienti/${clientId}/progetto/${project.id}`}
            className="flex items-center justify-between w-full px-4 py-3 bg-gold/5 hover:bg-gold/10 border border-gold/20 hover:border-gold/40 rounded-xl transition-all group"
          >
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-gold-text" />
              <span className="text-sm font-bold text-gold-text">Apri pagina progetto completa</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gold-text group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      )}
    </div>
  )
}

export function ProgettiAttivi({ projects: initialProjects, tasks, workstreams, milestones, kpis, clientId, hideEconomics = false }: {
  projects: Project[]; tasks: Task[]; workstreams: Workstream[]; milestones: Milestone[]; kpis: ClientKpi[]; clientId: string; hideEconomics?: boolean
}) {
  const [projects, setProjects] = useState(initialProjects)
  const [showNew, setShowNew]   = useState(false)
  const [editP, setEditP]       = useState<Project | null>(null)
  const [deleteP, setDeleteP]   = useState<Project | null>(null)

  const active = projects.filter(p => p.status === 'attivo')
  const other  = projects.filter(p => p.status !== 'attivo')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-text-secondary" />
          Progetti Attivi
          {active.length > 0 && <span className="text-text-secondary font-normal">({active.length})</span>}
        </h3>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/10 hover:bg-gold/20 border border-gold/30 hover:border-gold/50 rounded-lg text-xs font-bold text-gold-text transition-all">
          <Plus className="w-3.5 h-3.5" /> Nuovo progetto
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 border border-dashed border-border rounded-xl text-center">
          <FolderKanban className="w-8 h-8 text-text-tertiary mb-2" />
          <p className="text-sm text-text-secondary">Nessun progetto ancora</p>
          <button onClick={() => setShowNew(true)} className="mt-3 text-xs text-gold-text hover:text-gold-text font-bold">
            + Crea il primo progetto
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {active.map(p => (
              <ProgettoCard key={p.id} project={p} tasks={tasks} workstreams={workstreams} milestones={milestones} kpis={kpis} clientId={clientId}
                onEdit={() => setEditP(p)} onDelete={() => setDeleteP(p)} hideEconomics={hideEconomics} />
            ))}
          </div>
          {other.length > 0 && (
            <details className="group">
              <summary className="text-2xs text-text-secondary uppercase tracking-wider font-bold cursor-pointer hover:text-text-primary list-none flex items-center gap-1">
                <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                Completati / archiviati ({other.length})
              </summary>
              <div className="space-y-2 mt-2">
                {other.map(p => (
                  <ProgettoCard key={p.id} project={p} tasks={tasks} workstreams={workstreams} milestones={milestones} kpis={kpis} clientId={clientId}
                    onEdit={() => setEditP(p)} onDelete={() => setDeleteP(p)} hideEconomics={hideEconomics} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {showNew && (
        <NewProjectDetailedModal clientId={clientId} onClose={() => setShowNew(false)}
          onCreated={p => { setProjects(prev => [p, ...prev]); setShowNew(false) }} />
      )}
      {editP && (
        <EditProjectModal project={editP} onClose={() => setEditP(null)}
          onSaved={updated => { setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p)); setEditP(null) }} />
      )}
      {deleteP && (
        <DeleteProjectModal project={deleteP} onClose={() => setDeleteP(null)}
          onDeleted={id => { setProjects(prev => prev.filter(p => p.id !== id)); setDeleteP(null) }} />
      )}
    </div>
  )
}

// ─── NewProjectDetailedModal ─────────────────────────────────────────────────

type ProjectKind = 'growth' | 'marketing' | 'digital' | 'ai'
type ProjectType = 'ecommerce' | 'lead_gen' | 'sito_web' | 'app_ai' | 'campagna' | 'custom'

interface ProjectForm {
  name: string
  description: string
  kind: ProjectKind | ''
  project_type: ProjectType
  status: 'attivo' | 'in_pausa'
  budget: string
  objective: string
  target_audience: string
  channels: string
  kpi_targets: string
  deadline: string
  milestones: string[]
}

const EMPTY_FORM: ProjectForm = {
  name: '', description: '', kind: '', project_type: 'custom',
  status: 'attivo', budget: '', objective: '', target_audience: '',
  channels: '', kpi_targets: '', deadline: '', milestones: [''],
}

const TYPE_OPTIONS: { value: ProjectType; label: string; icon: string; kind: ProjectKind }[] = [
  { value: 'campagna',  label: 'Campagna Performance', icon: '📣', kind: 'growth' },
  { value: 'ecommerce', label: 'E-commerce',           icon: '🛒', kind: 'growth' },
  { value: 'lead_gen',  label: 'Lead Generation',      icon: '🎯', kind: 'growth' },
  { value: 'app_ai',    label: 'App AI / Custom',      icon: '🤖', kind: 'digital' },
  { value: 'sito_web',  label: 'Sito Web / Landing',   icon: '🌐', kind: 'digital' },
  { value: 'custom',    label: 'Personalizzato',        icon: '📁', kind: 'growth' },
]

function NewProjectDetailedModal({ clientId, onClose, onCreated }: {
  clientId: string
  onClose: () => void
  onCreated: (p: Project) => void
}) {
  const [mode, setMode]         = useState<'manual' | 'upload'>('manual')
  const [form, setForm]         = useState<ProjectForm>(EMPTY_FORM)
  const [loading, setLoading]   = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [fileText, setFileText] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef                 = useRef<HTMLInputElement>(null)

  const inp = 'w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold placeholder:text-text-secondary'

  const handleFile = async (file: File) => {
    setFileName(file.name)
    const text = await file.text()
    setFileText(text)
  }

  const extractFromFile = async () => {
    if (!fileText) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/extract-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fileText }),
      })
      const parsed = await res.json()
      if (parsed.error) { toast.error('Errore AI: ' + parsed.error); setAiLoading(false); return }
      setForm(prev => ({
        ...prev,
        name: parsed.name || prev.name,
        description: parsed.description || prev.description,
        kind: (['growth', 'marketing', 'digital', 'ai'] as ProjectKind[]).includes(parsed.kind) ? parsed.kind : prev.kind,
        project_type: TYPE_OPTIONS.find(t => t.value === parsed.project_type) ? parsed.project_type : prev.project_type,
        objective: parsed.objective || prev.objective,
        target_audience: parsed.target_audience || prev.target_audience,
        channels: parsed.channels || prev.channels,
        kpi_targets: parsed.kpi_targets || prev.kpi_targets,
        budget: parsed.budget || prev.budget,
        deadline: parsed.deadline || prev.deadline,
        milestones: Array.isArray(parsed.milestones) && parsed.milestones.length > 0 ? parsed.milestones : prev.milestones,
      }))
      setMode('manual')
      toast.success('Progetto estratto — verifica e completa i dettagli')
    } catch {
      toast.error('Errore nella chiamata AI')
    }
    setAiLoading(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.kind) { toast.error('Seleziona Growth o Digital'); return }
    if (!form.name.trim()) { toast.error('Inserisci il nome del progetto'); return }
    setLoading(true)
    const supabase = createClient()
    const milestones = form.milestones.filter(m => m.trim())
    const description = [
      form.description,
      form.objective       ? `\n\n**Obiettivo:** ${form.objective}` : '',
      form.target_audience ? `\n**Target:** ${form.target_audience}` : '',
      form.channels        ? `\n**Canali:** ${form.channels}` : '',
      form.kpi_targets     ? `\n**KPI target:** ${form.kpi_targets}` : '',
      form.budget          ? `\n**Budget:** ${form.budget}` : '',
    ].join('').trim()

    const { data, error } = await supabase.from('projects').insert({
      client_id: clientId,
      name: form.name.trim(),
      description: description || null,
      status: form.status,
      project_type: form.project_type,
      project_kind: form.kind,
      sprint_current: 1,
    }).select('*, tasks(id,title,status,priority,due_date,assignee_id,is_milestone), sprints(id,name,status,end_date,project_id)').single()

    if (error) { toast.error('Errore: ' + error.message); setLoading(false); return }

    if (milestones.length > 0) {
      const today = new Date()
      await Promise.all(milestones.map((title, i) => {
        const due = new Date(today)
        due.setDate(due.getDate() + (i + 1) * 14)
        return supabase.from('tasks').insert({
          project_id: data.id, title, status: 'da_fare', priority: 'normale',
          is_milestone: true, position: i, due_date: due.toISOString().split('T')[0],
          tags: [], logged_hours: 0, depth: 0,
        })
      }))
    }

    toast.success('Progetto creato!')
    onCreated(data as unknown as Project)
    setLoading(false)
  }

  const setMilestone = (i: number, val: string) => setForm(prev => {
    const ms = [...prev.milestones]; ms[i] = val; return { ...prev, milestones: ms }
  })
  const addMilestone = () => setForm(prev => ({ ...prev, milestones: [...prev.milestones, ''] }))
  const removeMilestone = (i: number) => setForm(prev => ({
    ...prev, milestones: prev.milestones.filter((_, j) => j !== i)
  }))

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-surface border border-border rounded-card w-full max-w-2xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Nuovo Progetto</h2>
            <p className="text-xs text-text-secondary mt-0.5">Compila manualmente o carica un file di riunione</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-text-primary" /></button>
        </div>

        {/* Mode switcher */}
        <div className="flex gap-2 p-4 border-b border-border">
          <button onClick={() => setMode('manual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'manual' ? 'bg-gold text-on-gold' : 'border border-border text-text-secondary hover:text-text-primary'}`}>
            <Pencil className="w-3.5 h-3.5" /> Inserimento manuale
          </button>
          <button onClick={() => setMode('upload')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'upload' ? 'bg-gold text-on-gold' : 'border border-border text-text-secondary hover:text-text-primary'}`}>
            <Sparkles className="w-3.5 h-3.5" /> Carica file riunione (AI)
          </button>
        </div>

        {/* Upload mode */}
        {mode === 'upload' && (
          <div className="p-6 space-y-4">
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border hover:border-gold/40 rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all">
              <Upload className="w-8 h-8 text-text-tertiary" />
              <div className="text-center">
                <p className="text-sm font-bold text-text-primary">{fileName || 'Trascina qui il file oppure clicca'}</p>
                <p className="text-xs text-text-secondary mt-1">Supporta .txt, .md, .pdf — trascrizioni Gemini, Plaud, Notion</p>
              </div>
              <input ref={fileRef} type="file" accept=".txt,.md,.pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
            {fileText && (
              <div className="bg-surface border border-border rounded-xl p-4">
                <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold mb-2">Anteprima testo ({fileText.length} caratteri)</p>
                <p className="text-xs text-text-primary font-mono leading-relaxed line-clamp-5">{fileText.slice(0, 500)}…</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
              <button onClick={extractFromFile} disabled={!fileText || aiLoading}
                className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Estrazione AI...</> : <><Sparkles className="w-4 h-4" />Estrai con AI</>}
              </button>
            </div>
          </div>
        )}

        {/* Manual form */}
        {mode === 'manual' && (
          <form onSubmit={submit} className="p-6 space-y-5">

            {/* Kind selector */}
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-2 uppercase tracking-wider">Natura del progetto *</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { v: 'growth' as const,    label: '🌱 Growth',    active: 'bg-gold/15 text-gold-text border-gold/50' },
                  { v: 'marketing' as const, label: '📣 Marketing',  active: 'bg-warning/15 text-warning border-warning/50' },
                  { v: 'digital' as const,   label: '💻 Digital',   active: 'bg-info/15 text-info border-info/50' },
                  { v: 'ai' as const,        label: '🤖 AI',        active: 'bg-accent/15 text-accent border-accent/50' },
                ]).map(({ v, label, active }) => (
                  <button key={v} type="button" onClick={() => setForm(p => ({ ...p, kind: v }))}
                    className={`py-3 rounded-xl border text-sm font-black transition-all ${
                      form.kind === v ? active : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tipo progetto */}
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-2 uppercase tracking-wider">Tipo di progetto</label>
              <div className="grid grid-cols-3 gap-2">
                {TYPE_OPTIONS.filter(t => !form.kind || t.kind === form.kind || t.value === 'custom').map(t => (
                  <button key={t.value} type="button" onClick={() => setForm(p => ({ ...p, project_type: t.value }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                      form.project_type === t.value
                        ? 'bg-gold/10 text-gold-text border-gold/40'
                        : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
                    }`}>
                    <span>{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Nome + stato */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-text-secondary mb-1">Nome progetto *</label>
                <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="es. Campagna Meta — Q3 2026" className={inp} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Stato</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as 'attivo'|'in_pausa' }))} className={inp}>
                  <option value="attivo">Attivo</option>
                  <option value="in_pausa">In pausa</option>
                </select>
              </div>
            </div>

            {/* Descrizione */}
            <div>
              <label className="block text-xs text-text-secondary mb-1">Descrizione generale</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2} placeholder="Contesto e scope del progetto..." className={`${inp} resize-none`} />
            </div>

            {/* Obiettivo + Target */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Obiettivo principale</label>
                <textarea value={form.objective} onChange={e => setForm(p => ({ ...p, objective: e.target.value }))}
                  rows={2} placeholder="es. Aumentare il traffico organico del 40%..." className={`${inp} resize-none`} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Target audience</label>
                <textarea value={form.target_audience} onChange={e => setForm(p => ({ ...p, target_audience: e.target.value }))}
                  rows={2} placeholder="es. Uomini 25-45, appassionati di sport..." className={`${inp} resize-none`} />
              </div>
            </div>

            {/* Canali + KPI target */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Canali / Piattaforme</label>
                <input value={form.channels} onChange={e => setForm(p => ({ ...p, channels: e.target.value }))}
                  placeholder="Meta Ads, Google Ads, SEO..." className={inp} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">KPI target</label>
                <input value={form.kpi_targets} onChange={e => setForm(p => ({ ...p, kpi_targets: e.target.value }))}
                  placeholder="es. 500 lead/mese, CPA &lt; 20€..." className={inp} />
              </div>
            </div>

            {/* Budget + Deadline */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Budget</label>
                <input value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))}
                  placeholder="es. €5.000/mese, €30.000 totali" className={inp} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Scadenza / Go-live</label>
                <input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} className={inp} />
              </div>
            </div>

            {/* Milestone */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Milestone</label>
                <button type="button" onClick={addMilestone} className="text-xs text-gold-text hover:text-gold-text font-bold flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Aggiungi
                </button>
              </div>
              <div className="space-y-2">
                {form.milestones.map((m, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-2xs text-text-tertiary w-5 text-right shrink-0">{i + 1}.</span>
                    <input value={m} onChange={e => setMilestone(i, e.target.value)}
                      placeholder={`Milestone ${i + 1}...`} className={`${inp} flex-1`} />
                    {form.milestones.length > 1 && (
                      <button type="button" onClick={() => removeMilestone(i)} className="text-text-tertiary hover:text-error shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-border">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Crea progetto
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── EditProjectModal ─────────────────────────────────────────────────────────

function EditProjectModal({ project, onClose, onSaved }: {
  project: Project
  onClose: () => void
  onSaved: (p: Partial<Project> & { id: string }) => void
}) {
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? '',
    status: project.status,
    project_type: (project.project_type ?? 'custom') as ProjectType,
    project_kind: (project.project_kind ?? '') as ProjectKind | '',
  })
  const [loading, setLoading] = useState(false)
  const inp = 'w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold'

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await createClient().from('projects').update({
      name: form.name, description: form.description || null,
      status: form.status, project_type: form.project_type,
      project_kind: form.project_kind || null,
    }).eq('id', project.id)
    setLoading(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    toast.success('Progetto aggiornato')
    onSaved({ id: project.id, name: form.name, description: form.description || null,
      status: form.status, project_type: form.project_type, project_kind: form.project_kind || null })
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Modifica progetto</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-text-primary" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Nome *</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3} className={`${inp} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Stato</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as typeof form.status }))} className={inp}>
                <option value="attivo">Attivo</option>
                <option value="in_pausa">In pausa</option>
                <option value="completato">Completato</option>
                <option value="archiviato">Archiviato</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Tipo</label>
              <select value={form.project_type} onChange={e => setForm(p => ({ ...p, project_type: e.target.value as ProjectType }))} className={inp}>
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-2">Kind</label>
            <div className="grid grid-cols-5 gap-1.5">
              {([
                { v: 'growth' as const,    label: '🌱 Growth',    active: 'bg-gold/15 text-gold-text border-gold/40' },
                { v: 'marketing' as const, label: '📣 Mktg',       active: 'bg-warning/15 text-warning border-warning/40' },
                { v: 'digital' as const,   label: '💻 Digital',   active: 'bg-info/15 text-info border-info/40' },
                { v: 'ai' as const,        label: '🤖 AI',        active: 'bg-accent/15 text-accent border-accent/40' },
                { v: '' as const,          label: '—',            active: 'bg-surface-active text-text-primary border-border-strong' },
              ]).map(({ v, label, active }) => (
                <button key={v} type="button" onClick={() => setForm(p => ({ ...p, project_kind: v }))}
                  className={`py-2 rounded-lg border text-2xs font-bold transition-all ${
                    form.project_kind === v ? active : 'border-border text-text-secondary hover:border-border-strong'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── DeleteProjectModal ───────────────────────────────────────────────────────

function DeleteProjectModal({ project, onClose, onDeleted }: {
  project: Project; onClose: () => void; onDeleted: (id: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const doDelete = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('tasks').delete().eq('project_id', project.id)
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    setLoading(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    toast.success('Progetto eliminato')
    onDeleted(project.id)
  }
  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-error" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">Elimina progetto</p>
            <p className="text-xs text-text-secondary">Azione irreversibile</p>
          </div>
        </div>
        <p className="text-sm text-text-secondary mb-5">
          Vuoi eliminare <span className="font-bold text-text-primary">{project.name}</span> e tutte le sue task?
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
          <button onClick={doDelete} disabled={loading}
            className="flex-1 py-2.5 bg-error text-text-primary font-bold rounded-lg text-sm hover:bg-error disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Elimina
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── KpiSnapshotPanel ─────────────────────────────────────────────────────────

function KpiSnapshotPanel({ label, accent, month, items, onTabChange }: {
  label: string
  accent: string
  month: string
  onTabChange?: (tab: number) => void
  items: { label: string; raw: number | null; fmt: (v: number) => string; target?: number | null }[]
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5" style={{ color: accent }} />
          <span className="text-2xs uppercase tracking-wider font-bold" style={{ color: accent }}>{label}</span>
          <span className="text-2xs text-text-secondary">
            — {new Date(month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </span>
        </div>
        {onTabChange && (
          <button onClick={() => onTabChange(2)} className="text-2xs text-gold-text hover:text-gold-text flex items-center gap-1">
            Tutti <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(k => {
          const pct = k.raw != null && k.target ? Math.round((k.raw / k.target) * 100) : null
          const color = pct == null ? (k.raw != null ? 'text-text-primary' : 'text-text-tertiary') : pct >= 100 ? 'text-success' : pct >= 70 ? 'text-warning' : 'text-error'
          return (
            <div key={k.label} className="bg-background rounded-lg p-3">
              <p className="text-2xs text-text-secondary mb-1">{k.label}</p>
              <p className={`text-base font-black ${color}`}>{k.raw != null ? k.fmt(k.raw) : '—'}</p>
              {pct !== null && (
                <div className="mt-1.5">
                  <div className="h-1 bg-surface-active rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? 'var(--color-success)' : pct >= 70 ? accent : 'var(--color-error)' }} />
                  </div>
                  <p className="text-2xs text-text-secondary mt-0.5">{pct}% target</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HealthRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 75 ? 'var(--color-success)' : score >= 50 ? 'var(--color-gold-text)' : 'var(--color-error)'
  const label = score >= 75 ? 'Ottimo' : score >= 50 ? 'Normale' : score >= 25 ? 'Attenzione' : 'Critico'
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={88} height={88} viewBox="0 0 88 88">
        <circle cx={44} cy={44} r={r} fill="none" stroke="#2A2A2A" strokeWidth="7" />
        <circle cx={44} cy={44} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 44 44)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        <text x="44" y="40" textAnchor="middle" fill={color} fontSize="18" fontWeight="900">{score}</text>
        <text x="44" y="54" textAnchor="middle" fill="#666" fontSize="9">/100</text>
      </svg>
      <span className="text-2xs font-bold" style={{ color }}>{label}</span>
      <span className="text-2xs text-text-secondary">Health Score</span>
    </div>
  )
}

export function PanoramicaTab({ client, tasks, invoices, kpis, projects, workstreams, milestones, meetings, allProfiles, teamMembers, interactions, isAdmin, openTickets, onTabChange, hideEconomics = false }: Props) {
  const now = new Date()

  // KPI più recente per tipo progetto
  const growthProjectIds  = new Set(projects.filter(p => p.project_kind === 'growth').map(p => p.id))
  const digitalProjectIds = new Set(projects.filter(p => p.project_kind === 'digital').map(p => p.id))
  const latestGrowthKpi   = kpis.find(k => k.project_id && growthProjectIds.has(k.project_id))
  const latestDigitalKpi  = kpis.find(k => k.project_id && digitalProjectIds.has(k.project_id))
  // fallback per clienti senza project_id ancora assegnato
  const lastKpi           = latestGrowthKpi ?? latestDigitalKpi ?? kpis[0] ?? null

  const isGrowth        = client.client_type === 'growth'
  const isDigital       = client.client_type === 'digital'
  const isGrowthDigital = client.client_type === 'growth_digital'

  const growthHealth  = calcGrowthHealth(latestGrowthKpi ?? (isGrowth ? kpis[0] : undefined), client)
  const digitalHealth = calcDigitalHealth(latestDigitalKpi ?? (isDigital ? kpis[0] : undefined))
  const healthScore   = isGrowthDigital
    ? Math.round((growthHealth + digitalHealth) / 2)
    : isDigital ? digitalHealth : growthHealth
  const activeProjects = projects.filter(p => p.status === 'attivo')
  const openTasks    = tasks.filter(t => t.status !== 'completato')
  const overdueTasks = openTasks.filter(t => t.due_date && new Date(t.due_date) < now)
  const urgentTasks  = openTasks.filter(t => {
    if (!t.due_date) return false
    const d = new Date(t.due_date)
    return d >= now && d <= new Date(now.getTime() + 7 * 86400000)
  })
  const unpaidAmount  = invoices.filter(i => ['da_inviare','inviata','in_ritardo'].includes(i.status)).reduce((s, i) => s + i.amount, 0)
  const lateInvoices  = invoices.filter(i => i.status === 'in_ritardo')
  const contractEnd   = new Date(client.contract_end)
  const daysToExpiry  = Math.round((contractEnd.getTime() - now.getTime()) / 86400000)
  const lastInteraction = interactions[0]
  const daysSinceContact = lastInteraction
    ? Math.round((now.getTime() - new Date(lastInteraction.date).getTime()) / 86400000)
    : null

  const mrrTrend = (() => {
    if (invoices.length < 2) return null
    const last = invoices[0]?.amount ?? 0
    const prev = invoices[1]?.amount ?? 0
    if (!prev) return null
    return Math.round(((last - prev) / prev) * 100)
  })()

  // ── Alert items (priorità decrescente) ──────────────────────────────────
  const alerts: { level: 'error' | 'warning'; msg: string; action?: () => void; actionLabel?: string }[] = []
  if (!hideEconomics && lateInvoices.length > 0)
    alerts.push({ level: 'error', msg: `${lateInvoices.length} fattura${lateInvoices.length > 1 ? 'e' : ''} in ritardo (${formatCurrency(lateInvoices.reduce((s,i) => s+i.amount,0))})`, action: () => onTabChange?.(2), actionLabel: 'Vai a fatturazione' })
  if (overdueTasks.length > 0)
    alerts.push({ level: 'error', msg: `${overdueTasks.length} task scadut${overdueTasks.length > 1 ? 'e' : 'a'}` })
  if (daysToExpiry > 0 && daysToExpiry <= 30)
    alerts.push({ level: 'warning', msg: `Contratto in scadenza tra ${daysToExpiry} giorni`, action: () => onTabChange?.(5), actionLabel: 'Anagrafica' })
  if (daysToExpiry <= 0)
    alerts.push({ level: 'error', msg: 'Contratto scaduto' })
  if (openTickets > 2)
    alerts.push({ level: 'warning', msg: `${openTickets} ticket aperti — verifica customer care` })
  if (daysSinceContact !== null && daysSinceContact > 21)
    alerts.push({ level: 'warning', msg: `Ultimo contatto ${daysSinceContact} giorni fa — pianifica un touchpoint`, action: () => onTabChange?.(6), actionLabel: 'Relazione' })

  return (
    <div className="space-y-4">

      {/* 1 ── Alert banner ─────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${
              a.level === 'error'
                ? 'bg-error/10 border-error/30 text-error'
                : 'bg-warning/10 border-warning/30 text-warning'
            }`}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{a.msg}</span>
              {a.action && (
                <button onClick={a.action} className="text-xs font-bold underline underline-offset-2 shrink-0 whitespace-nowrap">
                  {a.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 2 ── Hero: Health Score + MRR ─────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-5">
          <div className="shrink-0">
            <HealthRing score={healthScore} />
          </div>
          <div className="hidden sm:block w-px bg-surface-active" />
          <div className="flex-1 flex flex-col justify-center gap-1 text-center sm:text-left">
            {hideEconomics ? (
              <>
                <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold">Progetti attivi</p>
                <p className="text-3xl font-black text-gold-text">{activeProjects.length}</p>
                {openTasks.length > 0 && (
                  <p className={`text-xs font-bold ${overdueTasks.length > 0 ? 'text-error' : 'text-text-secondary'}`}>
                    {openTasks.length} task aperte{overdueTasks.length > 0 ? ` · ${overdueTasks.length} scadute` : ''}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold">MRR</p>
                <p className="text-3xl font-black text-gold-text">{formatCurrency(client.mrr)}</p>
                {mrrTrend !== null && (
                  <p className={`text-xs font-bold ${mrrTrend >= 0 ? 'text-success' : 'text-error'}`}>
                    {mrrTrend > 0 ? '+' : ''}{mrrTrend}% vs mese scorso
                  </p>
                )}
              </>
            )}
            <p className="text-2xs text-text-secondary mt-1">
              {isGrowthDigital ? '📈 Growth + 💻 Digital' : isGrowth ? '📈 Cliente Growth' : '💻 Cliente Digital'} · {client.package}
            </p>
          </div>
          <div className="hidden sm:block w-px bg-surface-active" />
          <div className="flex-1 flex flex-col justify-center gap-1 text-center sm:text-left">
            <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold">Contratto</p>
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <span className={`text-lg font-black ${daysToExpiry <= 0 ? 'text-error' : daysToExpiry <= 30 ? 'text-warning' : 'text-success'}`}>
                {daysToExpiry <= 0 ? 'Scaduto' : `${daysToExpiry}gg`}
              </span>
              {daysToExpiry > 0 && <span className="text-xs text-text-secondary">rimanenti</span>}
            </div>
            <div className="h-1.5 bg-surface-active rounded-full overflow-hidden mt-1">
              {(() => {
                const s = new Date(client.contract_start).getTime()
                const e = contractEnd.getTime()
                const pct = Math.min(100, Math.max(0, Math.round(((now.getTime() - s) / (e - s)) * 100)))
                return <div className="h-full rounded-full" style={{ width: `${pct}%`, background: daysToExpiry <= 0 ? 'var(--color-error)' : daysToExpiry <= 30 ? 'var(--color-gold-text)' : 'var(--color-success)' }} />
              })()}
            </div>
            <p className="text-2xs text-text-secondary">
              {new Date(client.contract_start).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })} →{' '}
              {contractEnd.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* 3 ── 4 urgency metrics ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4 text-left">
          <div className="flex items-center gap-2 text-text-secondary mb-2">
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="text-2xs uppercase tracking-wider font-bold">Task aperte</span>
          </div>
          <p className={`text-2xl font-black ${overdueTasks.length > 0 ? 'text-error' : openTasks.length > 0 ? 'text-warning' : 'text-success'}`}>
            {openTasks.length}
          </p>
          <p className="text-2xs mt-0.5">
            {overdueTasks.length > 0
              ? <span className="text-error font-bold">{overdueTasks.length} scadute</span>
              : urgentTasks.length > 0
                ? <span className="text-warning">{urgentTasks.length} in scadenza 7gg</span>
                : <span className="text-text-secondary">Nessuna urgenza</span>}
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4 text-left">
          <div className="flex items-center gap-2 text-text-secondary mb-2">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="text-2xs uppercase tracking-wider font-bold">Ticket aperti</span>
          </div>
          <p className={`text-2xl font-black ${openTickets > 2 ? 'text-error' : openTickets > 0 ? 'text-warning' : 'text-success'}`}>
            {openTickets}
          </p>
          <p className="text-2xs text-text-secondary mt-0.5">
            {openTickets === 0 ? 'Tutto risolto ✓' : openTickets > 2 ? 'Richiede attenzione' : 'In gestione'}
          </p>
        </div>

        {!hideEconomics && (
          <button onClick={() => onTabChange?.(2)}
            className="bg-surface border border-border rounded-xl p-4 text-left hover:border-gold/20 transition-colors">
            <div className="flex items-center gap-2 text-text-secondary mb-2">
              <FileText className="w-3.5 h-3.5" />
              <span className="text-2xs uppercase tracking-wider font-bold">Da incassare</span>
            </div>
            <p className={`text-2xl font-black ${unpaidAmount > 0 ? 'text-warning' : 'text-success'}`}>
              {unpaidAmount > 0 ? formatCurrency(unpaidAmount) : '✓'}
            </p>
            <p className="text-2xs text-text-secondary mt-0.5">
              {lateInvoices.length > 0
                ? <span className="text-error font-bold">{lateInvoices.length} in ritardo</span>
                : unpaidAmount > 0 ? 'In attesa di pagamento' : 'Tutto pagato'}
            </p>
          </button>
        )}

        <button onClick={() => onTabChange?.(6)}
          className="bg-surface border border-border rounded-xl p-4 text-left hover:border-gold/20 transition-colors">
          <div className="flex items-center gap-2 text-text-secondary mb-2">
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="text-2xs uppercase tracking-wider font-bold">Ultimo contatto</span>
          </div>
          <p className={`text-2xl font-black ${daysSinceContact === null ? 'text-text-tertiary' : daysSinceContact > 21 ? 'text-warning' : 'text-success'}`}>
            {daysSinceContact === null ? '—' : `${daysSinceContact}gg`}
          </p>
          <p className="text-2xs text-text-secondary mt-0.5">
            {daysSinceContact === null
              ? 'Nessuna interazione'
              : daysSinceContact > 21
                ? 'Pianifica un touchpoint'
                : lastInteraction ? TYPE_LABEL[lastInteraction.type] : ''}
          </p>
        </button>
      </div>

      {/* 4 ── Relazione commerciale ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Relazione commerciale */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-text-secondary">
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="text-2xs uppercase tracking-wider font-bold">Relazione commerciale</span>
            </div>

          </div>
          {interactions.length === 0 ? (
            <p className="text-xs text-text-secondary">Nessuna interazione registrata.</p>
          ) : (
            <div className="space-y-3">
              {interactions.slice(0, 4).map(i => (
                <div key={i.id} className="flex items-start gap-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${i.is_milestone ? 'bg-gold/20 text-gold-text' : 'bg-surface text-text-secondary'}`}>
                    {TYPE_ICON[i.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-text-primary truncate">{i.title}</span>
                      <span className={`text-2xs flex items-center gap-0.5 ${OUTCOME_COLOR[i.outcome]}`}>
                        {OUTCOME_ICON[i.outcome]}
                        {i.outcome.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-2xs text-text-secondary">
                      {TYPE_LABEL[i.type]} · {new Date(i.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5 ── KPI snapshot differenziato per tipo ─────────────────────── */}
      {lastKpi && (
        <div className={`grid gap-4 ${isGrowthDigital ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>

          {/* Pannello Growth */}
          {(isGrowth || isGrowthDigital) && latestGrowthKpi && (
            <KpiSnapshotPanel
              label="KPI Growth"
              accent="#F5C800"
              month={latestGrowthKpi.month}
              onTabChange={onTabChange}
              items={[
                { label: 'Revenue',  raw: latestGrowthKpi.revenue_attributed, fmt: (v) => formatCurrency(v), target: client.target_revenue_monthly },
                { label: 'Lead',     raw: latestGrowthKpi.leads_generated,    fmt: (v) => String(v),         target: client.target_leads_monthly },
                { label: 'ROAS',     raw: latestGrowthKpi.roas,               fmt: (v) => `${v}×`,           target: client.target_roas },
                { label: 'CTR',      raw: latestGrowthKpi.ctr,                fmt: (v) => `${v}%`,           target: client.target_ctr },
              ]}
            />
          )}
          {/* Fallback growth senza project_id */}
          {isGrowth && !latestGrowthKpi && kpis[0] && (
            <KpiSnapshotPanel
              label="KPI Growth"
              accent="#F5C800"
              month={kpis[0].month}
              onTabChange={onTabChange}
              items={[
                { label: 'Revenue',  raw: kpis[0].revenue_attributed, fmt: (v) => formatCurrency(v), target: client.target_revenue_monthly },
                { label: 'Lead',     raw: kpis[0].leads_generated,    fmt: (v) => String(v),         target: client.target_leads_monthly },
                { label: 'ROAS',     raw: kpis[0].roas,               fmt: (v) => `${v}×`,           target: client.target_roas },
                { label: 'CTR',      raw: kpis[0].ctr,                fmt: (v) => `${v}%`,           target: client.target_ctr },
              ]}
            />
          )}

          {/* Pannello Digital */}
          {(isDigital || isGrowthDigital) && latestDigitalKpi && (
            <KpiSnapshotPanel
              label="KPI Digital"
              accent="#60A5FA"
              month={latestDigitalKpi.month}
              onTabChange={onTabChange}
              items={[
                { label: 'Sessioni org.',  raw: latestDigitalKpi.organic_sessions, fmt: (v) => v.toLocaleString('it-IT') },
                { label: 'Nuovi utenti',   raw: latestDigitalKpi.new_users,         fmt: (v) => v.toLocaleString('it-IT') },
                { label: 'Utenti attivi',  raw: latestDigitalKpi.active_users,      fmt: (v) => v.toLocaleString('it-IT') },
                { label: 'Uptime',         raw: latestDigitalKpi.uptime,            fmt: (v) => `${v}%` },
              ]}
            />
          )}
          {/* Fallback digital senza project_id */}
          {isDigital && !latestDigitalKpi && kpis[0] && (
            <KpiSnapshotPanel
              label="KPI Digital"
              accent="#60A5FA"
              month={kpis[0].month}
              onTabChange={onTabChange}
              items={[
                { label: 'Sessioni org.',  raw: kpis[0].organic_sessions, fmt: (v) => v.toLocaleString('it-IT') },
                { label: 'Nuovi utenti',   raw: kpis[0].new_users,         fmt: (v) => v.toLocaleString('it-IT') },
                { label: 'Utenti attivi',  raw: kpis[0].active_users,      fmt: (v) => v.toLocaleString('it-IT') },
                { label: 'Uptime',         raw: kpis[0].uptime,            fmt: (v) => `${v}%` },
              ]}
            />
          )}
        </div>
      )}

      {/* 6 ── Agenda: prossimi appuntamenti + ultimi incontri ────────────── */}
      <CalendarAgenda
        clientName={client.display_name ?? client.company_name}
        projectNames={projects.map(p => p.name)}
        notes={meetings.map(m => ({ id: m.id, title: m.title, date: m.date }))}
      />


      {/* 8 ── Footer info: Team · Fatture recenti ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Team */}
        {teamMembers.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-text-secondary mb-3">
              <Users className="w-3.5 h-3.5" />
              <span className="text-2xs uppercase tracking-wider font-bold">Team assegnato</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {teamMembers.map(m => (
                <div key={m.id} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5">
                  <div className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center text-2xs font-black text-gold-text overflow-hidden shrink-0">
                    {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover rounded-full" alt="" /> : m.full_name[0]}
                  </div>
                  <span className="text-xs text-text-primary">{m.full_name.split(' ')[0]}</span>
                  <span className="text-2xs text-text-secondary capitalize">{m.app_role}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cosa ci serve dal cliente (task cliente) */}
        {(() => {
          const clientTasks = tasks.filter((t: any) => t.is_client_task && t.status !== 'completato')
          if (clientTasks.length === 0) return null
          return (
            <div className="bg-surface border border-gold/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-gold-text">
                  <Star className="w-3.5 h-3.5" />
                  <span className="text-2xs uppercase tracking-wider font-bold">Cosa ci serve dal cliente</span>
                  <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold-text">{clientTasks.length} pending</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {clientTasks.slice(0, 6).map((t: any) => {
                  const phase = (t.tags ?? []).find((x: string) => ['onboarding','build','lancio'].includes(x))
                  const phaseColor: Record<string, string> = { onboarding: 'var(--color-warning)', build: 'var(--color-info)', lancio: 'var(--color-success)' }
                  const proj = projects.find(p => p.id === t.project_id)
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 py-1">
                      <div className="w-3.5 h-3.5 rounded border border-border shrink-0" />
                      <span className="flex-1 text-xs text-text-secondary truncate">{t.title}</span>
                      {proj && (
                        <Link href={hideEconomics ? `/workspace/progetti/${proj.id}` : `/clienti/${client.id}/progetto/${proj.id}`}
                          className="text-2xs text-text-secondary hover:text-gold-text shrink-0 truncate max-w-[100px]">
                          {proj.name}
                        </Link>
                      )}
                      {phase && (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: `color-mix(in srgb, ${phaseColor[phase] ?? 'var(--color-text-tertiary)'} 9%, transparent)`, color: phaseColor[phase] ?? 'var(--color-text-tertiary)' }}>
                          {phase}
                        </span>
                      )}
                      <span className={`text-2xs font-bold shrink-0 ${t.priority === 'alta' ? 'text-error' : t.priority === 'media' ? 'text-gold-text' : 'text-text-tertiary'}`}>
                        {t.priority}
                      </span>
                    </div>
                  )
                })}
              </div>
              {clientTasks.length > 6 && (
                <p className="text-2xs text-text-tertiary mt-2 text-center">+{clientTasks.length - 6} altre task</p>
              )}
            </div>
          )
        })()}

        {/* Fatture recenti */}
        {invoices.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-text-secondary">
                <FileText className="w-3.5 h-3.5" />
                <span className="text-2xs uppercase tracking-wider font-bold">Fatture recenti</span>
              </div>
              {onTabChange && <button onClick={() => onTabChange(2)} className="text-2xs text-gold-text hover:text-gold-text flex items-center gap-1">Tutte <ChevronRight className="w-3 h-3" /></button>}
            </div>
            <div className="space-y-1.5">
              {invoices.slice(0, 4).map(inv => {
                const sc = inv.status === 'pagata' ? 'text-success' : inv.status === 'in_ritardo' ? 'text-error' : 'text-warning'
                const sl = { da_inviare: 'Da inviare', inviata: 'Inviata', pagata: 'Pagata', in_ritardo: 'In ritardo', accettata: 'Accettata' }[inv.status]
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="text-xs text-text-secondary">{new Date(inv.month).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}</span>
                    <span className="text-xs font-bold text-text-primary">{formatCurrency(inv.amount)}</span>
                    <span className={`text-2xs font-bold ${sc}`}>{sl}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
