import LabInvoiceArchiveList from '@/components/lab/LabInvoiceArchiveList'
import { listArchivedInvoicePdfs } from '@/lib/lab-invoice-archive'
import { ARCHIVE_PAGE_SIZES, type ArchiveState } from '@/lib/archive-page-sizes'
import { LabReturnFields } from '@/components/lab/LabJourney'
import LabInvoiceArchiveForm from '@/components/lab/LabInvoiceArchiveForm'

export default async function LabInvoiceArchive({ query, page, selected, month, size, state }: { query: string; page: number; selected?: string; month?: string; size: number; state: ArchiveState }) {
  const archive = await listArchivedInvoicePdfs(query, page, size, state)
  const document = archive?.rows.find(row => row.id === selected && !row.invoiceId)
  return (
    <section id="archivio-documenti" className="scroll-mt-4 space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-base font-semibold text-text-primary">Archivio documenti</h2>
      <form action="/lab/fonti#archivio-documenti" method="get" className="flex flex-wrap items-end gap-2">
        <LabReturnFields />{size !== ARCHIVE_PAGE_SIZES[0] && <input type="hidden" name="righe" value={size} />}{state !== 'tutti' && <input type="hidden" name="stato" value={state} />}{month && <input type="hidden" name="m" value={month} />}
        <label className="min-w-40 grow text-2xs text-text-secondary">Cerca per nome file o numero fattura
          <input name="archivio" defaultValue={query} maxLength={120} className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary" />
        </label>
        <button className="min-h-11 rounded-xl border border-border-interactive px-4 text-sm font-semibold text-text-primary">Cerca</button>
      </form>
      {!archive ? <p role="alert" className="text-sm text-warning">Archivio non disponibile. Ricarica per riprovare.</p> : <>
        {document && <LabInvoiceArchiveForm key={document.id} id={document.id} filename={document.filename} />}
        {!archive.rows.length && <p className="text-sm text-text-secondary">Nessun PDF per questa ricerca.</p>}
        <LabInvoiceArchiveList rows={archive.rows} query={query} page={page} more={archive.more} size={size} state={state} total={archive.total} />
      </>}
    </section>
  )
}
