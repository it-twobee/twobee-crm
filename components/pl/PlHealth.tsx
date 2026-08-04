'use client'

import { useState } from 'react'
import { AlertTriangle, AlertOctagon, CheckCircle2, ChevronDown, Stethoscope } from 'lucide-react'
import { healthScore, type Finding, type Severity } from '@/lib/pl-health'

const TONE: Record<Severity, { chip: string; icon: React.ReactNode; ring: string }> = {
  critico: {
    chip: 'bg-error-dim border-error/40 text-error',
    icon: <AlertOctagon className="w-4 h-4 text-error" />,
    ring: 'var(--color-error)',
  },
  attenzione: {
    chip: 'bg-warning-dim border-warning/40 text-warning',
    icon: <AlertTriangle className="w-4 h-4 text-warning" />,
    ring: 'var(--color-warning)',
  },
  buono: {
    chip: 'bg-success-dim border-success/40 text-success',
    icon: <CheckCircle2 className="w-4 h-4 text-success" />,
    ring: 'var(--color-success)',
  },
}

/**
 * La diagnosi in testa alla pagina: un voto, e sotto solo le cose su cui si può
 * fare qualcosa. Le note positive stanno chiuse: servono a confermare, non a
 * occupare spazio.
 *
 * Nasce **chiusa**. La riga da sola dice già quello che serve — il voto e quante
 * cose ci sono da guardare — e chi apre la pagina nove volte su dieci sta cercando
 * i numeri del mese, non la lista dei difetti: aperta li spingeva sotto la piega
 * ogni volta. Si apre quando la si vuole.
 */
export function PlHealth({ findings }: { findings: Finding[] }) {
  const [open, setOpen] = useState(false)
  const score = healthScore(findings)
  const tone = TONE[score.severity]
  const actionable = findings.filter(f => f.severity !== 'buono')
  const good = findings.filter(f => f.severity === 'buono')

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-hover transition-colors">
        {/* il voto come anello: si legge prima del testo */}
        <span className="relative w-11 h-11 shrink-0 grid place-items-center">
          <span className="absolute inset-0 rounded-full"
            style={{ background: `conic-gradient(${tone.ring} ${score.score * 3.6}deg, var(--color-surface-active) 0)` }} />
          <span className="absolute inset-[3px] rounded-full bg-surface" />
          <span className="relative text-2xs font-bold text-text-primary tabular">{score.score}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <Stethoscope className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
            <span className="text-sm font-bold text-text-primary">{score.label}</span>
          </span>
          <span className="block text-2xs text-text-tertiary mt-0.5">
            {actionable.length === 0
              ? 'Nessun intervento necessario su questo periodo'
              : `${actionable.length} cos${actionable.length > 1 ? 'e' : 'a'} da guardare`}
            {good.length > 0 && ` · ${good.length} in ordine`}
          </span>
        </span>

        <ChevronDown className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-2">
          {findings.length === 0 && (
            <p className="text-2xs text-text-tertiary">Nessuna segnalazione.</p>
          )}
          {[...actionable, ...good].map(f => (
            <div key={f.id} className="flex items-start gap-2.5 p-3 rounded-xl border border-border">
              <span className="shrink-0 mt-0.5">{TONE[f.severity].icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-text-primary">{f.title}</p>
                  {f.metric && (
                    <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full border tabular ${TONE[f.severity].chip}`}>
                      {f.metric}
                    </span>
                  )}
                </div>
                <p className="text-2xs text-text-secondary mt-0.5">{f.detail}</p>
                {f.action && (
                  <p className="text-2xs text-gold-text mt-1 font-semibold">{f.action}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
