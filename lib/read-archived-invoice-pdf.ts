import { suggestArchivedInvoice } from '@/lib/archived-invoice'

export async function readArchivedInvoiceDraft(id: string, signal?: AbortSignal) {
  const response = await fetch(`/api/lab/invoice-archive/${id}`, { signal })
  if (!response.ok) throw Error('PDF non disponibile.')
  const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()), isEvalSupported: false }).promise
  try {
    const pages = []
    if (pdf.numPages > 20) throw Error('Il PDF supera 20 pagine: separa i documenti prima di acquisirli.')
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent()
      pages.push(content.items.map(item => 'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ') : '').join(''))
    }
    return suggestArchivedInvoice(pages.join(' '))
  } finally { await pdf.destroy() }
}
