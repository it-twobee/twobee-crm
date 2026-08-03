'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Wallet, Target, TrendingDown, Layers,
  ShieldAlert, Info, Repeat, AlertTriangle, Download, ChevronDown, Sparkles, Truck, Users,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel, shiftMonth } from '@/lib/pl'
import {
  rollup, orphans, yearlyCost, plannedForMonth, nextOccurrences, costInsights, monthTarget,
  SUGGESTED_CENTERS, FREQUENCY_LABEL, isPayrollCenter, bySupplier,
  type CostCenter, type CostItem, type CostActual, type Frequency,
} from '@/lib/costs'
import {
  addCenter, updateCenter, deleteCenter,
  addCostItem, updateCostItem, deleteCostItem,
  applyPlanToMonth, promoteLineToPlan, addExternalSupplier, renameSupplier,
} from '@/app/actions/costs'
import { EconomicsNav } from '@/components/economics/EconomicsNav'
import { Draft, Money } from '@/components/economics/fields'

const eur = (n: number) => formatCurrency(Math.round(n))
const pc = (n: number) => `${Math.round(n * 100)}%`

const FREQS: Frequency[] = ['mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale', 'una_tantum']

export function CostPlanClient({
  month, setupNeeded, monthExists, monthLocked, centers, items, actuals, projectNames = {},
  revenue, costTargetPct,
}: {
  month: string
  setupNeeded: boolean
  monthExists: boolean
  monthLocked: boolean
  /** imponibile del mese dal conto economico: senza, il tetto non è calcolabile */
  revenue: number
  /** quota di fatturato destinata ai costi (pl_config.cost_target_pct, 35%) */
  costTargetPct: number
  centers: CostCenter[]
  items: CostItem[]
  actuals: CostActual[]
  /** §173: nome del progetto per i subappalti */
  projectNames?: Record<string, string>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState<string | null>(null)
  // la sezione dei costi esterni si chiude: quando i subappalti sono rateizzati
  // sono decine di righe, e chi guarda il piano di struttura non le sta cercando
  const [externalOpen, setExternalOpen] = useState(true)
  const [openSupplier, setOpenSupplier] = useState<string | null>(null)
  const [newSupplier, setNewSupplier] = useState('')

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const go = (d: number) => router.push(`/economics/costi?m=${shiftMonth(month, d)}`)

  const rows = useMemo(() => rollup(centers, items, actuals, month), [centers, items, actuals, month])
  const loose = useMemo(() => orphans(items, actuals), [items, actuals])
  /* Fra le voci senza area, quelle col progetto sono subappalti: fuori dai
     budget di struttura per disegno. Le altre sono dimenticanze. */
  const looseSubs = useMemo(() => loose.items.filter(i => i.project_id).length, [loose])
  const looseInternal = loose.items.length - looseSubs
  /* Raccolte per subappaltatore: otto righe «Rata 3 di 6» in fila sono rumore,
     sotto un nome sono un accordo con un fornitore e un importo. */
  const supplierGroups = useMemo(() => bySupplier(loose.items), [loose])
  const looseTotal = useMemo(() => supplierGroups.reduce((t, g) => t + g.total, 0), [supplierGroups])
  const looseProjects = useMemo(
    () => new Set(loose.items.map(i => i.project_id).filter(Boolean)).size, [loose])
  const due = useMemo(() => plannedForMonth(items, month), [items, month])

  const tot = useMemo(() => ({
    budget: rows.reduce((s, r) => s + r.budget, 0),
    planned: rows.reduce((s, r) => s + r.planned, 0) + loose.items.filter(i => due.includes(i)).reduce((s, i) => s + i.amount, 0),
    actual: rows.reduce((s, r) => s + r.actual, 0) + loose.actual,
    fixed: rows.reduce((s, r) => s + r.actualFixed, 0),
    variable: rows.reduce((s, r) => s + r.actualVariable, 0),
  }), [rows, loose, due])

  /* §180: il tetto del mese non è la somma delle aree — quella è già
     «Pianificato» — ma l'obiettivo: il 35% del fatturato incassabile del mese.
     Il confronto che conta è piano contro obiettivo, non piano contro sé stesso. */
  const goal = useMemo(() => monthTarget(revenue, costTargetPct), [revenue, costTargetPct])
  const overGoal = goal.known && tot.planned > goal.target

  // le voci di piano che questo mese non ha ancora portato nel conto economico
  const missing = due.filter(i => !actuals.some(a => a.cost_item_id === i.id))
  // spese pagate che il piano non prevedeva: candidate a diventare ricorrenti
  const offPlan = useMemo(() => actuals.filter(a => !a.cost_item_id && a.actual > 0), [actuals])
  const findings = useMemo(() => costInsights(rows, items, actuals, month), [rows, items, actuals, month])
  // solo le aree che non esistono già: un suggerimento già accolto è rumore
  const suggested = useMemo(() => {
    const have = new Set(centers.map(c => c.name.toLowerCase()))
    return SUGGESTED_CENTERS.filter(s => !have.has(s.name.toLowerCase()))
  }, [centers])

  if (setupNeeded) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        <EconomicsNav active="costi" month={month} />
        <div className="rounded-2xl border border-warning/40 bg-warning-dim p-4 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-text-primary">Migration da eseguire</p>
            <p className="text-2xs text-text-secondary mt-1">
              Le tabelle del piano dei costi non esistono ancora: esegui{' '}
              <code className="px-1 py-0.5 rounded bg-surface border border-border">supabase/migrations/171_cost_plan.sql</code>{' '}
              nel SQL Editor di Supabase.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <EconomicsNav active="costi" month={month} />

      {/* ── testata ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => go(-1)} aria-label="Mese precedente"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">{monthLabel(month)}</h1>
            <button onClick={() => go(1)} aria-label="Mese successivo"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Costi interni e societari · <span className="tabular font-semibold text-text-primary">{centers.length}</span> aree ·{' '}
            <span className="tabular font-semibold text-text-primary">{items.filter(i => i.is_active).length}</span> voci in piano
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => run(() => addCenter(), 'Area aggiunta')} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
            <Plus className="w-3.5 h-3.5" />Area
          </button>
          <button
            onClick={() => run(async () => {
              const n = await applyPlanToMonth(month)
              if (n === 0) toast.info('Il mese ha già tutte le voci di piano')
            }, undefined)}
            disabled={pending || !monthExists || monthLocked || missing.length === 0}
            title={!monthExists ? 'Apri prima il mese dal conto economico'
              : monthLocked ? 'Mese chiuso' : 'Crea le uscite del mese dalle voci di piano'}
            className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />
            Porta nel mese{missing.length > 0 ? ` (${missing.length})` : ''}
          </button>
        </div>
      </div>

      {/* ── quattro numeri ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Target className="w-4 h-4 text-info" />} label="Tetto del mese"
          value={goal.known ? eur(goal.target) : '—'}
          sub={goal.known
            ? `${pc(costTargetPct)} di ${eur(revenue)} fatturati`
            : 'nessun fatturato registrato: obiettivo non calcolabile'}
          tone={overGoal ? 'error' : undefined} />
        <Kpi icon={<Layers className="w-4 h-4 text-accent" />} label="Pianificato" value={eur(tot.planned)}
          sub={goal.known
            ? `${pc(tot.planned / Math.max(1, goal.target))} del tetto · ${due.length} voci`
            : `${due.length} voci cadono in questo mese`}
          tone={overGoal ? 'error' : undefined} />
        <Kpi icon={<Wallet className="w-4 h-4 text-gold-text" />} label="Speso davvero" value={eur(tot.actual)}
          sub={monthExists ? `${actuals.length} uscite registrate` : 'mese non ancora aperto'} />
        <Kpi icon={<TrendingDown className="w-4 h-4 text-error" />} label="Scostamento"
          value={goal.known ? `${goal.target - tot.planned >= 0 ? '' : '+'}${eur(Math.abs(goal.target - tot.planned))}` : '—'}
          sub={!goal.known ? 'serve il fatturato del mese'
            : overGoal ? `oltre il ${pc(costTargetPct)} del fatturato` : 'sotto il tetto'}
          tone={!goal.known ? undefined : overGoal ? 'error' : 'success'} />
      </div>

      {/* ── fisso contro variabile ── */}
      {tot.actual > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="text-sm font-bold text-text-primary">Fissi contro variabili</h2>
              <p className="text-2xs text-text-tertiary mt-0.5">
                I fissi ci sono anche a fatturato zero: sono loro a dire quanto devi vendere per stare in piedi
              </p>
            </div>
            <span className="text-2xs text-text-tertiary tabular">
              {tot.actual > 0 ? `${pc(tot.fixed / tot.actual)} fisso` : '—'}
            </span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-surface-active">
            <div className="bg-info" style={{ width: `${(tot.fixed / Math.max(1, tot.actual)) * 100}%` }} />
            <div className="bg-accent" style={{ width: `${(tot.variable / Math.max(1, tot.actual)) * 100}%` }} />
          </div>
          <div className="flex gap-4 mt-2">
            <Legend color="var(--color-info)" label="Fissi" value={eur(tot.fixed)} />
            <Legend color="var(--color-accent)" label="Variabili" value={eur(tot.variable)} />
          </div>
        </section>
      )}

      {/* ── aree ── */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Aree di spesa</h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Struttura, persone, software: quello che l&apos;azienda spende per esistere. Le lavorazioni affidate fuori
            stanno nell&apos;economics del loro progetto, non qui
          </p>
        </div>

        {centers.length === 0 ? (
          <div className="p-5 text-center py-8 border-t border-dashed border-border">
            <p className="text-2xs text-text-tertiary">Nessuna area. Creane una per dare un tetto alle spese.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map(r => {
              const isOpen = open === r.center.id
              const over = r.budget > 0 && r.actual > r.budget
              const own = items.filter(i => i.center_id === r.center.id)
              /* Il costo del lavoro lo calcola l'organico: qui si legge. Due
                 posti che scrivono la stessa riga danno sempre due numeri. */
              const locked = isPayrollCenter(r.center.name)
              return (
                <div key={r.center.id} className="px-5 py-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {locked ? (
                      <span className="flex-1 min-w-[140px] flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-text-tertiary shrink-0" aria-hidden="true" />
                        <span className="text-sm font-semibold text-text-primary">{r.center.name}</span>
                        <Link href="/economics/personale"
                          className="text-2xs font-semibold text-gold-text hover:opacity-80 whitespace-nowrap">
                          gestisci in Personale →
                        </Link>
                      </span>
                    ) : (
                      <Draft value={r.center.name} label="Nome dell'area"
                        onSave={v => run(() => updateCenter(r.center.id, { name: v }))}
                        className="flex-1 min-w-[140px] bg-transparent text-sm font-semibold text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />
                    )}

                    {/* §180: il tetto è la somma delle voci dell'area, non un numero
                        a parte — quindi si legge, non si scrive */}
                    <span className="text-sm tabular font-bold text-text-primary shrink-0"
                      title={`Somma delle ${own.filter(i => due.includes(i)).length} voci che cadono in questo mese`}>
                      {eur(r.planned)}
                    </span>

                    <span className={`text-2xs tabular font-semibold ${over ? 'text-error' : 'text-text-secondary'}`}>
                      {eur(r.actual)} speso
                    </span>

                    <button onClick={() => setOpen(isOpen ? null : r.center.id)} aria-expanded={isOpen}
                      className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80">
                      {own.length} vo{own.length === 1 ? 'ce' : 'ci'}
                      <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {!locked && (
                      <button onClick={() => run(async () => {
                        const { orphaned } = await deleteCenter(r.center.id)
                        if (orphaned) toast.info(`${orphaned} voci restano senza area`)
                      }, 'Area eliminata')}
                        aria-label={`Elimina ${r.center.name}`} className="text-text-tertiary hover:text-error">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* consumo del budget */}
                  <div className="mt-2 h-1.5 rounded-full bg-surface-active overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, r.usedPct * 100)}%`,
                      background: over ? 'var(--color-error)' : r.usedPct > 0.85 ? 'var(--color-warning)' : 'var(--color-success)',
                    }} />
                  </div>
                  <p className="text-2xs text-text-tertiary mt-1">
                    {r.planned === 0
                      ? 'Nessuna voce cade in questo mese'
                      : over
                        ? `Speso ${eur(r.actual - r.planned)} più del previsto`
                        : `${eur(r.actual)} di ${eur(r.planned)} previsti (${pc(r.usedPct)})`}
                    {r.actual > 0 && ` · ${eur(r.actualFixed)} fisso, ${eur(r.actualVariable)} variabile`}
                  </p>

                  {isOpen && (
                    <div className="mt-3 space-y-2">
                      {locked && (
                        <p className="text-2xs text-text-tertiary">
                          Queste voci le scrive l&apos;organico: retribuzioni, contributi, TFR ed esoneri
                          arrivano dalla sezione <Link href="/economics/personale" className="font-semibold text-gold-text hover:opacity-80">Personale</Link>{' '}
                          e da qui si leggono soltanto. Modificarle qui creerebbe un secondo numero per la stessa persona.
                        </p>
                      )}
                      {own.length === 0 ? (
                        <p className="text-2xs text-text-tertiary">
                          {locked
                            ? 'Nessuna riga: porta il costo dell\'organico nel mese dalla sezione Personale.'
                            : 'Nessuna voce ricorrente in quest\'area.'}
                        </p>
                      ) : own.map(i => (
                        <ItemRow key={i.id} item={i} month={month} centers={centers} run={run}
                          projectNames={projectNames} locked={locked} />
                      ))}
                      {!locked && (
                        <button onClick={() => run(() => addCostItem({ center_id: r.center.id }), 'Voce aggiunta')}
                          disabled={pending}
                          className="flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:opacity-80">
                          <Plus className="w-3.5 h-3.5" />Voce di spesa
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── cosa non torna ── */}
      {findings.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-text-primary">Cosa guardare</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              {findings.filter(f => f.severity !== 'ok').length} cose da sistemare nel piano
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {findings.map(f => (
              <div key={f.id} className="px-5 py-3">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 ${
                    f.severity === 'critico' ? 'text-error' : f.severity === 'attenzione' ? 'text-warning' : 'text-text-tertiary'
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xs font-bold text-text-primary">{f.title}</p>
                    <p className="text-2xs text-text-secondary mt-0.5">{f.detail}</p>
                    {f.action && <p className="text-2xs text-gold-text font-semibold mt-1">{f.action}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── spese pagate che il piano non prevedeva ── */}
      {offPlan.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-text-primary">Uscite del mese fuori piano</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              Le spese vere si scoprono pagando: quelle che tornano ogni mese conviene metterle in piano una volta sola
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {offPlan.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-5 py-2 flex-wrap">
                <span className="text-2xs text-text-tertiary shrink-0">{a.category}</span>
                <span className="text-2xs font-semibold text-text-primary flex-1 min-w-[120px] truncate">{a.label}</span>
                <span className="text-2xs tabular text-text-secondary">{eur(a.actual)}</span>
                <select value="" aria-label={`Rendi ricorrente ${a.label}`} disabled={pending}
                  onChange={e => e.target.value && run(
                    () => promoteLineToPlan(a.id, e.target.value as Frequency), 'Aggiunta al piano')}
                  className="bg-background border border-border-interactive rounded-lg px-1.5 py-1 text-2xs text-text-secondary">
                  <option value="">Rendi ricorrente…</option>
                  {FREQS.filter(f => f !== 'una_tantum').map(f => (
                    <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── aree che il modo di lavorare di TwoBee rende probabili ── */}
      {suggested.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Sparkles className="w-4 h-4 text-gold-text" />Aree che potresti aggiungere
            </h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              Da cosa c&apos;è nel piano e soprattutto da cosa non c&apos;è. Ognuna dice perché
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {suggested.map(s => (
              <div key={s.name} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-bold text-text-primary">{s.name}</p>
                    <p className="text-2xs text-text-tertiary">{s.description}</p>
                    <p className="text-2xs text-text-secondary mt-1">{s.why}</p>
                  </div>
                  <button
                    onClick={() => run(() => addCenter({
                      name: s.name, description: s.description, monthly_budget: s.budget,
                      sort_order: (centers.length + 1) * 10,
                    }), `Area «${s.name}» creata`)}
                    disabled={pending}
                    className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover press shrink-0 disabled:opacity-40">
                    <Plus className="w-3.5 h-3.5" />Aggiungi
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── subappalti e costi esterni, raccolti per chi li emette ──
          Un subappalto sta fuori dai budget d'area **per scelta** (§173: è una
          lavorazione venduta al cliente, non un costo di struttura), quindi non
          è un errore e non prende l'icona d'allarme. Una voce interna senza area
          invece sì: quella non pesa su nessun tetto per dimenticanza. */}
      <section className={`bg-surface border rounded-2xl shadow-soft overflow-hidden ${
        looseInternal > 0 ? 'border-warning/40' : 'border-border'}`}>
        <button onClick={() => setExternalOpen(o => !o)} aria-expanded={externalOpen}
          className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-surface-hover transition-colors">
          {looseInternal > 0
            ? <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
            : <Truck className="w-4 h-4 text-orange shrink-0" aria-hidden="true" />}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-text-primary">Subappalti e costi esterni</h2>
            {/* chiusa, la riga deve bastare: quanti fornitori, quanto, su quanti lavori */}
            <p className="text-2xs text-text-tertiary">
              {supplierGroups.length > 0 ? (
                <>
                  <strong className="text-text-secondary">{supplierGroups.length}</strong>{' '}
                  {supplierGroups.length === 1 ? 'fornitore' : 'fornitori'} ·{' '}
                  <span className="tabular font-semibold text-text-secondary">{eur(looseTotal)}</span>
                  {looseProjects > 0 && <> · su {looseProjects} {looseProjects === 1 ? 'progetto' : 'progetti'}</>}
                  {looseInternal > 0 && (
                    <span className="text-warning"> · {looseInternal} {looseInternal === 1 ? 'voce interna' : 'voci interne'} da assegnare a un'area</span>
                  )}
                </>
              ) : 'Nessun costo esterno: qui finiscono i subappalti e i fornitori senza area'}
            </p>
          </div>
          {loose.lines > 0 && (
            <span className="text-2xs tabular text-text-tertiary shrink-0">{eur(loose.actual)} nel mese</span>
          )}
          <ChevronDown className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${externalOpen ? 'rotate-180' : ''}`} />
        </button>

        {externalOpen && (
          <>
            <div className="divide-y divide-border/60 border-t border-border">
              {supplierGroups.map(g => {
                const key = g.supplier ?? '—'
                const isOpen = openSupplier === key
                return (
                  <div key={key}>
                    {/* la testata del fornitore: nome, quanto, su quali lavori.
                        Le rate stanno sotto e si aprono solo se servono. */}
                    <div className="flex items-center gap-2.5 px-5 py-2.5 flex-wrap">
                      {g.supplier ? (
                        <Draft value={g.supplier} label="Nome del subappaltatore"
                          onSave={v => run(async () => {
                            const n = await renameSupplier(g.supplier!, v)
                            if (n > 1) toast.success(`Rinominato su ${n} voci`)
                          })}
                          className="min-w-[140px] bg-transparent text-2xs font-bold text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />
                      ) : (
                        <span className="text-2xs font-bold text-warning">Subappaltatore da indicare</span>
                      )}

                      <span className="text-2xs text-text-tertiary">
                        {g.items.length} {g.items.length === 1 ? 'voce' : 'voci'}
                      </span>
                      <span className="text-2xs tabular font-semibold text-text-primary">{eur(g.total)}</span>
                      {g.yearly !== g.total && (
                        <span className="text-2xs text-text-tertiary" title="Peso su dodici mesi, secondo la frequenza">
                          {eur(g.yearly)}/anno
                        </span>
                      )}

                      {/* su quali e quanti progetti è staffato */}
                      {g.projectIds.length > 0 ? (
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-2xs text-text-tertiary">
                            su {g.projectIds.length} {g.projectIds.length === 1 ? 'progetto' : 'progetti'}:
                          </span>
                          {g.projectIds.map(id => (
                            <Link key={id} href={`/progetti/${id}?tab=economics`}
                              className="flex items-center gap-1 text-2xs font-semibold text-orange hover:opacity-80 max-w-[180px]">
                              <Truck className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{projectNames[id] ?? 'Progetto'}</span>
                            </Link>
                          ))}
                        </span>
                      ) : (
                        <span className="text-2xs text-text-tertiary">costo esterno, nessun progetto</span>
                      )}

                      <button onClick={() => setOpenSupplier(isOpen ? null : key)} aria-expanded={isOpen}
                        className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80 ml-auto shrink-0">
                        {isOpen ? 'chiudi' : 'voci'}
                        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {isOpen && (
                      <div className="px-5 pb-3 space-y-2">
                        {!g.supplier && (
                          <p className="text-2xs text-text-tertiary">
                            Il nome si scrive in <strong className="text-text-secondary">Dettagli → Fornitore</strong>,
                            una voce alla volta: un costo esterno senza un nome sopra non si può né contestare né
                            rinegoziare. Da lì in poi si rinomina dall&apos;intestazione del gruppo.
                          </p>
                        )}
                        {g.items.map(i => (
                          <ItemRow key={i.id} item={i} month={month} centers={centers} run={run}
                            projectNames={projectNames} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* aggiungere un fornitore senza passare da un progetto: il nome
                prima dell'importo, perché l'importo si scopre e il nome no */}
            <div className="px-5 py-3 border-t border-border flex items-center gap-2 flex-wrap">
              <input value={newSupplier} onChange={e => setNewSupplier(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newSupplier.trim()) {
                    run(() => addExternalSupplier(newSupplier), 'Subappaltatore aggiunto')
                    setNewSupplier('')
                  }
                }}
                placeholder="Nome del subappaltatore o fornitore"
                aria-label="Nome del subappaltatore da aggiungere"
                className="flex-1 min-w-[200px] bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary focus:outline-none focus:border-gold/40" />
              <button
                onClick={() => { run(() => addExternalSupplier(newSupplier), 'Subappaltatore aggiunto'); setNewSupplier('') }}
                disabled={pending || !newSupplier.trim()}
                className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" />Subappaltatore
              </button>
              <p className="text-2xs text-text-tertiary basis-full">
                I subappalti di un lavoro venduto si creano dall&apos;economics del progetto, che li quota e li
                rateizza. Qui si aggiungono i fornitori che non hanno un progetto dietro: studi, consulenti, agenzie.
              </p>
            </div>
          </>
        )}
      </section>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="flex items-start gap-2 text-2xs text-text-tertiary flex-1 min-w-[280px]">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          L&apos;importo di una voce è quanto costa <strong className="font-semibold">ogni volta che torna</strong>, non la sua
          dodicesima parte: un canone annuale da 1.200 pesa 1.200 nel mese in cui si paga. Spalmarlo darebbe un
          conto economico più liscio e una cassa sbagliata.
        </p>
        <Link href={`/economics?m=${month}`}
          className="text-2xs font-semibold text-gold-text hover:opacity-80 shrink-0">
          Vai al conto economico del mese →
        </Link>
      </div>
    </div>
  )
}

/** Una spesa ricorrente: quanto, ogni quanto, da quando. */
function ItemRow({ item, month, centers, run, projectNames, locked = false }: {
  item: CostItem
  month: string
  centers: CostCenter[]
  run: (fn: () => Promise<unknown>, ok?: string) => void
  projectNames: Record<string, string>
  /** voce del personale: si legge, si cambia dalla sezione Personale */
  locked?: boolean
}) {
  const [more, setMore] = useState(false)
  const yearly = yearlyCost(item)
  const upcoming = nextOccurrences(item, month, 4)

  if (locked) {
    return (
      <div className={`rounded-xl border border-border p-2.5 flex items-center gap-2 flex-wrap ${item.is_active ? '' : 'opacity-60'}`}>
        <Users className="w-3.5 h-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="flex-1 min-w-[120px] text-2xs font-semibold text-text-primary truncate">{item.label}</span>
        <span className="text-2xs tabular font-semibold text-text-primary">{eur(item.amount)}</span>
        <span className="text-2xs text-text-tertiary">{FREQUENCY_LABEL[item.frequency]}</span>
        <span className={`rounded-lg px-1.5 py-0.5 text-2xs font-semibold border ${
          item.cost_type === 'F' ? 'bg-info-dim border-info/40 text-info' : 'bg-accent-dim border-accent/40 text-accent'
        }`}>{item.cost_type === 'F' ? 'fisso' : 'variabile'}</span>
        <Link href="/economics/personale"
          className="text-2xs font-semibold text-gold-text hover:opacity-80 whitespace-nowrap">
          apri in Personale →
        </Link>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-2.5 ${item.is_active ? 'border-border' : 'border-dashed border-border opacity-60'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {item.project_id
          ? <Truck className="w-3.5 h-3.5 shrink-0 text-orange" />
          : <Repeat className={`w-3.5 h-3.5 shrink-0 ${item.cost_type === 'F' ? 'text-info' : 'text-accent'}`} />}
        <Draft value={item.label} label="Nome della spesa"
          onSave={v => run(() => updateCostItem(item.id, { label: v }))}
          className="flex-1 min-w-[120px] bg-transparent text-2xs font-semibold text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />

        {/* un subappalto non è un costo di struttura: si vede a quale lavoro appartiene */}
        {item.project_id && (
          <Link href={`/progetti/${item.project_id}?tab=economics`}
            className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text max-w-[180px]">
            <span className="truncate">{projectNames[item.project_id] ?? 'Progetto'}</span>
          </Link>
        )}

        <Money value={item.amount} small onSave={v => run(() => updateCostItem(item.id, { amount: v }))} />

        <select value={item.frequency} aria-label="Frequenza"
          onChange={e => run(() => updateCostItem(item.id, { frequency: e.target.value as Frequency }))}
          className="bg-background border border-border rounded-lg px-1.5 py-1 text-2xs text-text-secondary">
          {FREQS.map(f => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
        </select>

        <select value={item.cost_type} aria-label="Fisso o variabile"
          onChange={e => run(() => updateCostItem(item.id, { cost_type: e.target.value as 'F' | 'V' }))}
          className={`rounded-lg px-1.5 py-1 text-2xs font-semibold border ${
            item.cost_type === 'F' ? 'bg-info-dim border-info/40 text-info' : 'bg-accent-dim border-accent/40 text-accent'
          }`}>
          <option value="F">fisso</option>
          <option value="V">variabile</option>
        </select>

        <button onClick={() => setMore(!more)} aria-expanded={more}
          className="text-2xs font-semibold text-gold-text hover:opacity-80">{more ? 'Chiudi' : 'Dettagli'}</button>
        <button onClick={() => run(() => deleteCostItem(item.id), 'Voce eliminata')}
          aria-label={`Elimina ${item.label}`} className="text-text-tertiary hover:text-error">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {more && (
        <div className="mt-2 grid gap-2 sm:grid-cols-4 border-t border-border pt-2">
          <Field label="Area">
            <select value={item.center_id ?? ''} aria-label="Area"
              onChange={e => run(() => updateCostItem(item.id, { center_id: e.target.value || null }), 'Spostata')}
              className={inp}>
              <option value="">— senza area —</option>
              {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Categoria">
            <Draft value={item.category} label="Categoria" className={inp}
              onSave={v => run(() => updateCostItem(item.id, { category: v }))} />
          </Field>
          <Field label="Fornitore">
            <Draft value={item.supplier ?? ''} label="Fornitore" className={inp} placeholder="—"
              onSave={v => run(() => updateCostItem(item.id, { supplier: v || null }))} />
          </Field>
          <Field label="Attiva">
            <select value={item.is_active ? '1' : '0'} aria-label="Attiva"
              onChange={e => run(() => updateCostItem(item.id, { is_active: e.target.value === '1' }))}
              className={inp}>
              <option value="1">sì</option>
              <option value="0">sospesa</option>
            </select>
          </Field>
          <Field label="Da (mese)">
            <Draft type="month" value={item.start_month?.slice(0, 7) ?? ''} label="Mese d'inizio" className={inp}
              onSave={v => run(() => updateCostItem(item.id, { start_month: v ? `${v}-01` : null }))} />
          </Field>
          <Field label="Fino a (mese)">
            <Draft type="month" value={item.end_month?.slice(0, 7) ?? ''} label="Mese di fine" className={inp}
              onSave={v => run(() => updateCostItem(item.id, { end_month: v ? `${v}-01` : null }))} />
          </Field>
          <Field label="IVA">
            <select value={item.vat_applied ? '1' : '0'} aria-label="IVA"
              onChange={e => run(() => updateCostItem(item.id, { vat_applied: e.target.value === '1' }))}
              className={inp}>
              <option value="0">esclusa dal conto</option>
              <option value="1">da sommare</option>
            </select>
          </Field>
          <div className="text-2xs text-text-tertiary self-end pb-1">
            {yearly > 0 && <>Pesa <strong className="font-semibold text-text-secondary">{eur(yearly)}</strong> l&apos;anno</>}
            {item.frequency !== 'mensile' && !item.start_month && (
              <span className="block text-warning">Senza mese d&apos;inizio non entra in nessun mese</span>
            )}
          </div>
          {/* quando tornerà: una spesa trimestrale si dimentica, e poi arriva */}
          {upcoming.length > 0 && (
            <p className="sm:col-span-4 text-2xs text-text-tertiary border-t border-border pt-2">
              Prossime uscite: {upcoming.map(m => monthLabel(m)).join(' · ')}
            </p>
          )}
        </div>
      )}

      {!more && item.frequency !== 'mensile' && !item.start_month && (
        <p className="text-2xs text-warning mt-1">
          «{FREQUENCY_LABEL[item.frequency]}» ha bisogno di un mese d&apos;inizio per sapere quando cade
        </p>
      )}
    </div>
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

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub: string; tone?: 'error' | 'success'
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-1.5">{icon}
        <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className={`text-xl font-bold tabular ${
        tone === 'error' ? 'text-error' : tone === 'success' ? 'text-success' : 'text-text-primary'
      }`}>{value}</div>
      <div className="text-2xs text-text-tertiary mt-0.5">{sub}</div>
    </div>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-text-secondary">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label} <span className="tabular font-semibold text-text-primary">{value}</span>
    </span>
  )
}
