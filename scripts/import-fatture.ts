/**
 * Carica in archivio gli XML dello SdI da una o più cartelle.
 *
 *   npx tsx scripts/import-fatture.ts ~/Downloads/XML\ 2 ~/Downloads/XML\ 3
 *
 * Stessa strada della pagina — `parseFattura` e la stessa impronta — quindi
 * quello che entra da qui e quello che entra dal pulsante sono la stessa cosa.
 * Idempotente: rilanciarlo sulle stesse cartelle non crea niente.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { parseFattura, invoiceKey, invoiceWarnings } from '@/lib/fattura-xml'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

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
  return r.status === 204 ? (null as T) : r.json() as Promise<T>
}

const eur = (n: number) => `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function main() {
  const dirs = process.argv.slice(2)
  if (!dirs.length) throw new Error('Passa almeno una cartella di XML')

  const cfg = await api<{ company_vat: string }[]>('pl_config?select=company_vat&id=eq.true')
  const own = cfg[0]?.company_vat ?? '11030281213'
  console.log(`Partita IVA di casa: ${own}\n`)

  const files: { path: string; name: string }[] = []
  for (const d of dirs) {
    for (const f of readdirSync(d)) {
      if (!f.toLowerCase().endsWith('.xml')) continue
      if (statSync(join(d, f)).isFile()) files.push({ path: join(d, f), name: f })
    }
  }

  const have = await api<{ doc_key: string }[]>('invoices?select=doc_key')
  const già = new Set(have.map(h => h.doc_key))

  let nuovi = 0, dup = 0, falliti = 0
  const perDir: Record<string, { em: number; ri: number }> = {}

  for (const f of files) {
    const xml = readFileSync(f.path, 'utf8')
    let docs
    try { docs = parseFattura(xml, own) }
    catch (e) { falliti++; console.log(`  ✗ ${f.name}: ${(e as Error).message}`); continue }

    for (const inv of docs) {
      const key = invoiceKey(inv)
      if (già.has(key)) { dup++; continue }
      già.add(key)

      const w = invoiceWarnings(inv)
      const [row] = await api<{ id: string }[]>('invoices', {
        method: 'POST',
        body: JSON.stringify({
          direction: inv.direction, doc_type: inv.docType, number: inv.number,
          issued_on: inv.issuedOn, currency: inv.currency,
          counterparty_name: inv.counterparty.name, counterparty_vat: inv.counterparty.vat,
          counterparty_tax: inv.counterparty.taxCode, counterparty_city: inv.counterparty.city,
          counterparty_addr: inv.counterparty.address,
          taxable: inv.taxable, vat_amount: inv.tax, total: inv.total,
          total_derived: inv.totalDerived, stamp: inv.stamp, withholding: inv.withholding,
          fund_amount: inv.fund, sign: inv.sign, due_date: inv.dueDate,
          payment_method: inv.paymentMethod, payment_terms: inv.paymentTerms,
          notes: inv.notes.join(' · ') || null,
          attachments: inv.attachments.length ? inv.attachments : null,
          sdi_progressive: inv.transmissionId, sdi_recipient: inv.recipientCode,
          doc_key: key, source_file: f.name, raw_xml: xml,
          warnings: w.length ? w : null,
        }),
      })

      if (inv.lines.length) {
        await api('invoice_lines', { method: 'POST', body: JSON.stringify(inv.lines.map(l => ({
          invoice_id: row.id, line_no: l.line, description: l.description, quantity: l.quantity,
          unit_price: l.unitPrice, total: l.total, vat_rate: l.vatRate, natura: l.natura,
          period_from: l.from, period_to: l.to,
        }))) })
      }
      if (inv.vat.length) {
        await api('invoice_vat', { method: 'POST', body: JSON.stringify(inv.vat.map(v => ({
          invoice_id: row.id, rate: v.rate, taxable: v.taxable, tax: v.tax,
          natura: v.natura, collectability: v.collectability,
        }))) })
      }
      if (inv.installments.length) {
        await api('invoice_installments', { method: 'POST', body: JSON.stringify(inv.installments.map(r => ({
          invoice_id: row.id, due_date: r.dueDate, amount: r.amount, method: r.method, iban: r.iban,
        }))) })
      }

      nuovi++
      const d = f.path.split('/').slice(0, -1).join('/')
      perDir[d] = perDir[d] ?? { em: 0, ri: 0 }
      if (inv.direction === 'emessa') perDir[d].em++; else perDir[d].ri++
    }
  }

  const linked = await api<number>('rpc/link_invoices_to_clients', { method: 'POST', body: '{}' })

  console.log(`${files.length} file · ${nuovi} fatture nuove · ${dup} già in archivio · ${falliti} illeggibili`)
  for (const [d, c] of Object.entries(perDir)) {
    console.log(`  ${d.split('/').at(-1)}: ${c.em} emesse, ${c.ri} ricevute`)
  }
  console.log(`${linked} agganciate a un cliente per partita IVA\n`)

  const all = await api<{ direction: string; taxable: number; vat_amount: number; sign: number }[]>(
    'invoices?select=direction,taxable,vat_amount,sign')
  for (const dir of ['emessa', 'ricevuta']) {
    const own = all.filter(x => x.direction === dir)
    const imp = own.reduce((s, x) => s + x.sign * Number(x.taxable), 0)
    const iva = own.reduce((s, x) => s + x.sign * Number(x.vat_amount), 0)
    console.log(`  ${dir.padEnd(9)} ${String(own.length).padStart(3)} documenti · imponibile ${eur(imp)} · IVA ${eur(iva)}`)
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
