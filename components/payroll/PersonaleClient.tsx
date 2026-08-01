'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, Users, Wallet, PiggyBank,
  Sparkles, ShieldAlert, AlertTriangle, Lightbulb, Check, Loader2, Download,
  ScrollText, SlidersHorizontal, Info, ArrowRight, BadgeCheck,
  FileText, Receipt, Landmark, Baby, CalendarDays,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel, shiftMonth } from '@/lib/pl'
import {
  personCost, personNet, accruals, teamTotals, payrollHints, compareEmployment,
  flatTaxNet, contractSpec, CONTRACTS, monthLedger, ledgerAlerts,
  grossFromMonthlyNet, monthlyNetFromGross, monthlyInputSpec, ageAt, eligibility, fringeCapFor,
  type PayrollParams, type PersonInput, type ContractKind,
  type Payslip, type CollabInvoice, type F24, type TfrMovement,
} from '@/lib/payroll'
import { PARAM_FIELDS, type PersonRow } from '@/lib/payroll-map'
import { PayslipsTab, InvoicesTab, F24Tab, TfrTab } from '@/components/payroll/LedgerTabs'
import {
  addPerson, updatePerson, deletePerson, updateParams, markParamsVerified, pushLedgerToProfitLoss,
} from '@/app/actions/payroll'
import { EconomicsNav } from '@/components/economics/EconomicsNav'
import { Draft, Money } from '@/components/economics/fields'

type Person = PersonRow

const eur = (n: number) => formatCurrency(Math.round(n))
const eur2 = (n: number) => formatCurrency(n)
const pc = (n: number) => `${Math.round(n * 100)}%`
const pc1 = (n: number) => `${(n * 100).toFixed(2).replace('.', ',')}%`

const input = 'bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary focus:outline-none focus:border-gold/40'

const KIND_TONE: Record<string, string> = {
  subordinato: 'bg-info/15 text-info border-info/30',
  parasubordinato: 'bg-warning-dim text-warning border-warning/30',
  autonomo: 'bg-accent/15 text-accent border-accent/30',
}

type Tab = 'organico' | 'cedolini' | 'fatture' | 'f24' | 'tfr' | 'contratti' | 'aliquote'

export function PersonaleClient({
  month, setupNeeded, ledgerMissing, monthExists, monthLocked, monthRevenue,
  people, params, slips, yearSlips, invoices, f24, tfrMoves,
}: {
  month: string
  setupNeeded: boolean
  /** la 182 non è stata eseguita: cedolini e fatture non hanno dove stare */
  ledgerMissing: boolean
  monthExists: boolean
  monthLocked: boolean
  monthRevenue: number
  people: Person[]
  params: PayrollParams
  slips: Payslip[]
  yearSlips: Payslip[]
  invoices: CollabInvoice[]
  f24: F24 | null
  tfrMoves: TfrMovement[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<Tab>('organico')
  const [open, setOpen] = useState<string | null>(null)
  // chiusi di default: la prima cosa da vedere è l'organico, non i consigli
  const [hintsOpen, setHintsOpen] = useState(false)

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const go = (d: number) => router.push(`/economics/personale?m=${shiftMonth(month, d)}`)

  const active = useMemo(() => people.filter(p => p.active), [people])
  const tot = useMemo(() => teamTotals(active, params), [active, params])

  /* §182: quando ci sono i documenti il mese si legge da quelli. La stima
     annua resta sotto, per pianificare — ma il consuntivo lo dicono i cedolini. */
  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const ledger = useMemo(() => monthLedger(
    slips.map(s2 => ({ slip: s2, kind: byId.get(s2.personId)?.kind ?? 'indeterminato' })),
    invoices, params), [slips, invoices, byId, params])
  const hasDocs = slips.length > 0 || invoices.length > 0

  const alerts = useMemo(() => ledgerAlerts(
    people.filter(p => p.active).map(p => ({
      person: { id: p.id, name: p.name, kind: p.kind, agreedNet: p.agreedNet },
      slip: slips.find(s2 => s2.personId === p.id),
      invoice: invoices.find(i => i.personId === p.id),
    })),
    f24, params, monthRevenue), [people, slips, invoices, f24, params, monthRevenue])
  const hints = useMemo(() => payrollHints(active, params, monthRevenue * 12, month), [active, params, monthRevenue, month])
  const savings = useMemo(() => hints.reduce((t, h) => t + (h.value ?? 0), 0), [hints])

  if (setupNeeded) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        <EconomicsNav active="personale" month={month} />
        <div className="rounded-2xl border border-warning/40 bg-warning-dim p-4 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-text-primary">Migration da eseguire</p>
            <p className="text-2xs text-text-secondary mt-1">
              Le tabelle del personale non esistono ancora: esegui{' '}
              <code className="px-1 py-0.5 rounded bg-surface border border-border">supabase/migrations/181_payroll.sql</code>{' '}
              nel SQL Editor di Supabase.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <EconomicsNav active="personale" month={month} />

      {/* ── testata ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => go(-1)} aria-label="Mese precedente"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">Personale</h1>
            <button onClick={() => go(1)} aria-label="Mese successivo"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {monthLabel(month)} · <span className="tabular font-semibold text-text-primary">{tot.headcount}</span> person
            {tot.headcount === 1 ? 'a' : 'e'} · <span className="tabular font-semibold text-text-primary">{tot.fte}</span> FTE
          </p>
        </div>

        <button
          onClick={() => run(async () => {
            const { rows, total, estimated } = await pushLedgerToProfitLoss(month)
            toast.success(`${rows} righe in «Persone» per ${eur(total)}`)
            if (estimated > 0) {
              toast.warning(`${estimated} rig${estimated === 1 ? 'a' : 'he'} da stima: manca il documento`)
            }
          })}
          disabled={pending || !monthExists || monthLocked || active.length === 0}
          title={!monthExists ? 'Apri prima il mese dal conto economico'
            : monthLocked ? 'Mese chiuso'
            : 'Scrive una riga per persona nella voce Persone del conto economico'}
          className="flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold rounded-xl px-3 py-2 press disabled:opacity-40">
          <Download className="w-3.5 h-3.5" />Porta nel conto economico
        </button>
      </div>

      {/* ── i numeri che contano ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Wallet className="w-4 h-4 text-error" />} label="Costo di competenza"
          value={eur(hasDocs ? ledger.economic : tot.monthCost)}
          sub={hasDocs ? 'dai documenti del mese' : 'stima dai contratti'} />
        <Kpi icon={<Download className="w-4 h-4 text-warning" />} label="Uscita di cassa"
          value={eur(hasDocs ? ledger.cash : tot.yearCash / 12)}
          sub={hasDocs ? `${eur(ledger.netPayroll)} netti · ${eur(ledger.employeeWithheld)} trattenute` : 'stimata'} />
        <Kpi icon={<PiggyBank className="w-4 h-4 text-warning" />} label="TFR che matura"
          value={eur(hasDocs ? ledger.tfrAccrued : tot.tfr / 12)}
          sub="costo adesso, cassa alla fine del rapporto" />
        <Kpi icon={<Sparkles className="w-4 h-4 text-gold-text" />} label="Incidenza sul fatturato"
          value={monthRevenue > 0 ? pc((hasDocs ? ledger.economic : tot.monthCost) / monthRevenue) : '—'}
          sub={monthRevenue > 0 ? `su ${eur(monthRevenue)} del mese` : 'nessun fatturato nel mese'}
          tone={monthRevenue > 0 && (hasDocs ? ledger.economic : tot.monthCost) / monthRevenue > 0.5 ? 'error' : undefined} />
      </div>

      {/* i tre valori che non si sommano fra loro */}
      {hasDocs && (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <div className="flex items-start gap-2 flex-wrap">
            <Info className="w-3.5 h-3.5 text-text-tertiary mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-2xs text-text-secondary flex-1 min-w-[240px]">
              Nel conto economico entra <strong className="text-text-primary">{eur(ledger.economic)}</strong> di
              competenza. Dalla banca escono <strong className="text-text-primary">{eur(ledger.cash)}</strong>:{' '}
              {eur(ledger.netPayroll)} di netti, {eur(ledger.employeeWithheld)} di trattenute e{' '}
              {eur(ledger.employerCharges)} di oneri, che si versano con l&apos;F24, più{' '}
              {eur(ledger.paidToCollaborators)} pagati ai collaboratori. La differenza fra i due numeri è il TFR
              di {eur(ledger.tfrAccrued)}: <strong className="text-text-primary">non si sommano</strong>, sono
              due letture della stessa cosa.
              {ledger.estimatedCount > 0 && (
                <> {ledger.estimatedCount} person{ledger.estimatedCount === 1 ? 'a ha' : 'e hanno'} gli oneri
                  del datore stimati: il costo è indicativo finché non arriva il prospetto del consulente.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* debiti aperti: chi non è ancora stato pagato */}
      {(ledger.owedToPeople > 0 || ledger.owedToCollaborators > 0) && (
        <div className="rounded-2xl border border-warning/40 bg-warning-dim p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-2xs text-text-secondary">
            Da pagare: {ledger.owedToPeople > 0 && <strong className="text-text-primary">{eur(ledger.owedToPeople)} di netti</strong>}
            {ledger.owedToPeople > 0 && ledger.owedToCollaborators > 0 && ' · '}
            {ledger.owedToCollaborators > 0 && <strong className="text-text-primary">{eur(ledger.owedToCollaborators)} ai collaboratori</strong>}
            {f24 && !f24.paidOn && <> · <strong className="text-text-primary">{eur(f24.total)} di F24</strong></>}
          </p>
        </div>
      )}

      {ledgerMissing && (
        <div className="rounded-2xl border border-warning/40 bg-warning-dim p-3 flex items-start gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-2xs text-text-secondary">
            Cedolini, fatture, F24 e registro TFR hanno bisogno della migration{' '}
            <code className="px-1 rounded bg-surface border border-border">182_payroll_ledger.sql</code>.
            Senza, la sezione lavora solo con le stime dai contratti.
          </p>
        </div>
      )}

      {/* ── tab ── */}
      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {([
          ['organico', 'Organico', Users],
          ['cedolini', 'Cedolini', FileText],
          ['fatture', 'Fatture', Receipt],
          ['f24', 'F24', Landmark],
          ['tfr', 'TFR', PiggyBank],
          ['contratti', 'Contratti & regole', ScrollText],
          ['aliquote', 'Aliquote', SlidersHorizontal],
        ] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap ${
              tab === k ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'organico' && (
        <>
          {/* quello che non torna nei documenti: sono errori, non consigli,
              quindi non si nascondono dietro un pannello da aprire */}
          {alerts.length > 0 && (
            <section className="rounded-2xl border border-warning/40 bg-warning-dim overflow-hidden">
              <div className="px-5 py-3 border-b border-warning/30">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-text-primary">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  {alerts.length} cos{alerts.length === 1 ? 'a' : 'e'} da sistemare
                </h2>
              </div>
              <div className="divide-y divide-warning/20">
                {alerts.map(a => (
                  <div key={a.id} className="px-5 py-2.5">
                    <p className="text-2xs font-bold text-text-primary">{a.title}</p>
                    <p className="text-2xs text-text-secondary mt-0.5">{a.detail}</p>
                    {a.action && <p className="text-2xs text-gold-text font-semibold mt-0.5">{a.action}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* suggerimenti: leve legali, non scorciatoie. Si chiudono: quando li
              hai letti diventano rumore fra te e l'organico. */}
          {hints.length > 0 && (
            <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
              <button onClick={() => setHintsOpen(o => !o)} aria-expanded={hintsOpen}
                className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-surface-hover transition-colors">
                <Lightbulb className="w-4 h-4 text-gold-text shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold text-text-primary">
                    Dove si può ottimizzare
                    <span className="ml-1.5 text-2xs font-semibold text-text-tertiary">{hints.length}</span>
                  </h2>
                  <p className="text-2xs text-text-tertiary mt-0.5">
                    {hintsOpen
                      ? 'Strumenti previsti dalla legge, con il loro tetto e la loro condizione. Dove c\'è un rischio è scritto il rischio.'
                      : [
                          hints.filter(h => h.severity === 'opportunita').length && `${hints.filter(h => h.severity === 'opportunita').length} opportunità`,
                          hints.filter(h => h.severity === 'attenzione').length && `${hints.filter(h => h.severity === 'attenzione').length} da guardare`,
                        ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {savings > 0 && !hintsOpen && (
                  <span className="text-2xs tabular font-bold text-success shrink-0">{eur(savings)}</span>
                )}
                <ChevronDown className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${hintsOpen ? 'rotate-180' : ''}`} />
              </button>
              {hintsOpen && (
              <div className="divide-y divide-border/60 border-t border-border">
                {hints.map(h => (
                  <div key={h.id} className="flex items-start gap-2.5 px-5 py-3">
                    <span className={`mt-0.5 shrink-0 ${
                      h.severity === 'opportunita' ? 'text-success'
                      : h.severity === 'attenzione' ? 'text-warning' : 'text-text-tertiary'}`}>
                      {h.severity === 'opportunita' ? <Lightbulb className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-2xs font-bold text-text-primary">{h.title}</p>
                      <p className="text-2xs text-text-secondary mt-0.5">{h.detail}</p>
                      {h.action && <p className="text-2xs text-gold-text font-semibold mt-1">{h.action}</p>}
                    </div>
                    {h.value ? (
                      <span className="text-2xs tabular font-bold text-success shrink-0">{eur(h.value)}</span>
                    ) : null}
                  </div>
                ))}
              </div>
              )}
            </section>
          )}

          {/* l'organico */}
          <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-bold text-text-primary">Organico</h2>
                <p className="text-2xs text-text-tertiary mt-0.5">
                  Interni ed esterni insieme: un collaboratore che fattura ogni mese è costo del personale
                  anche se non ha una busta paga. <strong className="text-text-secondary">Si scrive il mese</strong>{' '}
                  — netto in busta per i dipendenti, compenso per chi fattura — e il resto lo calcola il tool
                </p>
              </div>
              <button onClick={() => run(() => addPerson(), 'Persona aggiunta')} disabled={pending}
                className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" />Persona
              </button>
            </div>

            {people.length === 0 ? (
              <p className="px-5 py-10 text-center text-2xs text-text-tertiary">
                Nessuno in organico. Aggiungi la prima persona per vedere quanto costa davvero.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {people.map(p => (
                  <PersonRow key={p.id} p={p} params={params} pending={pending} run={run} today={month}
                    isOpen={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />
                ))}
              </div>
            )}

            {tot.byKind.length > 0 && (
              <div className="px-5 py-3 border-t border-border flex flex-wrap gap-3">
                {tot.byKind.map(k => (
                  <span key={k.kind} className="text-2xs text-text-secondary">
                    <strong className="text-text-primary">{k.count}</strong> {k.label.toLowerCase()} ·{' '}
                    <span className="tabular">{eur(k.cost)}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'cedolini' && (
        <PayslipsTab people={people} slips={slips} params={params} month={month} pending={pending} run={run} />
      )}
      {tab === 'fatture' && (
        <InvoicesTab people={people} invoices={invoices} month={month} pending={pending} run={run} />
      )}
      {tab === 'f24' && (
        <F24Tab f24={f24} slips={slips} month={month} pending={pending} run={run} />
      )}
      {tab === 'tfr' && (
        <TfrTab people={people} yearSlips={yearSlips} moves={tfrMoves} month={month} pending={pending} run={run} />
      )}
      {tab === 'contratti' && <ContractGuide />}
      {tab === 'aliquote' && <ParamsPanel params={params} pending={pending} run={run} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'error' | 'success'
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-2xs text-text-secondary uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-black tabular ${
        tone === 'error' ? 'text-error' : tone === 'success' ? 'text-success' : 'text-text-primary'}`}>{value}</p>
      {sub && <p className="text-2xs text-text-tertiary mt-0.5">{sub}</p>}
    </div>
  )
}

/**
 * Una persona: la riga chiusa dice il costo, quella aperta dice **come** si
 * arriva a quel costo. Il dettaglio è il punto della sezione — un totale senza
 * scomposizione è un numero che non si può contestare, quindi nemmeno usare.
 */
function PersonRow({ p, params, pending, run, isOpen, onToggle, today }: {
  p: Person
  params: PayrollParams
  pending: boolean
  run: (fn: () => Promise<unknown>, ok?: string) => void
  isOpen: boolean
  onToggle: () => void
  /** la data su cui si valuta l'età: il mese guardato, non oggi */
  today: string
}) {
  const spec = contractSpec(p.kind)
  const c = personCost(p, params)
  const n = personNet(p, params)
  const a = accruals(p, params)
  const cmp = compareEmployment(p, params)
  const set = (patch: Record<string, unknown>) => run(() => updatePerson(p.id, patch))

  /* §183: la riga si legge e si scrive al mese. Per un dipendente il campo è il
     netto in busta, per chi fattura il compenso: sono i due numeri che una
     persona ha in testa quando pensa a quanto costa qualcuno. */
  const inputSpec = monthlyInputSpec(p.kind)
  const monthly = inputSpec.isNet
    ? (monthlyNetFromGross(p.gross, p.months, p.kind, params, p.fte) ?? 0)
    : p.gross / 12
  const age = ageAt(p.birthDate, today)
  const elig = eligibility(p, today)

  return (
    <div className={`px-5 py-3 ${p.active ? '' : 'opacity-50'}`}>
      {/* Griglia a colonne fisse: con le select a larghezza libera le colonne
          ballavano da una riga all'altra e i numeri non si potevano confrontare
          incolonnati, che è l'unica ragione per cui si mette una tabella. */}
      <div className="grid items-center gap-x-3 gap-y-1.5 grid-cols-[1fr_auto]
                      lg:grid-cols-[minmax(150px,1.3fr)_190px_110px_130px_auto]">
        {/* nome + tipologia: la persona e come la si tiene */}
        <div className="min-w-0">
          <Draft value={p.name} label="Nome" onSave={v => set({ full_name: v })}
            className="w-full bg-transparent text-sm font-semibold text-text-primary border-b border-transparent focus:border-border-interactive outline-none truncate" />
          <div className="flex items-center gap-1.5 mt-0.5">
            {p.role && <span className="text-2xs text-text-tertiary truncate">{p.role}</span>}
            {age !== null && <span className="text-2xs text-text-tertiary shrink-0">{age} anni</span>}
            {p.hasChildren && (
              <span className="text-2xs text-text-tertiary shrink-0" title={`${p.childrenCount || 1} figli a carico: soglia welfare doppia`}>
                <Baby className="w-3 h-3 inline" aria-hidden="true" />
              </span>
            )}
            {p.status !== 'attiva' && (
              <span className="text-2xs font-semibold text-warning shrink-0">{p.status}</span>
            )}
          </div>
        </div>

        <select value={p.kind} aria-label={`Tipo di contratto di ${p.name}`} disabled={pending}
          onChange={e => set({ contract_kind: e.target.value as ContractKind })}
          className={`${input} font-semibold w-full max-lg:col-span-2`}>
          {CONTRACTS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>

        {/* §183: si scrive il MESE, non l'anno. La RAL la calcola il tool —
            scrivere «1300» pensando al mese e vedersi 108 €/mese è il modo più
            veloce per non fidarsi più di un numero. */}
        <div className="flex flex-col items-end max-lg:items-start">
          <Money value={Math.round(monthly)} small
            onSave={v => set({ gross_year: grossFromMonthlyNet(v, p.months, p.kind, params, p.fte) })} />
          <span className="text-2xs text-text-tertiary" title={inputSpec.hint}>{inputSpec.label}</span>
        </div>

        <div className="flex flex-col items-end max-lg:items-start">
          <span className="text-sm tabular font-bold text-text-primary">{eur(c.monthly)}</span>
          <span className="text-2xs text-text-tertiary" title="Costo azienda: contributi, INAIL, TFR e ratei inclusi">
            costo/mese
          </span>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <button onClick={onToggle} aria-expanded={isOpen}
            className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80 whitespace-nowrap">
            dettaglio
            <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => run(() => deletePerson(p.id), 'Rimossa')} disabled={pending}
            aria-label={`Elimina ${p.name}`} className="text-text-tertiary hover:text-error shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {/* i parametri della persona */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Ruolo">
              <Draft value={p.role ?? ''} label="Ruolo" placeholder="es. Media Buyer"
                onSave={v => set({ role_label: v || null })} className={`${input} w-full`} />
            </Field>
            <Field label="Data di nascita"
              hint={age !== null ? `${age} anni${elig.apprentice ? ' · apprendistato ancora possibile' : ''}` : 'serve a sapere quali contratti sono possibili'}>
              <Draft value={p.birthDate ?? ''} label="Data di nascita" type="date"
                onSave={v => set({ birth_date: v || null })} className={`${input} w-full`} />
            </Field>
            <Field label="Figli a carico" hint={`soglia welfare ${eur(fringeCapFor(p, params))}`}>
              <span className="flex items-center gap-2">
                <Toggle on={p.hasChildren} disabled={pending}
                  onChange={v => set({ has_children: v, children_count: v ? Math.max(1, p.childrenCount) : 0 })} />
                {p.hasChildren && (
                  <Money value={p.childrenCount} small onSave={v => set({ children_count: Math.round(v) })} />
                )}
              </span>
            </Field>
            <Field label="Stato" hint="sospesa e cessata escono dai totali">
              <select value={p.status} aria-label="Stato del rapporto" disabled={pending}
                onChange={e => set({ status: e.target.value })} className={`${input} w-full`}>
                <option value="attiva">Attiva</option>
                <option value="sospesa">Sospesa</option>
                <option value="cessata">Cessata</option>
              </select>
            </Field>
            <Field label="Netto concordato" hint="se diverso da quello pagato, il tool lo segnala">
              <Money value={p.agreedNet ?? 0} small onSave={v => set({ agreed_net: v || null })} />
            </Field>
            <Field label="Mensilità" hint="13ª e 14ª sono già dentro la RAL">
              <select value={p.months} aria-label="Mensilità" disabled={pending || spec.employment !== 'subordinato'}
                onChange={e => set({ months: Number(e.target.value) })} className={`${input} w-full`}>
                <option value={12}>12</option><option value={13}>13</option><option value={14}>14</option>
              </select>
            </Field>
            <Field label="Impegno" hint="1 = full time">
              <Money value={p.fte} small onSave={v => set({ fte: Math.min(1, Math.max(0.01, v)) })} />
            </Field>
            <Field label="Mesi nell'anno" hint="chi entra a settembre non costa dodici mesi">
              <span className="flex items-center gap-1">
                <Money value={p.fromMonth} small onSave={v => set({ from_month: Math.round(v) })} />
                <ArrowRight className="w-3 h-3 text-text-tertiary" />
                <Money value={p.toMonth} small onSave={v => set({ to_month: Math.round(v) })} />
              </span>
            </Field>
            <Field label="Welfare / benefit annui" hint={`esenti fino a ${eur(params.fringeBenefitCap)}`}>
              <Money value={p.benefits} small onSave={v => set({ benefits_year: v })} />
            </Field>
            <Field label="Buoni pasto" hint={`esenti fino a ${eur2(params.mealVoucherExempt)}/giorno`}>
              <span className="flex items-center gap-1">
                <Money value={p.mealDays} small onSave={v => set({ meal_days: Math.round(v) })} />
                <span className="text-2xs text-text-tertiary">gg ×</span>
                <Money value={p.mealValue} small onSave={v => set({ meal_value: v })} />
              </span>
            </Field>
            {p.kind === 'piva_ordinario' && (
              <Field label="Rivalsa 4%" hint="cassa o Gestione Separata addebitata in fattura">
                <Toggle on={p.withRivalsa} onChange={v => set({ with_rivalsa: v })} disabled={pending} />
              </Field>
            )}
            {p.kind === 'piva_forfettario' && (
              <Field label="Primi 5 anni" hint="imposta sostitutiva al 5%">
                <Toggle on={p.startupRate} onChange={v => set({ startup_rate: v })} disabled={pending} />
              </Field>
            )}
            <Field label="In organico">
              <Toggle on={p.active} onChange={v => set({ is_active: v })} disabled={pending} />
            </Field>
          </div>

          {/* la scomposizione del costo */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Box title="Cosa paga l'azienda" total={c.total} totalLabel="costo annuo">
              <Line label={spec.employment === 'autonomo' ? 'Compenso fatturato' : 'Retribuzione lorda'} value={c.gross} />
              {c.inpsEmployer > 0 && <Line label="Contributi INPS" value={c.inpsEmployer} />}
              {c.inail > 0 && <Line label="INAIL" value={c.inail} />}
              {c.fixedTermExtra > 0 && <Line label="Addizionale NASpI" value={c.fixedTermExtra} />}
              {c.tfr > 0 && <Line label="TFR maturato" value={c.tfr} muted="non esce di cassa" />}
              {c.benefits > 0 && <Line label="Welfare e benefit" value={c.benefits} />}
              {c.mealVouchers > 0 && <Line label="Buoni pasto" value={c.mealVouchers} />}
              <Line label="Uscita di cassa dell'anno" value={c.cash} strong />
              {c.loadPct > 0 && (
                <p className="text-2xs text-text-tertiary pt-1">
                  Costa il <strong className="text-text-primary">{pc(c.loadPct)}</strong> in più della sola retribuzione.
                </p>
              )}
            </Box>

            {spec.employment === 'subordinato' && n.net !== null ? (
              <Box title="Cosa arriva a lui" total={n.net} totalLabel="netto annuo stimato">
                <Line label="Lordo" value={n.gross} />
                <Line label="Contributi a suo carico" value={-n.socialContributions} />
                <Line label="IRPEF netta" value={-n.irpef} muted={n.deductions > 0 ? `dopo ${eur(n.deductions)} di detrazioni` : undefined} />
                <Line label="Addizionali" value={-n.surcharges} />
                <Line label={`Netto per mensilità (×${p.months})`} value={n.perMonth ?? 0} strong />
                <p className="text-2xs text-text-tertiary pt-1">
                  Di {eur(c.total)} spesi, gliene arrivano {eur(n.net)}: il{' '}
                  <strong className="text-text-primary">{pc(n.efficiency ?? 0)}</strong>. Stima: mancano familiari a
                  carico, altri redditi e le addizionali del suo comune preciso.
                </p>
              </Box>
            ) : (
              <Box title="Dal suo lato" total={flatTaxNet(c.gross, params, p.startupRate).net}
                totalLabel={p.kind === 'piva_forfettario' ? 'netto stimato in forfettario' : 'imponibile fatturato'}>
                <Line label="Fatturato" value={c.gross} />
                {p.kind === 'piva_forfettario' && (
                  <>
                    <Line label={`Imponibile (${pc(params.flatTaxProfitability)})`} value={flatTaxNet(c.gross, params, p.startupRate).taxableIncome} />
                    <Line label="Contributi" value={-flatTaxNet(c.gross, params, p.startupRate).contributions} />
                    <Line label={`Imposta sostitutiva ${pc(p.startupRate ? params.flatTaxStartupPct : params.flatTaxPct)}`}
                      value={-flatTaxNet(c.gross, params, p.startupRate).tax} />
                  </>
                )}
                {/* §182: si dice «importo pagato», mai «netto personale» — le
                    imposte di chi fattura non sono conoscibili da Two Bee */}
                <p className="text-2xs text-warning pt-1">
                  Questo è l&apos;<strong>importo pagato al collaboratore</strong>, non il suo netto personale:
                  quanto gli resta dopo le sue imposte dipende dal suo regime e dai suoi altri redditi, che Two Bee non conosce.
                </p>
                <p className="text-2xs text-text-tertiary pt-1">
                  {p.kind === 'piva_ordinario'
                    ? 'L\'IVA in fattura è neutra: si detrae, non è un costo. La ritenuta d\'acconto è imposta sua, versata da te per suo conto.'
                    : 'Nessuna IVA, nessuna ritenuta: il costo per l\'azienda è esattamente quello che fattura.'}
                </p>
              </Box>
            )}
          </div>

          {/* ratei e confronto */}
          {spec.employment === 'subordinato' && (
            <div className="grid gap-3 lg:grid-cols-2">
              <Box title="Cosa matura senza uscire" total={a.tfrYear + a.thirteenth + a.fourteenth} totalLabel="accantonato nell'anno">
                <Line label="TFR nell'anno" value={a.tfrYear} muted={`${eur2(a.tfrMonth)}/mese`} />
                {p.tfrOpening > 0 && <Line label="TFR degli anni scorsi" value={p.tfrOpening} muted="debito verso la persona" />}
                {a.thirteenth > 0 && <Line label="Tredicesima" value={a.thirteenth} muted={`rateo ${eur2(a.thirteenthMonthly)}/mese`} />}
                {a.fourteenth > 0 && <Line label="Quattordicesima" value={a.fourteenth} muted={`rateo ${eur2(a.fourteenthMonthly)}/mese`} />}
                {a.decemberCash > 0 && (
                  <p className="text-2xs text-warning pt-1">
                    A dicembre escono <strong>{eur(a.decemberCash)}</strong> per la tredicesima, contributi compresi
                    {a.juneCash > 0 && <> · a giugno <strong>{eur(a.juneCash)}</strong> per la quattordicesima</>}.
                  </p>
                )}
              </Box>

              {cmp && (
                <Box title="Se fosse a P.IVA" total={cmp.equivalentInvoice} totalLabel="fattura a parità di netto">
                  <Line label="Costo come dipendente" value={cmp.employeeCost} />
                  <Line label="Netto che riceve oggi" value={cmp.employeeNet} />
                  <Line label="Fattura per dargli lo stesso netto" value={cmp.equivalentInvoice} strong />
                  <p className={`text-2xs pt-1 ${cmp.cheaperAsVat ? 'text-text-secondary' : 'text-success'}`}>
                    {cmp.cheaperAsVat
                      ? `Sulla carta l'azienda risparmierebbe ${eur(Math.abs(cmp.companyDelta))}. Ma la P.IVA non ha ferie pagate, malattia, TFR né tutele: se lavora come un dipendente, il rapporto è riqualificabile e i contributi si pagano dopo, con le sanzioni.`
                      : `Costerebbe ${eur(Math.abs(cmp.companyDelta))} in più: a questo livello di retribuzione il lavoro subordinato è anche più conveniente.`}
                  </p>
                </Box>
              )}
            </div>
          )}

          {/* §183: la finestra dell'apprendistato ha una scadenza vera */}
          {p.kind === 'indeterminato' && elig.apprentice && p.gross > 0 && p.gross < 25000 && (
            <div className="rounded-xl border border-warning/40 bg-warning-dim p-3 flex items-start gap-2">
              <CalendarDays className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-2xs text-text-secondary">
                A {age} anni l&apos;apprendistato professionalizzante sarebbe ancora possibile, e su questa
                retribuzione varrebbe circa{' '}
                <strong className="text-text-primary">{eur(p.gross * (params.inpsEmployerPct - params.inpsApprenticePct))}</strong>{' '}
                l&apos;anno di contributi in meno.
                {elig.monthsLeft !== null && elig.monthsLeft <= 12 && (
                  <> <strong className="text-warning">La finestra si chiude entro {elig.monthsLeft} mesi</strong> e non si riapre.</>
                )}
              </p>
            </div>
          )}

          {/* cosa sapere di questo contratto */}
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-2xs font-bold text-text-primary">{spec.label}</p>
            <p className="text-2xs text-text-secondary mt-0.5">{spec.what}</p>
            <ul className="mt-1.5 space-y-0.5">
              {spec.notes.map(nt => (
                <li key={nt} className="text-2xs text-text-tertiary flex gap-1.5">
                  <span className="text-text-tertiary shrink-0">·</span>{nt}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs text-text-secondary mb-1">{label}</p>
      {children}
      {hint && <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  )
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button onClick={() => onChange(!on)} disabled={disabled} role="switch" aria-checked={on}
      className={`w-9 h-5 rounded-full transition-colors relative ${on ? 'bg-gold' : 'bg-surface-active'} disabled:opacity-40`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-surface transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

function Box({ title, total, totalLabel, children }: {
  title: string; total: number; totalLabel: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-2xs font-bold text-text-primary uppercase tracking-wider">{title}</p>
        <span className="text-sm tabular font-black text-text-primary">{eur(total)}</span>
      </div>
      <p className="text-2xs text-text-tertiary -mt-2 mb-2 text-right">{totalLabel}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Line({ label, value, muted, strong }: { label: string; value: number; muted?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-2xs ${strong ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>
        {label}
        {muted && <span className="text-text-tertiary font-normal"> · {muted}</span>}
      </span>
      <span className={`text-2xs tabular shrink-0 ${
        strong ? 'font-bold text-text-primary' : value < 0 ? 'text-error' : 'text-text-secondary'}`}>
        {value < 0 ? '−' : ''}{eur(Math.abs(value))}
      </span>
    </div>
  )
}

/** Le tipologie contrattuali italiane, spiegate a chi non fa contratti di mestiere. */
function ContractGuide() {
  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-bold text-text-primary">Con che contratto</h2>
        <p className="text-2xs text-text-tertiary mt-0.5">
          Otto forme, tre famiglie: chi ha una busta paga, chi collabora, chi fattura. La differenza non è
          burocratica — cambia il costo, le tutele e cosa succede se il rapporto finisce male
        </p>
      </div>
      <div className="divide-y divide-border/60">
        {CONTRACTS.map(c => (
          <div key={c.kind} className="px-5 py-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-text-primary">{c.label}</p>
              <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${KIND_TONE[c.employment]}`}>
                {c.employment}
              </span>
              {c.tfr && <span className="text-2xs text-text-tertiary">matura TFR</span>}
              {c.extraMonths > 0 && (
                <span className="text-2xs text-text-tertiary">
                  {c.extraMonths === 2 ? '13ª e 14ª' : `${c.extraMonths}ª`}
                </span>
              )}
              {c.inail && <span className="text-2xs text-text-tertiary">INAIL</span>}
            </div>
            <p className="text-2xs text-text-secondary mt-1">{c.what}</p>
            <ul className="mt-1.5 space-y-0.5">
              {c.notes.map(n => (
                <li key={n} className="text-2xs text-text-tertiary flex gap-1.5">
                  <span className="shrink-0">·</span>{n}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="px-5 py-3 text-2xs text-text-tertiary bg-background border-t border-border">
        Sintesi operativa, non consulenza del lavoro: il CCNL applicato cambia mensilità, minimi e scatti,
        e su un contratto si decide col consulente.
      </p>
    </section>
  )
}

/**
 * Le aliquote. Sono in configurazione e non nel codice perché cambiano ogni
 * anno: finché nessuno le conferma la pagina dichiara che sta stimando, e
 * l'avviso resta lì a dare fastidio finché non si compila la data.
 */
function ParamsPanel({ params, pending, run }: {
  params: PayrollParams
  pending: boolean
  run: (fn: () => Promise<unknown>, ok?: string) => void
}) {
  const [by, setBy] = useState('')
  const groups = [
    ['contributi', 'Contributi e assicurazione'],
    ['tfr', 'TFR'],
    ['irpef', 'IRPEF e addizionali'],
    ['autonomi', 'Autonomi e forfettario'],
    ['welfare', 'Welfare e premi'],
  ] as const

  const raw = params as unknown as Record<string, unknown>
  const valueOf = (key: string): number => {
    // dal nome della colonna al campo del motore: snake_case → camelCase
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    return Number(raw[camel] ?? 0)
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 ${params.verifiedAt ? 'border-success/30 bg-success-dim' : 'border-warning/40 bg-warning-dim'}`}>
        <div className="flex items-start gap-2.5 flex-wrap">
          {params.verifiedAt
            ? <BadgeCheck className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
            : <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />}
          <div className="flex-1 min-w-[240px]">
            <p className="text-sm font-bold text-text-primary">
              {params.verifiedAt
                ? `Aliquote ${params.year} verificate il ${new Date(params.verifiedAt).toLocaleDateString('it-IT')}`
                : `Aliquote ${params.year} non verificate`}
            </p>
            <p className="text-2xs text-text-secondary mt-0.5">
              {params.verifiedAt
                ? 'I calcoli poggiano su numeri confermati. Rivedili a inizio anno: cambiano quasi sempre.'
                : 'I valori in uso sono quelli di partenza, non un dato ufficiale. L\'aliquota INPS a carico azienda dipende dal CCNL e dalla dimensione (29-32% nel terziario): un punto di differenza su 100.000 € di organico è mille euro l\'anno.'}
            </p>
          </div>
          {!params.verifiedAt && (
            <div className="flex items-center gap-1.5">
              <input value={by} onChange={e => setBy(e.target.value)} placeholder="Chi le ha confermate"
                aria-label="Chi ha verificato le aliquote" className={input} />
              <button onClick={() => run(() => markParamsVerified(params.year, by), 'Aliquote verificate')}
                disabled={pending || !by.trim()}
                className="flex items-center gap-1.5 text-2xs font-bold bg-gold text-on-gold rounded-lg px-2.5 py-1.5 press disabled:opacity-40">
                <Check className="w-3 h-3" />Segna
              </button>
            </div>
          )}
        </div>
      </div>

      {groups.map(([key, label]) => (
        <section key={key} className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-bold text-text-primary">{label}</h3>
          </div>
          <div className="divide-y divide-border/60">
            {PARAM_FIELDS.filter(f => f.group === key).map(f => (
              <div key={f.key} className="flex items-start gap-3 px-5 py-2.5 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-2xs font-semibold text-text-primary">{f.label}</p>
                  <p className="text-2xs text-text-tertiary mt-0.5">{f.hint}</p>
                </div>
                <span className="flex items-center gap-1.5 shrink-0">
                  {f.format === 'pct' && (
                    <span className="text-2xs tabular text-text-tertiary w-14 text-right">{pc1(valueOf(f.key))}</span>
                  )}
                  <Money value={valueOf(f.key)} small
                    onSave={v => run(() => updateParams(params.year, { [f.key]: v }), 'Aggiornata')} />
                  <span className="text-2xs text-text-tertiary w-3">
                    {f.format === 'eur' ? '€' : f.format === 'pct' ? '' : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="text-2xs text-text-tertiary">
        Le percentuali si scrivono in decimale: 0,30 vale il 30%. Gli scaglioni IRPEF si cambiano
        direttamente sulla colonna <code className="px-1 rounded bg-surface border border-border">irpef_brackets</code>,
        perché il loro numero cambia con le riforme.
      </p>
    </div>
  )
}
