import Link from '@/components/lab/LabLink'
import { listArchivedInvoicePdfs } from '@/lib/lab-invoice-archive'
import { LabReturnFields } from '@/components/lab/LabJourney'
import LabInvoiceArchiveForm from '@/components/lab/LabInvoiceArchiveForm'

export default async function LabInvoiceArchive({ query, page, selected, month }: { query: string; page: number; selected?: string; month?: string }) {
  const archive = await listArchivedInvoicePdfs(query, page)
  const href = (next: number, id?: string) => `/lab/fonti?${new URLSearchParams({
    ...(query ? { archivio: query } : {}), ...(next ? { pagina: String(next) } : {}), ...(id ? { pdf: id } : {}),
  })}#${id ? 'acquisisci-pdf' : 'archivio-documenti'}`
  const document = archive?.rows.find(row => row.id === selected && !row.invoiceId)
  return (
    <section id="archivio-documenti" className="scroll-mt-4 space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-base font-semibold text-text-primary">Archivio documenti</h2>
      <form action="/lab/fonti#archivio-documenti" method="get" className="flex flex-wrap items-end gap-2">
        <LabReturnFields />{month && <input type="hidden" name="m" value={month} />}
        <label className="min-w-40 grow text-2xs text-text-secondary">Cerca per nome file o numero fattura
          <input name="archivio" defaultValue={query} maxLength={120} className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary" />
        </label>
        <button className="min-h-11 rounded-xl border border-border-interactive px-4 text-sm font-semibold text-text-primary">Cerca</button>
      </form>
      {!archive ? <p role="alert" className="text-sm text-warning">Archivio non disponibile. Ricarica per riprovare.</p> : <>
        {document && <LabInvoiceArchiveForm key={document.id} id={document.id} filename={document.filename} />}
        {!archive.rows.length && <p className="text-sm text-text-secondary">Nessun PDF per questa ricerca.</p>}
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {archive.rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-1">
            <div className="min-w-0 flex-1 basis-52 py-1">
              <p className="break-words text-sm font-medium text-text-primary">{row.filename}</p>
              <p className="text-2xs text-text-secondary">{row.uploadedAt?.slice(0, 10)} · {row.invoiceId ? 'Associato al registro' : 'PDF in archivio'}</p>
            </div>
            <a href={`/api/lab/invoice-archive/${row.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-2xs text-gold-text underline">Apri PDF</a>
            <Link href={row.invoiceId ? `/lab/fatturazione?documento=${row.invoiceId}` : href(page, row.id)} className="inline-flex min-h-11 items-center rounded-lg bg-gold-dim px-3 text-2xs font-semibold text-gold-text">
              {row.invoiceId ? 'Apri fattura' : 'Acquisisci come fattura'}
            </Link>
          </li>)}
        </ul>
        {(page > 0 || archive.more) && <nav aria-label="Pagine archivio" className="flex gap-3">
          {page > 0 && <Link href={href(page - 1)} className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Precedenti</Link>}
          {archive.more && <Link href={href(page + 1)} className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Successivi</Link>}
        </nav>}
      </>}
    </section>
  )
}
