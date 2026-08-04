'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowDownLeft, ArrowUpRight, Banknote, Upload, Search, Link2, Link2Off, Check,
  AlertTriangle, TrendingUp, TrendingDown, Loader2, ChevronDown, ShieldAlert,
  Receipt, Landmark, Users, Repeat, CircleSlash, Sparkles, CalendarClock, Plus,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel } from '@/lib/pl'
import {
  balance, runningBalance, buckets, bucketLabel, compare, matchCandidates,
  unreconciled, forecast, bankInsights, byCounterparty, byKind, daysToCash,
  grossOf, isStructural, liquidity, fundingNeed,
  type BankAccount, type BankTx, type PlLineRef, type Expected,
  type Granularity, type TxKind,
} from '@/lib/bank'
import {
  importBankCsv, reconcile, unreconcile, markNoMatch, addManualTx, deleteTx,
} from '@/app/actions/bank'
import { spendSplit, CHECK_FAMILIES } from '@/lib/bank-import'
import { EconomicsNav } from '@/components/economics/EconomicsNav'
import {
  RevenueCostChart, TrendChart, DonutChart, SplitBar, Sparkline,
} from '@/components/charts/Charts'

const eur = (n: number) => formatCurrency(Math.round(n))
const eur2 = (n: number) => formatCurrency(n)
const pc = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`

const KIND_UI: Record<TxKind, { label: string; Icon: typeof Receipt; cls: string }> = {
  incasso:      { label: 'Incasso',       Icon: ArrowDownLeft, cls: 'text-success' },
  pagamento:    { label: 'Pagamento',     Icon: ArrowUpRight,  cls: 'text-error' },
  stipendio:    { label: 'Stipendi',      Icon: Users,         cls: 'text-warning' },
  imposta:      { label: 'Imposte',       Icon: Landmark,      cls: 'text-orange' },
  commissione:  { label: 'Commissioni',   Icon: Receipt,       cls: 'text-text-tertiary' },
  giroconto:    { label: 'Giroconto',     Icon: Repeat,        cls: 'text-info' },
  finanziamento:{ label: 'Soci e capitale', Icon: Banknote,    cls: 'text-accent' },
  altro:        { label: 'Altro',         Icon: CircleSlash,   cls: 'text-text-tertiary' },
}

const GRAN: { key: Granularity; label: string }[] = [
  { key: 'day', label: 'Giorno' },
  { key: 'week', label: 'Settimana' },
  { key: 'month', label: 'Mese' },
  { key: 'quarter', label: 'Trimestre' },
  { key: 'year', label: 'Anno' },
]

type PlMonth = {
  month: string; status: string
  accrued: number; collected: number; unpaid: number; vat: number
  growth: number; digital: number
  costs: number; structural: number; external: number
  margin: number; company: number; distributed: number; passThrough: number
}

export function BankClient({
  month, today, setupNeeded, accounts, txs, openLines, expected, months, plByMonth,
  clientNames, spendItems,
}: {
  month: string
  today: string
  setupNeeded: boolean
  accounts: BankAccount[]
  txs: BankTx[]
  openLines: PlLineRef[]
  expected: Expected[]
  months: string[]
  plByMonth: PlMonth[]
  clientNames: Record<string, string>
  /** §190 — le voci di piano che ciascun conto paga, per il fabbisogno del bonifico */
  spendItems: Record<string, { label: string; amount: number; center_id: string | null; centerName: string | null }[]>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  /* Il conto scelto. La liquidità totale sta sopra e non cambia: quella è
     dell'azienda, il saldo è del conto. */
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const account = accounts.find(a => a.id === accountId) ?? accounts[0] ?? null
  const ownTxs = useMemo(() => txs.filter(t => t.account_id === account?.id), [txs, account])
  const liq = useMemo(() => liquidity(accounts, txs), [accounts, txs])

  const [gran, setGran] = useState<Granularity>('month')
  const [q, setQ] = useState('')
  const [kindFilter, setKindFilter] = useState<TxKind | 'tutti'>('tutti')
  const [openTx, setOpenTx] = useState<string | null>(null)
  const [showAllTx, setShowAllTx] = useState(false)
  const [manual, setManual] = useState(false)
  const [mForm, setMForm] = useState({ booked_on: today, amount: '', description: '' })

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const upload = (file: File) => start(async () => {
    try {
      const text = await file.text()
      const r = await importBankCsv(account!.id, text)
      toast.success(`${r.nuovi} movimenti nuovi su ${r.letti} letti`
        + (r.duplicati ? ` · ${r.duplicati} già presenti` : ''))
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Import fallito') }
  })

  // ── i numeri ───────────────────────────────────────────────────────────────
  const bal = useMemo(() => balance(account ?? { opening_balance: 0 }, ownTxs), [account, ownTxs])
  const curve = useMemo(() => runningBalance(
    account ?? { opening_balance: 0, opening_date: today }, ownTxs), [account, ownTxs, today])
  const periods = useMemo(() => buckets(ownTxs, gran,
    { balance: account?.opening_balance ?? 0, complete: true }), [ownTxs, gran, account])
  const fc = useMemo(() => forecast(today, bal.real, expected, 90), [today, bal.real, expected])

  const overdueIn = useMemo(() => openLines
    .filter(l => l.direction === 'in' && l.month < today)
    .reduce((s, l) => s + grossOf(l), 0), [openLines, today])
  const overdueOut = useMemo(() => openLines
    .filter(l => l.direction === 'out' && l.month < today)
    .reduce((s, l) => s + grossOf(l), 0), [openLines, today])

  const findings = useMemo(() => bankInsights({
    today, bal, txs: ownTxs, fc, overdueIn, overdueOut,
  }), [today, bal, ownTxs, fc, overdueIn, overdueOut])

  const open = useMemo(() => unreconciled(ownTxs), [ownTxs])
  const kinds = useMemo(() => byKind(ownTxs), [ownTxs])
  const topIn = useMemo(() => byCounterparty(ownTxs, 'in').slice(0, 6), [ownTxs])
  const topOut = useMemo(() => byCounterparty(ownTxs, 'out').slice(0, 6), [ownTxs])

  /* Giorni per farsi pagare: dal mese di competenza al bonifico. Si calcola solo
     sui movimenti riconciliati — sugli altri non si sa a cosa appartengono. */
  const dtc = useMemo(() => {
    const pairs = ownTxs.filter(t => t.source === 'banca' && t.amount > 0 && t.revenue_line_id)
      .map(t => ({ month: t.booked_on.slice(0, 8) + '01', bookedOn: t.booked_on }))
    return daysToCash(pairs)
  }, [ownTxs])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return ownTxs.filter(t => {
      if (kindFilter !== 'tutti' && t.kind !== kindFilter) return false
      if (!needle) return true
      return [t.description, t.counterparty ?? '', t.doc_ref ?? '', String(t.amount)]
        .join(' ').toLowerCase().includes(needle)
    })
  }, [ownTxs, q, kindFilter])

  const byDay = useMemo(() => {
    const m = new Map<string, BankTx[]>()
    for (const t of filtered) m.set(t.booked_on, [...(m.get(t.booked_on) ?? []), t])
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  if (setupNeeded || !account) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        <EconomicsNav active="banca" month={month} />
        <div className="rounded-2xl border border-warning/40 bg-warning-dim p-4 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-text-primary">Migration da eseguire</p>
            <p className="text-2xs text-text-secondary mt-1">
              Il conto corrente ha bisogno di{' '}
              <code className="px-1 py-0.5 rounded bg-surface border border-border">supabase/migrations/189_bank.sql</code>{' '}
              nel SQL Editor di Supabase. Porta le tabelle dei movimenti e i due trigger che tengono
              allineati conto corrente e conto economico.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <EconomicsNav active="banca" month={month} />

      {/* ══ la liquidità dell'azienda, che non è il saldo di un conto ══ */}
      {accounts.length > 1 && (
        <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">
                Liquidità totale · {accounts.length} conti
              </p>
              <p className="text-2xl font-bold text-text-primary tabular mt-0.5">{eur2(liq.total)}</p>
              {liq.pendingTransfers > 0 && (
                <p className="text-2xs text-warning mt-0.5">
                  {eur(liq.pendingTransfers)} di giroconti usciti da un conto e non ancora registrati
                  sull&apos;altro: la liquidità vera è più alta di così
                </p>
              )}
            </div>
            <div className="flex gap-1 bg-background border border-border rounded-xl p-1">
              {accounts.map(a => {
                const b = liq.perAccount.find(x => x.id === a.id)
                return (
                  <button key={a.id} onClick={() => setAccountId(a.id)} aria-pressed={a.id === account.id}
                    className={`px-3 py-1.5 rounded-lg text-left ${
                      a.id === account.id ? 'bg-gold text-on-gold' : 'hover:bg-surface-hover'}`}>
                    <span className={`block text-2xs font-bold ${a.id === account.id ? '' : 'text-text-primary'}`}>
                      {a.label.split('—')[0].trim()}
                    </span>
                    <span className={`block text-2xs tabular ${a.id === account.id ? 'opacity-80' : 'text-text-tertiary'}`}>
                      {eur(b?.real ?? 0)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ══ il saldo, come lo mostrerebbe la banca ══ */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="p-5 sm:p-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-gold-text" aria-hidden="true" />
              <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">
                {account.label}{account.bank_name ? ` · ${account.bank_name}` : ''}
              </p>
            </div>
            <p className="text-4xl sm:text-5xl font-bold text-text-primary tabular mt-1.5">
              {eur2(bal.real)}
            </p>
            <p className="text-2xs text-text-tertiary mt-1">
              {bal.lastBookedOn
                ? `saldo all'ultimo movimento registrato, ${new Date(bal.lastBookedOn).toLocaleDateString('it-IT')}`
                : 'nessun movimento caricato'}
            </p>
            {account.purpose && (
              <p className="text-2xs text-text-secondary mt-1.5 max-w-md">{account.purpose}</p>
            )}
            {Math.abs(bal.pending) > 0 && (
              <p className="text-2xs text-info mt-1.5">
                {eur2(bal.declared)} contando {eur(Math.abs(bal.pending))} già{' '}
                {bal.pending > 0 ? 'incassati' : 'pagati'} secondo il conto economico ma non ancora
                sull&apos;estratto conto
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} disabled={pending}
              className="flex items-center gap-1.5 text-2xs font-bold bg-gold text-on-gold rounded-xl px-3 py-2 press disabled:opacity-40">
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Importa estratto conto
            </button>
            <button onClick={() => setManual(m => !m)}
              className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <Plus className="w-3.5 h-3.5" />Movimento a mano
            </button>
          </div>
        </div>

        {manual && (
          <div className="px-5 pb-4 flex items-end gap-2 flex-wrap border-t border-border pt-4">
            <label className="text-2xs text-text-tertiary">
              <span className="block mb-1">Data</span>
              <input type="date" value={mForm.booked_on} onChange={e => setMForm({ ...mForm, booked_on: e.target.value })}
                className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary" />
            </label>
            <label className="text-2xs text-text-tertiary">
              <span className="block mb-1">Importo (negativo = uscita)</span>
              <input type="number" step="0.01" value={mForm.amount} onChange={e => setMForm({ ...mForm, amount: e.target.value })}
                placeholder="-250,00"
                className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary w-32" />
            </label>
            <label className="text-2xs text-text-tertiary flex-1 min-w-[200px]">
              <span className="block mb-1">Descrizione</span>
              <input value={mForm.description} onChange={e => setMForm({ ...mForm, description: e.target.value })}
                placeholder="Contanti, carta di un socio, giroconto…"
                className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary" />
            </label>
            <button disabled={pending || !mForm.amount || !mForm.description.trim()}
              onClick={() => run(async () => {
                await addManualTx(account.id, {
                  booked_on: mForm.booked_on, amount: Number(mForm.amount),
                  description: mForm.description,
                })
                setMForm({ booked_on: today, amount: '', description: '' }); setManual(false)
              }, 'Movimento aggiunto')}
              className="text-2xs font-bold bg-gold text-on-gold rounded-lg px-3 py-2 press disabled:opacity-40">
              Aggiungi
            </button>
            <p className="text-2xs text-text-tertiary basis-full">
              Un movimento a mano non è dell&apos;estratto conto: entra nel saldo dichiarato, non in quello reale.
            </p>
          </div>
        )}

        {/* la curva del saldo, e da oggi in poi la previsione tratteggiata */}
        <div className="px-5 pb-5">
          <TrendChart
            history={curve.map(p => ({ date: p.date, value: p.balance }))}
            forecast={fc.curve.map(p => ({ date: p.date, value: p.balance }))}
            todayLabel={new Date(today).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
            height={180} />
        </div>
      </section>

      {/* ══ i numeri del periodo ══ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Entrate registrate" value={eur(bal.inflow)}
          icon={<ArrowDownLeft className="w-4 h-4 text-success" />}
          sub={`${ownTxs.filter(t => t.source === 'banca' && t.amount > 0).length} accrediti`} />
        <Kpi label="Uscite registrate" value={eur(Math.abs(bal.outflow))}
          icon={<ArrowUpRight className="w-4 h-4 text-error" />}
          sub={`${ownTxs.filter(t => t.source === 'banca' && t.amount < 0).length} addebiti`} />
        <Kpi label="Crediti scaduti" value={eur(overdueIn)}
          icon={<AlertTriangle className={`w-4 h-4 ${overdueIn > 0 ? 'text-warning' : 'text-text-tertiary'}`} />}
          sub={overdueIn > bal.real ? 'più del saldo attuale' : 'fatture emesse e non incassate'}
          tone={overdueIn > bal.real ? 'error' : undefined} />
        <Kpi label="Giorni per farsi pagare" value={dtc.avg !== null ? `${dtc.avg}` : '—'}
          icon={<CalendarClock className="w-4 h-4 text-info" />}
          sub={dtc.avg !== null ? `media su ${dtc.count} incassi · peggiore ${dtc.worst}` : 'serve riconciliare gli incassi'} />
      </div>

      {/* ══ cosa non torna ══ */}
      {findings.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Sparkles className="w-4 h-4 text-gold-text" aria-hidden="true" />Cosa guardare
            </h2>
          </div>
          <div className="divide-y divide-border/60">
            {findings.map(f => (
              <div key={f.id} className="flex items-start gap-2.5 px-5 py-3">
                <span className={`mt-0.5 shrink-0 ${
                  f.severity === 'critico' ? 'text-error'
                  : f.severity === 'attenzione' ? 'text-warning' : 'text-text-tertiary'}`}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xs font-bold text-text-primary">{f.title}</p>
                  <p className="text-2xs text-text-secondary mt-0.5">{f.detail}</p>
                  {f.action && <p className="text-2xs text-gold-text font-semibold mt-1">{f.action}</p>}
                </div>
                {f.value ? <span className="text-2xs tabular font-bold text-text-primary shrink-0">{eur(f.value)}</span> : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══ il bonifico ricorrente che alimenta questo conto ══ */}
      {(account.funding_from_id || (spendItems[account.id] ?? []).length > 0) && (
        <FundingPanel account={account} accounts={accounts} balance={bal.real}
          items={spendItems[account.id] ?? []} txs={ownTxs} />
      )}

      {/* ══ da riconciliare ══ */}
      {open.length > 0 && (
        <section className="bg-surface border border-gold/40 rounded-2xl shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Link2 className="w-4 h-4 text-gold-text" aria-hidden="true" />
              {open.length} movimenti da riconciliare
            </h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              Agganciare un movimento alla sua riga segna la fattura incassata e spegne il movimento
              dichiarato. Nessun aggancio è automatico: un abbinamento sbagliato dichiara pagata una
              fattura che nessuno ha pagato
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {open.slice(0, 12).map(t => {
              const cands = matchCandidates(t, openLines)
              return (
                <div key={t.id} className="px-5 py-3">
                  <div className="flex items-start gap-3 flex-wrap">
                    <TxIcon t={t} />
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-2xs font-bold text-text-primary">
                        {t.counterparty ?? 'Controparte non riconosciuta'}
                        {t.doc_ref && <span className="ml-1.5 text-text-tertiary">fattura {t.doc_ref}</span>}
                      </p>
                      <p className="text-2xs text-text-tertiary truncate">{t.description}</p>
                    </div>
                    <span className={`text-sm tabular font-bold shrink-0 ${t.amount > 0 ? 'text-success' : 'text-error'}`}>
                      {t.amount > 0 ? '+' : ''}{eur2(t.amount)}
                    </span>
                    <span className="text-2xs text-text-tertiary shrink-0">
                      {new Date(t.booked_on).toLocaleDateString('it-IT')}
                    </span>
                    <button onClick={() => run(() => markNoMatch(t.id), 'Segnato: niente da riconciliare')}
                      disabled={pending}
                      className="text-2xs font-semibold text-text-tertiary hover:text-text-secondary shrink-0">
                      niente da abbinare
                    </button>
                  </div>

                  {cands.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {cands.slice(0, 3).map(c => (
                        <button key={c.line.id} disabled={pending}
                          onClick={() => run(() => reconcile(t.id, c.line.direction === 'in'
                            ? { revenueLineId: c.line.id } : { costLineId: c.line.id }),
                            'Riconciliato: la riga risulta pagata')}
                          className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl border border-border hover:border-gold hover:bg-gold-dim press disabled:opacity-40">
                          <span className={`text-2xs font-bold tabular shrink-0 w-10 ${
                            c.score >= 0.8 ? 'text-success' : c.score >= 0.5 ? 'text-warning' : 'text-text-tertiary'}`}>
                            {Math.round(c.score * 100)}%
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-2xs font-semibold text-text-primary truncate">{c.line.label}</span>
                            <span className="block text-2xs text-text-tertiary">
                              {monthLabel(c.line.month)} · {c.why.join(' · ')}
                            </span>
                          </span>
                          <span className="text-2xs tabular font-bold text-text-primary shrink-0">
                            {eur2(grossOf(c.line))}
                          </span>
                          <Link2 className="w-3.5 h-3.5 text-gold-text shrink-0" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-2xs text-text-tertiary mt-1.5">
                      Nessuna riga aperta con questo importo. Se è un costo che non è a piano, registralo
                      prima nel conto economico del suo mese.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          {open.length > 12 && (
            <p className="px-5 py-2.5 text-2xs text-text-tertiary border-t border-border">
              e altri {open.length - 12}: si svuota man mano che agganci
            </p>
          )}
        </section>
      )}

      {/* ══ periodi: giorno, settimana, mese, trimestre, anno ══ */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-text-primary">Cassa per periodo</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              Entrate e uscite vere, quelle passate dal conto. Il saldo di chiusura è cumulato dall&apos;apertura
            </p>
          </div>
          <div className="flex gap-1 bg-background border border-border rounded-xl p-1">
            {GRAN.map(g => (
              <button key={g.key} onClick={() => setGran(g.key)}
                aria-pressed={gran === g.key}
                className={`px-2.5 py-1 rounded-lg text-2xs font-semibold ${
                  gran === g.key ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {periods.length === 0 ? (
          <p className="px-5 py-10 text-center text-2xs text-text-tertiary">
            Nessun movimento. Importa l&apos;estratto conto per cominciare.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
                  <th className="text-left font-semibold px-5 py-2">Periodo</th>
                  <th className="text-right font-semibold px-3 py-2">Entrate</th>
                  <th className="text-right font-semibold px-3 py-2">Uscite</th>
                  <th className="text-right font-semibold px-3 py-2">Netto</th>
                  <th className="text-right font-semibold px-3 py-2">vs precedente</th>
                  <th className="text-right font-semibold px-5 py-2">Saldo finale</th>
                </tr>
              </thead>
              <tbody>
                {[...periods].reverse().map((p, i, arr) => {
                  const prev = arr[i + 1]
                  const cmp = prev ? compare(p.net, prev.net) : null
                  return (
                    <tr key={p.key} className="border-t border-border/60 hover:bg-surface-hover">
                      <td className="px-5 py-2.5">
                        <span className="text-2xs font-semibold text-text-primary">{p.label}</span>
                        <span className="block text-2xs text-text-tertiary">{p.count} movimenti</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-2xs tabular text-success">{eur(p.inflow)}</td>
                      <td className="px-3 py-2.5 text-right text-2xs tabular text-error">{eur(Math.abs(p.outflow))}</td>
                      <td className={`px-3 py-2.5 text-right text-2xs tabular font-bold ${
                        p.net >= 0 ? 'text-text-primary' : 'text-error'}`}>{eur(p.net)}</td>
                      <td className="px-3 py-2.5 text-right text-2xs tabular">
                        {cmp ? (
                          <span className={cmp.delta >= 0 ? 'text-success' : 'text-error'}>
                            {cmp.delta >= 0 ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                            {' '}{eur(Math.abs(cmp.delta))}{cmp.pct !== null && ` · ${pc(cmp.pct)}`}
                          </span>
                        ) : <span className="text-text-tertiary">—</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right text-2xs tabular font-bold text-text-primary">
                        {p.closing !== null ? eur(p.closing) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ══ conto economico per periodo ══ */}
      {plByMonth.length > 0 && (
        <PlByPeriod months={plByMonth} gran={gran} />
      )}

      {/* ══ previsionale ══ */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">I prossimi novanta giorni</h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Non è una simulazione: sono le rate già firmate, le fatture aperte e i costi a piano.
            Quello che conta non è il totale, è il punto più basso
          </p>
        </div>
        {/* la curva della cassa attesa: il punto più basso è cerchiato */}
        {fc.curve.length > 1 && (
          <div className="px-5 pt-4">
            <TrendChart history={fc.curve.map(p => ({ date: p.date, value: p.balance }))} height={150} />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3 p-5">
          <Mini label="Da incassare" value={eur(fc.incoming)} tone="success" />
          <Mini label="Da pagare" value={eur(Math.abs(fc.outgoing))} tone="error" />
          <Mini label={fc.breakEven ? `Sotto zero il ${new Date(fc.breakEven).toLocaleDateString('it-IT')}` : 'Punto più basso'}
            value={eur(fc.lowest?.balance ?? bal.real)}
            tone={fc.breakEven ? 'error' : (fc.lowest?.balance ?? 0) < bal.real * 0.25 ? 'warning' : 'success'} />
        </div>
        {fc.items.length > 0 && (
          <div className="divide-y divide-border/60 border-t border-border">
            {fc.items.slice(0, 14).map((e, i) => (
              <div key={`${e.date}-${e.label}-${i}`} className="flex items-center gap-3 px-5 py-2">
                <span className="text-2xs text-text-tertiary tabular shrink-0 w-16">
                  {new Date(e.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                </span>
                <span className="flex-1 min-w-0 text-2xs text-text-primary truncate">
                  {e.label}
                  {e.overdue && <span className="ml-1.5 text-error font-semibold">scaduto</span>}
                  <span className="ml-1.5 text-text-tertiary">
                    {e.source === 'rata' ? 'rata a contratto' : e.source === 'piano' ? 'costo a piano' : 'a conto economico'}
                  </span>
                </span>
                <span className={`text-2xs tabular font-bold shrink-0 ${e.amount > 0 ? 'text-success' : 'text-error'}`}>
                  {e.amount > 0 ? '+' : ''}{eur(e.amount)}
                </span>
              </div>
            ))}
            {fc.items.length > 14 && (
              <p className="px-5 py-2 text-2xs text-text-tertiary">e altre {fc.items.length - 14} scadenze</p>
            )}
          </div>
        )}
      </section>

      {/* ══ con chi girano i soldi ══ */}
      {(topIn.length > 0 || topOut.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopList title="Da chi entrano" rows={topIn} kind="in" />
          <TopList title="A chi escono" rows={topOut} kind="out" />
        </div>
      )}

      {/* ══ i movimenti, come li mostra la banca ══ */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-text-primary flex-1">Movimenti</h2>
          <div className="flex items-center gap-1.5 bg-background border border-border-interactive rounded-xl px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="cerca cliente, fattura, importo"
              aria-label="Cerca nei movimenti"
              className="bg-transparent text-2xs text-text-primary outline-none w-44" />
          </div>
          <select value={kindFilter} onChange={e => setKindFilter(e.target.value as TxKind | 'tutti')}
            aria-label="Filtra per tipo"
            className="bg-background border border-border-interactive rounded-xl px-2 py-1.5 text-2xs text-text-secondary">
            <option value="tutti">Tutti i tipi</option>
            {kinds.map(k => <option key={k.kind} value={k.kind}>{KIND_UI[k.kind].label} ({k.count})</option>)}
          </select>
        </div>

        {byDay.length === 0 ? (
          <p className="px-5 py-10 text-center text-2xs text-text-tertiary">Nessun movimento con questi filtri.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {(showAllTx ? byDay : byDay.slice(0, 12)).map(([day, list]) => {
              const netto = list.reduce((s, t) => s + t.amount, 0)
              return (
                <div key={day}>
                  <div className="flex items-center gap-2 px-5 py-1.5 bg-background/60">
                    <span className="text-2xs font-bold text-text-secondary">
                      {new Date(day).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })}
                    </span>
                    <span className="text-2xs text-text-tertiary flex-1">{list.length} movimenti</span>
                    <span className={`text-2xs tabular font-semibold ${netto >= 0 ? 'text-success' : 'text-error'}`}>
                      {netto > 0 ? '+' : ''}{eur2(netto)}
                    </span>
                  </div>
                  {list.map(t => (
                    <div key={t.id}>
                      <button onClick={() => setOpenTx(openTx === t.id ? null : t.id)}
                        className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-hover transition-colors">
                        <TxIcon t={t} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-2xs font-semibold text-text-primary truncate">
                            {t.counterparty ?? t.description.slice(0, 48)}
                            {t.source !== 'banca' && (
                              <span className="ml-1.5 text-info font-normal">
                                {t.source === 'derivato' ? 'dichiarato' : 'a mano'}
                              </span>
                            )}
                          </span>
                          <span className="block text-2xs text-text-tertiary truncate">
                            {KIND_UI[t.kind].label}
                            {t.doc_ref && ` · fattura ${t.doc_ref}`}
                            {(t.revenue_line_id || t.cost_line_id) && ' · riconciliato'}
                            {t.no_match_needed && ' · senza abbinamento'}
                          </span>
                        </span>
                        <span className={`text-sm tabular font-bold shrink-0 ${t.amount > 0 ? 'text-success' : 'text-text-primary'}`}>
                          {t.amount > 0 ? '+' : ''}{eur2(t.amount)}
                        </span>
                        {(t.revenue_line_id || t.cost_line_id) && (
                          <Check className="w-3.5 h-3.5 text-success shrink-0" aria-label="Riconciliato" />
                        )}
                        <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary shrink-0 transition-transform ${
                          openTx === t.id ? 'rotate-180' : ''}`} />
                      </button>

                      {openTx === t.id && (
                        <div className="px-5 pb-3 pl-14 space-y-1.5">
                          <p className="text-2xs text-text-secondary">{t.description}</p>
                          <p className="text-2xs text-text-tertiary">
                            data valuta {t.value_on ? new Date(t.value_on).toLocaleDateString('it-IT') : '—'}
                            {t.causal_code && ` · causale ${t.causal_code}`}
                            {` · sorgente ${t.source}`}
                          </p>
                          {t.note && <p className="text-2xs text-text-tertiary">{t.note}</p>}
                          <div className="flex items-center gap-2 flex-wrap pt-1">
                            {(t.revenue_line_id || t.cost_line_id) ? (
                              <button onClick={() => run(() => unreconcile(t.id), 'Sganciato')} disabled={pending}
                                className="flex items-center gap-1 text-2xs font-semibold text-text-tertiary hover:text-error">
                                <Link2Off className="w-3 h-3" />sgancia dalla riga
                              </button>
                            ) : t.no_match_needed ? (
                              <button onClick={() => run(() => markNoMatch(t.id, false), 'Torna da riconciliare')}
                                disabled={pending}
                                className="text-2xs font-semibold text-text-tertiary hover:text-text-secondary">
                                rimetti fra i da riconciliare
                              </button>
                            ) : null}
                            {t.source !== 'banca' && (
                              <button onClick={() => run(() => deleteTx(t.id), 'Movimento rimosso')} disabled={pending}
                                className="text-2xs font-semibold text-text-tertiary hover:text-error">
                                elimina
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {byDay.length > 12 && (
          <button onClick={() => setShowAllTx(s => !s)}
            className="w-full px-5 py-2.5 text-2xs font-semibold text-gold-text hover:bg-surface-hover border-t border-border">
            {showAllTx ? 'mostra meno' : `mostra tutti i ${filtered.length} movimenti`}
          </button>
        )}
      </section>

      <p className="text-2xs text-text-tertiary">
        Il saldo reale conta solo i movimenti dell&apos;estratto conto. Gli incassi e i pagamenti spuntati
        nel conto economico creano un movimento <strong className="text-text-secondary">dichiarato</strong>:
        vale finché la banca non lo conferma, e quando lo confermi si spegne da sé. È il modo di non
        contare due volte lo stesso bonifico.
      </p>
    </div>
  )
}

/**
 * Il conto delle spese e il bonifico che lo tiene in piedi.
 *
 * Il fabbisogno non è una stima: è la somma delle voci di piano delle aree che
 * questo conto paga. Se il bonifico ricorrente è più basso, il conto si eroda di
 * quella differenza ogni mese — e il numero di mesi che resta si può dire adesso,
 * invece di scoprirlo da una carta rifiutata di sabato.
 */
function FundingPanel({ account, accounts, balance, items, txs }: {
  account: BankAccount
  accounts: BankAccount[]
  balance: number
  items: { label: string; amount: number; center_id: string | null; centerName: string | null }[]
  txs: BankTx[]
}) {
  const need = fundingNeed(account, items, balance)
  const from = accounts.find(a => a.id === account.funding_from_id)
  const short = need.gap > 0
  const spesa = useMemo(() => spendSplit(txs.filter(t => t.kind !== 'giroconto')), [txs])

  return (
    <section className={`bg-surface border rounded-2xl shadow-soft overflow-hidden ${
      short ? 'border-warning/40' : 'border-border'}`}>
      <div className="px-5 py-4 border-b border-border">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
          <Repeat className="w-4 h-4 text-info" aria-hidden="true" />Provvista del conto
        </h2>
        <p className="text-2xs text-text-tertiary mt-0.5">
          {from
            ? `Bonifico ricorrente da «${from.label.split('—')[0].trim()}»${account.funding_day ? `, il ${account.funding_day} del mese` : ''}`
            : 'Nessun conto di provvista collegato'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 p-5">
        <Mini label="Spese del mese a piano" value={eur(need.monthly)} />
        <Mini label="Bonifico ricorrente"
          value={need.configured !== null ? eur(need.configured) : 'da definire'}
          tone={need.configured === null ? 'warning' : undefined} />
        <Mini label={short ? 'Manca ogni mese' : 'Margine del bonifico'}
          value={eur(Math.abs(need.gap))} tone={short ? 'error' : 'success'} />
      </div>

      {need.monthsCovered !== null && (
        <p className="px-5 pb-3 text-2xs text-text-secondary">
          Col saldo attuale di {eur(balance)} il conto regge{' '}
          <strong className="text-text-primary">{need.monthsCovered} mesi</strong> di spese
          {short && need.configured !== null && (
            <> — e ogni mese il bonifico ne copre {eur(need.configured)} su {eur(need.monthly)},
              quindi la differenza la mangia dal saldo</>
          )}.
        </p>
      )}

      {items.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-2xs text-text-tertiary mb-2">Le voci di piano che questo conto paga</p>
          <SplitBar segments={need.items.slice(0, 6).map((i, n) => ({
            label: i.label, value: i.amount,
            color: ['var(--color-gold)', 'var(--color-info)', 'var(--color-accent)',
              'var(--color-orange)', 'var(--color-success)', 'var(--color-border-strong)'][n % 6],
          }))} />
        </div>
      )}

      {/* Il piano dice cosa dovrebbe passare; questo dice cosa è passato. */}
      {spesa.total > 0 && (
        <div className="px-5 pb-5 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3 mb-2.5">
            <p className="text-2xs font-bold text-text-primary">Cosa è passato davvero</p>
            <p className="text-2xs text-text-tertiary">
              {eur2(spesa.operativo)} operativo · <span className={spesa.share > 0.25 ? 'text-warning font-semibold' : ''}>
                {eur2(spesa.daGiustificare)} da giustificare</span>
            </p>
          </div>
          <SplitBar segments={spesa.families.map(f => ({
            label: f.label, value: f.total,
            color: CHECK_FAMILIES.includes(f.family) ? 'var(--color-warning)' : 'var(--color-info)',
          }))} />
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {spesa.families.map(f => {
              const check = CHECK_FAMILIES.includes(f.family)
              return (
                <li key={f.family} className="flex items-center gap-2 text-2xs">
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: check ? 'var(--color-warning)' : 'var(--color-info)' }} />
                  <span className={`truncate ${check ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                    {f.label}
                  </span>
                  <span className="ml-auto tabular text-text-tertiary shrink-0">{f.count}×</span>
                  <span className="tabular font-bold text-text-primary shrink-0 w-20 text-right">{eur2(f.total)}</span>
                </li>
              )
            })}
          </ul>
          {spesa.share > 0.25 && (
            <p className="text-2xs text-text-secondary mt-3">
              <strong className="text-warning">{Math.round(spesa.share * 100)}% delle uscite</strong> non è
              né advertising né software: ristoranti, spesa, carburante ed elettronica hanno deducibilità
              limitata e vanno attaccati a una ragione. Il conto può dire quanto pesano, non se erano inerenti.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Conto economico per periodo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Il conto economico aggregato per mese, trimestre o anno.
 *
 * Per settimana non esiste, e non si finge: una riga di ricavo appartiene a un
 * mese di competenza, non a un giorno. Chi vuole la settimana guarda la cassa,
 * che è la tabella sopra — ed è la distinzione che questa sezione serve a rendere
 * evidente.
 */
function PlByPeriod({ months, gran }: { months: PlMonth[]; gran: Granularity }) {
  const g: Granularity = gran === 'day' || gran === 'week' ? 'month' : gran

  const rows = useMemo(() => {
    const map = new Map<string, PlMonth[]>()
    for (const m of months) {
      const [y, mm] = m.month.split('-')
      const key = g === 'month' ? `${y}-${mm}`
        : g === 'quarter' ? `${y}-T${Math.floor((Number(mm) - 1) / 3) + 1}` : y
      map.set(key, [...(map.get(key) ?? []), m])
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, list]) => {
        const s = (f: (m: PlMonth) => number) => Math.round(list.reduce((n, m) => n + f(m), 0) * 100) / 100
        const accrued = s(m => m.accrued)
        return {
          key, label: bucketLabel(key, g), n: list.length,
          accrued, collected: s(m => m.collected), unpaid: s(m => m.unpaid),
          growth: s(m => m.growth), digital: s(m => m.digital),
          costs: s(m => m.costs), external: s(m => m.external),
          margin: s(m => m.margin), company: s(m => m.company),
          distributed: s(m => m.distributed),
          marginPct: accrued > 0 ? s(m => m.margin) / accrued : 0,
        }
      })
  }, [months, g])

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-bold text-text-primary">Conto economico per periodo</h2>
        <p className="text-2xs text-text-tertiary mt-0.5">
          Competenza, non cassa: qui una fattura vale nel mese in cui è stata emessa, anche se il
          bonifico arriva due mesi dopo.
          {(gran === 'day' || gran === 'week') && ' Per settimana non esiste: il conto economico è mensile per natura, e la settimana si guarda sulla cassa.'}
        </p>
      </div>
      {/* il grafico prima della tabella: la direzione si prende dalla forma, il
          numero dalla riga */}
      <div className="px-5 pt-4">
        <RevenueCostChart height={210} data={[...rows].reverse().map(r => ({
          key: r.key, label: r.label, revenue: r.accrued, costs: r.costs,
          margin: r.margin, collected: r.collected,
        }))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 px-5 py-4 border-b border-border">
        <div>
          <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
            Growth e digital sul totale
          </p>
          <DonutChart caption="fatturato" slices={[
            { label: 'Growth', value: rows.reduce((s, r) => s + r.growth, 0), color: 'var(--color-gold)' },
            { label: 'Digital', value: rows.reduce((s, r) => s + r.digital, 0), color: 'var(--color-info)' },
          ]} />
        </div>
        <div>
          <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
            Di cento euro fatturati, dove vanno
          </p>
          <SplitBar segments={[
            { label: 'distribuito', value: rows.reduce((s, r) => s + r.distributed, 0), color: 'var(--color-accent)' },
            { label: 'costi', value: rows.reduce((s, r) => s + r.costs, 0), color: 'var(--color-error)' },
            { label: 'cassa TwoBee', value: rows.reduce((s, r) => s + r.company, 0), color: 'var(--color-gold)' },
          ]} />
          <p className="text-2xs text-text-tertiary mt-2">
            Quote ai soci e provvigioni, costi effettivi e quello che resta in azienda. Sono le tre
            destinazioni di ogni euro fatturato, e la somma non torna al fatturato solo per le
            partite di giro.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
              <th className="text-left font-semibold px-5 py-2">Periodo</th>
              <th className="text-right font-semibold px-3 py-2">Fatturato</th>
              <th className="text-right font-semibold px-3 py-2">Growth</th>
              <th className="text-right font-semibold px-3 py-2">Digital</th>
              <th className="text-right font-semibold px-3 py-2">Incassato</th>
              <th className="text-right font-semibold px-3 py-2">Costi</th>
              <th className="text-right font-semibold px-3 py-2">Margine</th>
              <th className="text-right font-semibold px-5 py-2">Cassa TwoBee</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i, arr) => {
              const prev = arr[i + 1]
              const cmp = prev ? compare(r.accrued, prev.accrued) : null
              return (
                <tr key={r.key} className="border-t border-border/60 hover:bg-surface-hover">
                  <td className="px-5 py-2.5">
                    <span className="text-2xs font-semibold text-text-primary">{r.label}</span>
                    {cmp && (
                      <span className={`block text-2xs ${cmp.delta >= 0 ? 'text-success' : 'text-error'}`}>
                        {cmp.delta >= 0 ? '+' : ''}{eur(cmp.delta)}{cmp.pct !== null && ` · ${pc(cmp.pct)}`} sul precedente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-2xs tabular font-bold text-text-primary">{eur(r.accrued)}</td>
                  <td className="px-3 py-2.5 text-right text-2xs tabular text-text-secondary">{eur(r.growth)}</td>
                  <td className="px-3 py-2.5 text-right text-2xs tabular text-text-secondary">{eur(r.digital)}</td>
                  <td className="px-3 py-2.5 text-right text-2xs tabular text-success">
                    {eur(r.collected)}
                    {r.unpaid > 0 && <span className="block text-error">−{eur(r.unpaid)} aperti</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-2xs tabular text-error">
                    {eur(r.costs)}
                    {r.external > 0 && <span className="block text-text-tertiary">{eur(r.external)} subappalti</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-2xs tabular font-bold text-text-primary">
                    {eur(r.margin)}
                    <span className="block text-text-tertiary">{Math.round(r.marginPct * 100)}%</span>
                  </td>
                  <td className="px-5 py-2.5 text-right text-2xs tabular font-bold text-gold-text">{eur(r.company)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Pezzi
// ═══════════════════════════════════════════════════════════════════════════

function TxIcon({ t }: { t: BankTx }) {
  const ui = KIND_UI[t.kind]
  return (
    <span className={`w-8 h-8 rounded-xl border border-border flex items-center justify-center shrink-0 ${
      t.source === 'banca' ? 'bg-background' : 'bg-info/10 border-info/30'}`}>
      <ui.Icon className={`w-4 h-4 ${ui.cls}`} aria-hidden="true" />
    </span>
  )
}

function Kpi({ label, value, sub, icon, tone }: {
  label: string; value: string; sub?: string; icon: React.ReactNode
  tone?: 'error' | 'success' | 'warning'
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-bold tabular mt-1 ${
        tone === 'error' ? 'text-error' : tone === 'success' ? 'text-success'
        : tone === 'warning' ? 'text-warning' : 'text-text-primary'}`}>{value}</p>
      {sub && <p className="text-2xs text-text-tertiary mt-0.5">{sub}</p>}
    </div>
  )
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'error' | 'warning' }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <p className="text-2xs text-text-tertiary">{label}</p>
      <p className={`text-lg font-bold tabular ${
        tone === 'success' ? 'text-success' : tone === 'error' ? 'text-error'
        : tone === 'warning' ? 'text-warning' : 'text-text-primary'}`}>{value}</p>
    </div>
  )
}

function TopList({ title, rows, kind }: {
  title: string
  rows: { name: string; inflow: number; outflow: number; net: number; count: number; lastOn: string }[]
  kind: 'in' | 'out'
}) {
  const max = Math.max(...rows.map(r => Math.abs(r.net)), 1)
  return (
    <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
      <h2 className="text-sm font-bold text-text-primary mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-2xs text-text-tertiary">Ancora nessun movimento.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.name}>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-text-primary flex-1 truncate">{r.name}</span>
                <span className="text-2xs text-text-tertiary">{r.count}×</span>
                <span className={`text-2xs tabular font-bold ${kind === 'in' ? 'text-success' : 'text-error'}`}>
                  {eur(Math.abs(r.net))}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-surface-active overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${(Math.abs(r.net) / max) * 100}%`,
                  background: kind === 'in' ? 'var(--color-success)' : 'var(--color-error)',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
