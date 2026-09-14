/**
 * Il foglio dell'erogazione, generato su file per guardarlo prima di mandarlo.
 *
 *   npx tsx scripts/report-compensi.ts 2026-08-01 [percorso.html]
 *
 * Stessa composizione della route (`/api/compensi`): legge dal database col
 * service role e passa a `payoutReportHtml`. Serve a vedere il documento senza
 * autenticarsi — una colonna che va a capo o un numero vuoto si notano solo
 * guardando il foglio, non compilandolo.
 */
import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { monthKey } from '@/lib/pl'
import { loadWindow } from '@/lib/payouts-plan'
import { payoutReportHtml, payoutPeople, type PayoutLineRef } from '@/lib/payout-report'
import { eur2 } from '@/lib/money'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const month = process.argv[2] ? monthKey(new Date(process.argv[2])) : monthKey(new Date())
  const out = process.argv[3] ?? `/tmp/compensi-${month}.html`

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } })
  const { monthRow, w, t, config, summary } = await loadWindow(sb as never, month)

  const [{ data: clients }, { data: payoutRows }] = await Promise.all([
    sb.from('clients').select('id, display_name, company_name, sales_owner_name'),
    sb.from('pl_payouts').select('*').eq('month_id', monthRow.id),
  ])
  const clientNames = Object.fromEntries((clients ?? []).map((c: Record<string, unknown>) =>
    [String(c.id), String(c.display_name || c.company_name)]))
  const lines: PayoutLineRef[] = (payoutRows ?? []).map((r: Record<string, unknown>) => ({
    personKey: String(r.person_key), personLabel: String(r.person_label),
    kind: r.kind === 'commerciale' ? 'commerciale' : 'socio',
    amount: Number(r.amount ?? 0), paid: r.paid === true,
    paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
  }))

  const owners = Array.from(new Set((clients ?? [])
    .map((c: Record<string, unknown>) => String(c.sales_owner_name ?? '')).filter(Boolean)))
  const input = {
    month, today, w, t, config, clientNames, lines, owners, autore: 'Marco Lucci',
    open: { n: summary.open.n, amount: summary.open.amount },
    next: { n: summary.next.n, amount: summary.next.amount },
  }
  writeFileSync(out, payoutReportHtml(input))

  console.log(`\n${out} — erogazione del ${w.date}, incassi ${w.since ? `dal ${w.since}` : 'da sempre'}\n`)
  for (const p of payoutPeople(input)) {
    console.log(`  ${p.who.padEnd(20)} maturato ${eur2(p.total).padStart(12)}`
      + `  già uscito ${eur2(p.spent).padStart(10)}`
      + `  da versare ${eur2(p.cash).padStart(12)}`
      + `  ${p.rows.length} righe${p.paid ? '  [pagato]' : ''}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
