'use server'

import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin } from '@/lib/economics-guard'
import { requireLabAdmin } from '@/lib/lab-guard'
import { createActorClient } from '@/lib/supabase/admin'
import { archiveUuid, parseArchiveInvoice, type ArchiveInvoiceDraft } from '@/lib/archived-invoice'
import { listArchivedInvoicePdfs, readArchivedInvoicePdf } from '@/lib/lab-invoice-archive'
import { invoiceKey } from '@/lib/fattura-xml'
import { ownVat } from '@/app/actions/invoices'
import { getObject } from '@/lib/storage/s3'

export async function acquireArchivedInvoice(archiveId: string, input: ArchiveInvoiceDraft) {
  try {
    await requireLabAdmin()
    const actor = await requireEconomicsAdmin()
    if (!archiveUuid.test(archiveId)) throw Error('Documento non valido.')
    const invoice = parseArchiveInvoice(input)
    const companyVat = (await ownVat()).replace(/[^a-z0-9]/gi, '').toUpperCase().replace(/^IT/, '')
    if (invoice.vatId && invoice.vatId.replace(/^IT/, '') === companyVat) throw Error('L’identificativo fiscale deve essere quello del fornitore.')
    const file = await readArchivedInvoicePdf(archiveId)
    if (!file) throw Error('PDF non disponibile nell’archivio.')
    const original = await getObject(file.storage_key, 'bytes=0-1023')
    const signature = await new Response(original.body).text()
    if (!signature.startsWith('%PDF-')) throw Error('L’originale non è un PDF leggibile.')

    const admin = createActorClient(actor)
    const supplierVat = invoice.vatId.replace(/^IT(?=\d{11}$)/, '') || null
    const key = invoiceKey({ supplier: { name: invoice.supplier, vat: supplierVat, taxCode: null }, docType: invoice.kind, number: invoice.number, issuedOn: invoice.date })
    const columns = 'id,direction,taxable,vat_amount,total,currency,pdf_path,counterparty_name'
    const [byArchive, byIdentity, byNumber] = await Promise.all([
      admin.from('invoices').select(columns).eq('pdf_path', file.storage_key).limit(2),
      admin.from('invoices').select(columns).eq('doc_key', key).maybeSingle(),
      admin.from('invoices').select(columns).eq('direction', 'ricevuta').eq('doc_type', invoice.kind)
        .eq('number', invoice.number).eq('issued_on', invoice.date),
    ])
    if (byArchive.error || byIdentity.error || byNumber.error) throw Error('Verifica dei duplicati non disponibile.')
    const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const sameSupplier = byNumber.data.filter(row => normalizeName(row.counterparty_name) === normalizeName(invoice.supplier))
    if (sameSupplier.length > 1 || byIdentity.data && sameSupplier.some(row => row.id !== byIdentity.data?.id)) {
      throw Error('Nel registro risultano più fatture dello stesso fornitore con questo numero. Verifica i duplicati.')
    }
    const existing = byIdentity.data ?? sameSupplier[0]
    if (byArchive.data.length > 1 || byArchive.data[0] && existing?.id !== byArchive.data[0].id) {
      throw Error('Questo PDF è già collegato a una fattura. Verifica numero, data e fornitore.')
    }

    let id = existing?.id
    if (existing && (existing.direction !== 'ricevuta' || existing.currency !== invoice.currency
      || Number(existing.taxable) !== invoice.net || Number(existing.vat_amount) !== invoice.vat || Number(existing.total) !== invoice.total)) {
      throw Error('La fattura è già nel registro con dati diversi. Verifica prima di acquisire il PDF.')
    }
    if (existing && !existing.pdf_path) {
      const { data, error } = await admin.from('invoices').update({ pdf_path: file.storage_key })
        .eq('id', existing.id).is('pdf_path', null).select('id').maybeSingle()
      if (error || !data) throw Error('Il collegamento è cambiato. Ricarica l’archivio prima di riprovare.')
    }
    if (!id) {
      // L’ID del PDF rende atomica l’identità della nuova fattura anche fra richieste concorrenti.
      const { data, error } = await admin.from('invoices').insert({
        id: archiveId, direction: 'ricevuta', doc_type: invoice.kind, number: invoice.number, issued_on: invoice.date,
        counterparty_name: invoice.supplier, counterparty_vat: supplierVat, currency: invoice.currency,
        taxable: invoice.net, vat_amount: invoice.vat, total: invoice.total, sign: invoice.kind === 'TD04' ? -1 : 1,
        due_date: invoice.due, total_derived: false, pdf_path: file.storage_key,
        source_file: file.filename, doc_key: key, created_by: actor,
        notes: invoice.reference ? `Riferimento bancario PDF: ${invoice.reference}` : null,
      }).select('id').single()
      if (error) {
        if (error.code === '23505') throw Error('Il PDF o la fattura sono già stati acquisiti. Ricarica l’archivio.')
        const code = /^[A-Z0-9]{5,8}$/.test(error.code) ? error.code : 'DB'
        console.error('Acquisizione fattura da archivio: inserimento rifiutato', { code })
        throw Error(`Il registro ha rifiutato l’acquisizione (codice ${code}).`)
      }
      id = data.id
    }
    for (const path of ['/lab/fonti', '/lab/fatturazione', '/lab/raccordi', '/lab/verifiche', '/economics/fatturazione']) revalidatePath(path)
    return { ok: true as const, id: String(id), reused: !!existing, hasOtherOriginal: !!existing?.pdf_path && existing.pdf_path !== file.storage_key }
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : 'Acquisizione non completata.' }
  }
}


export async function selectArchivedInvoices(query: string) {
  try {
    await requireLabAdmin()
    await requireEconomicsAdmin()
    const rows = []
    for (let page = 0; page < 50; page++) {
      const result = await listArchivedInvoicePdfs(query.slice(0, 120), page)
      if (!result) throw Error('Archivio non disponibile. Riprova.')
      rows.push(...result.rows.filter(row => !row.invoiceId))
      if (rows.length > 100) break
      if (!result.more) return { ok: true as const, rows }
    }
    throw Error('La ricerca è troppo ampia per un lotto. Restringila o seleziona i PDF per pagina (fino a 100).')
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : 'Selezione non completata.' }
  }
}
