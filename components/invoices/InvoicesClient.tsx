'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  FileText, Upload, AlertTriangle, Search, Link2, Link2Off, Check, Loader2,
  ArrowDownLeft, ArrowUpRight, Info, Landmark, BookOpen, Trash2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { EconomicsNav } from '@/components/economics/EconomicsNav'
import { DOC_TYPES } from '@/lib/fattura-xml'
import {
  totals, byMonth, byParty, aging, paymentDays, reconciliation, vatByQuarter, coverage,
  lineCandidates, txCandidates, signed, signedTotal, daysBetween,
  type Invoice, type LineRef, type TxRef, type InvoiceDirection, type CoverageRow,
} from '@/lib/invoices'
import {
  importInvoices, linkInvoiceToLine, unlinkInvoiceFromLine,
  linkInvoiceToTx, setInvoicePaid, deleteInvoice,
} from '@/app/actions/invoices'

const eur = (n: number) => formatCurrency(Math.round(n))
const eur2 = (n: number) =>
  `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
const monthName = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })

type Tab = 'panoramica' | 'elenco' | 'riconcilia'

export function InvoicesClient({
  month, setupNeeded, today, invoices, lines, txs, clients,
}: {
  month: string
  setupNeeded: boolean
  today: string
  invoices: Invoice[]
  lines: LineRef[]
  txs: TxRef[]
  clients: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<Tab>('panoramica')
  const [dir, setDir] = useState<InvoiceDirection>('emessa')
  const [q, setQ] = useState('')
  const [year, setYear] = useState<string>('tutti')
  const [state, setState] = useState<'tutte' | 'aperte' | 'scadute' | 'pagate'>('tutte')
  const [open, setOpen] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const upload = (files: FileList) => start(async () => {
    try {
      const payload = await Promise.all(
        Array.from(files).map(async f => ({ name: f.name, xml: await f.text() })))
      const r = await importInvoices(payload)
      toast.success(
        `${r.nuovi} fatture nuove su ${r.letti} lette`
        + (r.duplicati ? ` · ${r.duplicati} già in archivio` : '')
        + (r.falliti.length ? ` · ${r.falliti.length} illeggibili` : ''))
      if (r.falliti.length) console.warn('File non letti:', r.falliti)
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Import fallito') }
  })

  // ── i numeri ───────────────────────────────────────────────────────────────
  const years = useMemo(() =>
    Array.from(new Set(invoices.map(i => i.issuedOn.slice(0, 4)))).sort().reverse(), [invoices])

  const scoped = useMemo(() =>
    invoices.filter(i => year === 'tutti' || i.issuedOn.startsWith(year)), [invoices, year])

  const emesse = useMemo(() => scoped.filter(i => i.direction === 'emessa'), [scoped])
  const ricevute = useMemo(() => scoped.filter(i => i.direction === 'ricevuta'), [scoped])
  const tEm = useMemo(() => totals(emesse, today), [emesse, today])
  const tRi = useMemo(() => totals(ricevute, today), [ricevute, today])
  const months = useMemo(() => byMonth(scoped), [scoped])
  const parties = useMemo(() => byParty(dir === 'emessa' ? emesse : ricevute), [dir, emesse, ricevute])
  const age = useMemo(() => aging(dir === 'emessa' ? emesse : ricevute, today), [dir, emesse, ricevute, today])
  const days = useMemo(() => paymentDays(emesse), [emesse])
  const vat = useMemo(() => vatByQuarter(scoped), [scoped])
  const cover = useMemo(() => coverage({ invoices: scoped, lines, txs }), [scoped, lines, txs])
  const findings = useMemo(
    () => reconciliation({ invoices: scoped, lines, txs, today }), [scoped, lines, txs, today])

  const listed = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scoped
      .filter(i => i.direction === dir)
      .filter(i => state === 'tutte'
        || (state === 'pagate' && i.paidOn)
        || (state === 'aperte' && !i.paidOn)
        || (state === 'scadute' && !i.paidOn && i.dueDate && i.dueDate < today))
      .filter(i => !needle
        || i.counterpartyName.toLowerCase().includes(needle)
        || i.number.toLowerCase().includes(needle))
  }, [scoped, dir, state, q, today])

  /* Le fatture che non hanno ancora un aggancio: è la coda di lavoro, e sta in
     cima perché finché è piena i totali delle altre sezioni non sono confrontabili. */
  const daAgganciare = useMemo(() => {
    const linkedLines = new Set(lines.map(l => l.invoiceId).filter(Boolean) as string[])
    const linkedTx = new Set(txs.map(t => t.invoiceId).filter(Boolean) as string[])
    return scoped
      .filter(i => !linkedLines.has(i.id) || (!i.paidOn && !linkedTx.has(i.id)))
      .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn))
  }, [scoped, lines, txs])

  if (setupNeeded) {
    return (
      <div className="p-6 space-y-4">
        <EconomicsNav active="fatture" month={month} />
        <div className="bg-surface border border-warning/40 rounded-2xl p-5">
          <h1 className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <AlertTriangle className="w-4 h-4 text-warning" />La sezione non è ancora attiva
          </h1>
          <p className="text-2xs text-text-secondary mt-1.5 max-w-2xl">
            Manca la migration <code className="text-gold-text">198_invoices.sql</code>: le tabelle
            delle fatture non esistono ancora. Eseguila nel SQL Editor di Supabase e questa pagina
            si accende da sola — nient&apos;altro nel tool cambia comportamento nel frattempo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 min-h-full">
      <EconomicsNav active="fatture" month={month} />

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-text-primary font-heading">
            <FileText className="w-5 h-5 text-gold-text" />Fatturazione
          </h1>
          <p className="text-2xs text-text-tertiary mt-0.5 max-w-2xl">
            {invoices.length} documenti letti dall&apos;XML dello SdI. Sta fra conto economico e banca
            perché è quello che le lega: il primo dice a quale mese appartiene un ricavo, la seconda
            quando i soldi si sono mossi, la fattura è l&apos;unico documento che vale davanti
            all&apos;erario. Gli importi non si scrivono a mano: si rileggono dal file.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(e.target.value)} aria-label="Anno"
            className="bg-background border border-border-interactive rounded-xl px-2.5 py-2 text-2xs text-text-primary">
            <option value="tutti">Tutti gli anni</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" multiple className="hidden"
            onChange={e => { const f = e.target.files; if (f?.length) upload(f); e.target.value = '' }} />
          <button onClick={() => fileRef.current?.click()} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-bold bg-gold text-on-gold rounded-xl px-3 py-2 press disabled:opacity-40">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Importa XML
          </button>
        </div>
      </header>

      {/* ── i quattro numeri che si guardano per primi ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<ArrowUpRight className="w-3.5 h-3.5 text-success" />}
          label="Fatturato emesso" value={eur(tEm.taxable)}
          hint={`${tEm.count} documenti${tEm.credits ? `, di cui ${tEm.credits} note di credito` : ''}`}
          extra={<span className="text-text-tertiary">IVA a debito {eur(tEm.vat)}</span>} />
        <Stat icon={<ArrowDownLeft className="w-3.5 h-3.5 text-info" />}
          label="Ricevuto" value={eur(tRi.taxable)}
          hint={`${tRi.count} documenti da ${byParty(ricevute).length} fornitori`}
          extra={<span className="text-text-tertiary">IVA a credito {eur(tRi.vat)}</span>} />
        <Stat icon={<Landmark className="w-3.5 h-3.5 text-gold-text" />}
          label="Da incassare" value={eur(tEm.outstanding)}
          hint={days.median !== null
            ? `chi paga lo fa in ${days.median} giorni (mediana su ${days.sample})`
            : 'nessuna fattura incassata: la mediana non si può ancora calcolare'}
          extra={tEm.overdue > 0
            ? <span className="text-error">{eur(tEm.overdue)} già scaduti</span>
            : <span className="text-success">niente di scaduto</span>} />
        <Stat icon={<ArrowDownLeft className="w-3.5 h-3.5 text-orange" />}
          label="Da pagare" value={eur(tRi.outstanding)}
          hint="debiti verso fornitori ancora aperti"
          extra={tRi.overdue > 0
            ? <span className="text-warning">{eur(tRi.overdue)} oltre la scadenza</span>
            : <span className="text-success">tutto nei termini</span>} />
      </div>

      {/* ── cosa non combacia: prima di ogni analisi ── */}
      {findings.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="text-sm font-bold text-text-primary mb-1">Cosa non combacia</h2>
          <p className="text-2xs text-text-tertiary mb-3">
            Le fatture sono il documento, il conto economico è la competenza, la banca è la cassa.
            Devono dire la stessa cosa: qui c&apos;è dove non succede.
          </p>
          <ul className="space-y-2">
            {findings.map(f => (
              <li key={f.id} className={`rounded-xl border p-3 ${
                f.severity === 'critico' ? 'border-error/40 bg-error/5'
                  : f.severity === 'attenzione' ? 'border-warning/40 bg-warning/5'
                  : 'border-border'}`}>
                <p className={`text-2xs font-bold ${
                  f.severity === 'critico' ? 'text-error'
                    : f.severity === 'attenzione' ? 'text-warning' : 'text-text-secondary'}`}>
                  {f.title}
                </p>
                <p className="text-2xs text-text-secondary mt-0.5 leading-snug">{f.detail}</p>
                {f.action && (
                  <p className="text-2xs text-text-tertiary mt-1 flex items-start gap-1.5">
                    <Info className="w-3 h-3 shrink-0 mt-0.5" />{f.action}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {([['panoramica', 'Panoramica'], ['elenco', 'Elenco'], ['riconcilia', `Da agganciare · ${daAgganciare.length}`]] as const)
          .map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap ${
                tab === k ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}>{l}</button>
          ))}
      </div>

      {tab === 'panoramica' && (
        <div className="space-y-5">
          <Coverage rows={cover} />
          <MonthChart rows={months} />

          <div className="grid gap-4 lg:grid-cols-2">
            {/* scadenzario */}
            <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2 className="text-sm font-bold text-text-primary">Scadenzario</h2>
                <Toggle value={dir} onChange={setDir} />
              </div>
              <p className="text-2xs text-text-tertiary mb-3">
                {eur(age.total)} aperti, di cui {eur(age.overdue)} oltre la scadenza.
                {age.noDueDate > 0 && ` ${age.noDueDate} documenti non hanno una data: contano fra quelli a scadere.`}
              </p>
              <ul className="space-y-1.5">
                {age.buckets.map(b => {
                  const share = age.total !== 0 ? Math.abs(b.amount / age.total) : 0
                  return (
                    <li key={b.key} className="flex items-center gap-2.5">
                      <span className="text-2xs text-text-secondary w-20 shrink-0">
                        {b.key === 'a scadere' ? 'a scadere' : `${b.key} gg`}
                      </span>
                      <span className="flex-1 h-2 rounded-full bg-surface-active overflow-hidden">
                        <span className={`block h-full rounded-full ${
                          b.key === 'a scadere' ? 'bg-info' : b.key === 'oltre 90' ? 'bg-error' : 'bg-warning'}`}
                          style={{ width: `${Math.max(share * 100, b.count ? 2 : 0)}%` }} />
                      </span>
                      <span className="text-2xs tabular text-text-primary font-semibold w-20 text-right shrink-0">
                        {eur(b.amount)}
                      </span>
                      <span className="text-2xs tabular text-text-tertiary w-6 text-right shrink-0">{b.count}</span>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* chi pesa */}
            <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
              <h2 className="text-sm font-bold text-text-primary mb-1">
                {dir === 'emessa' ? 'Clienti per fatturato' : 'Fornitori per spesa'}
              </h2>
              <p className="text-2xs text-text-tertiary mb-3">
                Raggruppati per partita IVA, non per nome: lo stesso soggetto scritto in due modi
                sarebbe due righe che non si sommano.
              </p>
              <ul className="divide-y divide-border/50">
                {parties.slice(0, 8).map(p => (
                  <li key={p.vat ?? p.name} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-2xs font-semibold text-text-primary truncate">
                        {p.clientId
                          ? <Link href={`/clienti/${p.clientId}`} className="hover:text-gold-text">{p.name}</Link>
                          : p.name}
                      </span>
                      <span className="block text-2xs text-text-tertiary">
                        {p.count} documenti · ultimo {day(p.last)}
                        {p.outstanding !== 0 && ` · ${eur(p.outstanding)} aperti`}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-2xs font-bold tabular text-text-primary">{eur(p.taxable)}</span>
                      <span className="block text-2xs tabular text-text-tertiary">
                        {Math.round(p.share * 100)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* IVA per trimestre */}
          <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
            <h2 className="text-sm font-bold text-text-primary mb-1">IVA dai documenti, per trimestre</h2>
            <p className="text-2xs text-text-tertiary mb-3">
              Calcolata dalle fatture, non dal conto economico. È il controllo incrociato di
              «Fiscale &amp; tasse»: se i due numeri divergono, una delle due sezioni ha una riga
              che l&apos;altra non ha. Qui non si riporta nessun credito — questa è la fotografia dei
              documenti, non la liquidazione.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
                    <th className="text-left font-semibold py-2">Trimestre</th>
                    <th className="text-right font-semibold py-2">IVA a debito</th>
                    <th className="text-right font-semibold py-2">IVA a credito</th>
                    <th className="text-right font-semibold py-2">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {vat.map(v => (
                    <tr key={v.quarter} className="border-t border-border/60">
                      <td className="py-1.5 text-2xs font-semibold text-text-primary">{v.quarter}</td>
                      <td className="py-1.5 text-2xs tabular text-right text-text-secondary">{eur2(v.debit)}</td>
                      <td className="py-1.5 text-2xs tabular text-right text-text-secondary">{eur2(v.credit)}</td>
                      <td className={`py-1.5 text-2xs tabular text-right font-bold ${
                        v.balance > 0 ? 'text-error' : 'text-success'}`}>{eur2(v.balance)}</td>
                    </tr>
                  ))}
                  {!vat.length && (
                    <tr><td colSpan={4} className="py-3 text-2xs text-text-tertiary">Nessun documento nel periodo.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'elenco' && (
        <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-wrap">
            <Toggle value={dir} onChange={setDir} />
            <div className="flex items-center gap-1.5 bg-background border border-border-interactive rounded-lg px-2 py-1.5">
              <Search className="w-3.5 h-3.5 text-text-tertiary" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="numero o controparte"
                aria-label="Cerca fra le fatture"
                className="bg-transparent text-2xs text-text-primary outline-none w-44" />
            </div>
            <select value={state} onChange={e => setState(e.target.value as never)} aria-label="Stato"
              className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
              <option value="tutte">Tutte</option>
              <option value="aperte">Aperte</option>
              <option value="scadute">Scadute</option>
              <option value="pagate">Saldate</option>
            </select>
            <span className="ml-auto text-2xs text-text-tertiary tabular">
              {listed.length} documenti · {eur(listed.reduce((s, i) => s + signed(i), 0))} imponibile
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
                  <th className="text-left font-semibold px-4 py-2">Numero e data</th>
                  <th className="text-left font-semibold px-2 py-2">
                    {dir === 'emessa' ? 'Cliente' : 'Fornitore'}
                  </th>
                  <th className="text-right font-semibold px-2 py-2">Imponibile</th>
                  <th className="text-right font-semibold px-2 py-2">IVA</th>
                  <th className="text-right font-semibold px-2 py-2">Totale</th>
                  <th className="text-left font-semibold px-2 py-2">Scadenza</th>
                  <th className="text-left font-semibold px-2 py-2">Stato</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {listed.map(i => {
                  const late = !i.paidOn && i.dueDate && i.dueDate < today
                  const linked = lines.find(l => l.invoiceId === i.id)
                  return (
                    <tr key={i.id} className="border-t border-border/60 hover:bg-surface-hover align-top">
                      <td className="px-4 py-2">
                        <button onClick={() => setOpen(open === i.id ? null : i.id)}
                          className="text-2xs font-bold text-text-primary hover:text-gold-text text-left">
                          {i.number}
                        </button>
                        <span className="block text-2xs text-text-tertiary">
                          {day(i.issuedOn)}
                          {i.docType !== 'TD01' && ` · ${DOC_TYPES[i.docType] ?? i.docType}`}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <span className="block text-2xs text-text-secondary truncate max-w-[220px]">
                          {i.clientId
                            ? <Link href={`/clienti/${i.clientId}`} className="hover:text-gold-text">{i.counterpartyName}</Link>
                            : i.counterpartyName}
                        </span>
                        {linked && (
                          <span className="flex items-center gap-1 text-2xs text-success">
                            <Link2 className="w-2.5 h-2.5" />nel conto economico
                          </span>
                        )}
                      </td>
                      <td className={`px-2 py-2 text-2xs tabular text-right font-semibold ${
                        i.sign === -1 ? 'text-error' : 'text-text-primary'}`}>{eur2(signed(i))}</td>
                      <td className="px-2 py-2 text-2xs tabular text-right text-text-tertiary">{eur2(i.sign * i.vatAmount)}</td>
                      <td className="px-2 py-2 text-2xs tabular text-right text-text-secondary">{eur2(signedTotal(i))}</td>
                      <td className="px-2 py-2 text-2xs text-text-tertiary">{day(i.dueDate)}</td>
                      <td className="px-2 py-2">
                        {i.paidOn ? (
                          <span className="text-2xs font-semibold text-success">saldata {day(i.paidOn)}</span>
                        ) : late ? (
                          <span className="text-2xs font-semibold text-error">
                            scaduta da {daysBetween(i.dueDate!, today)} gg
                          </span>
                        ) : (
                          <button onClick={() => run(() => setInvoicePaid(i.id, today), 'Segnata come saldata')}
                            className="text-2xs font-semibold text-text-tertiary hover:text-success press">
                            segna saldata
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {i.paidOn && (
                          <button onClick={() => run(() => setInvoicePaid(i.id, null), 'Riaperta')}
                            aria-label="Riapri la fattura"
                            className="text-text-tertiary hover:text-warning press">
                            <Link2Off className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {!listed.length && (
                  <tr><td colSpan={8} className="px-4 py-6 text-2xs text-text-tertiary text-center">
                    Nessun documento con questi filtri.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {open && <Detail invoice={invoices.find(i => i.id === open)!} onClose={() => setOpen(null)}
            onDelete={() => run(() => deleteInvoice(open), 'Fattura eliminata')} />}
        </section>
      )}

      {tab === 'riconcilia' && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="text-sm font-bold text-text-primary mb-1">Da agganciare</h2>
          <p className="text-2xs text-text-tertiary mb-4 max-w-3xl">
            Ogni fattura dovrebbe avere una riga nel conto economico — che dice a quale mese
            appartiene — e un movimento in banca — che dice quando è stata pagata. Il punteggio
            propone, <strong className="font-semibold text-text-secondary">l&apos;aggancio lo confermi
            tu</strong>: un abbinamento sbagliato fa tornare i conti nel modo peggiore, cioè senza
            che nessuno lo cerchi più.
          </p>

          {!daAgganciare.length ? (
            <p className="flex items-center gap-2 text-2xs text-success">
              <Check className="w-3.5 h-3.5" />Ogni fattura ha la sua riga e il suo movimento.
            </p>
          ) : (
            <ul className="space-y-3">
              {daAgganciare.slice(0, 25).map(i => (
                <Reconcile key={i.id} invoice={i} lines={lines} txs={txs} pending={pending} run={run} />
              ))}
            </ul>
          )}
          {daAgganciare.length > 25 && (
            <p className="text-2xs text-text-tertiary mt-3">
              Ne restano {daAgganciare.length - 25}: si accorciano man mano che agganci.
            </p>
          )}
        </section>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════

function Toggle({ value, onChange }: { value: InvoiceDirection; onChange: (v: InvoiceDirection) => void }) {
  return (
    <div className="flex gap-0.5 bg-surface-active rounded-lg p-0.5" role="group" aria-label="Verso">
      {(['emessa', 'ricevuta'] as const).map(k => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k}
          className={`px-2.5 py-1 rounded-md text-2xs font-semibold ${
            value === k ? 'bg-surface text-text-primary shadow-soft' : 'text-text-tertiary hover:text-text-secondary'}`}>
          {k === 'emessa' ? 'Emesse' : 'Ricevute'}
        </button>
      ))}
    </div>
  )
}

function Stat({ icon, label, value, hint, extra }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; extra?: React.ReactNode
}) {
  return (
    <div className="h-full flex flex-col px-3 py-2.5 rounded-xl border border-border bg-surface">
      <span className="flex items-center gap-1.5">
        {icon}<span className="text-2xs font-semibold text-text-secondary truncate">{label}</span>
      </span>
      <span className="mt-1.5 text-base font-bold tabular text-text-primary">{value}</span>
      {extra && <span className="text-2xs font-semibold leading-snug">{extra}</span>}
      {hint && <span className="mt-auto pt-1.5 text-2xs text-text-tertiary leading-snug">{hint}</span>}
    </div>
  )
}

/**
 * §214 — la tabella per cui questa sezione sta fra le altre due.
 *
 * Tre letture dello stesso mese che dovrebbero coincidere e quasi mai lo fanno.
 * Lo scarto fra documenti e conto economico **è un errore** — sono due letture
 * della stessa competenza — mentre quello con la banca è normale, perché si
 * fattura prima di incassare. Il conteggio degli agganci sta accanto agli
 * importi e non in fondo: due numeri uguali con zero righe collegate sono una
 * coincidenza, non una quadratura.
 */
function Coverage({ rows }: { rows: CoverageRow[] }) {
  if (!rows.length) return null
  const gapTot = rows.reduce((s, r) => s + Math.abs(r.revenueGap) + Math.abs(r.costGap), 0)

  return (
    <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-bold text-text-primary">Quadratura con le altre sezioni</h2>
        <span className={`text-2xs font-semibold ${gapTot < 1 ? 'text-success' : 'text-warning'}`}>
          {gapTot < 1 ? 'documenti e conto economico coincidono' : `${eur(gapTot)} di scarto da chiudere`}
        </span>
      </div>
      <p className="text-2xs text-text-tertiary mb-3 max-w-3xl">
        Mese per mese: quanto dicono i <strong className="font-semibold text-text-secondary">documenti</strong>,
        quanto ne ha registrato il <strong className="font-semibold text-text-secondary">conto economico</strong>,
        e quanto è arrivato in <strong className="font-semibold text-text-secondary">banca</strong>. Fra i primi
        due lo scarto è un errore; col terzo è il tempo di incasso, e diventa un problema solo quando invecchia.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
              <th className="text-left font-semibold py-2">Mese</th>
              <th className="text-right font-semibold py-2">Fatturato</th>
              <th className="text-right font-semibold py-2">Conto econ.</th>
              <th className="text-right font-semibold py-2">Scarto</th>
              <th className="text-right font-semibold py-2">Incassato</th>
              <th className="text-right font-semibold py-2">Ricevute</th>
              <th className="text-right font-semibold py-2">Costi</th>
              <th className="text-right font-semibold py-2">Scarto</th>
              <th className="text-center font-semibold py-2">Agganci</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const gap = (v: number) => v === 0 ? 'text-text-tertiary' : Math.abs(v) < 1 ? 'text-success' : 'text-warning'
              const tot = r.issuedCount + r.receivedCount
              const done = r.issuedLinked + r.receivedLinked
              return (
                <tr key={r.month} className="border-t border-border/60">
                  <td className="py-1.5 text-2xs font-semibold text-text-primary">{monthName(r.month)}</td>
                  <td className="py-1.5 text-2xs tabular text-right text-text-secondary">{eur(r.docsIssued)}</td>
                  <td className="py-1.5 text-2xs tabular text-right text-text-secondary">{eur(r.plRevenue)}</td>
                  <td className={`py-1.5 text-2xs tabular text-right font-semibold ${gap(r.revenueGap)}`}>
                    {r.revenueGap === 0 ? '—' : eur(r.revenueGap)}
                  </td>
                  <td className="py-1.5 text-2xs tabular text-right text-success">{r.collected ? eur(r.collected) : '—'}</td>
                  <td className="py-1.5 text-2xs tabular text-right text-text-secondary">{eur(r.docsReceived)}</td>
                  <td className="py-1.5 text-2xs tabular text-right text-text-secondary">{eur(r.plCost)}</td>
                  <td className={`py-1.5 text-2xs tabular text-right font-semibold ${gap(r.costGap)}`}>
                    {r.costGap === 0 ? '—' : eur(r.costGap)}
                  </td>
                  <td className="py-1.5 text-2xs tabular text-center">
                    {tot === 0 ? <span className="text-text-tertiary">—</span> : (
                      <span className={done === tot ? 'text-success font-semibold' : 'text-text-tertiary'}>
                        {done}/{tot}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * Emesso contro ricevuto, mese per mese.
 *
 * Due serie affiancate e non impilate: la domanda è «quanto entra rispetto a
 * quanto esce», e su barre impilate quel confronto si fa a occhio fra un
 * segmento e il suo vicino, che è esattamente ciò che l'occhio non sa fare.
 */
function MonthChart({ rows }: { rows: ReturnType<typeof byMonth> }) {
  if (!rows.length) {
    return (
      <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
        <p className="text-2xs text-text-tertiary">Nessun documento: importa gli XML per vedere l&apos;andamento.</p>
      </section>
    )
  }
  const peak = Math.max(1, ...rows.map(r => Math.max(Math.abs(r.issued), Math.abs(r.received))))
  const h = 132

  return (
    <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-sm font-bold text-text-primary">Emesso e ricevuto, mese per mese</h2>
        <span className="flex items-center gap-3 text-2xs text-text-tertiary">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-success" />emesse</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-info" />ricevute</span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-3 min-w-fit" style={{ height: h + 34 }}>
          {rows.map(r => (
            <div key={r.month} className="flex flex-col items-center gap-1 shrink-0" style={{ width: 46 }}>
              <span className="text-2xs tabular text-text-tertiary">{r.issued ? eur(r.issued) : ''}</span>
              <span className="flex items-end gap-1" style={{ height: h }}>
                <span className="w-4 rounded-t bg-success" title={`Emesse ${eur2(r.issued)} · ${r.issuedCount} documenti`}
                  style={{ height: Math.max(2, (Math.abs(r.issued) / peak) * h) }} />
                <span className="w-4 rounded-t bg-info" title={`Ricevute ${eur2(r.received)} · ${r.receivedCount} documenti`}
                  style={{ height: Math.max(2, (Math.abs(r.received) / peak) * h) }} />
              </span>
              <span className="text-2xs text-text-tertiary whitespace-nowrap">{monthName(r.month)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Una fattura da agganciare, coi suoi candidati su entrambi i lati. */
function Reconcile({ invoice, lines, txs, pending, run }: {
  invoice: Invoice
  lines: LineRef[]
  txs: TxRef[]
  pending: boolean
  run: (fn: () => Promise<unknown>, ok?: string) => void
}) {
  const line = lines.find(l => l.invoiceId === invoice.id)
  const tx = txs.find(t => t.invoiceId === invoice.id)
  const lineOptions = useMemo(() => lineCandidates(invoice, lines).slice(0, 3), [invoice, lines])
  const txOptions = useMemo(() => txCandidates(invoice, txs).slice(0, 3), [invoice, txs])
  const kind = invoice.direction === 'emessa' ? 'ricavo' as const : 'costo' as const

  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xs font-bold text-text-primary">{invoice.number}</span>
        <span className="text-2xs text-text-secondary truncate max-w-[280px]">{invoice.counterpartyName}</span>
        <span className="text-2xs text-text-tertiary">{day(invoice.issuedOn)}</span>
        <span className="ml-auto text-2xs font-bold tabular text-text-primary">{eur2(signedTotal(invoice))}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 mt-2">
        <Slot icon={<BookOpen className="w-3 h-3" />} title="Conto economico"
          done={line ? `${line.label} · ${line.month.slice(0, 7)}` : null}
          onUndo={line ? () => run(() => unlinkInvoiceFromLine(line.id, kind), 'Sganciata') : undefined}
          empty="Nessuna riga con importo e mese compatibili."
          options={lineOptions.map(c => ({
            key: c.item.id,
            label: `${c.item.label} · ${c.item.month.slice(0, 7)} · ${eur2(c.item.net)}`,
            why: c.why, score: c.score,
            onPick: () => run(() => linkInvoiceToLine(invoice.id, c.item.id, kind), 'Agganciata alla riga'),
          }))}
          pending={pending} />

        <Slot icon={<Landmark className="w-3 h-3" />} title="Banca"
          done={tx ? `${day(tx.bookedOn)} · ${eur2(tx.amount)}` : null}
          empty="Nessun movimento con lo stesso importo lordo."
          options={txOptions.map(c => ({
            key: c.item.id,
            label: `${day(c.item.bookedOn)} · ${eur2(c.item.amount)} · ${c.item.counterparty ?? c.item.description.slice(0, 30)}`,
            why: c.why, score: c.score,
            onPick: () => run(() => linkInvoiceToTx(invoice.id, c.item.id), 'Agganciata al movimento'),
          }))}
          pending={pending} />
      </div>
    </li>
  )
}

function Slot({ icon, title, done, onUndo, empty, options, pending }: {
  icon: React.ReactNode
  title: string
  done: string | null
  onUndo?: () => void
  empty: string
  options: { key: string; label: string; why: string[]; score: number; onPick: () => void }[]
  pending: boolean
}) {
  return (
    <div className="rounded-lg border border-border/60 p-2">
      <p className="flex items-center gap-1.5 text-2xs font-semibold text-text-tertiary mb-1">
        {icon}{title}
      </p>
      {done ? (
        <p className="flex items-center gap-1.5 text-2xs text-success">
          <Check className="w-3 h-3 shrink-0" /><span className="truncate">{done}</span>
          {onUndo && (
            <button onClick={onUndo} disabled={pending}
              className="ml-auto text-text-tertiary hover:text-warning press" aria-label="Sgancia">
              <Link2Off className="w-3 h-3" />
            </button>
          )}
        </p>
      ) : options.length ? (
        <ul className="space-y-1">
          {options.map(o => (
            <li key={o.key} className="flex items-start gap-2">
              <button onClick={o.onPick} disabled={pending}
                className="min-w-0 flex-1 text-left press disabled:opacity-40">
                <span className="block text-2xs text-text-primary truncate hover:text-gold-text">{o.label}</span>
                <span className="block text-2xs text-text-tertiary truncate">{o.why.join(' · ')}</span>
              </button>
              <span className="text-2xs tabular text-text-tertiary shrink-0">{o.score}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-2xs text-text-tertiary">{empty}</p>
      )}
    </div>
  )
}

function Detail({ invoice, onClose, onDelete }: {
  invoice: Invoice; onClose: () => void; onDelete: () => void
}) {
  return (
    <div className="border-t border-border bg-surface-hover px-5 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-2xs font-bold text-text-primary">
            {DOC_TYPES[invoice.docType] ?? invoice.docType} {invoice.number}
          </p>
          <p className="text-2xs text-text-tertiary">
            {invoice.counterpartyName}
            {invoice.counterpartyVat && ` · P.IVA ${invoice.counterpartyVat}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onDelete} className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-error press">
            <Trash2 className="w-3 h-3" />Elimina
          </button>
          <button onClick={onClose} className="text-2xs font-semibold text-text-tertiary hover:text-text-primary press">
            Chiudi
          </button>
        </div>
      </div>
      {invoice.warnings?.length ? (
        <ul className="mt-2 space-y-0.5">
          {invoice.warnings.map((w, k) => (
            <li key={k} className="flex items-start gap-1.5 text-2xs text-warning">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{w}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1.5 text-2xs text-success mt-2">
          <Check className="w-3 h-3" />Il documento torna: righe, aliquote e totale combaciano.
        </p>
      )}
    </div>
  )
}
