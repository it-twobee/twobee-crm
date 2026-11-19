'use server'

import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin } from '@/lib/economics-guard'
import { requireLabAdmin } from '@/lib/lab-guard'
import { createActorClient } from '@/lib/supabase/admin'
import { archiveUuid, parseArchiveInvoice, type ArchiveInvoiceDraft } from '@/lib/archived-invoice'
import { readArchivedInvoicePdf } from '@/lib/lab-invoice-archive'
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
    if (invoice.vatId.replace(/^IT/, '') === companyVat) throw Error('L’identificativo fiscale deve essere quello del fornitore.')
    const file = await readArchivedInvoicePdf(archiveId)
    if (!file) throw Error('PDF non disponibile nell’archivio.')
    const original = await getObject(file.storage_key, 'bytes=0-1023')
    const signature = await new Response(original.body).text()
    if (!signature.startsWith('%PDF-')) throw Error('L’originale non è un PDF leggibile.')

    const admin = createActorClient(actor)
    const supplierVat = invoice.vatId.replace(/^IT(?=\d{11}$)/, '')
    const key = invoiceKey({ supplier: { name: invoice.supplier, vat: supplierVat, taxCode: null }, docType: invoice.kind, number: invoice.number, issuedOn: invoice.date })
    const columns = 'id,direction,taxable,vat_amount,total,currency,pdf_path'
    const [byArchive, byIdentity] = await Promise.all([
      admin.from('invoices').select(columns).eq('pdf_path', file.storage_key).limit(2),
      admin.from('invoices').select(columns).eq('doc_key', key).maybeSingle(),
    ])
    if (byArchive.error || byIdentity.error) throw Error('Verifica dei duplicati non disponibile.')
    if (byArchive.data.length > 1 || byArchive.data[0] && byIdentity.data?.id !== byArchive.data[0].id) {
      throw Error('Questo PDF è già collegato a una fattura. Verifica numero, data e fornitore.')
    }

    let id = byIdentity.data?.id
    const existing = byIdentity.data
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
        due_date: invoice.due, total_derived: false, from_sdi: false, pdf_path: file.storage_key,
        source_file: file.filename, doc_key: key, created_by: actor,
        notes: invoice.reference ? `Riferimento bancario PDF: ${invoice.reference}` : null,
      }).select('id').single()
      if (error) throw Error(error.code === '23505' ? 'Il PDF o la fattura sono già stati acquisiti. Ricarica l’archivio.' : 'Registrazione non completata.')
      id = data.id
    }
    for (const path of ['/lab/fonti', '/lab/fatturazione', '/lab/raccordi', '/lab/verifiche', '/economics/fatturazione']) revalidatePath(path)
    return { ok: true as const, id: String(id), reused: !!existing, hasOtherOriginal: !!existing?.pdf_path && existing.pdf_path !== file.storage_key }
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : 'Acquisizione non completata.' }
  }
}
