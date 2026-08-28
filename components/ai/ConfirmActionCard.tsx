'use client'

import { AlertTriangle, Check, Loader2, X } from 'lucide-react'

interface Props {
  summary: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmActionCard({ summary, busy, onConfirm, onCancel }: Props) {
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning-dim p-3 mt-2">
      <div className="flex gap-2 items-start">
        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-2xs text-text-primary leading-relaxed flex-1">{summary}</p>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-2xs font-semibold px-3 py-1.5 rounded-xl bg-gold text-on-gold disabled:opacity-50 transition-opacity"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Check className="w-3 h-3" aria-hidden="true" />}
          Conferma
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-2xs font-semibold px-3 py-1.5 rounded-xl border border-border bg-surface text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
        >
          <X className="w-3 h-3" aria-hidden="true" />
          Annulla
        </button>
      </div>
    </div>
  )
}
