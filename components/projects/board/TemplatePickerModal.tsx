'use client'

import { useState } from 'react'
import { Zap, X, Flag, Sparkles } from 'lucide-react'
import type { AiPlanSprint } from '../AiPlanBuilder'
import { PLAN_TEMPLATES } from './planTemplates'
import { PRIORITY_COLORS } from './types'

// ─── Template picker modal ─────────────────────────────────────────────────────
export function TemplatePickerModal({ onClose, onSelect, projectType, accent }: {
  onClose: () => void; onSelect: (plan: AiPlanSprint[], label: string) => void
  projectType?: string | null; accent: string
}) {
  const suggested = projectType && PLAN_TEMPLATES[projectType] ? projectType : null
  const [sel, setSel] = useState<string>(suggested ?? 'custom')
  const tmpl = PLAN_TEMPLATES[sel]
  const tot  = tmpl.plan.reduce((a, s) => a + s.milestones.reduce((b, m) => b + m.tasks.length + 1, 0) + 1, 0)

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border shrink-0">
          <Zap className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-text-primary">Scegli un template</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">Piano predefinito + brief AI generato automaticamente</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden min-h-0">
          {/* Template list */}
          <div className="sm:w-60 shrink-0 border-b sm:border-b-0 sm:border-r border-border overflow-y-auto bg-background">
            <div className="p-2 space-y-0.5">
              {Object.entries(PLAN_TEMPLATES).map(([key, t]) => (
                <button key={key} onClick={() => setSel(key)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                    sel === key
                      ? 'bg-background border border-border shadow-sm'
                      : 'hover:bg-background border border-transparent'
                  }`}>
                  <span className="text-2xl shrink-0">{t.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-bold ${sel === key ? 'text-text-primary' : 'text-text-tertiary'}`}>{t.label}</p>
                      {key === suggested && (
                        <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: `color-mix(in srgb, ${accent} 13%, transparent)`, color: accent }}>✓ suggerito</span>
                      )}
                    </div>
                    <p className="text-2xs text-text-tertiary mt-0.5 leading-tight">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview piano */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{tmpl.emoji}</span>
              <div>
                <p className="text-sm font-bold text-text-primary">{tmpl.label}</p>
                <p className="text-2xs text-text-tertiary">{tmpl.plan.length} sprint · {tot - tmpl.plan.length} elementi</p>
              </div>
            </div>
            <div className="space-y-2">
              {tmpl.plan.map((s, si) => (
                <div key={si} className="border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-background">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-2xs font-black shrink-0"
                      style={{ background: `color-mix(in srgb, ${accent} 13%, transparent)`, color: accent }}>{si + 1}</div>
                    <span className="text-xs font-bold text-text-primary flex-1">{s.name}</span>
                    <span className="text-2xs text-text-tertiary font-medium">{s.duration_weeks} sett.</span>
                  </div>
                  <div className="divide-y divide-border">
                    {s.milestones.map((m, mi) => (
                      <div key={mi} className="px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Flag className="w-3 h-3 shrink-0" style={{ color: accent, opacity: 0.6 }} />
                          <span className="text-xs font-semibold text-text-tertiary">{m.title}</span>
                          <span className="text-2xs px-1.5 py-0.5 rounded-full ml-auto"
                            style={{ background: `color-mix(in srgb, ${accent} 6%, transparent)`, color: accent }}>{m.tasks.length}</span>
                        </div>
                        <div className="pl-4 space-y-1">
                          {m.tasks.map((t, ti) => (
                            <div key={ti} className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[t.priority] ?? 'var(--color-border)' }} />
                              <span className="text-2xs text-text-tertiary">{t.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 border border-border rounded-xl text-sm text-text-tertiary hover:text-text-primary transition-colors">
            Annulla
          </button>
          <button onClick={() => onSelect(tmpl.plan, tmpl.label)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-on-gold transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: accent }}>
            <Sparkles className="w-3.5 h-3.5" />
            Usa {tmpl.label} · {tot} elementi
          </button>
        </div>
      </div>
    </div>
  )
}
