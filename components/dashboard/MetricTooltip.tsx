'use client'

import { useState, useId } from 'react'
import { Info } from 'lucide-react'

/**
 * Spiegazione di una metrica economica: formula, periodo, fonte, aggiornamento.
 *
 * Sta accanto al numero e non in un documento perché una formula scritta altrove
 * smette di essere letta. Requisito §7 e §20.19 del brief.
 */

export interface MetricExplain {
  formula: string
  period: string
  source: string
  updatedAt?: string | null
  note?: string
}

export function MetricTooltip({ label, explain }: { label: string; explain: MetricExplain }) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`Come si calcola: ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(v => !v)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-text-tertiary hover:text-text-secondary transition-colors p-0.5 rounded"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-6 z-50 w-72 rounded-xl border border-border bg-surface p-3 shadow-lg text-left"
        >
          <span className="block text-2xs font-bold text-text-primary mb-2">{label}</span>

          <span className="block text-2xs text-text-tertiary">Formula</span>
          <span className="block text-2xs text-text-secondary font-mono leading-relaxed mb-2 break-words">
            {explain.formula}
          </span>

          <span className="block text-2xs text-text-tertiary">Periodo</span>
          <span className="block text-2xs text-text-secondary mb-2">{explain.period}</span>

          <span className="block text-2xs text-text-tertiary">Fonte</span>
          <span className="block text-2xs text-text-secondary font-mono mb-2">{explain.source}</span>

          {explain.note && (
            <span className="block text-2xs text-warning mb-2">{explain.note}</span>
          )}

          {explain.updatedAt && (
            <span className="block text-2xs text-text-tertiary">
              Aggiornato: {new Date(explain.updatedAt).toLocaleString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
