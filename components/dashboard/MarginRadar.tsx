'use client'
import { useMemo } from 'react'
import type { Client } from '@/lib/types/database'
import { formatCurrency } from '@/lib/utils'

/**
 * Mix di MRR per linea di servizio e margine stimato per cliente.
 *
 * Il mix NON si legge più da `clients.client_type`: quel campo ha tre soli valori
 * e un cliente `growth_digital` finiva tutto in "G+D", non scomponibile. Ora
 * arriva da `mrrByLine`, calcolato sugli accordi economici reali — dove un
 * cliente con canone Growth + Social Media Management contribuisce a due linee
 * con gli importi giusti.
 */

const MARGIN_BY_PACKAGE: Record<string, number> = {
  'Worker Bee Start': 75,
  'Worker Bee Basic': 70,
  'Hive Basic': 65,
  'Hive Custom': 60,
  'Royal Queen': 55,
  'IT Digital Partner': 50,
  'Partner Quota': 45,
}

const LINE_LABEL: Record<string, string> = {
  growth: 'Growth', digital: 'Digital', marketing: 'Marketing',
  ai: 'AI', hybrid: 'Hybrid', consulting: 'Consulting', other: 'Altro',
}

const LINE_COLOR: Record<string, string> = {
  growth: 'var(--color-gold-text)',
  digital: 'var(--color-info)',
  marketing: 'var(--color-accent)',
  ai: 'var(--color-warning)',
  hybrid: 'var(--color-text-secondary)',
  consulting: 'var(--color-text-secondary)',
  other: 'var(--color-text-tertiary)',
}

interface Props {
  clients: Client[]
  /** MRR per linea dagli accordi reali. Assente finché la 123 non è applicata. */
  mrrByLine?: Record<string, number> | null
  /** Linee attive per cliente, per colorare la barra. */
  linesByClient?: Record<string, string[]> | null
}

export function MarginRadar({ clients, mrrByLine, linesByClient }: Props) {
  // Un cliente con MRR 0 è cessato o senza accordi: la derivazione lo dice già,
  // quindi non serve più filtrare su client_label.
  const sorted = useMemo(() =>
    [...clients]
      .filter(c => !c.is_internal && (c.mrr ?? 0) > 0)
      .sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0))
      .slice(0, 12)
  , [clients])

  const totalMrr = sorted.reduce((s, c) => s + (c.mrr ?? 0), 0)
  const totalMargin = sorted.reduce((s, c) => {
    const pct = MARGIN_BY_PACKAGE[c.package] ?? 60
    return s + (c.mrr ?? 0) * pct / 100
  }, 0)
  const avgMarginPct = totalMrr > 0 ? Math.round(totalMargin / totalMrr * 100) : 0
  const maxMrr = sorted[0]?.mrr ?? 1

  const lineEntries = Object.entries(mrrByLine ?? {})
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))

  const colorOf = (c: Client): string => {
    const lines = linesByClient?.[c.id]
    if (lines && lines.length > 0) return LINE_COLOR[lines[0]] ?? LINE_COLOR.other
    return LINE_COLOR.growth
  }

  return (
    <div className="p-3 h-full overflow-auto flex flex-col gap-3">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        {[
          { label: 'MRR Totale',   value: formatCurrency(totalMrr),   color: 'var(--color-gold-text)' },
          { label: 'Margine est.', value: formatCurrency(totalMargin), color: 'var(--color-success)' },
          { label: '% media',      value: `${avgMarginPct}%`,          color: 'var(--color-info)' },
        ].map(k => (
          <div key={k.label} className="rounded-lg p-2.5 bg-surface border border-border">
            <p className="text-2xs font-bold uppercase tracking-widest mb-1 text-text-tertiary">{k.label}</p>
            <p className="text-sm font-black leading-none" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Mix per linea di servizio — dagli accordi, non da client_type */}
      {lineEntries.length > 0 ? (
        <div className="flex flex-wrap gap-2 shrink-0">
          {lineEntries.map(([line, value]) => (
            <div key={line} className="rounded-lg px-2.5 py-1.5 text-center bg-background border border-border flex-1 min-w-[80px]">
              <p className="text-2xs font-bold uppercase text-text-tertiary">{LINE_LABEL[line] ?? line}</p>
              <p className="text-2xs font-bold" style={{ color: LINE_COLOR[line] ?? LINE_COLOR.other }}>
                {formatCurrency(Number(value))}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-2xs text-text-tertiary shrink-0">
          Mix per linea non disponibile: nessun accordo economico ricorrente attivo.
        </p>
      )}

      {/* Barre per cliente */}
      <div className="space-y-1.5 flex-1">
        {sorted.map(c => {
          const pct = MARGIN_BY_PACKAGE[c.package] ?? 60
          const mrr = c.mrr ?? 0
          const barW = maxMrr > 0 ? (mrr / maxMrr) * 100 : 0
          const color = colorOf(c)
          return (
            <div key={c.id} className="flex items-center gap-2">
              <p className="w-[90px] text-2xs font-semibold truncate shrink-0 text-text-secondary">
                {c.company_name}
              </p>
              <div className="flex-1 relative h-5 rounded-sm overflow-hidden bg-background">
                <div className="absolute inset-y-0 left-0" style={{
                  width: `${barW}%`,
                  background: `color-mix(in srgb, ${color} 9%, transparent)`,
                  borderRight: `2px solid color-mix(in srgb, ${color} 33%, transparent)`,
                }} />
                <div className="absolute inset-y-0 left-0" style={{
                  width: `${barW * pct / 100}%`,
                  background: `color-mix(in srgb, ${color} 21%, transparent)`,
                }} />
              </div>
              <div className="w-[72px] shrink-0 text-right">
                <p className="text-2xs font-bold text-text-secondary">{formatCurrency(mrr)}</p>
                <p className="text-2xs" style={{ color }}>{pct}%</p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-2xs text-center shrink-0 text-text-tertiary">
        % margine stimato per package · costi reali non ancora tracciati
      </p>
    </div>
  )
}
