'use client'

import { Megaphone, TrendingUp, Cpu } from 'lucide-react'
import { StepHead } from '@/components/shared/formkit'
import { AREAS, type ProjectArea } from './types'

const ICON: Record<string, React.ReactNode> = {
  marketing: <Megaphone className="w-5 h-5" />,
  growth: <TrendingUp className="w-5 h-5" />,
  digital: <Cpu className="w-5 h-5" />,
}
const TONE: Record<string, string> = {
  marketing: 'text-accent', growth: 'text-gold-text', digital: 'text-info',
}

export function StepArea({
  value, onChange, counts,
}: { value: ProjectArea | ''; onChange: (a: ProjectArea) => void; counts: Record<string, number> }) {
  return (
    <div>
      <StepHead title="In quale area ricade?" hint="Determina i workstream disponibili al passo successivo." />
      <div className="grid gap-3 sm:grid-cols-3">
        {AREAS.map(a => (
          <button key={a.key} type="button" onClick={() => onChange(a.key)} aria-pressed={value === a.key}
            className={`text-left p-4 rounded-2xl border transition-colors ${
              value === a.key ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
            }`}>
            <span className={`inline-flex w-10 h-10 rounded-xl bg-surface-active items-center justify-center mb-3 ${TONE[a.key]}`}>
              {ICON[a.key]}
            </span>
            <div className="text-sm font-bold text-text-primary">{a.label}</div>
            <div className="text-2xs text-text-tertiary mt-1 leading-snug">{a.hint}</div>
            <div className="text-2xs text-text-secondary mt-2 tabular">
              {counts[a.key] ?? 0} workstream a catalogo
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
