/**
 * §323 — Rilegge lo storno dai documenti già in archivio.
 *
 *   npx tsx scripts/fix-invoice-states.ts          # dice cosa farebbe
 *   npx tsx scripts/fix-invoice-states.ts --scrivi # lo fa
 *
 * `DatiFattureCollegate` era nell'XML dallo SdI dal primo import e non finiva in
 * nessuna colonna: le note di credito dicevano da sole quale fattura
 * annullavano, e il legame lo ricostruiva una persona scrivendo a mano una
 * ragione di esclusione (§281) su **una** delle due righe della coppia. Nei dati
 * veri l'ha scritta sulla riga sbagliata due volte su quattro, con due errori di
 * segno opposto che si compensavano quasi:
 *
 *   · Tailors — FPR 51/26 esclusa, la sua nota FPR 52/26 no: la nota toglieva
 *     2.440 € da un mese da cui la fattura era già uscita.
 *   · Affinity — FPR 45/26 (la nota) esclusa, la FPR 31/26 che annulla no:
 *     giugno contava 4.392 dove i documenti dicono 2.196.
 *
 * Qui non si inventa niente: si rilegge il file conservato in `raw_xml` — che
 * esiste **per** poterlo rifare — si scrivono i riferimenti dichiarati, si
 * lascia risolvere il legame al database, e si tolgono le esclusioni a mano che
 * lo storno adesso spiega da sé. L'esclusione resta per quello che nessun
 * documento spiega: un duplicato mai stornato, un giro fra società collegate.
 *
 * Idempotente: rilanciarlo non cambia più niente.
 */
import { readFileSync } from 'fs'
import { parseFattura, invoiceWarnings, isCreditNote } from '@/lib/fattura-xml'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const SCRIVI = process.argv.includes('--scrivi')

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : null) as T
}

const eur = (n: number) =>
  `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

type Row = {
  id: string; direction: string; doc_type: string; number: string; issued_on: string
  counterparty_name: string; counterparty_vat: string | null
  taxable: number; sign: number; paid_on: string | null
  excluded_reason: string | null; rectifies_id: string | null
  raw_xml: string | null; warnings: string[] | null
}

async function main() {
  // Senza la 219 non c'è niente da scrivere, e dirlo è meglio di un 400 di PostgREST
  await api('invoices?select=rectifies_id&limit=1').catch(() => {
    throw new Error('Manca la migration 219_invoice_states.sql: eseguila prima nel SQL Editor.')
  })

  const cfg = await api<{ company_vat: string }[]>('pl_config?select=company_vat&id=eq.true')
  const own = cfg[0]?.company_vat ?? '11030281213'

  const rows = await api<Row[]>('invoices?select=id,direction,doc_type,number,issued_on,'
    + 'counterparty_name,counterparty_vat,taxable,sign,paid_on,excluded_reason,rectifies_id,'
    + 'raw_xml,warnings&order=issued_on')
  console.log(`${rows.length} documenti in archivio, partita IVA di casa ${own}\n`)

  const have = await api<{ invoice_id: string; doc_id: string }[]>(
    'invoice_related?select=invoice_id,doc_id')
  const già = new Set(have.map(h => `${h.invoice_id}|${h.doc_id}`))

  // ── 1 · i riferimenti dichiarati, riletti dal file ────────────────────────
  const nuovi: { invoice_id: string; doc_id: string; doc_date: string | null; line_no: number | null }[] = []
  const warnFix: { id: string; warnings: string[] | null }[] = []
  let illeggibili = 0

  for (const r of rows) {
    if (!r.raw_xml) continue
    let docs
    try { docs = parseFattura(r.raw_xml, own) } catch { illeggibili++; continue }
    /* Un lotto contiene più corpi: si prende quello con lo stesso numero, non il
       primo, o su un file da due fatture si copierebbero i riferimenti dell'altra. */
    const inv = docs.find(d => d.number === r.number && d.issuedOn === r.issued_on) ?? docs[0]
    if (!inv) continue

    for (const f of inv.related) {
      if (già.has(`${r.id}|${f.id}`)) continue
      già.add(`${r.id}|${f.id}`)
      nuovi.push({ invoice_id: r.id, doc_id: f.id, doc_date: f.date, line_no: f.line })
    }

    /* §323 — gli avvisi si ricalcolano: la regola nuova («una nota deve dire cosa
       rettifica») vale anche per i documenti entrati prima che esistesse, e
       l'XML conservato è esattamente ciò che permette di non richiedere niente
       a nessuno per applicarla. */
    const w = invoiceWarnings(inv)
    const prima = JSON.stringify(r.warnings ?? [])
    if (JSON.stringify(w) !== prima) warnFix.push({ id: r.id, warnings: w.length ? w : null })
  }

  console.log(`Riferimenti da scrivere: ${nuovi.length}`)
  for (const n of nuovi) {
    const r = rows.find(x => x.id === n.invoice_id)!
    console.log(`  ${r.number.padEnd(12)} ${r.doc_type} → ${n.doc_id} del ${n.doc_date ?? 'senza data'}`)
  }
  console.log(`Avvisi da riscrivere: ${warnFix.length}`)
  if (illeggibili) console.log(`  (${illeggibili} XML non rileggibili: lasciati come sono)`)

  if (SCRIVI && nuovi.length) {
    await api('invoice_related', { method: 'POST', body: JSON.stringify(nuovi) })
  }
  if (SCRIVI) {
    for (const w of warnFix) {
      await api(`invoices?id=eq.${w.id}`, {
        method: 'PATCH', body: JSON.stringify({ warnings: w.warnings }),
      })
    }
  }

  // ── 2 · il legame, risolto dal database ──────────────────────────────────
  let collegate = 0
  if (SCRIVI) {
    collegate = await api<number>('rpc/link_invoice_rectifications', { method: 'POST', body: '{}' })
    console.log(`\n${collegate} note collegate alla fattura che rettificano`)
  } else {
    console.log('\n(a secco: il collegamento lo scrive link_invoice_rectifications con --scrivi)')
  }

  // ── 3 · le esclusioni che lo storno adesso spiega da sé ───────────────────
  const dopo = await api<Row[]>('invoices?select=id,direction,doc_type,number,issued_on,'
    + 'counterparty_name,counterparty_vat,taxable,sign,paid_on,excluded_reason,rectifies_id'
    + '&order=issued_on')

  const stornatoDa = new Map<string, string[]>()
  for (const n of dopo) {
    if (!n.rectifies_id || !isCreditNote(n.doc_type)) continue
    stornatoDa.set(n.rectifies_id, [...(stornatoDa.get(n.rectifies_id) ?? []), n.number])
  }

  /* Si toglie l'esclusione solo dove la coppia è **completa**: la fattura ha una
     nota che la annulla, o è la nota stessa. Dove il documento non spiega
     niente — la ISF 9/26 duplicata e mai stornata — l'esclusione a mano resta,
     ed è il suo mestiere. */
  const daRimettere = dopo.filter(r => r.excluded_reason
    && (stornatoDa.has(r.id) || (r.rectifies_id && dopo.some(x => x.id === r.rectifies_id))))

  console.log(`\nEsclusioni a mano che una nota di credito spiega già: ${daRimettere.length}`)
  for (const r of daRimettere) {
    const perché = stornatoDa.has(r.id)
      ? `stornata da ${stornatoDa.get(r.id)!.join(', ')}`
      : `è la nota che rettifica ${dopo.find(x => x.id === r.rectifies_id)!.number}`
    console.log(`  ${r.number.padEnd(12)} ${eur(r.sign * r.taxable).padStart(12)}  «${r.excluded_reason}» → ${perché}`)
  }

  if (SCRIVI) {
    for (const r of daRimettere) {
      await api(`invoices?id=eq.${r.id}`, {
        method: 'PATCH', body: JSON.stringify({ excluded_reason: null }),
      })
    }
  }

  // ── 4 · cosa cambia nei numeri ───────────────────────────────────────────
  const finale = await api<Row[]>('invoices?select=id,direction,doc_type,number,issued_on,'
    + 'counterparty_name,counterparty_vat,taxable,sign,paid_on,excluded_reason,rectifies_id'
    + '&direction=eq.emessa')

  const annullate = new Set<string>()
  for (const n of finale) {
    if (n.rectifies_id && isCreditNote(n.doc_type)) annullate.add(n.rectifies_id)
  }
  const netto = finale
    .filter(r => !r.excluded_reason)
    .reduce((s, r) => s + r.sign * Number(r.taxable), 0)
  const aperto = finale
    .filter(r => r.sign > 0 && !r.paid_on && !r.excluded_reason && !annullate.has(r.id))
    .reduce((s, r) => s + Number(r.taxable), 0)

  console.log(`\nEmesse: imponibile netto ${eur(netto)} · ancora da incassare ${eur(aperto)} (imponibile)`)
  console.log(SCRIVI ? '\nScritto.\n' : '\nNiente scritto: rilancia con --scrivi.\n')
}

main().catch(e => { console.error(e.message); process.exit(1) })
