'use client'

import { useState } from 'react'
import { Sparkles, ChevronDown, ArrowRight } from 'lucide-react'
import { CHANGE_KINDS, type ChangeKind } from '@/lib/os-version'
import type { OsVersion, OsVersionChange } from '@/lib/types/database'

const KIND_STYLE: Record<ChangeKind, string> = {
  novita:        'bg-accent/15 text-accent border-accent/30',
  miglioramento: 'bg-info/15 text-info border-info/30',
  correzione:    'bg-warning-dim text-warning border-warning/30',
  rimozione:     'bg-surface-active text-text-secondary border-border',
  sicurezza:     'bg-gold-dim text-gold-text border-gold/30',
}

/**
 * Le novità dell'ultima versione pubblicata, in sola lettura.
 * Il changelog lo scrive l'admin: qui il team lo legge, e sa cosa è cambiato
 * nel tool senza doverlo scoprire sbattendoci contro.
 */
export function VersionNews({ version, changes }: {
  version: OsVersion
  changes: OsVersionChange[]
}) {
  const [open, setOpen] = useState(false)
  const sorted = [...changes].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <section className="border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface-hover transition-colors text-left">
        <Sparkles className="w-4 h-4 text-gold-text shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary">
            Novità del tool · <span className="text-gold-text tabular">v{version.version}</span> {version.title}
          </p>
          <p className="text-2xs text-text-tertiary">
            {version.released_at && new Date(version.released_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
            {sorted.length > 0 && ` · ${sorted.length} voc${sorted.length === 1 ? 'e' : 'i'}`}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-2.5 bg-background">
          {version.summary && <p className="text-xs text-text-secondary leading-relaxed">{version.summary}</p>}
          {sorted.map(c => (
            <div key={c.id} className="border border-border rounded-xl p-3 bg-surface">
              <div className="flex items-start gap-2 flex-wrap">
                <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border ${KIND_STYLE[c.kind]}`}>
                  {CHANGE_KINDS.find(k => k.key === c.kind)?.label ?? c.kind}
                </span>
                <span className="text-2xs text-text-secondary bg-background border border-border px-1.5 py-0.5 rounded">{c.area}</span>
                <p className="text-sm font-semibold text-text-primary flex-1 min-w-[200px]">{c.title}</p>
              </div>
              {c.detail && <p className="text-xs text-text-secondary mt-1.5">{c.detail}</p>}
              {(c.before_text || c.after_text) && (
                <p className="flex items-center gap-2 flex-wrap text-2xs mt-2">
                  <span className="text-text-tertiary">{c.before_text ?? '—'}</span>
                  <ArrowRight className="w-3 h-3 text-text-tertiary shrink-0" aria-hidden="true" />
                  <span className="text-text-primary font-medium">{c.after_text ?? '—'}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
