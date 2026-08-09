/**
 * Gli abbinamenti certi, letti dal database e passati al motore vero. (§276)
 *
 *   npx tsx scripts/verify-match.ts
 *
 * Sola lettura: dice quali coppie il pulsante «Conferma tutti» aggancerebbe e
 * quali lascia a te, con la ragione. Serve a guardarle prima di premere.
 */
import { readFileSync } from 'fs'
import { sureMatches } from '@/lib/auto-match'
import type { BankTx, PlLineRef } from '@/lib/bank'
import { eur2 } from '@/lib/money'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const get = async <T>(p: string): Promise<T> => {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}
const n = (v: unknown) => (v == null ? 0 : Number(v))

async function main() {
  const [txs, months, clients, rev, cost] = await Promise.all([
    get<Record<string, unknown>[]>('bank_transactions?select=*'),
    get<{ id: string; month: string }[]>('pl_months?select=id,month'),
    get<Record<string, unknown>[]>('clients?select=id,display_name,company_name'),
    get<Record<string, unknown>[]>('pl_revenue_lines?select=*&paid=eq.false'),
    get<Record<string, unknown>[]>('pl_cost_lines?select=*&paid=eq.false'),
  ])
  const monthOf = new Map(months.map(m => [m.id, m.month.slice(0, 10)]))
  const nameOf = new Map(clients.map(c => [String(c.id), String(c.display_name || c.company_name || '')]))
  const lines: PlLineRef[] = [
    ...rev.map(r => ({
      id: String(r.id), month: monthOf.get(String(r.month_id)) ?? '', label: String(r.label),
      clientName: nameOf.get(String(r.client_id ?? '')) ?? null,
      net: n(r.amount_net), vatRate: n(r.vat_rate), paid: false, direction: 'in' as const,
    })),
    ...cost.map(c => ({
      id: String(c.id), month: monthOf.get(String(c.month_id)) ?? '', label: String(c.label),
      clientName: (c.note as string) ?? null,
      net: n(c.actual) > 0 ? n(c.actual) : n(c.budget),
      vatRate: c.vat_applied ? n(c.vat_rate) : 0, paid: false, direction: 'out' as const,
    })),
  ].filter(l => l.month && l.net > 0)

  const r = sureMatches(txs as unknown as BankTx[], lines)
  console.log(`CERTI — ${r.pairs.length} coppie`)
  for (const p of r.pairs) {
    console.log(`  ${p.date}  ${eur2(Math.abs(p.amount)).padStart(11)}  ${p.who.slice(0, 26).padEnd(28)}`
      + `→ ${p.label.slice(0, 34).padEnd(36)}${p.why}`)
  }
  console.log(`\nDA GUARDARE A MANO — ${r.ambiguous.length}`)
  for (const a of r.ambiguous) {
    console.log(`  ${a.date}  ${eur2(Math.abs(a.amount)).padStart(11)}  ${a.who.slice(0, 26).padEnd(28)}${a.why}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
