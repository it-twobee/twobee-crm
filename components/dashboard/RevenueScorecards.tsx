'use client'

import { formatCurrency } from '@/lib/utils'
import { MetricTooltip, type MetricExplain } from './MetricTooltip'
import type { AdminRevenueScorecards } from '@/lib/types/database'

/**
 * Le otto scorecard economiche dell'Admin (§7 del brief).
 *
 * Sostituiscono la singola card "MRR", che mescolava Growth ricorrente e
 * qualunque altra cosa avesse un numero in `clients.mrr`.
 *
 * Ogni numero arriva dalla RPC `admin_revenue_scorecards`: qui non si calcola
 * nulla, si disegna soltanto. Le formule nei tooltip descrivono quella RPC.
 */

const LINE_LABEL: Record<string, string> = {
  growth: 'Growth', digital: 'Digital', marketing: 'Marketing',
  ai: 'AI', hybrid: 'Hybrid', consulting: 'Consulting', other: 'Altro',
}

function Card({
  label, value, hint, explain, accent = 'text-text-primary', children,
}: {
  label: string; value: string; hint?: string; explain: MetricExplain
  accent?: string; children?: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-2xs text-text-tertiary">{label}</p>
        <MetricTooltip label={label} explain={explain} />
      </div>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      {hint && <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>}
      {children}
    </div>
  )
}

export function RevenueScorecards({ data }: { data: AdminRevenueScorecards }) {
  const at = data.computed_at
  const year = data.year
  const byLine = data.recurring_by_line ?? {}
  const otherLines = Object.entries(byLine).filter(([k]) => k !== 'growth')

  const progress = data.target_progress != null ? Number(data.target_progress) : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          label="Growth MRR"
          value={formatCurrency(Number(data.growth_mrr))}
          hint="Canoni Growth attivi"
          accent="text-gold-text"
          explain={{
            formula: 'Σ importo/mese degli accordi service_line=growth con revenue_model ∈ (recurring, maintenance), status=attivo e data odierna nel periodo di validità',
            period: 'Fotografia a oggi',
            source: 'revenue_streams',
            updatedAt: at,
            note: 'Un canone trimestrale da 3.000 conta 1.000.',
          }}
        />

        <Card
          label="Ricorrente totale"
          value={formatCurrency(Number(data.total_recurring))}
          hint={otherLines.length > 0
            ? otherLines.map(([k, v]) => `${LINE_LABEL[k] ?? k} ${formatCurrency(Number(v))}`).join(' · ')
            : 'Solo Growth'}
          explain={{
            formula: 'Come Growth MRR ma su tutte le linee di servizio',
            period: 'Fotografia a oggi',
            source: 'revenue_streams',
            updatedAt: at,
            note: 'Include il Social Media Management e ogni altra manutenzione ricorrente.',
          }}
        />

        <Card
          label={`Fatturato ${year}`}
          value={formatCurrency(Number(data.revenue_ytd))}
          hint="Incassato, netto IVA"
          accent="text-success"
          explain={{
            formula: 'Σ imponibile delle fatture status=pagata con paid_at nell’anno, MENO le note di credito',
            period: `1 gennaio ${year} → oggi`,
            source: 'invoices (paid_at, taxable_amount)',
            updatedAt: at,
            note: 'Per CASSA: una fattura di gennaio incassata a marzo conta a marzo.',
          }}
        >
          {progress != null && (
            <div className="mt-3">
              <div className="h-1.5 w-full rounded-full bg-surface-active overflow-hidden">
                <div className="h-full rounded-full bg-success"
                  style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
              </div>
              <p className="text-2xs text-text-tertiary mt-1.5">
                {Math.round(progress * 100)}% di {formatCurrency(Number(data.annual_target))}
              </p>
            </div>
          )}
        </Card>

        <Card
          label="SAL non fatturati"
          value={formatCurrency(Number(data.unbilled_sal))}
          hint="Lavoro consegnato da fatturare"
          accent={Number(data.unbilled_sal) > 0 ? 'text-warning' : 'text-text-primary'}
          explain={{
            formula: 'Σ importo delle milestone economiche con status=maturato e nessuna fattura collegata',
            period: 'Tutto lo storico',
            source: 'revenue_milestones',
            updatedAt: at,
            note: 'Se è sopra zero, sono soldi già guadagnati che non hai ancora chiesto.',
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          label={`Digital venduto ${year}`}
          value={formatCurrency(Number(data.digital_sold_ytd))}
          hint="Accordi avviati nell’anno"
          accent="text-info"
          explain={{
            formula: 'Σ importo degli accordi service_line=digital con revenue_model ∈ (one_off, milestone_based) e start_date nell’anno',
            period: `Anno ${year}`,
            source: 'revenue_streams',
            updatedAt: at,
          }}
        />

        <Card
          label={`Digital incassato ${year}`}
          value={formatCurrency(Number(data.digital_collected_ytd))}
          hint="Netto IVA, per cassa"
          accent="text-info"
          explain={{
            formula: 'Σ imponibile delle fatture collegate ad accordi digital, status=pagata, paid_at nell’anno, meno le note di credito',
            period: `Anno ${year}`,
            source: 'invoices JOIN revenue_streams',
            updatedAt: at,
            note: 'Solo fatture con stream_id valorizzato: una fattura scollegata non compare qui.',
          }}
        />

        <Card
          label="Backlog Digital"
          value={formatCurrency(Number(data.digital_backlog))}
          hint="Contrattualizzato non ancora fatturato"
          explain={{
            formula: 'Σ accordi digital a corpo o a SAL attivi, MENO tutto il già fatturato su quegli accordi. Mai negativo.',
            period: 'Fotografia a oggi',
            source: 'revenue_streams − invoices',
            updatedAt: at,
          }}
        />

        <Card
          label="Incassato non attribuito"
          value={formatCurrency(Number(data.unassigned_revenue))}
          hint={Number(data.unassigned_revenue) > 0 ? 'Fatture senza accordo collegato' : 'Tutto attribuito'}
          accent={Number(data.unassigned_revenue) > 0 ? 'text-error' : 'text-text-primary'}
          explain={{
            formula: 'Σ imponibile delle fatture incassate nell’anno con stream_id nullo',
            period: `Anno ${year}`,
            source: 'invoices (stream_id IS NULL)',
            updatedAt: at,
            note: 'Se cresce, le metriche per linea di servizio stanno perdendo pezzi: collega le fatture a un accordo.',
          }}
        />
      </div>
    </div>
  )
}
