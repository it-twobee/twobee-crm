'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ChevronRight, Sparkles } from 'lucide-react'
import type { Client } from '@/lib/types/database'

interface Props {
  clients: Client[]
  totalMrr: number
}

interface Insight {
  id: string
  type: 'warning' | 'risk' | 'opportunity' | 'positive'
  title: string
  detail: string
  href?: string
  confidence: number   // 0-100
}

function generateInsights(clients: Client[], totalMrr: number): Insight[] {
  const insights: Insight[] = []

  // ── Clienti ad alto rischio AI ───────────────────────────────
  const highRisk = clients.filter(c => (c.risk_score ?? 0) >= 60 && c.client_label !== 'perso')
  if (highRisk.length > 0) {
    const mrrAtRisk = highRisk.reduce((s, c) => s + c.mrr, 0)
    insights.push({
      id: 'high-risk',
      type: 'risk',
      title: `${highRisk.length} client${highRisk.length > 1 ? 'i' : 'e'} ad alto rischio`,
      detail: `€${mrrAtRisk.toLocaleString('it-IT')} MRR potenzialmente a rischio. ${highRisk[0].company_name}${highRisk.length > 1 ? ` e altri ${highRisk.length - 1}` : ''} mostrano segnali critici.`,
      href: '/clienti',
      confidence: 85,
    })
  }

  // ── Trend risk in peggioramento ──────────────────────────────
  const worsening = clients.filter(c => c.risk_trend === 'peggiora' && (c.risk_score ?? 0) >= 30)
  if (worsening.length >= 2) {
    insights.push({
      id: 'worsening',
      type: 'warning',
      title: `${worsening.length} clienti in deterioramento`,
      detail: `Il rischio sta aumentando per ${worsening.slice(0, 2).map(c => c.company_name).join(', ')}${worsening.length > 2 ? ` e altri ${worsening.length - 2}` : ''}. Intervieni prima che diventino critici.`,
      href: '/clienti',
      confidence: 78,
    })
  }

  // ── Contratti in scadenza ────────────────────────────────────
  const expiring = clients.filter(c => {
    const days = Math.round((new Date(c.contract_end).getTime() - Date.now()) / 86400000)
    return days > 0 && days < 45 && c.client_label !== 'perso'
  })
  if (expiring.length > 0) {
    const expiringMrr = expiring.reduce((s, c) => s + c.mrr, 0)
    insights.push({
      id: 'expiring',
      type: 'warning',
      title: `${expiring.length} contratt${expiring.length > 1 ? 'i' : 'o'} in scadenza (45gg)`,
      detail: `Rinnova in anticipo: ${expiring[0].company_name}${expiring.length > 1 ? ` e altri ${expiring.length - 1}` : ''}. Rappresentano €${expiringMrr.toLocaleString('it-IT')}/mese.`,
      href: '/clienti',
      confidence: 95,
    })
  }

  // ── Opportunità: clienti in miglioramento ────────────────────
  const improving = clients.filter(c => c.risk_trend === 'migliora' && (c.risk_score ?? 0) < 30)
  if (improving.length >= 2) {
    insights.push({
      id: 'improving',
      type: 'positive',
      title: `${improving.length} clienti in salute migliorata`,
      detail: `Il profilo di rischio è in calo per ${improving.slice(0, 2).map(c => c.company_name).join(', ')}. Ottimo momento per proposte di upsell.`,
      href: '/clienti',
      confidence: 72,
    })
  }

  // ── Concentrazione MRR pericolosa ────────────────────────────
  const top3Mrr = clients.sort((a, b) => b.mrr - a.mrr).slice(0, 3).reduce((s, c) => s + c.mrr, 0)
  const concentration = totalMrr > 0 ? (top3Mrr / totalMrr) * 100 : 0
  if (concentration > 60) {
    insights.push({
      id: 'concentration',
      type: 'warning',
      title: `MRR concentrato: top 3 clienti = ${Math.round(concentration)}%`,
      detail: `Alta dipendenza dai clienti principali. Perdere anche solo uno impatta significativamente il fatturato.`,
      href: '/clienti',
      confidence: 90,
    })
  }

  // ── Clienti senza KPI aggiornato ────────────────────────────
  const noKpi = clients.filter(c => c.risk_factors?.kpi?.msg?.includes('nessun KPI'))
  if (noKpi.length > 0) {
    insights.push({
      id: 'no-kpi',
      type: 'opportunity',
      title: `${noKpi.length} client${noKpi.length > 1 ? 'i' : 'e'} senza KPI recenti`,
      detail: `Aggiorna i dati di performance per ${noKpi[0].company_name}${noKpi.length > 1 ? ` e altri ${noKpi.length - 1}` : ''} per una valutazione accurata.`,
      href: '/report',
      confidence: 70,
    })
  }

  // Massimo 4 insight, i più rilevanti
  return insights.slice(0, 4)
}

const insightConfig = {
  risk:        { icon: AlertTriangle,  color: 'text-error',   bg: 'bg-error/5 border-error/15' },
  warning:     { icon: TrendingDown,   color: 'text-warning',  bg: 'bg-warning/5 border-warning/15' },
  opportunity: { icon: TrendingUp,     color: 'text-blue-400', bg: 'bg-blue-500/5 border-blue-500/15' },
  positive:    { icon: CheckCircle2,   color: 'text-success',  bg: 'bg-success/5 border-success/15' },
}

export function SmartInsights({ clients, totalMrr }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const insights = generateInsights(clients, totalMrr).filter(i => !dismissed.has(i.id))

  if (insights.length === 0) {
    return (
      <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-success" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Tutto sotto controllo</p>
          <p className="text-xs text-text-secondary">Nessun segnale critico rilevato dall'AI</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-[#2A2A2A] rounded-xl overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2A2A2A]">
        <div className="w-5 h-5 rounded bg-gold/10 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-gold" />
        </div>
        <span className="text-xs font-bold text-white uppercase tracking-wider">AI Insights</span>
        <span className="text-[10px] text-text-secondary ml-auto">aggiornati in tempo reale</span>
      </div>

      <div className="divide-y divide-[#1E1E1E] flex-1 overflow-auto">
        {insights.map(insight => {
          const cfg = insightConfig[insight.type]
          const Icon = cfg.icon
          return (
            <div key={insight.id} className={`flex items-start gap-3 p-3.5 hover:bg-white/2 transition-colors`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg} border`}>
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white">{insight.title}</p>
                <p className="text-[10px] text-text-secondary mt-0.5 leading-relaxed">{insight.detail}</p>
                <div className="flex items-center gap-3 mt-2">
                  {/* Confidence bar */}
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1 bg-[#2A2A2A] rounded-full overflow-hidden">
                      <div className="h-full bg-gold/60 rounded-full" style={{ width: `${insight.confidence}%` }} />
                    </div>
                    <span className="text-[9px] text-[#555]">{insight.confidence}% conf.</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {insight.href && (
                  <Link href={insight.href} className="p-1 text-text-secondary hover:text-gold transition-colors">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                )}
                <button onClick={() => setDismissed(p => { const n = new Set(p); n.add(insight.id); return n })}
                  className="p-1 text-[#333] hover:text-text-secondary transition-colors text-[10px]">✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
