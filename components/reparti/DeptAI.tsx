'use client'

import { useState } from 'react'
import { Sparkles, Loader2, TrendingUp, Lightbulb, Zap, Target, RefreshCw } from 'lucide-react'
import type { ProjectKind } from '@/lib/types/database'

interface Project {
  name: string; status: string; project_type: string
  client_name: string | null; tasks: { status: string }[]
}

interface Suggestion {
  title: string
  category: 'trend' | 'ottimizzazione' | 'opportunità' | 'idea'
  insight: string
  action: string
  impact: 'alto' | 'medio' | 'basso'
}

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  trend:          { icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'var(--color-info)', bg: '#3B82F618' },
  ottimizzazione: { icon: <Zap className="w-3.5 h-3.5" />,        color: 'var(--color-warning)', bg: '#F59E0B18' },
  opportunità:    { icon: <Target className="w-3.5 h-3.5" />,     color: 'var(--color-success)', bg: '#22C55E18' },
  idea:           { icon: <Lightbulb className="w-3.5 h-3.5" />,  color: 'var(--color-accent)', bg: '#A855F718' },
}

const IMPACT_COLOR: Record<string, string> = {
  alto:  'text-error bg-error/10',
  medio: 'text-gold-text bg-gold/10',
  basso: 'text-text-tertiary bg-surface',
}

const DEPT_EMOJI: Record<ProjectKind, string> = {
  growth: '🌱', marketing: '📣', digital: '💻', ai: '🤖',
}

export function DeptAI({ dept, projects }: { dept: ProjectKind; projects: Project[] }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)

  const analyze = async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = {
        dept,
        projects: projects.map(p => ({
          name: p.name,
          status: p.status,
          project_type: p.project_type,
          client_name: p.client_name,
          task_count: p.tasks.length,
          done_count: p.tasks.filter(t => t.status === 'completato').length,
        })),
      }
      const res = await fetch('/api/reparti/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-text-primary flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold-text" />
            AI Advisor
          </h2>
          <p className="text-text-tertiary text-sm mt-0.5">
            Analisi intelligente del reparto — trend, ottimizzazioni e nuove opportunità
          </p>
        </div>
        <button
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-xs font-black rounded-xl hover:bg-gold/90 disabled:opacity-50 transition-all shrink-0">
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisi in corso…</>
            : ran
              ? <><RefreshCw className="w-3.5 h-3.5" /> Rianalizza</>
              : <><Sparkles className="w-3.5 h-3.5" /> Analizza Reparto</>
          }
        </button>
      </div>

      {!ran && !loading && (
        <div className="bg-background border border-border rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">{DEPT_EMOJI[dept]}</div>
          <div>
            <p className="text-text-primary font-bold mb-1">Pronto per l'analisi</p>
            <p className="text-text-tertiary text-sm max-w-sm">
              L'AI analizzerà i {projects.length} progetti del reparto e suggerirà
              ottimizzazioni, trend di settore e nuove opportunità.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
            {[
              { label: 'Trend di settore', desc: 'Novità e direzioni emergenti' },
              { label: 'Ottimizzazioni', desc: 'Miglioramenti sui progetti attivi' },
              { label: 'Opportunità', desc: 'Servizi e upsell potenziali' },
              { label: 'Idee brillanti', desc: 'Spunti creativi e innovativi' },
            ].map(item => (
              <div key={item.label} className="bg-background border border-border rounded-xl p-3 text-left">
                <p className="text-xs font-bold text-text-primary">{item.label}</p>
                <p className="text-2xs text-text-tertiary mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-background border border-border rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-gold-text animate-spin" />
          <p className="text-text-primary font-bold">Analisi in corso…</p>
          <p className="text-text-tertiary text-sm">Sto analizzando i progetti e i trend del settore</p>
        </div>
      )}

      {error && (
        <div className="bg-error/10 border border-error/20 rounded-2xl p-4 text-center">
          <p className="text-error text-sm">{error}</p>
        </div>
      )}

      {ran && !loading && suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((s, i) => {
            const cfg = CATEGORY_CONFIG[s.category] ?? CATEGORY_CONFIG['idea']
            return (
              <div key={i} className="bg-background border border-border rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg" style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.icon}
                    </span>
                    <span className="text-2xs font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
                      {s.category}
                    </span>
                  </div>
                  <span className={`text-2xs font-black px-2 py-0.5 rounded-full ${IMPACT_COLOR[s.impact] ?? IMPACT_COLOR['basso']}`}>
                    impatto {s.impact}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-black text-text-primary mb-1">{s.title}</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">{s.insight}</p>
                </div>

                <div className="bg-background border border-border rounded-xl p-3">
                  <p className="text-2xs font-bold text-gold-text mb-1">↗ Azione consigliata</p>
                  <p className="text-xs text-text-tertiary">{s.action}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ran && !loading && suggestions.length === 0 && (
        <div className="bg-background border border-border rounded-2xl p-8 text-center">
          <p className="text-text-tertiary text-sm">Nessun suggerimento generato. Riprova.</p>
        </div>
      )}
    </div>
  )
}
