'use client'

import { useMemo } from 'react'
import { Repeat, Package, Truck, Info, CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel } from '@/lib/pl'
import { buildSchedule, type ScheduleSpec } from '@/lib/revenue'

const eur = (n: number) => formatCurrency(Math.round(n))

export type EconomicsState = {
  enabled: boolean
  label: string
  billing: 'recurring' | 'one_off'
  amount: string
  status: 'bozza' | 'attivo'
  payment_terms: string
  /** piano rate per i lavori a corpo */
  mode: 'deposit' | 'even' | 'percent' | 'unica'
  depositPct: string
  count: string
  everyMonths: string
  percents: string
  startMonth: string
  /** subappalto */
  subOn: boolean
  subLabel: string
  subSupplier: string
  subAmount: string
  subMirror: boolean
}

export const emptyEconomics = (startMonth: string): EconomicsState => ({
  enabled: true, label: '', billing: 'one_off', amount: '', status: 'bozza', payment_terms: '',
  mode: 'deposit', depositPct: '30', count: '5', everyMonths: '1', percents: '40, 30, 30',
  startMonth,
  subOn: false, subLabel: '', subSupplier: '', subAmount: '', subMirror: true,
})

/** Dalla forma dell'accordo al piano rate: un solo posto che sa tradurre. */
export function specOf(e: EconomicsState): ScheduleSpec | null {
  if (e.billing !== 'one_off') return null
  const startMonth = `${e.startMonth}-01`
  if (e.mode === 'unica') return { mode: 'percent', percents: [100], startMonth }
  if (e.mode === 'percent') {
    return {
      mode: 'percent',
      percents: e.percents.split(/[,;\s]+/).map(Number).filter(n => n > 0),
      everyMonths: Math.max(1, Number(e.everyMonths) || 1),
      startMonth,
    }
  }
  return {
    mode: e.mode === 'deposit' ? 'deposit' : 'even',
    depositPct: Number(e.depositPct) || 0,
    count: Math.max(1, Number(e.count) || 1),
    everyMonths: Math.max(1, Number(e.everyMonths) || 1),
    startMonth,
  }
}

/**
 * L'accordo economico, deciso mentre si crea il progetto.
 *
 * Sta nel wizard perché è lì che si sa: quando vendi conosci già quota,
 * durata e come te la faranno pagare. Rimandarlo a dopo produce progetti
 * attivi senza un numero, ed è il buco che il conto economico non colma.
 *
 * Visibile solo ad admin e super admin: i progetti li crea anche un manager,
 * i numeri no.
 */
export function StepEconomics({ value, onChange, clientName }: {
  value: EconomicsState
  onChange: (v: EconomicsState) => void
  clientName: string
}) {
  const set = <K extends keyof EconomicsState>(k: K, v: EconomicsState[K]) => onChange({ ...value, [k]: v })
  const total = Number(value.amount.replace(',', '.')) || 0
  const sub = Number(value.subAmount.replace(',', '.')) || 0

  const rate = useMemo(() => {
    const spec = specOf(value)
    return spec && total > 0 ? buildSchedule(total, spec) : []
  }, [value, total])

  const margin = total - sub
  const marginPct = total > 0 ? margin / total : 0

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-text-primary">L&apos;accordo con {clientName}</h3>
        <p className="text-2xs text-text-tertiary mt-0.5">
          Quota, durata e come viene pagata. Tutti gli importi sono <strong className="font-semibold">IVA esclusa</strong>:
          l&apos;IVA si calcola in Fiscale &amp; Tasse
        </p>
      </div>

      {/* ── canone o a corpo ── */}
      <div className="grid gap-2 sm:grid-cols-2">
        {([
          ['recurring', 'Canone mensile', 'Un importo che torna ogni mese finché il contratto è attivo', Repeat],
          ['one_off', 'Lavoro a corpo', 'Una quota totale, pagata in una o più rate', Package],
        ] as const).map(([k, title, hint, Icon]) => (
          <button key={k} type="button" onClick={() => set('billing', k)} aria-pressed={value.billing === k}
            className={`text-left rounded-xl border p-3 press ${
              value.billing === k ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
            }`}>
            <span className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${value.billing === k ? 'text-gold-text' : 'text-text-tertiary'}`} />
              <span className="text-2xs font-bold text-text-primary">{title}</span>
            </span>
            <span className="block text-2xs text-text-tertiary mt-1">{hint}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cosa vendiamo">
          <input value={value.label} onChange={e => set('label', e.target.value)}
            placeholder="Digitalizzazione — CRM" aria-label="Nome del servizio" className={inp} />
        </Field>
        <Field label={value.billing === 'recurring' ? 'Canone mensile (€)' : 'Quota totale (€)'}>
          <input value={value.amount} onChange={e => set('amount', e.target.value)}
            inputMode="decimal" placeholder="45000" aria-label="Importo" className={`${inp} text-right tabular`} />
        </Field>
        <Field label="Stato">
          <select value={value.status} onChange={e => set('status', e.target.value as 'bozza' | 'attivo')}
            aria-label="Stato del contratto" className={inp}>
            <option value="bozza">Bozza — quotato, non ancora venduto</option>
            <option value="attivo">Attivo — venduto</option>
          </select>
        </Field>
      </div>

      {/* ── il piano di pagamento ── */}
      {value.billing === 'one_off' && (
        <div className="rounded-xl border border-border p-3 space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xs font-semibold text-text-secondary mr-1">Come lo paga:</span>
            {([
              ['deposit', 'Acconto + rate'],
              ['even', 'Rate uguali'],
              ['percent', 'Tranche %'],
              ['unica', 'Unica soluzione'],
            ] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => set('mode', k)} aria-pressed={value.mode === k}
                className={`text-2xs font-semibold rounded-lg px-2 py-1 border ${
                  value.mode === k ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:bg-surface-hover'
                }`}>{label}</button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            {value.mode === 'deposit' && (
              <Field label="Acconto %">
                <input value={value.depositPct} onChange={e => set('depositPct', e.target.value)}
                  inputMode="decimal" aria-label="Percentuale di acconto" className={inp} />
              </Field>
            )}
            {(value.mode === 'deposit' || value.mode === 'even') && (
              <Field label={value.mode === 'deposit' ? 'Rate dopo l’acconto' : 'Numero di rate'}>
                <input value={value.count} onChange={e => set('count', e.target.value)}
                  inputMode="numeric" aria-label="Numero di rate" className={inp} />
              </Field>
            )}
            {value.mode === 'percent' && (
              <Field label="Tranche in %">
                <input value={value.percents} onChange={e => set('percents', e.target.value)}
                  placeholder="40, 30, 30" aria-label="Percentuali" className={inp} />
              </Field>
            )}
            {value.mode !== 'unica' && (
              <Field label="Ogni (mesi)">
                <input value={value.everyMonths} onChange={e => set('everyMonths', e.target.value)}
                  inputMode="numeric" aria-label="Cadenza" className={inp} />
              </Field>
            )}
            <Field label="Prima scadenza">
              <input type="month" value={value.startMonth} onChange={e => set('startMonth', e.target.value)}
                aria-label="Mese della prima scadenza" className={inp} />
            </Field>
            <Field label="Metodo">
              <input value={value.payment_terms} onChange={e => set('payment_terms', e.target.value)}
                placeholder="30gg d.f.f.m." aria-label="Metodo di pagamento" className={inp} />
            </Field>
          </div>

          {rate.length > 0 && (
            <div className="rounded-lg bg-background/60 border border-border p-2.5">
              <p className="text-2xs font-semibold text-text-secondary mb-1.5">
                {rate.length} scadenz{rate.length === 1 ? 'a' : 'e'} · somma {eur(rate.reduce((s, r) => s + r.amount, 0))}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rate.map((r, i) => (
                  <span key={i} className="text-2xs rounded-lg border border-border px-2 py-1 text-text-secondary">
                    {monthLabel(r.due_month)} · <strong className="font-semibold text-text-primary">{eur(r.amount)}</strong>
                    <span className="text-text-tertiary"> {r.label}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── subappalto ── */}
      <div className={`rounded-xl border p-3 ${value.subOn ? 'border-orange/40 bg-orange-dim/20' : 'border-border'}`}>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={value.subOn} onChange={e => set('subOn', e.target.checked)}
            className="mt-0.5 accent-gold" />
          <span>
            <span className="flex items-center gap-1.5 text-2xs font-bold text-text-primary">
              <Truck className="w-3.5 h-3.5 text-orange" />Una parte la eroga qualcun altro
            </span>
            <span className="block text-2xs text-text-tertiary mt-0.5">
              Un fornitore, un professionista, un&apos;agenzia partner. È quello che toglie margine, e va saputo adesso
            </span>
          </span>
        </label>

        {value.subOn && (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Lavorazione">
                <input value={value.subLabel} onChange={e => set('subLabel', e.target.value)}
                  placeholder="Sviluppo CRM" aria-label="Lavorazione affidata fuori" className={inp} />
              </Field>
              <Field label="Fornitore">
                <input value={value.subSupplier} onChange={e => set('subSupplier', e.target.value)}
                  placeholder="Nome o azienda" aria-label="Fornitore" className={inp} />
              </Field>
              <Field label="Costo totale (€)">
                <input value={value.subAmount} onChange={e => set('subAmount', e.target.value)}
                  inputMode="decimal" placeholder="18500" aria-label="Costo del subappalto"
                  className={`${inp} text-right tabular`} />
              </Field>
            </div>

            {value.billing === 'one_off' && rate.length > 0 && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={value.subMirror} onChange={e => set('subMirror', e.target.checked)}
                  className="mt-0.5 accent-gold" />
                <span className="text-2xs text-text-secondary">
                  <strong className="font-semibold text-text-primary">Paghiamo con la stessa dilazione del cliente</strong> —
                  {' '}{rate.length} rate sulle stesse percentuali e sugli stessi mesi. Così la cassa non va sotto in mezzo:
                  incassi e paghi nello stesso momento. Togli la spunta se col fornitore hai un accordo diverso, lo definisci
                  poi nell&apos;economics del progetto.
                </span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* ── quanto resta ── */}
      {total > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider">
              {value.billing === 'recurring' ? 'Margine mensile' : 'Margine sul lavoro'}
            </span>
            <span className={`text-lg font-bold tabular ${margin < 0 ? 'text-error' : 'text-success'}`}>
              {eur(margin)} <span className="text-2xs text-text-tertiary">{Math.round(marginPct * 100)}%</span>
            </span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-active mt-2">
            <div className="bg-success" style={{ width: `${Math.max(0, marginPct * 100)}%` }} />
            <div className="bg-orange" style={{ width: `${Math.min(100, (sub / Math.max(1, total)) * 100)}%` }} />
          </div>
          <p className="text-2xs text-text-tertiary mt-1.5">
            {eur(total)} dal cliente{sub > 0 ? ` · ${eur(sub)} al fornitore` : ' · nessun costo esterno'}.
            Il tempo del team interno non è qui: sta nel costo del lavoro aziendale.
          </p>
        </div>
      )}

      <p className="flex items-start gap-2 text-2xs text-text-tertiary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Puoi anche saltare questo passaggio e quotare dopo, dalla scheda Economics del progetto. Ma un progetto
        attivo senza quotazione è un lavoro che non entra in nessun conto: prima o poi qualcuno se ne accorge a
        fine anno.
      </p>

      {value.status === 'attivo' && total > 0 && (
        <p className="flex items-start gap-2 text-2xs text-success">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Nasce già attivo: entra subito nel conto economico e nell&apos;MRR del cliente.
        </p>
      )}
    </div>
  )
}

const inp = 'w-full bg-background border border-border-interactive rounded-lg px-2.5 py-2 text-2xs text-text-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-2xs font-semibold text-text-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}
