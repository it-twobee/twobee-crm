'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { parseFattura, invoiceKey, invoiceWarnings, type ParsedInvoice } from '@/lib/fattura-xml'

const PATH = '/economics/fatturazione'

/** Le fatture sono il documento fiscale: admin e basta, come tutto l'economics. */
async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, email').eq('id', user.id).single()
  const ok = p?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(p?.email ?? '')
  if (!ok) throw new Error('Permesso negato: le fatture sono riservate agli admin')
  return user.id
}

function rev() {
  revalidatePath(PATH)
  revalidatePath('/economics')
  revalidatePath('/economics/banca')
}

/**
 * La partita IVA di Two Bee, che decide il **verso** di ogni documento.
 *
 * Sta in configurazione e non nel codice perché è un dato dell'azienda, e perché
 * senza il valore giusto ogni fattura emessa verrebbe archiviata come ricevuta —
 * un errore che si scopre solo guardando i totali, quando l'archivio è già dentro.
 */
export async function ownVat(): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin.from('pl_config').select('company_vat').eq('id', true).maybeSingle()
  return String((data as { company_vat?: string } | null)?.company_vat ?? '11030281213')
}

export type ImportReport = {
  letti: number
  nuovi: number
  duplicati: number
  falliti: { file: string; motivo: string }[]
  agganciati: number
  dal: string | null
  al: string | null
}

/**
 * Importa uno o più XML dello SdI.
 *
 * Idempotente per `doc_key` — emittente, tipo, numero, data. Reimportare la
 * stessa cartella non crea niente: è la proprietà che rende sicuro scaricare
 * dallo SdI «tutto l'anno» ogni volta invece di ricordarsi da dove si era
 * rimasti. L'XML si conserva per intero: è la prova, e se domani serve un campo
 * che oggi non leggiamo non bisogna richiedere niente a nessuno.
 */
export async function importInvoices(
  files: { name: string; xml: string }[],
): Promise<ImportReport> {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  const vat = await ownVat()

  const report: ImportReport = {
    letti: 0, nuovi: 0, duplicati: 0, falliti: [], agganciati: 0, dal: null, al: null,
  }

  const parsed: { file: string; xml: string; inv: ParsedInvoice }[] = []
  for (const f of files) {
    try {
      for (const inv of parseFattura(f.xml, vat)) parsed.push({ file: f.name, xml: f.xml, inv })
    } catch (e) {
      report.falliti.push({ file: f.name, motivo: e instanceof Error ? e.message : 'illeggibile' })
    }
  }
  report.letti = parsed.length
  if (!parsed.length) return report

  const keys = parsed.map(p => invoiceKey(p.inv))
  const { data: have } = await admin.from('invoices').select('doc_key').in('doc_key', keys)
  const già = new Set((have ?? []).map((r: { doc_key: string }) => r.doc_key))

  /* Anche dentro lo stesso lotto: due scarichi dello stesso documento nella
     stessa cartella capitano, e senza questo il secondo sbatterebbe contro il
     vincolo unico facendo fallire l'intero import invece di una riga. */
  const visti = new Set<string>()

  for (const { file, xml, inv } of parsed) {
    const key = invoiceKey(inv)
    if (già.has(key) || visti.has(key)) { report.duplicati++; continue }
    visti.add(key)

    const { data: row, error } = await admin.from('invoices').insert({
      direction: inv.direction,
      doc_type: inv.docType,
      number: inv.number,
      issued_on: inv.issuedOn,
      currency: inv.currency,
      counterparty_name: inv.counterparty.name,
      counterparty_vat: inv.counterparty.vat,
      counterparty_tax: inv.counterparty.taxCode,
      counterparty_city: inv.counterparty.city,
      counterparty_addr: inv.counterparty.address,
      taxable: inv.taxable,
      vat_amount: inv.tax,
      total: inv.total,
      total_derived: inv.totalDerived,
      stamp: inv.stamp,
      withholding: inv.withholding,
      fund_amount: inv.fund,
      sign: inv.sign,
      due_date: inv.dueDate,
      payment_method: inv.paymentMethod,
      payment_terms: inv.paymentTerms,
      notes: inv.notes.join(' · ') || null,
      attachments: inv.attachments.length ? inv.attachments : null,
      sdi_progressive: inv.transmissionId,
      sdi_recipient: inv.recipientCode,
      doc_key: key,
      source_file: file,
      raw_xml: xml,
      warnings: (() => { const w = invoiceWarnings(inv); return w.length ? w : null })(),
      created_by: uid,
    }).select('id').single()

    if (error) { report.falliti.push({ file, motivo: error.message }); continue }
    const id = (row as { id: string }).id
    report.nuovi++

    if (inv.lines.length) {
      await admin.from('invoice_lines').insert(inv.lines.map(l => ({
        invoice_id: id, line_no: l.line, description: l.description,
        quantity: l.quantity, unit_price: l.unitPrice, total: l.total,
        vat_rate: l.vatRate, natura: l.natura, period_from: l.from, period_to: l.to,
      })))
    }
    if (inv.vat.length) {
      await admin.from('invoice_vat').insert(inv.vat.map(v => ({
        invoice_id: id, rate: v.rate, taxable: v.taxable, tax: v.tax,
        natura: v.natura, collectability: v.collectability,
      })))
    }
    if (inv.installments.length) {
      await admin.from('invoice_installments').insert(inv.installments.map(r => ({
        invoice_id: id, due_date: r.dueDate, amount: r.amount, method: r.method, iban: r.iban,
      })))
    }
  }

  // l'aggancio all'anagrafica per partita IVA: lo fa il database, in un colpo
  const { data: linked } = await admin.rpc('link_invoices_to_clients')
  report.agganciati = Number(linked ?? 0)

  const date = parsed.map(p => p.inv.issuedOn).sort()
  report.dal = date[0] ?? null
  report.al = date.at(-1) ?? null
  rev()
  return report
}

// ═══════════════════════════════════════════════════════════════════════════
// I collegamenti
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggancia una fattura a una riga di conto economico.
 *
 * §211 — l'aggancio è **confermato da una persona**, come in banca. Il punteggio
 * dei candidati suggerisce, non decide: dichiarare fatturata una riga che non lo
 * è fa tornare i conti nel modo peggiore, cioè senza che nessuno lo cerchi più.
 */
export async function linkInvoiceToLine(
  invoiceId: string, lineId: string, kind: 'ricavo' | 'costo',
) {
  await requireAdmin()
  const table = kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'
  const { error } = await createAdminClient().from(table)
    .update({ invoice_id: invoiceId }).eq('id', lineId)
  if (error) throw new Error(error.message)
  rev()
}

export async function unlinkInvoiceFromLine(lineId: string, kind: 'ricavo' | 'costo') {
  await requireAdmin()
  const table = kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'
  const { error } = await createAdminClient().from(table)
    .update({ invoice_id: null }).eq('id', lineId)
  if (error) throw new Error(error.message)
  rev()
}

/**
 * Aggancia un movimento bancario a una fattura, e con lui la data di pagamento.
 *
 * La data la porta il movimento: è il giorno in cui i soldi si sono mossi, e
 * chiederla di nuovo a chi conferma sarebbe chiedere di ricopiare un dato che
 * il tool ha già davanti.
 */
export async function linkInvoiceToTx(invoiceId: string, txId: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: tx, error: e0 } = await admin.from('bank_transactions')
    .select('booked_on, amount, source').eq('id', txId).single()
  if (e0) throw new Error(e0.message)

  const { error } = await admin.from('bank_transactions')
    .update({ invoice_id: invoiceId }).eq('id', txId)
  if (error) throw new Error(error.message)

  /* §195 — `derivato` è una dichiarazione, `banca` e `manuale` sono fatti. Solo
     un fatto può segnare pagata una fattura: altrimenti la spunta che ha creato
     il movimento tornerebbe indietro a confermare se stessa. */
  if ((tx as { source: string }).source !== 'derivato') {
    const { error: e2 } = await admin.from('invoices')
      .update({ paid_on: (tx as { booked_on: string }).booked_on })
      .eq('id', invoiceId).is('paid_on', null)
    if (e2) throw new Error(e2.message)
  }
  rev()
}

export async function unlinkInvoiceFromTx(txId: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('bank_transactions')
    .update({ invoice_id: null }).eq('id', txId)
  if (error) throw new Error(error.message)
  rev()
}

/** La data di incasso o pagamento, a mano: contanti, compensazioni, giroconti. */
export async function setInvoicePaid(invoiceId: string, paidOn: string | null) {
  await requireAdmin()
  const { error } = await createAdminClient().from('invoices')
    .update({ paid_on: paidOn }).eq('id', invoiceId)
  if (error) throw new Error(error.message)
  rev()
}

/** Il cliente giusto, quando la partita IVA non bastava ad agganciarlo. */
export async function setInvoiceClient(invoiceId: string, clientId: string | null) {
  await requireAdmin()
  const { error } = await createAdminClient().from('invoices')
    .update({ client_id: clientId }).eq('id', invoiceId)
  if (error) throw new Error(error.message)
  rev()
}

/**
 * Elimina una fattura dall'archivio.
 *
 * Si può: un file caricato per sbaglio, o un documento che lo SdI ha scartato.
 * Quello che non si può è modificarne gli importi — per quello si ricarica
 * l'XML corretto, che è l'unico posto dove quei numeri hanno un'origine.
 */
export async function deleteInvoice(invoiceId: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('invoices').delete().eq('id', invoiceId)
  if (error) throw new Error(error.message)
  rev()
}
