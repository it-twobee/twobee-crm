'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  FileText, Upload, AlertTriangle, Search, Link2, Link2Off, Check, Loader2,
  ArrowDownLeft, ArrowUpRight, Info, Landmark, BookOpen, Trash2, Plus, CalendarClock, Send,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { EconomicsNav } from '@/components/economics/EconomicsNav'
import { DOC_TYPES } from '@/lib/fattura-xml'
import {
  totals, byMonth, byParty, aging, paymentDays, reconciliation, vatByQuarter, coverage, managed,
  type BillingPoint,
  lineCandidates, txCandidates, signed, signedTotal, daysBetween,
  invoiceStatus, invoiceStage, stageWhy, isOpen, isVoided, rectified,
  docKind, DOC_KIND_LABEL, isCreditNote, isDebitNote,
  payables, outflow, suggestedDue, type Payable,
  type Invoice, type LineRef, type TxRef, type InvoiceDirection, type CoverageRow,
  type InvoiceState, type DocKind, type InvoiceStatus,
} from '@/lib/invoices'
import { BillingChart } from '@/components/charts/BillingChart'
import {
  importInvoices, addInvoiceManually, attachInvoicePdf, removeInvoicePdf,
  linkInvoiceToLine, unlinkInvoiceFromLine,
  linkInvoiceToTx, setInvoicePaid, setInvoiceDue, setInvoiceUnmanaged, deleteInvoice,
  setInvoiceSent, setInvoiceRectifies,
} from '@/app/actions/invoices'

const eur = (n: number) => formatCurrency(Math.round(n))
const eur2 = (n: number) =>
  `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
const monthName = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })

type Tab = 'panoramica' | 'elenco' | 'riconcilia'

/* §323 — i filtri di stato, con dentro la stessa parola che sta nella colonna.
   Un filtro che dice «Aperte» accanto a una riga che dice «da incassare» fa
   dubitare che siano la stessa cosa, e chi dubita conta a mano. */
const STATE_FILTER: { key: InvoiceState | 'tutte' | 'non_pagate'; label: string; hint: string }[] = [
  { key: 'tutte', label: 'Tutti gli stati', hint: '' },
  { key: 'non_pagate', label: 'Non pagate', hint: 'scadute, nei termini e senza data insieme' },
  { key: 'scaduta', label: '· scadute', hint: 'oltre la data attesa' },
  { key: 'attesa', label: '· nei termini', hint: 'attese, non ancora scadute' },
  { key: 'senza_data', label: '· senza data', hint: 'né scadute né attese: invisibili' },
  { key: 'pagata', label: 'Pagate', hint: 'con una data di incasso o di pagamento' },
  { key: 'stornata', label: 'Stornate', hint: 'annullate da una nota di credito' },
  { key: 'rettifica', label: 'Note di credito', hint: 'non si incassano: rettificano' },
  { key: 'non_gestita', label: 'Non gestite', hint: 'fuori dai conti, col perché scritto' },
]

const KIND_FILTER: { key: DocKind | 'tutti'; label: string }[] = [
  { key: 'tutti', label: 'Tutti i documenti' },
  { key: 'fattura', label: 'Solo fatture' },
  { key: 'nota_credito', label: 'Note di credito' },
  { key: 'nota_debito', label: 'Note di debito' },
  { key: 'parcella', label: 'Parcelle' },
  { key: 'autofattura', label: 'Autofatture' },
]

const TONE: Record<InvoiceStatus['tone'], string> = {
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
  info: 'text-info',
  muted: 'text-text-tertiary',
}

/** §323 — il genere del documento, dove cambia il segno di quello che si legge. */
function KindBadge({ docType }: { docType: string }) {
  const kind = docKind(docType)
  if (kind === 'fattura') return null
  const tone = kind === 'nota_credito' ? 'text-error border-error/40'
    : kind === 'nota_debito' ? 'text-orange border-orange/40'
    : 'text-text-tertiary border-border'
  return (
    <span className={`inline-flex items-center rounded border px-1 py-px text-2xs font-semibold ${tone}`}
      title={`${DOC_TYPES[docType] ?? docType} (${docType})`}>
      {DOC_KIND_LABEL[kind]}
    </span>
  )
}

export function InvoicesClient({
  month, setupNeeded, statesReady = true, today, invoices, lines, txs, clients, series = [],
}: {
  month: string
  setupNeeded: boolean
  /** §323 — false = manca la 219: il viaggio del documento non si può dichiarare */
  statesReady?: boolean
  today: string
  /** §278 — emesso, incassato, in attesa e previsionale, mese per mese */
  series?: BillingPoint[]
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
  const [state, setState] = useState<InvoiceState | 'tutte' | 'non_pagate'>('tutte')
  const [kind, setKind] = useState<DocKind | 'tutti'>('tutti')
  const [open, setOpen] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  /* §247 — la porta che mancava: il documento che non c'è ancora si scrive. */
  const [manual, setManual] = useState(false)

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
        + (r.stornate ? ` · ${r.stornate} storni collegati` : '')
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
  /* §324 — i debiti si leggono per fornitore, non per documento: chi ha tre
     fatture aperte fa un bonifico solo. Si calcola sull'archivio intero, non su
     `scoped`: filtrare per anno spezzerebbe un fornitore a cavallo di dicembre. */
  const debiti = useMemo(() => payables(invoices, today), [invoices, today])
  const uscite = useMemo(() => outflow(invoices, today), [invoices, today])
  /* §324 — «prossima uscita» degenera quando tutto è già scaduto: mostrerebbe
     una data passata sotto la parola «prossima». La domanda che regge sempre è
     quanto serve avere sul conto entro il mese, scaduto compreso. */
  const entro30 = useMemo(() => {
    const q = ['già scadute', 'entro 7 giorni', 'entro 30 giorni'] as const
    const s = uscite.slices.filter(x => (q as readonly string[]).includes(x.key))
    return {
      amount: Math.round(s.reduce((n, x) => n + x.amount, 0) * 100) / 100,
      count: s.reduce((n, x) => n + x.count, 0),
    }
  }, [uscite])
  const cover = useMemo(() => coverage({ invoices: scoped, lines, txs }), [scoped, lines, txs])
  const findings = useMemo(
    () => reconciliation({ invoices: scoped, lines, txs, today }), [scoped, lines, txs, today])

  const listed = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scoped
      .filter(i => i.direction === dir)
      .filter(i => {
        if (state === 'tutte') return true
        const s = invoiceStatus(i, today).state
        /* «Non pagate» è la domanda che si fa davvero, e le tre sotto sono le
           risposte: una fattura senza data non è meno non pagata delle altre —
           è solo quella che nessuno vede (§280). */
        if (state === 'non_pagate') return s === 'scaduta' || s === 'attesa' || s === 'senza_data'
        return s === state
      })
      .filter(i => kind === 'tutti' || docKind(i.docType) === kind)
      .filter(i => !needle
        || i.counterpartyName.toLowerCase().includes(needle)
        || i.number.toLowerCase().includes(needle))
  }, [scoped, dir, state, kind, q, today])

  /* §323 — per dire «storna la FPR 41/26» serve il documento, non il suo id. */
  const byId = useMemo(() => new Map(invoices.map(i => [i.id, i])), [invoices])

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

      {/* §323 — la 219 manca: la sezione funziona, ma il viaggio del documento e
          gli storni non si possono dichiarare. Dirlo è meglio che mostrare ogni
          fattura come «da inviare», che sarebbe plausibile e falso. */}
      {!statesReady && (
        <div className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3">
          <p className="flex items-center gap-2 text-2xs font-bold text-warning">
            <AlertTriangle className="w-3.5 h-3.5" />Stati e storni non ancora attivi
          </p>
          <p className="text-2xs text-text-secondary mt-1 max-w-3xl">
            Manca la migration <code className="text-gold-text">219_invoice_states.sql</code>: senza,
            il tool non sa quali fatture una nota di credito ha annullato e non distingue una fattura
            emessa da una inviata. Tutto il resto funziona, e queste due colonne restano vuote invece
            di dire qualcosa di sbagliato.
          </p>
        </div>
      )}

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-text-primary font-heading">
            <FileText className="w-5 h-5 text-gold-text" />Fatturazione
          </h1>
          <p className="text-2xs text-text-tertiary mt-0.5 max-w-2xl">
            {invoices.length} documenti letti dall&apos;XML dello SdI, in due aree: le
            <strong className="text-text-secondary"> fatture inviate</strong> ai clienti e le
            <strong className="text-text-secondary"> fatture ricevute</strong> dai fornitori. Sono due
            domande diverse — chi deve pagare noi e quando, chi dobbiamo pagare e quando — e ognuna ha
            il suo scadenzario, la sua coda di lavoro e i suoi numeri. Gli importi non si scrivono a
            mano: si rileggono dal file, e lo stato pure — una nota di credito dice quale fattura
            storna, e da quel momento quella fattura non è più un credito da inseguire.
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
          {/* §247 — l'XML resta la strada giusta, ma arriva quando arriva: senza
              una seconda porta, un costo già uscito dal conto non aveva un
              documento con cui riconciliarsi. */}
          <button onClick={() => setManual(m => !m)} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
            <Plus className="w-3.5 h-3.5" />A mano
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-bold bg-gold text-on-gold rounded-xl px-3 py-2 press disabled:opacity-40">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Importa XML
          </button>
        </div>
      </header>

      {manual && (
        <ManualForm dir={dir} clients={clients} pending={pending}
          onCancel={() => setManual(false)}
          onDone={v => { setManual(false); run(() => addInvoiceManually(v), 'Fattura aggiunta') }} />
      )}

      {/* ── §292 · due aree, e la scelta è della pagina ──
          La direzione stava dentro «Scadenzario»: governava quel riquadro e i
          fornitori, mentre le scorecard, il grafico e la coda del «da incassare»
          restavano sulle emesse qualunque cosa premessi. Due letture della stessa
          pagina che non concordano sono peggio di una sola (§210), e per vedere i
          debiti verso i fornitori bisognava sapere che quell'interruttore c'era.
          Ora l'area dichiara cosa contiene **prima** che uno prema. */}
      <div className="flex gap-1 bg-surface border border-border rounded-2xl p-1 w-fit">
        {([
          ['emessa', 'Fatture inviate', tEm, 'ai clienti: quello che devono pagarci'],
          ['ricevuta', 'Fatture ricevute', tRi, 'dai fornitori: quello che dobbiamo pagare'],
        ] as const).map(([k, label, t, hint]) => (
          <button key={k} onClick={() => setDir(k)} aria-current={dir === k ? 'page' : undefined}
            className={`px-4 py-2.5 rounded-xl text-left ${
              dir === k ? 'bg-gold text-on-gold' : 'hover:bg-surface-hover'}`}>
            <span className={`block text-2xs font-bold ${dir === k ? 'text-on-gold' : 'text-text-primary'}`}>
              {label} · {t.count}
            </span>
            <span className={`block text-2xs ${dir === k ? 'text-on-gold/80' : 'text-text-tertiary'}`}>
              {eur(t.taxable)} · {hint}
            </span>
          </button>
        ))}
      </div>

      {/* ── i quattro numeri dell'area scelta ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dir === 'emessa' ? (
          <>
            <Stat icon={<ArrowUpRight className="w-3.5 h-3.5 text-success" />}
              label="Fatturato emesso" value={eur(tEm.taxable)}
              hint={`${tEm.count} documenti da ${byParty(emesse).length} clienti, al netto degli storni`}
              extra={<span className="text-text-tertiary">IVA a debito {eur(tEm.vat)}</span>} />
            <Stat icon={<Landmark className="w-3.5 h-3.5 text-gold-text" />}
              label="Da incassare" value={eur(tEm.outstanding)}
              hint="crediti aperti verso i clienti"
              extra={tEm.overdue > 0
                ? <span className="text-error">{eur(tEm.overdue)} già scaduti</span>
                : <span className="text-success">niente di scaduto</span>} />
            <Stat icon={<CalendarClock className="w-3.5 h-3.5 text-info" />}
              label="Tempi di incasso"
              value={days.median !== null ? `${days.median} giorni` : 'n/d'}
              hint={days.median !== null
                ? `mediana su ${days.sample} fatture rientrate`
                : 'nessuna fattura incassata: la mediana non si può ancora calcolare'}
              extra={<span className="text-text-tertiary">dalla data di emissione</span>} />
            {/* §323 — le note non sono una nota a piè di pagina: sui dati veri
                sono 7 documenti su 47, e sono quelli che spostano il fatturato
                nella direzione che nessuno si aspetta. Le due specie stanno
                nello stesso riquadro perché è lì che si confondono. */}
            <Stat icon={<FileText className="w-3.5 h-3.5 text-orange" />}
              label="Note di credito e debito"
              value={`${tEm.credits} · ${tEm.debits}`}
              hint={`${eur(tEm.creditsAmount)} stornati, ${eur(tEm.debitsAmount)} rifatturati`}
              extra={tEm.voided > 0
                ? <span className="text-text-tertiary">{tEm.voided} fatture annullate per intero</span>
                : <span className="text-text-tertiary">nessuna fattura annullata</span>} />
          </>
        ) : (
          <>
            <Stat icon={<ArrowDownLeft className="w-3.5 h-3.5 text-info" />}
              label="Ricevuto" value={eur(tRi.taxable)}
              hint={`${tRi.count} documenti da ${byParty(ricevute).length} fornitori`}
              extra={<span className="text-text-tertiary">IVA a credito {eur(tRi.vat)}</span>} />
            <Stat icon={<Landmark className="w-3.5 h-3.5 text-orange" />}
              label="Da pagare" value={eur(tRi.outstanding)}
              hint="debiti verso fornitori ancora aperti"
              extra={tRi.overdue > 0
                ? <span className="text-warning">{eur(tRi.overdue)} oltre la scadenza</span>
                : <span className="text-success">tutto nei termini</span>} />
            {/* §324 — qui c'era «Oltre la scadenza», che ripeteva il numero già
                scritto nel riquadro accanto: due volte la stessa cifra sulla
                stessa riga fa contare a mano invece di leggere (§238). La
                domanda che mancava è l'altra: **quando esce il prossimo euro**. */}
            <Stat icon={<CalendarClock className="w-3.5 h-3.5 text-info" />}
              label="Serve entro 30 giorni"
              value={eur(entro30.amount)}
              hint={entro30.count
                ? `${entro30.count} fatture fra scadute e in scadenza`
                : 'niente in scadenza entro il mese'}
              extra={uscite.undated > 0
                ? <span className="text-warning">più {eur(uscite.undated)} senza una data</span>
                : <span className="text-text-tertiary">ogni debito ha una scadenza</span>} />
            <Stat icon={<FileText className="w-3.5 h-3.5 text-gold-text" />}
              label="Note di credito e debito"
              value={`${tRi.credits} · ${tRi.debits}`}
              hint="la prima toglie dal costo, la seconda aggiunge"
              extra={<span className="text-text-tertiary">
                {eur(tRi.creditsAmount)} stornati, {eur(tRi.debitsAmount)} rifatturati
              </span>} />
          </>
        )}
      </div>

      {/* ── §278 · il fatturato nel tempo: la forma che risponde a «come andiamo» ── */}
      {dir === 'emessa' && series.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
            <h2 className="text-sm font-bold text-text-primary">Fatturato nel tempo</h2>
            <span className="text-2xs text-text-tertiary tabular">
              {eur(series.filter(p => !p.future).reduce((s2, p) => s2 + p.gross, 0))} emessi ·{' '}
              {eur(series.filter(p => !p.future).reduce((s2, p) => s2 + p.collected, 0))} rientrati ·{' '}
              {eur(series.filter(p => !p.future).reduce((s2, p) => s2 + p.pending, 0))} in attesa
              {series.some(p => p.credited > 0) && <> ·{' '}
                {eur(series.reduce((s2, p) => s2 + p.credited, 0))} stornati</>} ·{' '}
              {eur(series.filter(p => p.future).reduce((s2, p) => s2 + p.forecast, 0))} previsti entro dicembre
            </span>
          </div>
          <BillingChart data={series} today={today} />
          {/* §280 — la leva sta sotto il suo risultato: la barra smorzata dice
              «in attesa», e qui sotto ci sono le fatture che la compongono, una
              per una, col gesto per chiuderle. */}
          <PendingInvoices invoices={invoices} txs={txs} today={today}
            pending={pending} run={run} direction="emessa" />
        </section>
      )}

      {/* §292 — le ricevute non hanno una serie storica da guardare: la domanda
          non è «come andiamo» ma «chi dobbiamo pagare e quando», quindi la coda
          sta da sola e in cima, dov'è la prima cosa da fare. */}
      {/* ── §324 · Chi dobbiamo pagare, e quando esce ── */}
      {dir === 'ricevuta' && debiti.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
            <h2 className="text-sm font-bold text-text-primary">Chi dobbiamo pagare</h2>
            <span className="text-2xs text-text-tertiary tabular">
              {debiti.length} fornitor{debiti.length === 1 ? 'e' : 'i'} · {eur2(uscite.total)} lordi
            </span>
          </div>
          <p className="text-2xs text-text-tertiary mb-3 max-w-3xl">
            Un credito si insegue una fattura alla volta; un debito si paga un fornitore alla volta.
            In ordine di <strong className="text-text-secondary">ritardo</strong>, non di importo: un
            fornitore piccolo scaduto da due mesi smette di lavorare prima di uno grande che scade domani.
          </p>

          {/* Quando esce: la domanda della cassa, non dello scadenzario */}
          <div className="grid gap-2 sm:grid-cols-5 mb-4">
            {uscite.slices.map(s => (
              <div key={s.key} className={`rounded-xl border px-3 py-2 ${
                s.amount === 0 ? 'border-border opacity-50'
                  : s.key === 'già scadute' ? 'border-error/40 bg-error/5'
                  : s.key === 'senza data' ? 'border-warning/40 bg-warning/5'
                  : 'border-border'}`}>
                <span className="block text-2xs text-text-tertiary">{s.key}</span>
                <span className={`block text-sm font-bold tabular ${
                  s.key === 'già scadute' && s.amount > 0 ? 'text-error'
                    : s.key === 'senza data' && s.amount > 0 ? 'text-warning' : 'text-text-primary'}`}>
                  {eur(s.amount)}
                </span>
                <span className="block text-2xs text-text-tertiary">
                  {s.count} fattur{s.count === 1 ? 'a' : 'e'}
                </span>
              </div>
            ))}
          </div>

          <ul className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
            {debiti.map(p => <PayableRow key={p.key} p={p} invoices={invoices} today={today}
              pending={pending} run={run} />)}
          </ul>
        </section>
      )}

      {dir === 'ricevuta' && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="text-sm font-bold text-text-primary">
            Le stesse fatture, una per una
          </h2>
          {/* §324 — sono gli stessi documenti del riquadro sopra, non altri: là
              si decide **chi** pagare, qui si lavora **una fattura**. Due liste
              sulla stessa pagina vanno dichiarate uguali, o la prima cosa che
              viene in mente è che i due totali siano due numeri diversi (§238). */}
          <p className="text-2xs text-text-tertiary max-w-3xl">
            Lo stesso debito di sopra, visto per documento invece che per fornitore: là si sceglie chi
            pagare, qui si chiude la singola partita — si aggancia il movimento che è già passato, si
            mette la data attesa, o si dichiara che non è un debito. Un debito senza una data di
            scadenza non è né in ritardo né atteso: sparisce dalla previsione di cassa, e riappare il
            giorno in cui il fornitore chiama.
          </p>
          <PendingInvoices invoices={invoices} txs={txs} today={today}
            pending={pending} run={run} direction="ricevuta" />
        </section>
      )}

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
              <h2 className="text-sm font-bold text-text-primary mb-1">
                Scadenzario · {dir === 'emessa' ? 'da incassare' : 'da pagare'}
              </h2>
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
            {/* §292 — niente secondo interruttore qui: l'area la sceglie la
                pagina, e due selettori della stessa cosa nella stessa schermata
                fanno cercare due volte dove si sta guardando. */}
            <span className="text-2xs font-bold text-text-primary">
              {dir === 'emessa' ? 'Inviate' : 'Ricevute'} · {listed.length}
            </span>
            <div className="flex items-center gap-1.5 bg-background border border-border-interactive rounded-lg px-2 py-1.5">
              <Search className="w-3.5 h-3.5 text-text-tertiary" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="numero o controparte"
                aria-label="Cerca fra le fatture"
                className="bg-transparent text-2xs text-text-primary outline-none w-44" />
            </div>
            <select value={state} onChange={e => setState(e.target.value as never)} aria-label="Stato"
              className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
              {STATE_FILTER.map(o => (
                <option key={o.key} value={o.key} title={o.hint}>{o.label}</option>
              ))}
            </select>
            {/* §323 — il genere del documento è un filtro suo: «quali sono le
                note di credito» è una domanda che si fa da sola, e prima si
                poteva rispondere solo leggendo riga per riga la scritta piccola
                sotto il numero. */}
            <select value={kind} onChange={e => setKind(e.target.value as never)} aria-label="Tipo di documento"
              className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
              {KIND_FILTER.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
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
                  const st = invoiceStatus(i, today)
                  const linked = lines.find(l => l.invoiceId === i.id)
                  /* §323 — il documento che questa nota storna, e le note che
                     stornano questo: la stessa relazione letta nei due versi,
                     perché chi guarda una fattura annullata vuole sapere da cosa
                     e chi guarda una nota vuole sapere cosa. */
                  const storna = i.rectifiesId ? byId.get(i.rectifiesId) : undefined
                  const stornata = (i.rectifiedBy ?? []).map(x => byId.get(x)).filter(Boolean) as Invoice[]
                  return (
                    <tr key={i.id} className="border-t border-border/60 hover:bg-surface-hover align-top">
                      <td className="px-4 py-2">
                        <button onClick={() => setOpen(open === i.id ? null : i.id)}
                          className="text-2xs font-bold text-text-primary hover:text-gold-text text-left">
                          {i.number}
                        </button>
                        <span className="block text-2xs text-text-tertiary">
                          {day(i.issuedOn)}
                          {i.docType !== 'TD01' && docKind(i.docType) === 'fattura'
                            && ` · ${DOC_TYPES[i.docType] ?? i.docType}`}
                        </span>
                        <span className="flex items-center gap-1 flex-wrap mt-0.5">
                          <KindBadge docType={i.docType} />
                          {/* §323 — il viaggio del documento, dove è una domanda:
                              sulle ricevute non lo è, non le abbiamo mandate noi. */}
                          {statesReady && st.stage === 'emessa' && (
                            <span title={stageWhy(i)}
                              className="inline-flex items-center gap-0.5 rounded border border-warning/40 px-1 py-px text-2xs font-semibold text-warning">
                              <Send className="w-2.5 h-2.5" />da inviare
                            </span>
                          )}
                        </span>
                        {/* §250 — il documento sta accanto al numero, dove lo si
                            cerca: una fattura senza il suo PDF si ritrova solo
                            aprendo la cartella download di qualcuno. */}
                        <span className="mt-1 inline-block">
                          <PdfCell id={i.id} path={i.pdfPath} pending={pending} run={run} />
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
                        {storna && (
                          <span className="block text-2xs text-text-tertiary">
                            {i.sign < 0 ? 'storna' : 'integra'} la {storna.number} del {day(storna.issuedOn)}
                          </span>
                        )}
                        {stornata.length > 0 && (
                          <span className="block text-2xs text-error">
                            stornata da {stornata.map(x => x.number).join(', ')}
                          </span>
                        )}
                      </td>
                      <td className={`px-2 py-2 text-2xs tabular text-right font-semibold ${
                        i.sign === -1 ? 'text-error' : 'text-text-primary'}`}>{eur2(signed(i))}</td>
                      <td className="px-2 py-2 text-2xs tabular text-right text-text-tertiary">{eur2(i.sign * i.vatAmount)}</td>
                      <td className="px-2 py-2 text-2xs tabular text-right text-text-secondary">{eur2(signedTotal(i))}</td>
                      <td className="px-2 py-2 text-2xs text-text-tertiary">{day(i.dueDate)}</td>
                      {/* §323 — lo stato lo dice `invoiceStatus`, che è l'unico
                          posto in cui si decide: qui prima c'era una seconda
                          catena di if, e due catene divergono sempre. Il titolo
                          porta il perché — «scaduta» senza una data è un'accusa
                          che chi legge deve andare a verificare. */}
                      <td className="px-2 py-2">
                        <span className={`block text-2xs font-semibold ${TONE[st.tone]}`} title={st.why}>
                          {st.label}
                        </span>
                        {st.state === 'pagata' && (
                          <span className="block text-2xs text-text-tertiary">{day(i.paidOn!)}</span>
                        )}
                        {isOpen(i) && (
                          <button onClick={() => run(() => setInvoicePaid(i.id, today), 'Segnata come saldata')}
                            className="text-2xs text-text-tertiary hover:text-success press underline">
                            segna {dir === 'emessa' ? 'saldata' : 'pagata'}
                          </button>
                        )}
                        {statesReady && st.stage === 'emessa' && (
                          <button onClick={() => run(() => setInvoiceSent(i.id, today), 'Segnata come inviata')}
                            className="block text-2xs text-text-tertiary hover:text-text-primary press underline">
                            segna inviata
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
            today={today} statesReady={statesReady} pending={pending} run={run}
            candidates={invoices.filter(x =>
              x.direction === dir && x.sign > 0 && x.id !== open
              && x.counterpartyName === invoices.find(i => i.id === open)!.counterpartyName)}
            target={(() => {
              const t = invoices.find(i => i.id === open)!.rectifiesId
              return t ? byId.get(t) ?? null : null
            })()}
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

/**
 * §280 — Le fatture che devono ancora rientrare, sotto il grafico.
 *
 * La parte smorzata della barra è un totale, e un totale non si insegue: si
 * insegue una fattura, con un nome e un cliente da chiamare. Qui sotto ci sono
 * quelle, in ordine di **ritardo** — chi aspetta da più tempo per primo, che è
 * l'unico ordine che una persona userebbe.
 *
 * Due strade per chiuderne una, e sono due fatti diversi:
 *
 *   · **il movimento c'è già** — l'estratto conto è stato caricato e il bonifico
 *     è lì: si aggancia, e da quel momento la fattura è incassata con la data
 *     del movimento, non con quella di oggi.
 *   · **deve ancora arrivare** — allora l'unica cosa vera che si può scrivere è
 *     **quando**. Senza una data una fattura non è né scaduta né attesa: sparisce
 *     dalle telefonate da fare e da ogni previsione di cassa.
 *
 * La terza — «segnala incassata» a mano — resta per il contante e per il conto
 * che nessuno ha ancora caricato, e dichiara quello che è: una spunta senza un
 * movimento che la dimostri (§226).
 */
/**
 * §324 — Un fornitore, con dentro le sue fatture.
 *
 * Chiuso di default: la riga porta già la decisione — quanto, quando, quanto in
 * ritardo — e aprirlo serve solo quando si vuole sapere **di cosa** è fatto quel
 * numero. Un elenco che parte tutto aperto è un elenco che non si legge.
 */
function PayableRow({ p, invoices, today, pending, run }: {
  p: Payable
  invoices: Invoice[]
  today: string
  pending: boolean
  run: (fn: () => Promise<unknown>, ok?: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className={open ? 'bg-surface-hover/50' : ''}>
      <div className="flex items-baseline gap-3 px-3 py-2 flex-wrap">
        <button onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="text-2xs font-bold text-text-primary hover:text-gold-text text-left min-w-[150px] flex-1 truncate">
          {p.name}
        </button>
        <span className="text-2xs text-text-tertiary shrink-0">
          {p.invoices.length} fattur{p.invoices.length === 1 ? 'a' : 'e'}
        </span>
        <span className="text-2xs shrink-0">
          {p.worstLate > 0
            ? <span className="text-error font-semibold">in ritardo di {p.worstLate} giorni</span>
            : p.nextDue
              ? <span className="text-text-tertiary">scade il {day(p.nextDue)}</span>
              : <span className="text-warning">senza data attesa</span>}
        </span>
        {p.undated > 0 && p.nextDue && (
          <span className="text-2xs text-warning shrink-0">
            {p.undated} senza data
          </span>
        )}
        <span className="text-2xs font-bold tabular text-text-primary shrink-0 w-28 text-right">
          {eur2(p.total)}
        </span>
      </div>

      {open && (
        <ul className="px-3 pb-3 space-y-1">
          {/* §324 — il termine che questo fornitore usa, dai suoi stessi documenti.
              Col campione accanto: un termine dedotto da un documento solo non è
              un termine, è un caso. */}
          {p.term.days !== null && p.term.sample >= 2 && (
            <li className="text-2xs text-text-tertiary">
              Di solito scrive <strong className="text-text-secondary">{p.term.days} giorni</strong> di
              termine, su {p.term.sample} sue fatture.
            </li>
          )}
          {p.invoices.map(i => {
            const st = invoiceStatus(i, today)
            const sug = suggestedDue(i, invoices)
            return (
              <li key={i.id} className="flex items-baseline gap-2 flex-wrap text-2xs">
                <span className="font-semibold text-text-secondary w-24 shrink-0">{i.number}</span>
                <span className="text-text-tertiary shrink-0">del {day(i.issuedOn)}</span>
                <span className={`shrink-0 ${TONE[st.tone]}`} title={st.why}>{st.label}</span>
                <span className="tabular text-text-primary ml-auto shrink-0">{eur2(signedTotal(i))}</span>
                {!i.paidOn && (
                  <button disabled={pending}
                    onClick={() => run(() => setInvoicePaid(i.id, today), 'Segnata pagata')}
                    className="text-text-tertiary hover:text-success underline shrink-0">segna pagata</button>
                )}
                {sug && (
                  <span className="basis-full pl-24 text-text-tertiary">
                    Nessuna scadenza sul documento.{' '}
                    <button disabled={pending}
                      onClick={() => run(() => setInvoiceDue(i.id, sug.date), 'Scadenza impostata')}
                      className="text-gold-text hover:underline">
                      metti il {day(sug.date)}
                    </button>{' '}
                    — {sug.why}.
                  </span>
                )}
                {!i.dueDate && !sug && (
                  <span className="basis-full pl-24 text-warning">
                    Nessuna scadenza sul documento e nessuno storico da cui dedurla: va decisa a mano.
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

const CODA = {
  emessa: {
    titolo: 'Da incassare', vuoto: 'Nessuna fattura in attesa: tutto quello che è stato emesso è rientrato.',
    fuori: 'non sono crediti e non si inseguono', arriva: 'Deve ancora arrivare',
    quando: 'Attesa il', segna: 'Oppure segnala incassata oggi', fatto: 'Segnata incassata oggi',
    perche: 'Senza una data non è né scaduta né attesa: sparisce dalle telefonate da fare.',
    manuale: 'Per il contante o un conto non caricato: resta una spunta che nessun movimento dimostra.',
    escludi: 'Non è da incassare', chiedi: 'Perché %s non è da incassare?',
    esempi: 'Es: duplicata di FPR 10/26 · stornata con nota di credito · giro fra società collegate',
  },
  ricevuta: {
    titolo: 'Da pagare', vuoto: 'Nessuna fattura aperta: tutto quello che è arrivato è stato pagato.',
    fuori: 'non sono debiti e non si pagano', arriva: 'Deve ancora uscire',
    quando: 'In scadenza il', segna: 'Oppure segnala pagata oggi', fatto: 'Segnata pagata oggi',
    perche: 'Senza una data non è né scaduta né attesa: sparisce dalla previsione di cassa.',
    manuale: 'Per il contante o la carta di un socio: resta una spunta che nessun movimento dimostra.',
    escludi: 'Non è da pagare', chiedi: 'Perché %s non è da pagare?',
    esempi: 'Es: già pagata in contanti · duplicata · nota di credito in arrivo',
  },
} as const

function PendingInvoices({ invoices, txs, today, pending, run, direction }: {
  invoices: Invoice[]
  txs: TxRef[]
  today: string
  pending: boolean
  run: (fn: () => Promise<unknown>, ok?: string) => void
  /** §292 — la stessa coda vale nei due versi: cambia il verbo, non il gesto */
  direction: InvoiceDirection
}) {
  const v = CODA[direction]
  const [open, setOpen] = useState<string | null>(null)
  const fuori = useMemo(() => invoices.filter(i =>
    i.direction === direction && i.sign > 0 && !managed(i)), [invoices, direction])
  /* §323 — annullate da una nota di credito. Non si nascondono: sparire da una
     lista senza dire perché è il modo di far ricomparire la stessa domanda fra
     un mese. Qui però non c'è niente da fare, e infatti non c'è nessun gesto. */
  const stornate = useMemo(() => invoices.filter(i =>
    i.direction === direction && managed(i) && !i.paidOn && isVoided(i)), [invoices, direction])
  const attesa = useMemo(() => invoices
    /* §281 — quelle fuori dai conti non sono crediti: qui si elenca chi va
       chiamato, e chiamare per una fattura duplicata è il modo di non essere
       più creduti. */
    /* §323 — e nemmeno quelle che una nota di credito ha annullato: la FPR
       41/26 di Petito era in questa lista da 56 giorni, e la nota che la
       cancellava era in archivio. `isOpen` è la stessa porta dei totali. */
    .filter(i => i.direction === direction && isOpen(i))
    .map(i => ({
      i,
      /* Senza scadenza non è in ritardo: è una fattura di cui non sappiamo
         quando è attesa, ed è un'altra cosa da dire. */
      late: i.dueDate && i.dueDate < today ? daysBetween(i.dueDate, today) : 0,
    }))
    .sort((a, b) => b.late - a.late || (a.i.dueDate ?? '9999').localeCompare(b.i.dueDate ?? '9999')),
    [invoices, today, direction])

  const fuoriBlock = fuori.length > 0 ? (
    <div className="mt-2 rounded-xl border border-border bg-surface-hover/40 px-3 py-2">
      <p className="text-2xs text-text-tertiary">
        <strong className="text-text-secondary">{fuori.length} fuori dai conti</strong> per
        {' '}{eur2(fuori.reduce((s2, i) => s2 + signedTotal(i), 0))}: {v.fuori}.
      </p>
      <ul className="mt-1 space-y-0.5">
        {fuori.map(i => (
          <li key={i.id} className="flex items-baseline gap-2 text-2xs">
            <span className="font-semibold text-text-secondary">{i.number}</span>
            <span className="text-text-tertiary truncate flex-1">{i.excludedReason}</span>
            <span className="tabular text-text-tertiary">{eur2(signedTotal(i))}</span>
            <button disabled={pending} onClick={() => run(() => setInvoiceUnmanaged(i.id, null), 'Rimessa nei conti')}
              className="text-text-tertiary hover:text-text-secondary underline shrink-0">rimetti</button>
          </li>
        ))}
      </ul>
    </div>
  ) : null

  const stornateBlock = stornate.length > 0 ? (
    <div className="mt-2 rounded-xl border border-border bg-surface-hover/40 px-3 py-2">
      <p className="text-2xs text-text-tertiary">
        <strong className="text-text-secondary">{stornate.length} annullate da una nota di credito</strong>
        {' '}per {eur2(stornate.reduce((s2, i) => s2 + signedTotal(i), 0))}: il documento lo dice da sé,
        e non c&apos;è niente da inseguire.
      </p>
      <ul className="mt-1 space-y-0.5">
        {stornate.map(i => (
          <li key={i.id} className="flex items-baseline gap-2 text-2xs">
            <span className="font-semibold text-text-secondary">{i.number}</span>
            <span className="text-text-tertiary truncate flex-1">{i.counterpartyName}</span>
            <span className="tabular text-text-tertiary">{eur2(signedTotal(i))}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null

  if (!attesa.length) {
    return (
      <div className="mt-4 pt-3 border-t border-border">
        <p className="flex items-center gap-2 text-2xs text-success">
          <Check className="w-3.5 h-3.5" />{v.vuoto}
        </p>
        {stornateBlock}
        {fuoriBlock}
      </div>
    )
  }

  const tot = attesa.reduce((s2, x) => s2 + signedTotal(x.i), 0)
  const scadute = attesa.filter(x => x.late > 0)
  const senzaData = attesa.filter(x => !x.i.dueDate)

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h3 className="text-2xs font-bold uppercase tracking-wider text-text-secondary">
          {v.titolo} · {attesa.length} fattur{attesa.length === 1 ? 'a' : 'e'}
        </h3>
        <span className="text-2xs text-text-tertiary tabular">
          {eur2(tot)} lordi
          {scadute.length > 0 && (
            <span className="text-error"> · {scadute.length} oltre la scadenza per {eur2(scadute.reduce((s2, x) => s2 + signedTotal(x.i), 0))}</span>
          )}
          {senzaData.length > 0 && (
            <span className="text-warning"> · {senzaData.length} senza una data attesa</span>
          )}
        </span>
      </div>

      <ul className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
        {attesa.map(({ i, late }) => {
          const cand = txCandidates(i, txs).slice(0, 3)
          const aperto = open === i.id
          return (
            <li key={i.id} className={aperto ? 'bg-surface-hover/50' : ''}>
              <div className="flex items-baseline gap-3 px-3 py-2 flex-wrap">
                <span className="text-2xs font-bold text-text-primary shrink-0">{i.number}</span>
                <span className="text-2xs text-text-secondary flex-1 min-w-[140px] truncate">
                  {i.counterpartyName}
                </span>
                <span className="text-2xs text-text-tertiary shrink-0">
                  {i.dueDate
                    ? late > 0
                      ? <span className="text-error font-semibold">in ritardo di {late} giorni</span>
                      : <>attesa il {day(i.dueDate)}</>
                    : <span className="text-warning">senza data attesa</span>}
                </span>
                <span className="text-2xs font-bold tabular text-text-primary shrink-0 w-24 text-right">
                  {eur2(signedTotal(i))}
                </span>
                <button onClick={() => setOpen(aperto ? null : i.id)} aria-expanded={aperto}
                  className="text-2xs font-semibold text-gold-text hover:underline shrink-0">
                  {cand.length > 0 ? `${cand.length} movimenti` : 'chiudi la partita'}
                </button>
              </div>

              {aperto && (
                <div className="px-3 pb-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/60 p-2">
                    <p className="flex items-center gap-1.5 text-2xs font-semibold text-text-tertiary mb-1">
                      <Landmark className="w-3 h-3" />Il movimento c&apos;è già
                    </p>
                    {cand.length === 0 ? (
                      <p className="text-2xs text-text-tertiary">
                        Nessun movimento con questo importo lordo. Se il bonifico è arrivato su un conto
                        che non è ancora stato caricato, importa l&apos;estratto conto in Banca.
                      </p>
                    ) : cand.map(c => (
                      <button key={c.item.id} disabled={pending}
                        onClick={() => run(() => linkInvoiceToTx(i.id, c.item.id), 'Agganciata al movimento')}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-hover press disabled:opacity-40">
                        <span className="block text-2xs text-text-primary">
                          {day(c.item.bookedOn)} · <span className="tabular font-semibold">{eur2(c.item.amount)}</span>
                          {' '}· {c.item.counterparty ?? c.item.description.slice(0, 28)}
                        </span>
                        <span className="block text-2xs text-text-tertiary">{c.why.join(' · ')}</span>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-lg border border-border/60 p-2">
                    <p className="flex items-center gap-1.5 text-2xs font-semibold text-text-tertiary mb-1">
                      <CalendarClock className="w-3 h-3" />{v.arriva}
                    </p>
                    <label className="flex items-center gap-2">
                      <span className="text-2xs text-text-secondary">{v.quando}</span>
                      <input type="date" defaultValue={i.dueDate ?? ''} disabled={pending}
                        onChange={e => run(() => setInvoiceDue(i.id, e.target.value || null),
                          e.target.value ? 'Scadenza aggiornata' : 'Scadenza tolta')}
                        className="bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary" />
                    </label>
                    <p className="text-2xs text-text-tertiary mt-1.5">{v.perche}</p>
                    <button disabled={pending}
                      onClick={() => run(() => setInvoicePaid(i.id, today), v.fatto)}
                      className="mt-2 text-2xs font-semibold text-text-secondary hover:text-text-primary underline">
                      {v.segna}
                    </button>
                    <p className="text-2xs text-text-tertiary">{v.manuale}</p>
                    {/* §281 — la terza risposta: non è un credito. Duplicata,
                        stornata, giro fra società collegate — e il perché si
                        scrive, o fra sei mesi nessuno sa se era una scelta. */}
                    <button disabled={pending}
                      onClick={() => {
                        const why = window.prompt(`${v.chiedi.replace('%s', i.number)}\n${v.esempi}`)
                        if (why?.trim()) run(() => setInvoiceUnmanaged(i.id, why), 'Tolta dai conti')
                      }}
                      className="mt-2 block text-2xs font-semibold text-text-tertiary hover:text-text-secondary underline">
                      {v.escludi}
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {stornateBlock}
      {fuoriBlock}
    </div>
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

function Detail({ invoice, onClose, onDelete, today, statesReady, pending, run, candidates, target }: {
  invoice: Invoice
  onClose: () => void
  onDelete: () => void
  today: string
  statesReady: boolean
  pending: boolean
  run: (fn: () => Promise<unknown>, ok?: string) => void
  /** §323 — le fatture della stessa controparte: è fra queste che una nota storna */
  candidates: Invoice[]
  target: Invoice | null
}) {
  const st = invoiceStatus(invoice, today)
  const nota = isCreditNote(invoice.docType) || isDebitNote(invoice.docType)
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
      {/* §323 — lo stato per esteso, col perché accanto: in elenco c'è la
          parola, qui la ragione, e sono due bisogni diversi. */}
      <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div className="flex items-baseline gap-2">
          <dt className="text-2xs text-text-tertiary w-24 shrink-0">Stato</dt>
          <dd className={`text-2xs font-semibold ${TONE[st.tone]}`}>
            {st.label} <span className="font-normal text-text-tertiary">— {st.why}</span>
          </dd>
        </div>
        {statesReady && st.stage && (
          <div className="flex items-baseline gap-2">
            <dt className="text-2xs text-text-tertiary w-24 shrink-0">Documento</dt>
            <dd className="text-2xs text-text-secondary">
              {st.stage === 'inviata' ? 'inviata' : 'emessa, non ancora inviata'}
              <span className="text-text-tertiary"> — {stageWhy(invoice)}</span>
              {st.stage === 'emessa' && (
                <button disabled={pending}
                  onClick={() => run(() => setInvoiceSent(invoice.id, today), 'Segnata come inviata')}
                  className="ml-2 underline text-text-tertiary hover:text-text-primary press">
                  segna inviata oggi
                </button>
              )}
            </dd>
          </div>
        )}
        {rectified(invoice) > 0 && (
          <div className="flex items-baseline gap-2">
            <dt className="text-2xs text-text-tertiary w-24 shrink-0">Stornato</dt>
            <dd className="text-2xs text-error">
              {eur2(rectified(invoice))} su {eur2(invoice.taxable)} di imponibile
              {!isVoided(invoice) && ' — il resto è ancora un credito'}
            </dd>
          </div>
        )}
      </dl>

      {/* §323 — il legame fra la nota e la fattura che rettifica. Lo dichiara il
          documento (`DatiFattureCollegate`) e su tutte le note di credito di
          questo archivio c'è; sulle note di **debito** non c'è mai, e senza il
          legame la fattura resta a galleggiare fra i crediti aperti. È l'unico
          punto in cui si scrive a mano, e ci si arriva solo quando il file tace. */}
      {nota && statesReady && (
        <div className="mt-3 rounded-xl border border-border p-3">
          <p className="text-2xs font-semibold text-text-secondary">
            {isCreditNote(invoice.docType) ? 'Storna' : 'Integra'} il documento
          </p>
          {target ? (
            <p className="text-2xs text-text-secondary mt-1">
              {target.number} del {day(target.issuedOn)} · {eur2(target.taxable)} di imponibile
              <button disabled={pending}
                onClick={() => run(() => setInvoiceRectifies(invoice.id, null), 'Collegamento tolto')}
                className="ml-2 underline text-text-tertiary hover:text-warning press">togli</button>
            </p>
          ) : (
            <>
              <p className="text-2xs text-text-tertiary mt-1">
                Il documento non lo dichiara. Finché manca, la fattura che questa nota tocca resta
                fra i crediti aperti e lo storno pesa sul mese sbagliato.
              </p>
              <select defaultValue="" disabled={pending} aria-label="Documento rettificato"
                onChange={e => { if (e.target.value) run(() => setInvoiceRectifies(invoice.id, e.target.value), 'Collegata') }}
                className="mt-1.5 bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary max-w-full">
                <option value="">scegli la fattura…</option>
                {candidates.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.number} · {day(c.issuedOn)} · {eur2(c.taxable)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

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

/**
 * §247 — La fattura scritta a mano.
 *
 * L'import legge l'XML dello SdI ed è la strada giusta: il documento è quello
 * che vale davanti all'erario. Ma il file arriva quando arriva — dal
 * commercialista, dal fornitore, a volte mai — e nel frattempo il costo è già
 * uscito dal conto. Finché l'unica porta era l'XML, una spesa senza documento
 * restava invisibile qui dentro e il conto economico non aveva niente con cui
 * riconciliarla: su luglio erano 61 movimenti e zero agganciati.
 *
 * Il modulo chiede **sei campi**, non trenta: chi, quando, numero, imponibile,
 * IVA, scadenza. Tutto il resto lo porta l'XML quando arriva — e quando arriva
 * l'import la riconosce come duplicato, perché la chiave è la stessa.
 */
function ManualForm({ dir, prefill, clients, onDone, onCancel, pending }: {
  dir: InvoiceDirection
  prefill?: { name?: string; taxable?: number; issuedOn?: string; note?: string }
  clients: { id: string; name: string }[]
  onDone: (v: {
    direction: InvoiceDirection; number: string; issuedOn: string
    counterpartyName: string; counterpartyVat: string | null; clientId: string | null
    taxable: number; vatAmount: number; dueDate: string | null; credit: boolean; notes: string | null
  }) => void
  onCancel: () => void
  pending: boolean
}) {
  const [name, setName] = useState(prefill?.name ?? '')
  const [vat, setVat] = useState('')
  const [clientId, setClientId] = useState('')
  const [number, setNumber] = useState('')
  const [issuedOn, setIssuedOn] = useState(prefill?.issuedOn ?? new Date().toISOString().slice(0, 10))
  const [taxable, setTaxable] = useState(prefill?.taxable ? String(prefill.taxable) : '')
  const [rate, setRate] = useState('22')
  const [dueDate, setDueDate] = useState('')
  const [credit, setCredit] = useState(false)

  const imp = Number(taxable.replace(',', '.')) || 0
  const iva = Math.round(imp * (Number(rate) / 100) * 100) / 100
  const tot = Math.round((imp + iva) * 100) / 100
  const input = 'w-full bg-background border border-border-interactive rounded-lg px-2.5 py-1.5 text-2xs text-text-primary'

  return (
    <div className="rounded-2xl border border-border-strong bg-surface p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-text-primary">
          Aggiungi a mano una fattura {dir === 'emessa' ? 'emessa' : 'ricevuta'}
        </h3>
        <p className="text-2xs text-text-tertiary mt-0.5">
          Sei campi. Quando l&apos;XML arriva, l&apos;import la riconosce dalla stessa chiave —
          fornitore, numero, data — e non ne crea una seconda.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-2xs text-text-tertiary">
            {dir === 'emessa' ? 'Cliente' : 'Fornitore'}
          </span>
          <input value={name} onChange={e => setName(e.target.value)} className={input}
            placeholder={dir === 'emessa' ? 'iCura Impresa' : 'Affinity S.r.l.'} />
        </label>
        <label className="block">
          <span className="text-2xs text-text-tertiary">Partita IVA (se la sai)</span>
          <input value={vat} onChange={e => setVat(e.target.value)} className={input} placeholder="IT01234567890" />
        </label>
        <label className="block">
          <span className="text-2xs text-text-tertiary">Numero</span>
          <input value={number} onChange={e => setNumber(e.target.value)} className={input} placeholder="2026/128" />
        </label>
        <label className="block">
          <span className="text-2xs text-text-tertiary">Data</span>
          <input type="date" value={issuedOn} onChange={e => setIssuedOn(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="text-2xs text-text-tertiary">Imponibile</span>
          <input value={taxable} onChange={e => setTaxable(e.target.value)} className={input} placeholder="2450" inputMode="decimal" />
        </label>
        <label className="block">
          <span className="text-2xs text-text-tertiary">IVA %</span>
          <select value={rate} onChange={e => setRate(e.target.value)} className={input}>
            {['22', '10', '5', '4', '0'].map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-2xs text-text-tertiary">Scadenza (facoltativa)</span>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={input} />
        </label>
        {dir === 'emessa' && clients.length > 0 && (
          <label className="block">
            <span className="text-2xs text-text-tertiary">Cliente in anagrafica</span>
            <select value={clientId} onChange={e => setClientId(e.target.value)} className={input}>
              <option value="">— nessuno</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <label className="flex items-center gap-2 text-2xs text-text-secondary">
        <input type="checkbox" checked={credit} onChange={e => setCredit(e.target.checked)} />
        È una nota di credito (toglie invece di aggiungere)
      </label>

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-border">
        <p className="text-2xs text-text-tertiary">
          Totale <strong className="text-text-primary tabular">{eur(tot)}</strong> ={' '}
          {eur(imp)} + {eur(iva)} di IVA
        </p>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="text-2xs font-semibold text-text-secondary hover:text-text-primary px-3 py-2">
            Annulla
          </button>
          <button
            disabled={pending || !name.trim() || !number.trim() || imp === 0}
            onClick={() => onDone({
              direction: dir, number, issuedOn,
              counterpartyName: name, counterpartyVat: vat.trim() || null,
              clientId: clientId || null, taxable: imp, vatAmount: iva,
              dueDate: dueDate || null, credit, notes: prefill?.note ?? null,
            })}
            className="text-2xs font-semibold bg-gold text-on-gold rounded-xl px-3 py-2 press disabled:opacity-40">
            Aggiungi
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * §250 — Il documento allegato.
 *
 * L'XML vale davanti all'erario ma non è quello che si guarda; e per le fatture
 * che un XML non ce l'hanno — un fornitore estero, una ricevuta, Google Cloud —
 * il PDF **è** il documento. Il download passa dal proxy autenticato: un link
 * firmato che finisce in una chat resta valido finché non scade, e qui dentro ci
 * sono nomi, importi e partite IVA.
 */
function PdfCell({ id, path, pending, run }: {
  id: string
  path: string | null | undefined
  pending: boolean
  run: (fn: () => Promise<unknown>, ok?: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <span className="inline-flex items-center gap-1">
      <input ref={ref} type="file" accept=".pdf,image/png,image/jpeg" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) { const fd = new FormData(); fd.set('file', f); run(() => attachInvoicePdf(id, fd), 'Documento allegato') }
          e.target.value = ''
        }} />
      {path ? (
        <>
          <a href={`/api/invoices/${id}/download`} target="_blank" rel="noreferrer"
            title="Apri il documento"
            className="inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-1.5 py-0.5
                       border border-success/40 bg-success-dim text-success press">
            <FileText className="w-3 h-3" aria-hidden="true" />PDF
          </a>
          <button onClick={() => run(() => removeInvoicePdf(id), 'Documento tolto')} disabled={pending}
            aria-label="Togli il documento"
            className="text-text-tertiary hover:text-error press disabled:opacity-40">
            <Trash2 className="w-3 h-3" />
          </button>
        </>
      ) : (
        <button onClick={() => ref.current?.click()} disabled={pending}
          title="Allega il PDF o una foto del documento"
          className="inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-1.5 py-0.5
                     border border-border bg-background text-text-tertiary hover:text-text-primary press disabled:opacity-40">
          <Upload className="w-3 h-3" aria-hidden="true" />PDF
        </button>
      )}
    </span>
  )
}
