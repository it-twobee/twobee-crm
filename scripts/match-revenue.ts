/**
 * §257 — Le entrate contro gli incassi veri.
 *
 *   npx tsx scripts/match-revenue.ts
 *
 * Sola lettura: mostra, non scrive. Su un'entrata sbagliare l'aggancio è peggio
 * che su un'uscita — dichiara incassata una fattura che nessuno ha pagato, e da
 * lì in poi nessuno la va più a chiedere.
 */
import { readFileSync } from 'fs'
import { eur2 } from '@/lib/money'
const env = Object.fromEntries(readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), KEY = env.SUPABASE_SERVICE_ROLE_KEY
const g = async (p: string) => (await fetch(`${URL}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json()
const num = (v: unknown) => Number(v ?? 0)
const r2 = (n: number) => Math.round(n * 100) / 100

async function main() {
  const [ms, tx, rev, clients] = await Promise.all([
    g('pl_months?select=id,month&order=month'), g('bank_transactions?select=*'),
    g('pl_revenue_lines?select=*'), g('clients?select=id,company_name,display_name'),
  ])
  const mOf = new Map(ms.map((m: { id: string; month: string }) => [m.id, m.month.slice(0, 7)]))
  const cOf = new Map(clients.map((c: Record<string, unknown>) =>
    [String(c.id), String(c.display_name || c.company_name)]))

  const attached = new Map<string, string[]>()
  for (const t of tx) if (t.revenue_line_id && t.source === 'banca') {
    attached.set(String(t.revenue_line_id), [...(attached.get(String(t.revenue_line_id)) ?? []), String(t.id)])
  }

  const righe = rev.map((r: Record<string, unknown>) => ({
    id: String(r.id), month: String(mOf.get(String(r.month_id))),
    cliente: r.client_id ? String(cOf.get(String(r.client_id)) ?? '') : '',
    label: String(r.label), lordo: r2(num(r.amount_net) * (1 + num(r.vat_rate))),
    paid: r.paid === true, agganciata: (attached.get(String(r.id)) ?? []).length > 0,
  })).sort((a: {month:string}, b: {month:string}) => a.month.localeCompare(b.month))

  const incassi = tx.filter((t: Record<string, unknown>) =>
    t.source === 'banca' && num(t.amount) > 0 && !t.revenue_line_id && t.kind !== 'giroconto'
    && t.kind !== 'finanziamento')

  console.log('── LE RIGHE DI ENTRATA ─────────────────────────────────────────────────────')
  console.log('mese     cliente                  lordo        stato')
  righe.forEach((r: Record<string, unknown>) => console.log(
    `${r.month}  ${String(r.cliente || r.label).slice(0, 22).padEnd(24)} ${eur2(Number(r.lordo)).padStart(11)}`
    + `  ${r.agganciata ? '✓ agganciata' : r.paid ? '⚠ spuntata senza movimento' : '· da incassare'}`))

  console.log('\n── GLI INCASSI SENZA RIGA ──────────────────────────────────────────────────')
  incassi.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(a.booked_on).localeCompare(String(b.booked_on)))
  for (const t of incassi) {
    const abs = r2(num(t.amount))
    const esatte = righe.filter((r: Record<string, unknown>) => !r.agganciata && Math.abs(Number(r.lordo) - abs) < 0.02)
    const coppie: string[] = []
    const liberi = righe.filter((r: Record<string, unknown>) => !r.agganciata)
    for (let i = 0; i < liberi.length; i++) for (let j = i + 1; j < liberi.length; j++) {
      if (Math.abs(Number(liberi[i].lordo) + Number(liberi[j].lordo) - abs) < 0.02) {
        coppie.push(`${liberi[i].month} ${liberi[i].cliente} + ${liberi[j].month} ${liberi[j].cliente}`)
      }
    }
    console.log(`\n  ${String(t.booked_on).slice(0, 10)}  ${eur2(abs).padStart(11)}  ${String(t.counterparty ?? '').slice(0, 30)}`)
    console.log(`     ${String(t.description).slice(0, 88)}`)
    if (esatte.length) esatte.forEach((r: Record<string, unknown>) =>
      console.log(`     → una riga sola: ${r.month} ${r.cliente} ${eur2(Number(r.lordo))}`))
    if (coppie.length) coppie.slice(0, 3).forEach(c => console.log(`     → due righe: ${c}`))
    if (!esatte.length && !coppie.length) console.log('     → nessuna combinazione: importo parziale, o riga mancante')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
