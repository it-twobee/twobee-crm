import { createClient } from '@/lib/supabase/server'
import { INVOICE_COLUMNS, toInvoices } from '@/lib/invoices-load'
import { invoiceStatus, isOpen, txCandidates, signedTotal, type Invoice, type InvoiceStatus, type TxRef } from '@/lib/invoices'
import { eur2 } from '@/lib/money'
import Link from 'next/link'
import { ChevronLeft, Info } from 'lucide-react'

export const revalidate = 0

type Row = Record<string, unknown>
const r2 = (n: number) => Math.round(n * 100) / 100
const TONE: Record<InvoiceStatus['tone'], string> = {
  success: 'bg-success-dim text-success', error: 'bg-error-dim text-error', warning: 'bg-warning-dim text-warning',
  info: 'bg-info-dim text-info', muted: 'bg-surface-hover text-text-secondary',
}
const URGENZA: Record<string, number> = { grave: 0, scaduto: 1, in_ritardo: 2 }

export default async function FatturazioneLabPage() {
  const sb = await createClient()
  const [{ data: rows }, { data: txs }] = await Promise.all([
    sb.from('invoices').select(INVOICE_COLUMNS).eq('direction', 'emessa').order('issued_on', { ascending: false }),
    sb.from('bank_transactions').select('id, booked_on, amount, description, counterparty, invoice_id'),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const invoices = toInvoices((rows ?? []) as unknown as Row[])
  const tx: TxRef[] = ((txs ?? []) as Row[]).map(t => ({
    id: String(t.id), bookedOn: String(t.booked_on), amount: Number(t.amount ?? 0),
    description: String(t.description ?? ''), counterparty: (t.counterparty as string) ?? null,
    invoiceId: (t.invoice_id as string) ?? null,
  }))

  const withStatus = invoices.map(i => ({ i, s: invoiceStatus(i, today) }))
  const aperte = withStatus.filter(x => isOpen(x.i) && x.i.sign > 0)
    .sort((a, b) => (URGENZA[a.s.band ?? ''] ?? 3) - (URGENZA[b.s.band ?? ''] ?? 3)
      || (a.i.dueDate ?? '9999').localeCompare(b.i.dueDate ?? '9999'))
  const chiuse = withStatus.filter(x => x.s.state === 'pagata').slice(0, 8)
  const fuori = withStatus.filter(x => ['non_gestita', 'rettifica', 'stornata'].includes(x.s.state))

  const scaduto = r2(aperte.filter(x => x.s.state === 'scaduta').reduce((a, x) => a + signedTotal(x.i), 0))
  const totale = r2(aperte.reduce((a, x) => a + signedTotal(x.i), 0))
  const senzaData = aperte.filter(x => x.s.state === 'senza_data').length

  const Riga = ({ i, s }: { i: Invoice; s: InvoiceStatus }) => {
    const cand = isOpen(i) ? txCandidates(i, tx.filter(t => !t.invoiceId))[0] : undefined
    return (
      <li className="px-4 py-3 border-b border-border/60 last:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary break-words">{i.counterpartyName}</p>
            <p className="text-2xs text-text-tertiary leading-snug">{i.number} · emessa il {i.issuedOn}</p>
          </div>
          <p className="text-sm font-semibold text-text-primary tabular-nums whitespace-nowrap">{eur2(signedTotal(i))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
          <span className={`text-2xs font-semibold rounded-full px-2 py-0.5 ${TONE[s.tone]}`}>{s.label}</span>
          <span className="text-2xs text-text-tertiary leading-snug">{s.why}</span>
        </div>
        {cand && (
          <p className="text-2xs text-text-secondary leading-snug mt-1.5">
            Movimento candidato: {cand.item.bookedOn} · {eur2(cand.item.amount)} · {cand.why.join(', ')}
          </p>
        )}
      </li>
    )
  }

  return (
    <div className="min-h-full pb-8">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5 flex items-center gap-2">
          <Link href="/lab" aria-label="Torna al Laboratorio" className="flex items-center justify-center w-11 h-11 rounded-xl border border-border text-text-secondary hover:bg-surface-hover press">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-text-primary leading-tight">Fatturazione</h1>
            <p className="text-2xs text-text-tertiary leading-tight">Laboratorio · sola lettura · fatture emesse, IVA inclusa</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-3 space-y-3">
        <section className="bg-surface border border-border rounded-2xl p-4" aria-label="Da incassare">
          <p className="text-2xs text-text-tertiary">Da incassare</p>
          <p className="text-2xl font-semibold text-text-primary tabular-nums leading-tight">{eur2(totale)}</p>
          <p className="text-2xs text-text-tertiary mt-1">
            {aperte.length} {aperte.length === 1 ? 'fattura' : 'fatture'} · di cui scaduto {eur2(scaduto)}
            {senzaData > 0 && <> · {senzaData} senza data attesa</>}
          </p>
        </section>

        <div className="flex gap-2 rounded-xl px-3 py-2.5 text-2xs leading-snug bg-surface-hover text-text-secondary">
          <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden />
          <p>Le stesse regole di Fatturazione (<code>isOpen</code>, <code>invoiceStatus</code>): una nota di credito o una stornata non è un credito. Le azioni — «incassata», «emessa» — non ci sono ancora: qui si legge.</p>
        </div>

        <ul className="bg-surface border border-border rounded-2xl overflow-hidden">
          {aperte.length === 0 && <li className="px-4 py-5 text-sm text-text-tertiary">Nessuna fattura da incassare.</li>}
          {aperte.map(x => <Riga key={x.i.id} {...x} />)}
        </ul>

        {chiuse.length > 0 && (
          <details className="bg-surface border border-border rounded-2xl overflow-hidden">
            <summary className="px-4 min-h-[52px] flex items-center text-sm font-semibold text-text-primary cursor-pointer">Incassate di recente</summary>
            <ul className="border-t border-border">{chiuse.map(x => <Riga key={x.i.id} {...x} />)}</ul>
          </details>
        )}
        {fuori.length > 0 && (
          <details className="bg-surface border border-border rounded-2xl overflow-hidden">
            <summary className="px-4 min-h-[52px] flex items-center text-sm font-semibold text-text-primary cursor-pointer">Fuori dai conti · {fuori.length}</summary>
            <ul className="border-t border-border">{fuori.map(x => <Riga key={x.i.id} {...x} />)}</ul>
          </details>
        )}
      </div>
    </div>
  )
}
