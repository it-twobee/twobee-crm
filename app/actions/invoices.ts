'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { parseFattura, invoiceKey, invoiceWarnings, type ParsedInvoice } from '@/lib/fattura-xml'
import { putObject, deleteObject } from '@/lib/storage/s3'

const PATH = '/economics/fatturazione'


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
  // §234 — era l'unica azione di questo file senza gate: un file `use server`
  // esporta endpoint, e sette copie del controllo sono sette posti dove
  // dimenticarlo. Adesso la porta è una sola e ci passano tutte.
  await requireAdmin()
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

/**
 * §281 — Fuori dai conti, e con scritto perché.
 *
 * Una ISF duplicata, una nota di credito che ne annulla un'altra, una Tailors
 * emessa due volte: esistono, sono passate dallo SDI, e non sono crediti — non
 * si telefona a nessuno per averle. Fra gli «in attesa» gonfiavano lo scaduto
 * di 42.456 € su un archivio di trentanove documenti.
 *
 * La ragione è **obbligatoria**: un'esclusione senza il perché è un numero che
 * nessuno può più contestare, e fra sei mesi nessuno sa se era una scelta o una
 * dimenticanza. Si può rimettere dentro passando `null`, e allora la fattura
 * torna a essere un credito come prima.
 */
export async function setInvoiceUnmanaged(invoiceId: string, reason: string | null) {
  await requireAdmin()
  const testo = reason?.trim() ?? ''
  if (reason !== null && !testo) {
    throw new Error('Serve la ragione: una fattura tolta dai conti senza il perché non si legge')
  }
  const { error } = await createAdminClient().from('invoices')
    .update({ excluded_reason: reason === null ? null : testo }).eq('id', invoiceId)
  /* 42703 = la 210 non è stata eseguita. Va detto, non fatto fallire in silenzio. */
  if (error?.code === '42703') throw new Error('Esegui prima la migration 210_invoice_unmanaged.sql')
  if (error) throw new Error(error.message)
  rev()
}

/**
 * §280 — Quando quel denaro è atteso.
 *
 * Una fattura in attesa ha due strade, e sono due gesti diversi: il movimento
 * **c'è già** e le si aggancia (`linkInvoiceToTx`), oppure **deve ancora
 * arrivare** — e allora la sola cosa che si può dire è **quando**. Senza una
 * data la fattura resta un credito senza scadenza: non compare fra gli scaduti,
 * non entra in nessuna previsione di cassa, e sparisce dalle telefonate da fare.
 *
 * Cancellarla si può (`null`): una data inventata è peggio di nessuna data.
 */
export async function setInvoiceDue(invoiceId: string, dueDate: string | null) {
  await requireAdmin()
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Data non valida')
  const { error } = await createAdminClient().from('invoices')
    .update({ due_date: dueDate }).eq('id', invoiceId)
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

/**
 * §247 — La fattura scritta a mano.
 *
 * L'import legge l'XML dello SdI, ed è la strada giusta: il documento è quello
 * che vale davanti all'erario. Ma il file arriva quando arriva — dal
 * commercialista, dal fornitore, a volte mai — e nel frattempo il costo è già
 * uscito dal conto. Finché l'unica porta era l'XML, una spesa senza documento
 * restava **invisibile** alla Fatturazione e il conto economico non aveva
 * niente con cui riconciliarla.
 *
 * Due cose la rendono sicura, e sono le stesse dell'import:
 *
 * **La chiave è la stessa** (`invoiceKey`: partita IVA, tipo, numero, data).
 * Quando l'XML arriva davvero, l'import la riconosce come duplicato e non ne
 * crea una seconda — che è l'unico modo perché scriverla a mano non diventi un
 * problema domani.
 *
 * **Dice di essere scritta a mano.** `source_file = 'inserita a mano'` e un
 * avviso in `warnings`: una riga senza documento sotto non può leggersi identica
 * a una firmata dallo SdI. Quando l'XML arriva, sostituisce.
 */
export type ManualInvoice = {
  direction: 'emessa' | 'ricevuta'
  docType?: string
  number: string
  issuedOn: string
  counterpartyName: string
  counterpartyVat?: string | null
  clientId?: string | null
  taxable: number
  vatAmount: number
  /** se non c'è si deriva: imponibile più IVA, ed è dichiarato */
  total?: number | null
  dueDate?: string | null
  /** nota di credito: toglie invece di aggiungere */
  credit?: boolean
  notes?: string | null
}

export async function addInvoiceManually(input: ManualInvoice): Promise<{ id: string }> {
  const uid = await requireAdmin()
  const admin = createAdminClient()

  const number = input.number.trim()
  const name = input.counterpartyName.trim()
  if (!number) throw new Error('Serve il numero della fattura: è metà della chiave che la rende unica')
  if (!name) throw new Error('Serve il nome della controparte')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedOn)) throw new Error('La data va nel formato AAAA-MM-GG')

  const docType = input.docType || (input.credit ? 'TD04' : 'TD01')
  const taxable = Math.round(Number(input.taxable) * 100) / 100
  const vat = Math.round(Number(input.vatAmount) * 100) / 100
  const derived = input.total == null || Number(input.total) === 0
  const total = derived ? Math.round((taxable + vat) * 100) / 100 : Math.round(Number(input.total) * 100) / 100

  /* La stessa chiave dell'import: chi emette è il fornitore su una ricevuta e
     Two Bee su una emessa, quindi su una emessa la chiave usa la nostra P.IVA —
     esattamente come farebbe il parser leggendo il file. */
  const own = await ownVat()
  const party = input.direction === 'ricevuta' ? (input.counterpartyVat?.trim() || name) : own
  const doc_key = [party, docType, number, input.issuedOn].join('|').toUpperCase()

  const { data: già } = await admin.from('invoices').select('id').eq('doc_key', doc_key).maybeSingle()
  if (già) throw new Error('Questa fattura c\'è già: stesso emittente, numero e data')

  const warnings = ['Inserita a mano: il documento non è stato caricato']
  if (derived) warnings.push('Totale derivato da imponibile più IVA')

  const { data: row, error } = await admin.from('invoices').insert({
    direction: input.direction,
    doc_type: docType,
    number,
    issued_on: input.issuedOn,
    counterparty_name: name,
    counterparty_vat: input.counterpartyVat?.trim() || null,
    client_id: input.clientId ?? null,
    taxable, vat_amount: vat, total, total_derived: derived,
    sign: input.credit ? -1 : 1,
    due_date: input.dueDate || null,
    notes: input.notes?.trim() || null,
    doc_key,
    source_file: 'inserita a mano',
    warnings,
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.message)

  rev()
  return { id: String(row.id) }
}

/**
 * §250 — Il PDF della fattura.
 *
 * L'XML è il documento che vale davanti all'erario, ma non è quello che si
 * guarda: nessuno legge un XML per capire cosa ha comprato. E per le fatture
 * che un XML non ce l'hanno — un fornitore estero, una ricevuta, Google Cloud —
 * il PDF **è** il documento, e senza un posto dove metterlo resta nella cartella
 * download di qualcuno.
 *
 * Sta su MinIO come le buste paga, sotto `invoices/`, e **non è pubblico**: il
 * download passa dal proxy autenticato. Una fattura è un documento fiscale con
 * dentro nomi, importi e partite IVA — un link firmato che gira in una chat è
 * un link che resta valido finché non scade.
 */
export async function attachInvoicePdf(invoiceId: string, form: FormData): Promise<{ path: string }> {
  await requireAdmin()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('Nessun file')
  if (file.size > 15 * 1024 * 1024) throw new Error('Il file supera i 15 MB')

  const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase()
  if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
    throw new Error('Formato non ammesso: PDF o immagine')
  }

  const admin = createAdminClient()
  const { data: inv } = await admin.from('invoices')
    .select('id, number, issued_on, pdf_path').eq('id', invoiceId).maybeSingle()
  if (!inv) throw new Error('Fattura non trovata')

  /* La chiave contiene l'id, non il numero: un numero di fattura può avere una
     barra dentro, e due fornitori possono avere lo stesso numero. */
  const key = `invoices/${invoiceId}.${ext}`
  await putObject(key, Buffer.from(await file.arrayBuffer()), file.type || 'application/pdf')

  /* Se ce n'era un altro con estensione diversa, va tolto: due file per la
     stessa fattura e non si sa più quale sia il documento. */
  const old = (inv as { pdf_path: string | null }).pdf_path
  if (old && old !== key) { try { await deleteObject(old) } catch { /* già sparito */ } }

  const { error } = await admin.from('invoices').update({ pdf_path: key }).eq('id', invoiceId)
  if (error) throw new Error(error.message)
  rev()
  return { path: key }
}

export async function removeInvoicePdf(invoiceId: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: inv } = await admin.from('invoices').select('pdf_path').eq('id', invoiceId).maybeSingle()
  const path = (inv as { pdf_path: string | null } | null)?.pdf_path
  if (path) { try { await deleteObject(path) } catch { /* già sparito */ } }
  const { error } = await admin.from('invoices').update({ pdf_path: null }).eq('id', invoiceId)
  if (error) throw new Error(error.message)
  rev()
}
