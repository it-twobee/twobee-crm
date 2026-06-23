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
  trend:          { icon: <TrendingUp className="w-3.5 h-3.5" />, color: '#3B82F6', bg: '#3B82F618' },
  ottimizzazione: { icon: <Zap className="w-3.5 h-3.5" />,        color: '#F59E0B', bg: '#F59E0B18' },
  opportunità:    { icon: <Target className="w-3.5 h-3.5" />,     color: '#22C55E', bg: '#22C55E18' },
  idea:           { icon: <Lightbulb className="w-3.5 h-3.5" />,  color: '#A855F7', bg: '#A855F718' },
}

const IMPACT_COLOR: Record<string, string> = {
  alto:  'text-red-400 bg-red-400/10',
  medio: 'text-yellow-400 bg-yellow-400/10',
  basso: 'text-[#444] bg-[#1A1A1A]',
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
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#F5C800]" />
            AI Advisor
          </h2>
          <p className="text-[#444] text-sm mt-0.5">
            Analisi intelligente del reparto — trend, ottimizzazioni e nuove opportunità
          </p>
        </div>
        <button
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#F5C800] text-black text-xs font-black rounded-xl hover:bg-yellow-400 disabled:opacity-50 transition-all shrink-0">
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisi in corso…</>
            : ran
              ? <><RefreshCw className="w-3.5 h-3.5" /> Rianalizza</>
              : <><Sparkles className="w-3.5 h-3.5" /> Analizza Reparto</>
          }
        </button>
      </div>

      {!ran && !loading && (
        <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">{DEPT_EMOJI[dept]}</div>
          <div>
            <p className="text-white font-bold mb-1">Pronto per l'analisi</p>
            <p className="text-[#444] text-sm max-w-sm">
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
              <div key={item.label} className="bg-[#111] border border-[#1A1A1A] rounded-xl p-3 text-left">
                <p className="text-xs font-bold text-white">{item.label}</p>
                <p className="text-[10px] text-[#333] mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-[#F5C800] animate-spin" />
          <p className="text-white font-bold">Analisi in corso…</p>
          <p className="text-[#444] text-sm">Sto analizzando i progetti e i trend del settore</p>
        </div>
      )}

      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded-2xl p-4 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {ran && !loading && suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((s, i) => {
            const cfg = CATEGORY_CONFIG[s.category] ?? CATEGORY_CONFIG['idea']
            return (
              <div key={i} className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg" style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.icon}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
                      {s.category}
                    </span>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${IMPACT_COLOR[s.impact] ?? IMPACT_COLOR['basso']}`}>
                    impatto {s.impact}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-black text-white mb-1">{s.title}</h3>
                  <p className="text-xs text-[#888] leading-relaxed">{s.insight}</p>
                </div>

                <div className="bg-[#111] border border-[#1A1A1A] rounded-xl p-3">
                  <p className="text-[10px] font-bold text-[#F5C800] mb-1">↗ Azione consigliata</p>
                  <p className="text-xs text-[#666]">{s.action}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ran && !loading && suggestions.length === 0 && (
        <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-8 text-center">
          <p className="text-[#444] text-sm">Nessun suggerimento generato. Riprova.</p>
        </div>
      )}
    </div>
  )
}
