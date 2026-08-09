/**
 * §253 — Aggancia i movimenti il cui importo coincide al centesimo, e **solo**
 * quelli con un candidato unico.
 *
 *   npx tsx scripts/match-exact.ts          (prova)
 *   npx tsx scripts/match-exact.ts --apply
 *
 * La regola della §189 dice che la riconciliazione la conferma una persona, e
 * resta giusta: quello che qui viene automatizzato è il caso in cui **non c'è
 * niente da decidere** — un importo lordo che coincide al centesimo con una
 * riga sola, nella direzione giusta. Dove le righe candidate sono due, la
 * scelta resta a mano: attaccarlo alla sbagliata dichiara pagata una fattura
 * che nessuno ha pagato, ed è l'errore che poi nessuno va a cercare.
 */
import { readFileSync } from 'fs'
import { eur2 } from '@/lib/money'
const env = Object.fromEntries(readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const g = async (p: string) => (await fetch(`${URL}/rest/v1/${p}`, { headers: H })).json()
const num = (v: unknown) => Number(v ?? 0)
const r2 = (n: number) => Math.round(n * 100) / 100
const APPLY = process.argv.includes('--apply')

async function main() {
  const [ms, tx, rev, cost] = await Promise.all([
    g('pl_months?select=id,month'), g('bank_transactions?select=*'),
    g('pl_revenue_lines?select=*'), g('pl_cost_lines?select=*'),
  ])
  const mOf = new Map(ms.map((m: { id: string; month: string }) => [m.id, m.month.slice(0, 7)]))

  type Cand = { id: string; label: string; gross: number; month: string; side: 'in' | 'out' }
  const cands: Cand[] = [
    ...rev.map((r: Record<string, unknown>) => ({
      id: String(r.id), label: String(r.label), side: 'in' as const,
      month: String(mOf.get(String(r.month_id))),
      gross: r2(num(r.amount_net) * (1 + num(r.vat_rate))),
    })),
    ...cost.map((c: Record<string, unknown>) => ({
      id: String(c.id), label: String(c.label), side: 'out' as const,
      month: String(mOf.get(String(c.month_id))),
      gross: r2((num(c.actual) || num(c.budget)) * (c.vat_applied ? 1 + num(c.vat_rate) : 1)),
    })),
  ]
  /* Una riga già agganciata a un movimento non è più candidata: un secondo
     bonifico dello stesso importo pagherebbe due volte la stessa fattura. */
  const preso = new Set(tx.filter((t: Record<string, unknown>) => t.revenue_line_id || t.cost_line_id)
    .map((t: Record<string, unknown>) => String(t.revenue_line_id ?? t.cost_line_id)))

  const liberi = tx.filter((t: Record<string, unknown>) =>
    t.source === 'banca' && !t.revenue_line_id && !t.cost_line_id && t.no_match_needed !== true)

  /* §253 — l'importo esatto **da solo** non basta, e si vede alla prima prova:
     una commissione da 5,00 € coincideva al centesimo con l'hosting da 5,00 €.
     Due numeri uguali non sono un fatto: servono due indizi. Il secondo è che
     la controparte e la riga condividano una parola vera — «Google Cloud» e
     «Google Workspace» sì, «comm.su bonifici» e «Dominio + Hosting» no.
     E le commissioni e le imposte restano **fuori**: non hanno una riga per
     movimento, si sommano in una voce sola a fine mese. */
  const parole = (s2: string) => new Set(s2.toLowerCase()
    .split(/[^a-zà-ù0-9]+/).filter(w => w.length >= 4))
  const affini = (a: string, b: string) => {
    const A = parole(a), B = parole(b)
    for (const w of Array.from(A)) if (B.has(w)) return true
    return false
  }
  const AUTO_ESCLUSI = ['commissione', 'imposta', 'giroconto', 'finanziamento']

  const fatti: string[] = []
  const ambigui: string[] = []
  const soli: string[] = []

  for (const t of liberi) {
    const amount = num(t.amount)
    const abs = r2(Math.abs(amount))
    const side = amount > 0 ? 'in' : 'out'
    const hit = cands.filter(c => c.side === side && !preso.has(c.id) && Math.abs(c.gross - abs) < 0.005)
    const who = `${String(t.booked_on).slice(0, 10)} ${eur2(amount).padStart(12)} ${String(t.counterparty ?? t.description).slice(0, 34)}`

    if (AUTO_ESCLUSI.includes(String(t.kind))) { soli.push(`  ${who}   [${t.kind}: si somma, non si aggancia]`); continue }
    if (hit.length === 0) { soli.push(`  ${who}`); continue }
    if (hit.length > 1) {
      ambigui.push(`  ${who}\n      ${hit.length} righe con lo stesso importo: `
        + hit.map(h => `${h.month} ${h.label.slice(0, 28)}`).join(' · '))
      continue
    }
    const c = hit[0]
    if (!affini(String(t.counterparty ?? t.description), c.label)) {
      ambigui.push(`  ${who}\n      importo uguale a «${c.label.slice(0, 34)}» ma niente in comune nel nome`)
      continue
    }
    fatti.push(`  ${who}  →  ${c.month} ${c.label.slice(0, 40)}`)
    preso.add(c.id)
    if (APPLY) {
      const res = await fetch(`${URL}/rest/v1/bank_transactions?id=eq.${t.id}`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({
          [c.side === 'in' ? 'revenue_line_id' : 'cost_line_id']: c.id,
          matched_at: new Date().toISOString(),
        }),
      })
      if (!res.ok) console.error('  ✗', who, await res.text())
    }
  }

  console.log(`${liberi.length} movimenti liberi\n`)
  console.log(`── AGGANCIATI (${fatti.length}) — importo esatto, candidato unico`)
  fatti.forEach(x => console.log(x))
  console.log(`\n── DA DECIDERE A MANO (${ambigui.length}) — l'importo torna, la riga no`)
  ambigui.forEach(x => console.log(x))
  console.log(`\n── SENZA CANDIDATO (${soli.length}) — nessuna riga con questo importo`)
  soli.slice(0, 25).forEach(x => console.log(x))
  if (soli.length > 25) console.log(`  … e altri ${soli.length - 25}`)
  if (!APPLY) console.log('\n(prova. --apply per scrivere)')
}
main().catch(e => { console.error(e); process.exit(1) })
