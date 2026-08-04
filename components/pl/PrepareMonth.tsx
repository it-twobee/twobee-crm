'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Sparkles, Loader2, ArrowRight, Check, TrendingUp, Package, Truck, Users2,
  AlertTriangle, ChevronDown,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel } from '@/lib/pl'
import { previewPrefill, prefillMonth, type PrefillPreview } from '@/app/actions/pl'

const eur = (n: number) => formatCurrency(Math.round(n))

type Source = {
  key: keyof Pick<PrefillPreview, 'revenue' | 'plan' | 'subcontracts' | 'people'>
  label: string
  what: string
  href: string
  icon: typeof TrendingUp
  side: 'in' | 'out'
}

/**
 * Le quattro sorgenti da cui nasce un mese. Nessuna è un'invenzione della
 * pagina: ognuna vive altrove nel tool, e da qui ci si arriva con un clic —
 * se un numero non torna, si corregge alla fonte, non qui.
 */
const SOURCES: Source[] = [
  { key: 'revenue', label: 'Entrate', side: 'in', icon: TrendingUp,
    what: 'Canoni e rate dei contratti che cadono in questo mese',
    href: '/clienti' },
  { key: 'plan', label: 'Costi di struttura', side: 'out', icon: Package,
    what: 'Le voci del piano che tornano in questo mese',
    href: '/economics/costi' },
  { key: 'subcontracts', label: 'Subappalti', side: 'out', icon: Truck,
    what: 'Lavorazioni affidate fuori, col loro progetto attaccato',
    href: '/economics/costi' },
  { key: 'people', label: 'Personale', side: 'out', icon: Users2,
    what: 'Costo dell’organico: contributi, TFR e ratei inclusi',
    href: '/economics/personale' },
]

/**
 * Prepara il mese.
 *
 * Il pulsante non riempie e basta: prima **conta**. Chi guarda vede da dove
 * viene ogni euro e quanto ne entra, poi decide. È la differenza fra uno
 * strumento e un pulsante magico — e un pulsante magico su dei conti nessuno
 * lo usa due volte.
 */
export function PrepareMonth({ month, compact = false }: { month: string; compact?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [pv, setPv] = useState<PrefillPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(!compact)

  useEffect(() => {
    let alive = true
    setLoading(true)
    previewPrefill(month)
      .then(r => { if (alive) setPv(r) })
      .catch(() => { if (alive) setPv(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [month])

  const go = () => start(async () => {
    try {
      const r = await prefillMonth(month)
      const done = r.revenue + r.plan + r.subcontracts + r.people
      if (done === 0 && r.skipped.length) toast.error(r.skipped[0])
      else if (done === 0) toast.info('Non c’era niente di nuovo da portare nel mese')
      else {
        const parts = [
          r.revenue && `${r.revenue} entrate`,
          r.plan && `${r.plan} costi`,
          r.subcontracts && `${r.subcontracts} subappalti`,
          r.people && `${r.people} persone`,
        ].filter(Boolean)
        toast.success(`${monthLabel(month)}: ${parts.join(' · ')}`)
      }
      // quello che non è riuscito si dice, non si nasconde
      for (const s of r.skipped.slice(0, 2)) toast.warning(s)
      setPv(await previewPrefill(month))
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  })

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-text-tertiary" />
        <span className="text-2xs text-text-secondary">Guardo cosa c’è da portare nel mese…</span>
      </div>
    )
  }
  if (!pv) return null

  const income = pv.revenue.amount
  const outgo = pv.plan.amount + pv.subcontracts.amount + pv.people.amount
  const margin = income - outgo
  const nothing = SOURCES.every(s => pv[s.key].count === 0)

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft overflow-hidden">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-hover transition-colors">
        <span className="w-8 h-8 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-gold-text" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary">Prepara {monthLabel(month)}</p>
          <p className="text-2xs text-text-tertiary">
            {nothing
              ? 'Nessuna sorgente ha qualcosa per questo mese'
              : <>Da contratti, piano dei costi, subappalti e organico ·{' '}
                  <span className="text-success font-semibold tabular">{eur(income)}</span> in entrata,{' '}
                  <span className="text-error font-semibold tabular">{eur(outgo)}</span> in uscita</>}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map(s => {
              const d = pv[s.key]
              const has = d.count > 0
              return (
                <div key={s.key}
                  className={`rounded-xl border p-3 transition-colors ${has ? 'border-border bg-background' : 'border-dashed border-border bg-transparent'}`}>
                  <div className="flex items-start gap-2">
                    <s.icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      has ? (s.side === 'in' ? 'text-success' : 'text-error') : 'text-text-tertiary'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`text-2xs font-bold ${has ? 'text-text-primary' : 'text-text-tertiary'}`}>{s.label}</p>
                        <span className={`text-sm tabular font-black shrink-0 ${
                          !has ? 'text-text-tertiary'
                          : s.side === 'in' ? 'text-success' : 'text-error'}`}>
                          {has ? `${s.side === 'in' ? '' : '−'}${eur(d.amount)}` : '—'}
                        </span>
                      </div>
                      <p className="text-2xs text-text-tertiary mt-0.5">
                        {has ? `${d.count} voc${d.count === 1 ? 'e' : 'i'} · ${s.what.toLowerCase()}` : s.what}
                      </p>
                      {/* la riga d'anagrafica è un ripiego: va detto qui, non scoperto dopo */}
                      {s.key === 'revenue' && pv.revenue.fromRegistry > 0 && (
                        <p className="text-2xs text-warning mt-0.5">
                          {pv.revenue.fromRegistry} sen{pv.revenue.fromRegistry === 1 ? 'za' : 'za'} contratto: entra l’MRR d’anagrafica
                        </p>
                      )}
                      {!has && (
                        <Link href={s.href} className="text-2xs font-semibold text-gold-text hover:underline inline-flex items-center gap-1 mt-1">
                          {s.key === 'revenue' ? 'Quota i progetti' : s.key === 'people' ? 'Aggiungi l’organico' : 'Apri il piano'}
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* il margine che ne uscirebbe: è l'unica cosa che si vuole sapere prima */}
          {!nothing && (
            <div className="flex items-baseline justify-between gap-3 rounded-xl bg-background border border-border px-3 py-2.5 flex-wrap">
              <span className="text-2xs text-text-secondary">
                Margine del mese, se prepari adesso
              </span>
              <span className={`text-base tabular font-black ${margin >= 0 ? 'text-success' : 'text-error'}`}>
                {eur(margin)}
                {income > 0 && (
                  <span className="text-2xs font-semibold text-text-tertiary ml-1.5">
                    {Math.round((margin / income) * 100)}%
                  </span>
                )}
              </span>
            </div>
          )}

          {(pv.existing.revenue > 0 || pv.existing.costs > 0) && (
            <p className="text-2xs text-text-tertiary flex items-start gap-1.5">
              <Check className="w-3 h-3 mt-0.5 shrink-0 text-success" aria-hidden="true" />
              {/* Con gli importi: i numeri qui sopra sono quello che **manca**, quelli
                  del conto economico sono quello che **c'è**. Senza gli importi
                  accanto le due letture sembrano contraddirsi. */}
              Nel mese ci sono già <strong className="text-text-secondary">
                {eur(pv.existing.revenueAmount)} di entrate</strong> ({pv.existing.revenue} righe) e{' '}
              <strong className="text-text-secondary">
                {eur(pv.existing.costsAmount)} di uscite</strong> ({pv.existing.costs} righe).
              Qui sopra c&apos;è quello che manca: rilanciare aggiunge solo quello, non duplica niente.
            </p>
          )}

          {pv.monthLocked ? (
            <p className="text-2xs text-warning flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />Il mese è chiuso: riaprilo per modificarlo.
            </p>
          ) : (
            <button onClick={go} disabled={pending || nothing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2.5 rounded-xl press btn-gold disabled:opacity-40">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {pending ? 'Preparo…' : `Prepara ${monthLabel(month)}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
