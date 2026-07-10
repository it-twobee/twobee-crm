'use client'

import { Target, TrendingUp, AlertTriangle, XCircle } from 'lucide-react'
import type { Objective } from '@/lib/types/database'

interface Props { objectives: Objective[] }

function statusFromProgress(progress: number, status: string) {
  if (status === 'completato') return 'completato'
  if (status === 'abbandonato') return 'abbandonato'
  if (progress >= 70) return 'on_track'
  if (progress >= 35) return 'at_risk'
  return 'off_track'
}

const STATUS_CONFIG = {
  on_track:    { label: 'On track',    color: 'var(--color-success)', Icon: TrendingUp   },
  at_risk:     { label: 'At risk',     color: 'var(--color-warning)', Icon: AlertTriangle },
  off_track:   { label: 'Off track',   color: 'var(--color-error)', Icon: XCircle      },
  completato:  { label: 'Completato',  color: 'var(--color-info)', Icon: TrendingUp   },
  abbandonato: { label: 'Abbandonato', color: '#555',    Icon: XCircle      },
} as const

export function StrategicObjectives({ objectives }: Props) {
  const active = objectives.filter(o => o.status !== 'abbandonato')
  const avgProgress = active.length
    ? Math.round(active.reduce((s, o) => s + o.progress, 0) / active.length)
    : 0

  const onTrack  = active.filter(o => statusFromProgress(o.progress, o.status) === 'on_track' || o.status === 'completato').length
  const atRisk   = active.filter(o => statusFromProgress(o.progress, o.status) === 'at_risk').length
  const offTrack = active.filter(o => statusFromProgress(o.progress, o.status) === 'off_track').length

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border">
        <Target className="w-4 h-4 text-gold-text" />
        <span className="text-xs font-black text-text-primary uppercase tracking-widest">OKR Aziendali</span>
        <span className="ml-auto text-2xs text-text-tertiary font-mono">{avgProgress}% avg</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Summary pills */}
        <div className="flex gap-2 px-3 pt-3 pb-2">
          {[
            { label: 'On track',  count: onTrack,  color: 'var(--color-success)' },
            { label: 'At risk',   count: atRisk,   color: 'var(--color-warning)' },
            { label: 'Off track', count: offTrack, color: 'var(--color-error)' },
          ].map(s => (
            <div key={s.label}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-2xs font-bold"
              style={{ borderColor: `color-mix(in srgb, ${s.color} 19%, transparent)`, background: `color-mix(in srgb, ${s.color} 6%, transparent)`, color: s.color }}>
              <span className="text-base leading-none font-black">{s.count}</span>
              <span className="text-2xs font-medium opacity-80">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Objectives list */}
        <div className="px-3 pb-4 space-y-2">
          {objectives.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2 bg-surface rounded-xl border border-border">
              <Target className="w-6 h-6 text-text-tertiary" />
              <p className="text-2xs text-text-tertiary">Nessun obiettivo trovato</p>
            </div>
          ) : objectives.map(obj => {
            const key = statusFromProgress(obj.progress, obj.status)
            const cfg = STATUS_CONFIG[key]
            return (
              <div key={obj.id}
                className="bg-surface rounded-xl p-3 border border-border">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs font-bold text-text-primary leading-snug truncate">{obj.title}</p>
                    {obj.area && (
                      <p className="text-2xs text-text-tertiary mt-0.5">{obj.area} · {obj.quarter}</p>
                    )}
                  </div>
                  <span className="flex items-center gap-1 shrink-0 text-2xs font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `color-mix(in srgb, ${cfg.color} 8%, transparent)`, color: cfg.color }}>
                    <cfg.Icon className="w-2.5 h-2.5" />
                    {cfg.label}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(obj.progress, 100)}%`, background: cfg.color }} />
                  </div>
                  <span className="text-2xs font-black shrink-0" style={{ color: cfg.color }}>
                    {obj.progress}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
