/**
 * Il rischio di ogni cliente, letto dal database e passato al motore vero.
 *
 *   npx tsx scripts/verify-risk.ts
 *   npx tsx scripts/verify-risk.ts 2026-06-05      ← com'era a quella data
 *
 * Serve a controllare la catena intera — righe di conto economico, rate,
 * contratti, sospensioni — con lo stesso `risksFor` che gira in pagina, non con
 * una riscrittura che potrebbe divergere. La data come argomento è il modo di
 * vedere il trend: il motore è puro, quindi «com'era un mese fa» si chiede
 * riesegundolo indietro. Sola lettura: non scrive niente.
 */
import { readFileSync } from 'fs'
import { risksFor, riskSummary, type RiskRows } from '@/lib/risk'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const today = process.argv[2] ?? new Date().toISOString().slice(0, 10)

async function get<T>(path: string): Promise<T[]> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`${path}: ${await r.text()}`)
  return r.json()
}

const pad = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n)

async function main() {
  const [clients, streams, installments, lines] = await Promise.all([
    get<RiskRows['clients'][number]>('clients?select=id,company_name,display_name,client_label,is_internal,paused_at&order=company_name'),
    get<RiskRows['streams'][number]>('revenue_streams?select=id,client_id,status,end_date'),
    get<RiskRows['installments'][number]>('revenue_installments?select=stream_id,amount,paid,due_month'),
    get<RiskRows['lines'][number]>('pl_revenue_lines?select=client_id,amount_net,paid,pl_months!inner(month)'),
  ])

  const risks = risksFor({ clients, streams, installments, lines }, today)

  console.log(`\n═══ rischio clienti al ${today} ══════════════════════════════`)
  console.log(`  ${clients.length} clienti · ${streams.length} contratti · ${installments.length} rate · ${lines.length} righe\n`)

  const rows = clients.map(c => ({ c, r: risks[c.id] }))
    .sort((a, b) => (b.r.score ?? -1) - (a.r.score ?? -1))

  for (const { c, r } of rows) {
    const name = pad(c.display_name || c.company_name, 26)
    if (r.score == null) {
      console.log(`  ${name} ${'—'.padStart(4)}  ${r.basis}`)
      continue
    }
    const arrow = r.trend === 'peggiora' ? '↑' : r.trend === 'migliora' ? '↓' : '→'
    console.log(`  ${name} ${String(r.score).padStart(4)} ${arrow} ${(r.band ?? '').padEnd(6)} ${r.basis}`)
    for (const f of r.factors) {
      if (f.score === 0) continue
      console.log(`  ${' '.repeat(26)} ${(f.score > 0 ? '+' : '') + f.score}`.padEnd(36) + f.msg)
    }
    for (const un of r.unknown) {
      console.log(`  ${' '.repeat(26)} n/d`.padEnd(36) + un.msg)
    }
  }

  const s = riskSummary(rows.map(x => x.r))
  console.log('\n  ── riepilogo ──')
  console.log(`  valutati            ${s.scored}`)
  console.log(`  alto rischio        ${s.high}`)
  console.log(`  rischio medio       ${s.medium}`)
  console.log(`  in peggioramento    ${s.worsening}`)
  console.log(`  non valutabili      ${s.notReady}   ← senza questo numero gli altri non si leggono\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
