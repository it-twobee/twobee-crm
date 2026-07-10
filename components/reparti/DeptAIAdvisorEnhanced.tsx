'use client'

import { useState, useRef } from 'react'
import {
  Sparkles, Loader2, TrendingUp, Lightbulb, Zap, Target,
  RefreshCw, Copy, Plus, FileText, Download, Check,
  ChevronDown, X, CheckCircle2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { ProjectKind } from '@/lib/types/database'
import type { DeptProject } from '@/app/(dashboard)/reparti/[dept]/page'

interface Suggestion {
  title: string
  category: 'trend' | 'ottimizzazione' | 'opportunità' | 'idea'
  insight: string
  action: string
  impact: 'alto' | 'medio' | 'basso'
}

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  trend:          { icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'var(--color-info)', bg: '#3B82F618', label: 'Trend' },
  ottimizzazione: { icon: <Zap        className="w-3.5 h-3.5" />, color: 'var(--color-warning)', bg: '#F59E0B18', label: 'Ottimizzazione' },
  opportunità:    { icon: <Target     className="w-3.5 h-3.5" />, color: 'var(--color-success)', bg: '#22C55E18', label: 'Opportunità' },
  idea:           { icon: <Lightbulb  className="w-3.5 h-3.5" />, color: 'var(--color-accent)', bg: '#A855F718', label: 'Idea' },
}

const IMPACT_STYLE: Record<string, string> = {
  alto:  'text-error bg-error/10 border-error/20',
  medio: 'text-gold-text bg-gold/10 border-warning/20',
  basso: 'text-text-tertiary bg-surface border-border',
}

const DEPT_EMOJI: Record<ProjectKind, string> = {
  growth: '🌱', marketing: '📣', digital: '💻', ai: '🤖',
}

// ─── Create task modal ────────────────────────────────────────────────────────
function CreateTaskModal({ suggestion, projects, onClose }: {
  suggestion: Suggestion; projects: DeptProject[]; onClose: () => void
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [title, setTitle]         = useState(suggestion.title)
  const [priority, setPriority]   = useState<'alta' | 'media' | 'bassa'>('media')
  const [saving, setSaving]       = useState(false)

  const save = async () => {
    if (!projectId || !title.trim()) return
    setSaving(true)
    const { error } = await createClient().from('tasks').insert({
      project_id: projectId, title: title.trim(),
      status: 'da_fare', priority, is_milestone: false,
    } as never)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Task creata nel progetto')
    onClose()
  }

  const inp = 'w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold'

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-bold text-text-primary">Crea task da suggestion AI</h3>
          <button onClick={onClose} className="p-1.5 text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Titolo task</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Progetto</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inp}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.client_name ?? '—'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Priorità</label>
            <div className="flex gap-2">
              {(['alta', 'media', 'bassa'] as const).map(p => (
                <button key={p} onClick={() => setPriority(p)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize border transition-all ${
                    priority === p ? 'border-gold text-gold-text bg-gold/10' : 'border-border text-text-tertiary'
                  }`}>{p}</button>
              ))}
            </div>
          </div>
          <div className="p-3 bg-background border border-border rounded-xl">
            <p className="text-2xs text-text-tertiary mb-1">Insight AI:</p>
            <p className="text-xs text-text-tertiary">{suggestion.insight}</p>
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-text-tertiary hover:text-text-primary">Annulla</button>
          <button onClick={save} disabled={saving || !title.trim() || !projectId}
            className="flex-1 py-2.5 bg-gold rounded-xl text-sm font-bold text-on-gold flex items-center justify-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crea Task
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Save note modal ──────────────────────────────────────────────────────────
function SaveNoteModal({ suggestion, projects, onClose }: {
  suggestion: Suggestion; projects: DeptProject[]; onClose: () => void
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [saving, setSaving]       = useState(false)
  const content = `**AI Insight — ${suggestion.title}**\n\n${suggestion.insight}\n\n**Azione consigliata:** ${suggestion.action}\n\n*Impatto stimato: ${suggestion.impact}*`

  const save = async () => {
    if (!projectId) return
    setSaving(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    const { error } = await sb.from('project_updates').insert({
      project_id: projectId,
      content,
      author_id: user?.id ?? null,
      type: 'nota',
    } as never)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Nota salvata nel progetto')
    onClose()
  }

  const inp = 'w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold'

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-bold text-text-primary">Salva come nota</h3>
          <button onClick={onClose} className="p-1.5 text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Progetto</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inp}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.client_name ?? '—'}</option>)}
            </select>
          </div>
          <div className="p-3 bg-background border border-border rounded-xl text-xs text-text-tertiary whitespace-pre-wrap leading-relaxed">
            {content}
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-text-tertiary hover:text-text-primary">Annulla</button>
          <button onClick={save} disabled={saving || !projectId}
            className="flex-1 py-2.5 bg-gold rounded-xl text-sm font-bold text-on-gold flex items-center justify-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salva Nota
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Action bar ───────────────────────────────────────────────────────────────
function SuggestionActions({ suggestion, projects }: { suggestion: Suggestion; projects: DeptProject[] }) {
  const [copied, setCopied]       = useState(false)
  const [createTask, setCreate]   = useState(false)
  const [saveNote, setSaveNote]   = useState(false)

  const text = `${suggestion.title}\n\n${suggestion.insight}\n\nAzione: ${suggestion.action}\nImpatto: ${suggestion.impact}`

  const copyText = () => {
    navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const exportPDF = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>${suggestion.title}</title><style>
      body{font-family:sans-serif;max-width:600px;margin:40px auto;color:#111;line-height:1.6}
      h1{font-size:20px;border-bottom:2px solid #F5C800;padding-bottom:8px}
      .cat{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px}
      .insight{background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0}
      .action{border-left:3px solid #F5C800;padding:12px 16px;background:#fffbea;border-radius:0 8px 8px 0}
      .impact{display:inline-block;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:bold;background:#fee;color:#c00}
      footer{margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:16px}
    </style></head><body>
    <div class="cat">${suggestion.category} — impatto ${suggestion.impact}</div>
    <h1>${suggestion.title}</h1>
    <div class="insight">${suggestion.insight}</div>
    <div class="action"><strong>↗ Azione consigliata</strong><br>${suggestion.action}</div>
    <br><span class="impact">Impatto ${suggestion.impact}</span>
    <footer>Generato da TwoBee AI Advisor — ${new Date().toLocaleDateString('it-IT')}</footer>
    </body></html>`)
    w.document.close()
    setTimeout(() => { w.print() }, 300)
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-border">
        <button onClick={copyText}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-bold border border-border rounded-lg text-text-tertiary hover:text-text-primary hover:border-border-strong transition-all">
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copiato' : 'Copia'}
        </button>
        <button onClick={() => setCreate(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-bold border border-border rounded-lg text-text-tertiary hover:text-gold-text hover:border-gold/40 transition-all">
          <Plus className="w-3 h-3" /> Crea Task
        </button>
        <button onClick={() => setSaveNote(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-bold border border-border rounded-lg text-text-tertiary hover:text-info hover:border-info/40 transition-all">
          <FileText className="w-3 h-3" /> Salva Nota
        </button>
        <button onClick={exportPDF}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-bold border border-border rounded-lg text-text-tertiary hover:text-accent hover:border-accent/40 transition-all">
          <Download className="w-3 h-3" /> Export PDF
        </button>
      </div>
      {createTask && <CreateTaskModal suggestion={suggestion} projects={projects} onClose={() => setCreate(false)} />}
      {saveNote   && <SaveNoteModal   suggestion={suggestion} projects={projects} onClose={() => setSaveNote(false)} />}
    </>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DeptAIAdvisorEnhanced({ dept, projects }: { dept: ProjectKind; projects: DeptProject[] }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [ran, setRan]                 = useState(false)
  const [focus, setFocus]             = useState<'tutto' | 'trend' | 'ottimizzazione' | 'opportunità' | 'idea'>('tutto')

  const analyze = async () => {
    setLoading(true); setError(null)
    try {
      const payload = {
        dept,
        projects: projects.map(p => ({
          name: p.name, status: p.status, project_type: p.project_type,
          client_name: p.client_name, client_mrr: p.client_mrr, client_risk: p.client_risk,
          task_count:  p.tasks.filter(t => !t.is_milestone && !t.parent_id).length,
          done_count:  p.tasks.filter(t => !t.is_milestone && !t.parent_id && t.status === 'completato').length,
          sprint_count: p.sprints.length,
          active_sprint: p.sprints.find(s => s.status === 'in_corso')?.name ?? null,
          overdue_tasks: p.tasks.filter(t => !t.is_milestone && t.due_date && t.due_date < new Date().toISOString().slice(0,10) && t.status !== 'completato').length,
        })),
      }
      const res = await fetch('/api/reparti/ai-suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Errore API')
      const data = await res.json()
      setSuggestions(data.suggestions ?? [])
      setRan(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto')
    } finally {
      setLoading(false)
    }
  }

  const visible = focus === 'tutto' ? suggestions : suggestions.filter(s => s.category === focus)

  const exportAll = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>AI Advisor Report — ${dept}</title><style>
      body{font-family:sans-serif;max-width:700px;margin:40px auto;color:#111;line-height:1.7}
      h1{font-size:24px;border-bottom:3px solid #F5C800;padding-bottom:12px}
      .card{border:1px solid #eee;border-radius:12px;padding:20px;margin:20px 0}
      .cat{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.1em}
      h2{font-size:16px;margin:8px 0}
      .insight{color:#444;margin:10px 0}
      .action{border-left:3px solid #F5C800;padding:10px 14px;background:#fffbea;border-radius:0 8px 8px 0;margin:10px 0}
      .impact{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:bold}
      .alto{background:#fee;color:#c00} .medio{background:#fffae0;color:#856400} .basso{background:#f5f5f5;color:#666}
      footer{margin-top:40px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:16px}
    </style></head><body>
    <h1>AI Advisor Report — Reparto ${dept.charAt(0).toUpperCase()+dept.slice(1)}</h1>
    <p style="color:#888;font-size:13px">${new Date().toLocaleDateString('it-IT')} · ${projects.length} progetti analizzati</p>
    ${suggestions.map(s => `
    <div class="card">
      <div class="cat">${s.category}</div>
      <h2>${s.title}</h2>
      <div class="insight">${s.insight}</div>
      <div class="action">↗ ${s.action}</div>
      <span class="impact ${s.impact}">Impatto ${s.impact}</span>
    </div>`).join('')}
    <footer>Generato da TwoBee AI Advisor — ${new Date().toLocaleString('it-IT')}</footer>
    </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-text-primary flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold-text" /> AI Advisor
          </h2>
          <p className="text-text-tertiary text-sm mt-0.5">Analisi reparto su dati DB + trend di settore</p>
        </div>
        <div className="flex items-center gap-2">
          {ran && (
            <button onClick={exportAll}
              className="flex items-center gap-1.5 px-3 py-2 border border-border text-xs font-bold text-text-tertiary hover:text-text-primary rounded-xl transition-all">
              <Download className="w-3.5 h-3.5" /> Export Report
            </button>
          )}
          <button onClick={analyze} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-xs font-black rounded-xl hover:bg-gold/90 disabled:opacity-50 transition-all">
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisi…</>
              : ran ? <><RefreshCw className="w-3.5 h-3.5" /> Rianalizza</>
              : <><Sparkles className="w-3.5 h-3.5" /> Analizza Reparto</>}
          </button>
        </div>
      </div>

      {/* filter tabs */}
      {ran && !loading && (
        <div className="flex gap-2 flex-wrap">
          {(['tutto', 'trend', 'ottimizzazione', 'opportunità', 'idea'] as const).map(f => {
            const cfg = f === 'tutto' ? null : CATEGORY_CONFIG[f]
            const count = f === 'tutto' ? suggestions.length : suggestions.filter(s => s.category === f).length
            return (
              <button key={f} onClick={() => setFocus(f)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-2xs font-bold rounded-full border transition-all capitalize ${
                  focus === f ? 'text-on-gold border-transparent' : 'text-text-tertiary border-border hover:border-border'
                }`}
                style={focus === f ? { background: cfg?.color ?? 'var(--color-gold-text)' } : {}}>
                {cfg?.icon} {f} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* empty state */}
      {!ran && !loading && (
        <div className="bg-background border border-border rounded-2xl p-10 flex flex-col items-center gap-5 text-center">
          <div className="text-5xl">{DEPT_EMOJI[dept]}</div>
          <div>
            <p className="text-text-primary font-bold mb-1">Pronto per l'analisi</p>
            <p className="text-text-tertiary text-sm max-w-sm">
              L'AI analizza {projects.length} progetti, le task scadute, gli sprint attivi e il risk score dei clienti — poi suggerisce azioni concrete.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
            {[
              { label: '📈 Trend di settore', desc: 'Novità e direzioni emergenti' },
              { label: '⚡ Ottimizzazioni', desc: 'Miglioramenti su progetti attivi' },
              { label: '🎯 Opportunità', desc: 'Upsell e nuove proposte' },
              { label: '💡 Idee brillanti', desc: 'Spunti creativi e innovativi' },
            ].map(i => (
              <div key={i.label} className="bg-background border border-border rounded-xl p-3 text-left">
                <p className="text-xs font-bold text-text-primary">{i.label}</p>
                <p className="text-2xs text-text-tertiary mt-0.5">{i.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-background border border-border rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-gold-text animate-spin" />
          <p className="text-text-primary font-bold">Analisi in corso…</p>
          <p className="text-text-tertiary text-sm">Elaboro i dati del reparto e i trend di mercato</p>
        </div>
      )}

      {error && (
        <div className="bg-error/10 border border-error/20 rounded-2xl p-4 text-center">
          <p className="text-error text-sm">{error}</p>
        </div>
      )}

      {ran && !loading && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((s, i) => {
            const cfg = CATEGORY_CONFIG[s.category] ?? CATEGORY_CONFIG.idea
            return (
              <div key={i} className="bg-background border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg" style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.icon}
                    </span>
                    <span className="text-2xs font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                  <span className={`text-2xs font-black px-2.5 py-1 rounded-full border ${IMPACT_STYLE[s.impact]}`}>
                    impatto {s.impact}
                  </span>
                </div>
                <h3 className="text-sm font-black text-text-primary mb-2">{s.title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed mb-3">{s.insight}</p>
                <div className="bg-background border border-border rounded-xl p-3">
                  <p className="text-2xs font-bold text-gold-text mb-1">↗ Azione consigliata</p>
                  <p className="text-xs text-text-tertiary">{s.action}</p>
                </div>
                <SuggestionActions suggestion={s} projects={projects} />
              </div>
            )
          })}
        </div>
      )}

      {ran && !loading && visible.length === 0 && (
        <div className="bg-background border border-border rounded-2xl p-8 text-center">
          <p className="text-text-tertiary text-sm">Nessun suggerimento per questa categoria.</p>
        </div>
      )}
    </div>
  )
}
