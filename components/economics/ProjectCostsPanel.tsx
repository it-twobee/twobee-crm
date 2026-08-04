'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Trash2, Truck, Info, ArrowUpRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel } from '@/lib/pl'
import {
  yearlyCost, nextOccurrences, FREQUENCY_LABEL,
  type CostItem, type CostActual, type Frequency,
} from '@/lib/costs'
import {
  addProjectCost, addProjectCostFromContract, updateProjectCost, deleteProjectCost,
  splitCostLikeClient, splitCostCustom,
} from '@/app/actions/costs'
import { CustomPlan } from './CustomPlan'
import { Draft, Money } from './fields'

const eur = (n: number) => formatCurrency(Math.round(n))
const FREQS: Frequency[] = ['una_tantum', 'mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale']

/**
 * Quello che questo lavoro costa **fuori**: un video, un design, uno sviluppo,
 * un'agenzia partner. Senza, la scheda economics dice quanto il cliente paga e
 * non quanto costa consegnare — cioè non dice niente sul margine.
 *
 * Il tempo del team interno non si mette qui: sta nel costo del lavoro
 * aziendale. Mescolare le due cose darebbe un margine più onesto in teoria e
 * inutilizzabile in pratica, perché nessuno rileva le ore.
 */
export function ProjectCostsPanel({
  projectId, month, items, actuals, canEdit, contracts = [],
}: {
  projectId: string
  month: string
  items: CostItem[]
  /** uscite del mese già registrate su questo progetto */
  actuals: CostActual[]
  canEdit: boolean
  /** i contratti col cliente su questo progetto: è da lì che nasce la proposta */
  contracts?: { id: string; label: string; billing: string; terms: string | null; installments: number }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState<string | null>(null)
  const [plan, setPlan] = useState<string | null>(null)

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const spent = actuals.reduce((s, a) => s + a.actual, 0)
  // solo i contratti che un piano di rate ce l'hanno: gli altri non hanno niente da ricalcare
  const rateable = contracts.filter(c => c.installments > 0)

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <Truck className="w-4 h-4 text-orange" />Lavorazioni affidate fuori
          </h3>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Fornitori e professionisti esterni su questo progetto: è quello che toglie margine · importi IVA esclusa
          </p>
          {/* §192 — la gerarchia, dichiarata dove si scrive: questa è la sorgente */}
          <p className="text-2xs text-text-tertiary mt-0.5">
            <strong className="text-text-secondary">Questa è la sorgente</strong>: importo, fornitore e
            frequenza si scrivono qui. Nel{' '}
            <Link href="/economics" className="text-info hover:underline">conto economico</Link>{' '}
            atterra l&apos;occorrenza del mese, e lì si registra quanto è uscito davvero
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* il patto col fornitore parte da quello col cliente: stessa
                struttura, stesse date, stesso metodo. Poi si cambia quel che serve */}
            {contracts.length > 0 && (
              <select value="" aria-label="Ricalca l'accordo col cliente" disabled={pending}
                onChange={e => e.target.value && run(
                  () => addProjectCostFromContract(projectId, e.target.value),
                  'Subappalto creato sull\'accordo col cliente')}
                className="bg-background border border-border-interactive rounded-xl px-2 py-2 text-2xs text-text-secondary max-w-[240px]">
                <option value="">Ricalca l&apos;accordo col cliente…</option>
                {contracts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label} — {c.billing === 'recurring' ? 'canone' : 'a corpo'}
                    {c.terms ? ` · ${c.terms}` : ''}
                  </option>
                ))}
              </select>
            )}
            <button onClick={() => run(() => addProjectCost(projectId), 'Fornitore aggiunto')} disabled={pending}
              className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />Accordo diverso
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="p-5">
          <div className="text-center py-6 border border-dashed border-border rounded-xl">
            <p className="text-2xs text-text-tertiary">
              Nessuna lavorazione esterna. Se una parte di questo progetto la eroga qualcun altro, mettila qui:
              finisce nell&apos;area <strong className="font-semibold">Delivery &amp; Fornitori</strong> del mese e nel margine.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {items.map(i => {
            const isOpen = open === i.id
            const upcoming = nextOccurrences(i, month, 3)
            const paid = actuals.filter(a => a.cost_item_id === i.id)
            return (
              <div key={i.id} className="px-5 py-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <Draft value={i.label} label="Fornitore o lavorazione" disabled={!canEdit}
                    onSave={v => run(() => updateProjectCost(i.id, projectId, { label: v }))}
                    className="flex-1 min-w-[140px] bg-transparent text-sm font-semibold text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />

                  <Money value={i.amount} disabled={!canEdit}
                    onSave={v => run(() => updateProjectCost(i.id, projectId, { amount: v }))} />

                  <select value={i.frequency} disabled={!canEdit} aria-label="Ogni quanto"
                    onChange={e => run(() => updateProjectCost(i.id, projectId, { frequency: e.target.value as Frequency }))}
                    className="bg-background border border-border rounded-lg px-1.5 py-1 text-2xs text-text-secondary">
                    {FREQS.map(f => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
                  </select>

                  <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full border ${
                    i.is_active ? 'bg-success-dim border-success/40 text-success' : 'bg-surface-active border-border-strong text-text-secondary'
                  }`}>{i.is_active ? 'attivo' : 'sospeso'}</span>

                  {canEdit && (
                    <>
                      <button onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen}
                        className="text-2xs font-semibold text-gold-text hover:opacity-80">
                        {isOpen ? 'Chiudi' : 'Dettagli'}
                      </button>
                      <button onClick={() => run(() => deleteProjectCost(i.id, projectId), 'Eliminato')}
                        aria-label={`Elimina ${i.label}`} className="text-text-tertiary hover:text-error">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {/* Dov'è arrivata questa lavorazione: senza saperlo, il margine del
                      progetto sembra giusto anche quando l'occorrenza non è mai atterrata. */}
                  <Stato item={i} lines={paid} month={month} />
                  <p className="text-2xs text-text-tertiary">
                    {i.frequency === 'una_tantum'
                      ? (i.start_month ? `Cade a ${monthLabel(i.start_month)}` : 'Senza mese: non entra in nessun conto economico')
                      : `${eur(yearlyCost(i))} l'anno`}
                    {upcoming.length > 0 && i.frequency !== 'una_tantum' && ` · prossime: ${upcoming.map(m => monthLabel(m)).join(', ')}`}
                  </p>
                </div>

                {isOpen && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-4 rounded-xl border border-border bg-background/40 p-3">
                    <Field label="Fornitore">
                      <Draft value={i.supplier ?? ''} label="Fornitore" className={inp} placeholder="Nome o azienda"
                        onSave={v => run(() => updateProjectCost(i.id, projectId, { supplier: v || null }))} />
                    </Field>
                    <Field label="Categoria">
                      <Draft value={i.category} label="Categoria" className={inp}
                        onSave={v => run(() => updateProjectCost(i.id, projectId, { category: v }))} />
                    </Field>
                    <Field label={i.frequency === 'una_tantum' ? 'Mese' : 'Da (mese)'}>
                      <Draft type="month" value={i.start_month?.slice(0, 7) ?? ''} label="Mese d'inizio" className={inp}
                        onSave={v => run(() => updateProjectCost(i.id, projectId, { start_month: v ? `${v}-01` : null }))} />
                    </Field>
                    <Field label="Fino a (mese)">
                      <Draft type="month" value={i.end_month?.slice(0, 7) ?? ''} label="Mese di fine" className={inp}
                        onSave={v => run(() => updateProjectCost(i.id, projectId, { end_month: v ? `${v}-01` : null }))} />
                    </Field>
                    <Field label="Tipo">
                      <select value={i.cost_type} aria-label="Fisso o variabile" className={inp}
                        onChange={e => run(() => updateProjectCost(i.id, projectId, { cost_type: e.target.value as 'F' | 'V' }))}>
                        <option value="V">variabile (segue il lavoro)</option>
                        <option value="F">fisso</option>
                      </select>
                    </Field>
                    <Field label="Stato">
                      <select value={i.is_active ? '1' : '0'} aria-label="Stato" className={inp}
                        onChange={e => run(() => updateProjectCost(i.id, projectId, { is_active: e.target.value === '1' }))}>
                        <option value="1">attivo</option>
                        <option value="0">sospeso</option>
                      </select>
                    </Field>
                    <Field label="Pagamento">
                      <Draft value={i.payment_terms ?? ''} label="Metodo di pagamento" className={inp}
                        placeholder="30gg d.f.f.m."
                        onSave={v => run(() => updateProjectCost(i.id, projectId, { payment_terms: v || null }))} />
                    </Field>
                    <Field label="Nota">
                      <Draft value={i.note ?? ''} label="Nota" className={inp} placeholder="—"
                        onSave={v => run(() => updateProjectCost(i.id, projectId, { note: v || null }))} />
                    </Field>

                    {/* il piano di pagamento del fornitore: ricalcato dal cliente
                        — così la cassa non va sotto in mezzo — o costruito a mano */}
                    {i.frequency === 'una_tantum' && i.amount > 0 && (
                      <div className="sm:col-span-4 border-t border-border pt-2 space-y-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-2xs font-semibold text-text-secondary">Piano di pagamento:</span>
                          {rateable.map(c => (
                            <button key={c.id} disabled={pending}
                              onClick={() => run(() => splitCostLikeClient(i.id, c.id, projectId), 'Rate ricalcate')}
                              className="text-2xs font-semibold border border-border rounded-lg px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
                              come il cliente · {c.label} ({c.installments} rate)
                            </button>
                          ))}
                          <button onClick={() => setPlan(plan === i.id ? null : i.id)} aria-expanded={plan === i.id}
                            className="text-2xs font-semibold border border-gold/40 bg-gold-dim rounded-lg px-2 py-1 text-gold-text press">
                            Su misura
                          </button>
                        </div>
                        {plan === i.id && (
                          <CustomPlan
                            defaultMonth={(i.start_month ?? month).slice(0, 7)}
                            onBuild={spec => { setPlan(null); run(() => splitCostCustom(i.id, projectId, spec), 'Piano generato') }} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap px-5 py-3 border-t border-border">
        <p className="flex items-start gap-2 text-2xs text-text-tertiary flex-1 min-w-[240px]">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {spent > 0
            ? <>Questo mese sono già uscite <strong className="font-semibold text-text-secondary">{eur(spent)}</strong> su
              questo progetto. Il resto entra col «Porta nel mese» dei costi.</>
            : <>Le lavorazioni entrano nel conto economico da <strong className="font-semibold">Costi e budget → Porta nel mese</strong>,
              nell&apos;area Delivery &amp; Fornitori.</>}
        </p>
        <Link href={`/economics/costi?m=${month}`}
          className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80 shrink-0">
          Costi e budget<ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  )
}

const inp = 'w-full bg-background border border-border rounded-lg px-2 py-1 text-2xs text-text-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-2xs font-semibold text-text-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}

/**
 * Dove è arrivata questa lavorazione: patto, mese, pagata.
 *
 * È il pezzo che mancava. Un subappalto può esistere come patto e non essere mai
 * atterrato in un conto economico: il margine del progetto sembra giusto, il mese
 * non lo conosce, e la differenza salta fuori mesi dopo quando il fornitore
 * fattura. Qui si vede in una parola, con lo stesso vocabolario del conto
 * economico — «da portare», «nel mese», «pagato», «scostato».
 */
function Stato({ item, lines, month }: {
  item: CostItem
  lines: CostActual[]
  month: string
}) {
  const booked = lines.reduce((s, a) => s + (a.actual > 0 ? a.actual : a.budget), 0)
  const nelMese = lines.length > 0
  const pagata = nelMese && lines.every(a => a.paid)
  const scarto = Math.round((booked - item.amount) * 100) / 100

  const ui = !item.is_active ? { t: 'sospesa', c: 'bg-surface-active text-text-tertiary' }
    : !nelMese ? { t: `da portare in ${monthLabel(month)}`, c: 'bg-surface-active text-text-tertiary' }
    : Math.abs(scarto) >= 0.01 ? { t: `nel mese ${eur(booked)}, scostata`, c: 'bg-warning-dim text-warning' }
    : pagata ? { t: `pagata ${eur(booked)}`, c: 'bg-success-dim text-success' }
    : { t: `nel mese ${eur(booked)}, da pagare`, c: 'bg-info-dim text-info' }

  return (
    <span className={`shrink-0 text-2xs font-semibold px-2 py-0.5 rounded ${ui.c}`}>{ui.t}</span>
  )
}
