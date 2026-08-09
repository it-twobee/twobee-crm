/**
 * Fatture contro banca contro conto economico. (§248)
 *
 *   npx tsx scripts/verify-invoices.ts
 *
 * Sola lettura. Tre domande, in ordine:
 *   1. cosa dice l'archivio fatture, emesse e ricevute, mese per mese
 *   2. cosa dicono i conti (BPM e Vivid), in entrata e in uscita
 *   3. cosa si aggancia a cosa, e cosa resta scoperto da tutte e due le parti
 */
import { readFileSync } from 'fs'
import { eur } from '@/lib/money'
const env = Object.fromEntries(readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), KEY = env.SUPABASE_SERVICE_ROLE_KEY
const get = async <T>(p: string): Promise<T> => {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json() as Promise<T> }
const num = (v: unknown) => Number(v ?? 0)
const r2 = (n: number) => Math.round(n * 100) / 100
const line = (c = '─') => console.log(c.repeat(76))

async function main() {
  const [inv, acc, tx, ms, rev, cost] = await Promise.all([
    get<Record<string, unknown>[]>('invoices?select=*&order=issued_on'),
    get<Record<string, unknown>[]>('bank_accounts?select=id,label'),
    get<Record<string, unknown>[]>('bank_transactions?select=*&order=booked_on'),
    get<{ id: string; month: string; status: string }[]>('pl_months?select=id,month,status&order=month'),
    get<Record<string, unknown>[]>('pl_revenue_lines?select=*'),
    get<Record<string, unknown>[]>('pl_cost_lines?select=*'),
  ])
  const nm = new Map(acc.map(a => [String(a.id), String(a.label)]))
  const mOf = new Map(ms.map(m => [m.id, m.month.slice(0, 7)]))
  const mesi = ms.map(m => m.month.slice(0, 7))
  const real = tx.filter(t => String(t.source) === 'banca')

  // ── 1 · l'archivio fatture ────────────────────────────────────────────────
  line('═'); console.log('1 · FATTURE — quello che l\'archivio contiene'); line()
  console.log('mese     emesse                    ricevute                  pagate')
  for (const m of mesi) {
    const own = inv.filter(i => String(i.issued_on).slice(0, 7) === m)
    const em = own.filter(i => i.direction === 'emessa')
    const ri = own.filter(i => i.direction === 'ricevuta')
    const sum = (xs: Record<string, unknown>[]) => r2(xs.reduce((s, i) => s + num(i.sign) * num(i.total), 0))
    console.log(`${m}  ${String(em.length).padStart(2)} · ${eur(sum(em)).padStart(11)}`
      + `      ${String(ri.length).padStart(2)} · ${eur(sum(ri)).padStart(11)}`
      + `      ${own.filter(i => i.paid_on).length}/${own.length}`)
  }
  const orfane = inv.filter(i => !i.client_id && i.direction === 'emessa')
  console.log(`\n  ${inv.length} in tutto · ${inv.filter(i => i.source_file === 'inserita a mano').length} a mano`
    + ` · ${orfane.length} emesse senza cliente in anagrafica`)

  // ── 2 · i conti ───────────────────────────────────────────────────────────
  line('═'); console.log('2 · CONTI — quello che è passato davvero'); line()
  console.log('mese     BPM in       BPM out      Vivid in     Vivid out    netto')
  for (const m of mesi) {
    const own = real.filter(t => String(t.booked_on).slice(0, 7) === m)
    const q = (label: string, dir: 1 | -1) => r2(own
      .filter(t => String(nm.get(String(t.account_id))).includes(label) && Math.sign(num(t.amount)) === dir)
      .reduce((s, t) => s + Math.abs(num(t.amount)), 0))
    const bi = q('Two Bee', 1), bo = q('Two Bee', -1), vi = q('Vivid', 1), vo = q('Vivid', -1)
    console.log(`${m}  ${eur(bi).padStart(11)}  ${eur(-bo).padStart(11)}  ${eur(vi).padStart(11)}`
      + `  ${eur(-vo).padStart(11)}  ${eur(r2(bi - bo + vi - vo)).padStart(11)}`)
  }

  // ── 3 · chi è agganciato a chi ────────────────────────────────────────────
  line('═'); console.log('3 · AGGANCI — cosa spiega cosa'); line()
  const linkedTx = real.filter(t => t.revenue_line_id || t.cost_line_id)
  const invLinked = inv.filter(i => tx.some(t => String(t.invoice_id) === String(i.id)))
  const lineWithInv = [...rev, ...cost].filter(l => l.invoice_id)
  console.log(`  movimenti veri agganciati a una riga   ${String(linkedTx.length).padStart(3)} su ${real.length}`)
  console.log(`  fatture agganciate a un movimento      ${String(invLinked.length).padStart(3)} su ${inv.length}`)
  console.log(`  righe di conto economico con fattura   ${String(lineWithInv.length).padStart(3)} su ${rev.length + cost.length}`)

  // ── 4 · un pagamento, due fatture ─────────────────────────────────────────
  line('═'); console.log('4 · UN PAGAMENTO, PIÙ FATTURE — somme che coincidono'); line()
  const aperte = inv.filter(i => !i.paid_on)
  const liberi = real.filter(t => !t.revenue_line_id && !t.cost_line_id && t.no_match_needed !== true)
  let trovate = 0
  for (const t of liberi) {
    const abs = r2(Math.abs(num(t.amount)))
    if (abs < 50) continue
    const dir = num(t.amount) > 0 ? 'emessa' : 'ricevuta'
    const pool = aperte.filter(i => i.direction === dir)
    for (let a = 0; a < pool.length; a++) {
      for (let b = a + 1; b < pool.length; b++) {
        const somma = r2(num(pool[a].total) * num(pool[a].sign) + num(pool[b].total) * num(pool[b].sign))
        if (Math.abs(somma - abs) > 0.02) continue
        console.log(`  ${String(t.booked_on).slice(0, 10)} ${eur(num(t.amount)).padStart(11)}`
          + ` ${String(t.counterparty ?? '').slice(0, 22).padEnd(24)}`
          + ` = ${pool[a].number} + ${pool[b].number}`)
        trovate++
      }
    }
  }
  console.log(trovate ? `\n  ${trovate} pagamenti cumulativi da confermare a mano.`
    : '  Nessun pagamento che copra esattamente due fatture aperte.')

  // ── 5 · anticipi di tasca propria ─────────────────────────────────────────
  line('═'); console.log('5 · ANTICIPI — quello che non è passato dai conti aziendali'); line()
  const perName = new Map<string, { n: number; a: number }>()
  for (const t of real.filter(t => num(t.amount) < 0)) {
    const k = String(t.counterparty ?? '(senza nome)')
    const c = perName.get(k) ?? { n: 0, a: 0 }
    perName.set(k, { n: c.n + 1, a: r2(c.a + Math.abs(num(t.amount))) })
  }
  const marco = Array.from(perName).filter(([k]) => /marco|lucci/i.test(k))
  marco.forEach(([k, v]) => console.log(`  uscite verso «${k}»: ${v.n} movimenti · ${eur(v.a)}`))
  const manuali = tx.filter(t => String(t.source) === 'manuale')
  console.log(`  movimenti registrati come «manuale» (contante, carta di un socio): ${manuali.length}`)
  if (!manuali.length) {
    console.log('  ⚠ Nessuno. Un anticipo di tasca propria che non è registrato non esiste per il tool:')
    console.log('    va inserito in Banca come movimento «manuale», e da lì si aggancia alla sua riga (§195).')
  }
  line('═')
}
main().catch(e => { console.error(e); process.exit(1) })
