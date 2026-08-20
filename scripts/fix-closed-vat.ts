/**
 * §299 — Riapre maggio e giugno, corregge le quattro righe, li richiude.
 * E alloca la seconda distinta del 20 agosto.
 *
 *   npx tsx scripts/fix-closed-vat.ts            # dice cosa farebbe
 *   npx tsx scripts/fix-closed-vat.ts --apply    # scrive
 *
 * Le quattro righe portano il **lordo** dove il motore aspetta l'imponibile, e
 * `vat_applied` acceso gli fa aggiungere il 22% sopra un numero che l'IVA la
 * contiene già. Le fatture dicono chi ha ragione, e dicono anche perché lo
 * scorporo cieco sbaglierebbe: Talenti è 300 + 66 (il 22% esatto), Gialeda è
 * 134 + **7,04** — il 5,25%, perché una pratica CCIAA ha dentro diritti esenti.
 * Su Asana non c'è nessuna fattura italiana: fornitore irlandese, l'IVA non è
 * stata pagata a nessuno, e scorporare inventerebbe un credito che non esiste.
 *
 * **Riaprire un mese chiuso non è gratis** (§290): la riapertura cancella il
 * segno del trascinamento sulle righe scoperte, e richiudendolo si riscrive con
 * la data di oggi. Su maggio e giugno non ci sono righe scoperte da trascinare
 * — sono mesi liquidati — quindi il prezzo è zero, ma il conto va fatto prima e
 * non dopo: lo script lo verifica e si ferma se trova qualcosa da perdere.
 *
 * La seconda distinta del 20 agosto sono **1.554 € di Annalisa più 1.300 di
 * Gabriele**, e le fatture lo confermano: FPR 9/26 di Annalisa è 1.554 esatti.
 * La riga di luglio ne portava 1.530, che è l'importo della fattura *prima*
 * (FPR 8/26, già pagata il 20 luglio con un bonifico suo).
 */
import { readFileSync } from 'fs'
import { eur2 } from '@/lib/money'

const APPLY = process.argv.includes('--apply')

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
  })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.status === 204 ? (null as T) : r.json() as Promise<T>
}
const num = (v: unknown) => (v == null ? 0 : Number(v))
const line = (c = '─') => console.log(c.repeat(78))
const step = async (what: string, run: () => Promise<unknown>) => {
  console.log(`   ${APPLY ? '→' : '·'} ${what}`)
  if (APPLY) await run()
}

/** Le quattro, con la ragione e la fonte di ogni numero. */
const FIX = [
  { month: '2026-06-01', match: /^Talenti/, net: 300, rate: 0.22,
    why: 'Fattura 392/SL-2026: 300 + 66 = 366. La riga portava il totale' },
  { month: '2026-05-01', match: /^Gialeda/, net: 134, rate: 0.0525,
    why: "Fattura 90/2026: 134 + 7,04 = 141,04. L'aliquota è il 5,25%, non il 22%" },
  { month: '2026-05-01', match: /^Asana$/, net: null, rate: 0,
    why: 'Fornitore irlandese, nessuna fattura italiana: nessuna IVA da detrarre' },
  { month: '2026-06-01', match: /^Asana$/, net: null, rate: 0,
    why: 'Come sopra' },
]

async function main() {
  console.log(`\n${APPLY ? 'CORREGGO' : 'ANTEPRIMA — non scrivo niente'}\n`)

  const months = await api<{ id: string; month: string; status: string; closed_at: string | null }[]>(
    'pl_months?select=id,month,status,closed_at')
  const daRiaprire = ['2026-05-01', '2026-06-01']
    .map(m => months.find(x => x.month === m)).filter(Boolean) as typeof months

  // ── 0 · quanto costa riaprire ─────────────────────────────────────────────
  line('═')
  console.log('0 · COSA SI PERDE RIAPRENDO')
  line()
  for (const m of daRiaprire) {
    const [r, c] = await Promise.all([
      api<{ id: string }[]>(`pl_revenue_lines?select=id&month_id=eq.${m.id}&carried_at=not.is.null`),
      api<{ id: string }[]>(`pl_cost_lines?select=id&month_id=eq.${m.id}&carried_at=not.is.null`),
    ])
    const n = r.length + c.length
    console.log(`   ${m.month.slice(0, 7)} ${m.status} · ${n} righe portano il segno del trascinamento`
      + (n ? ' — riaprendo lo perdono (§290)' : ': niente da perdere'))
    if (n > 0) throw new Error(
      `${m.month.slice(0, 7)} ha ${n} righe trascinate: riaprirlo cancella il loro segno. Fermati e guarda.`)
  }

  // ── 1 · riapro ────────────────────────────────────────────────────────────
  line('═')
  console.log('1 · RIAPRO')
  line()
  for (const m of daRiaprire) {
    if (m.status !== 'chiuso') { console.log(`   ${m.month.slice(0, 7)} è già aperto`); continue }
    await step(`${m.month.slice(0, 7)} riaperto (era chiuso il ${String(m.closed_at).slice(0, 10)})`,
      () => api(`pl_months?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'aperto' }) }))
  }

  // ── 2 · le quattro righe ──────────────────────────────────────────────────
  line('═')
  console.log('2 · LE QUATTRO RIGHE')
  line()
  for (const f of FIX) {
    const m = months.find(x => x.month === f.month)!
    const righe = await api<{ id: string; label: string; actual: number; budget: number; vat_applied: boolean; vat_rate: number }[]>(
      `pl_cost_lines?select=id,label,actual,budget,vat_applied,vat_rate&month_id=eq.${m.id}`)
    const riga = righe.find(r => f.match.test(r.label))
    if (!riga) { console.log(`   ⚠ ${f.month.slice(0, 7)}: nessuna riga per ${f.match}`); continue }

    const era = num(riga.actual) > 0 ? num(riga.actual) : num(riga.budget)
    const patch = f.net == null
      ? { vat_applied: false }
      : { actual: f.net, budget: f.net, vat_applied: true, vat_rate: f.rate }
    const dopo = f.net ?? era
    const lordoPrima = Math.round(era * (riga.vat_applied ? 1 + num(riga.vat_rate) : 1) * 100) / 100
    const lordoDopo = Math.round(dopo * (f.net == null ? 1 : 1 + f.rate) * 100) / 100

    await step(`${f.month.slice(0, 7)} ${riga.label.slice(0, 30).padEnd(31)} imponibile ${eur2(era)} → ${eur2(dopo)}`
      + ` · lordo atteso ${eur2(lordoPrima)} → ${eur2(lordoDopo)}`,
      () => api(`pl_cost_lines?id=eq.${riga.id}`, { method: 'PATCH', body: JSON.stringify(patch) }))
    console.log(`        ${f.why}`)
  }

  // ── 3 · richiudo ──────────────────────────────────────────────────────────
  line('═')
  console.log('3 · RICHIUDO')
  line()
  for (const m of daRiaprire) {
    await step(`${m.month.slice(0, 7)} richiuso`,
      () => api(`pl_months?id=eq.${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'chiuso', closed_at: m.closed_at ?? new Date().toISOString() }),
      }))
  }

  // ── 4 · la seconda distinta del 20 agosto ─────────────────────────────────
  line('═')
  console.log('4 · LA DISTINTA DI 2.854 € — ANNALISA 1.554 + GABRIELE 1.300')
  line()
  const tx = await api<{ id: string; amount: number }[]>(
    'bank_transactions?select=id,amount&booked_on=eq.2026-08-20&amount=eq.-2854')
  if (tx.length !== 1) {
    console.log(`   ⚠ atteso 1 movimento da 2.854 il 20/08, trovati ${tx.length}: salto`)
  } else {
    const gia = await api<{ id: string }[]>(`payment_allocations?select=id&tx_id=eq.${tx[0].id}`)
    if (gia.length) console.log('   già allocata: non tocco niente')
    else {
      const luglio = months.find(m => m.month === '2026-07-01')!
      const righe = await api<{ id: string; label: string; actual: number }[]>(
        `pl_cost_lines?select=id,label,actual&month_id=eq.${luglio.id}&or=(label.ilike.*Annalisa*,label.ilike.*Gabriele*)`)
      const ann = righe.find(r => /Annalisa/i.test(r.label))
      const gab = righe.find(r => /Gabriele/i.test(r.label))
      if (!ann || !gab) throw new Error('non trovo le righe di Annalisa e Gabriele in luglio')

      /* La riga portava 1.530, che è l'importo della fattura **prima** — FPR 8/26,
         già pagata il 20 luglio con un bonifico suo. Quella che questa distinta
         paga è la FPR 9/26, di 1.554 esatti. */
      await step(`Annalisa: imponibile ${eur2(num(ann.actual))} → ${eur2(1554)} (FPR 9/26)`,
        () => api(`pl_cost_lines?id=eq.${ann.id}`, {
          method: 'PATCH', body: JSON.stringify({ actual: 1554, budget: 1554 }),
        }))
      await step(`${eur2(1554)} → «${ann.label.slice(0, 28)}» e ${eur2(1300)} → «${gab.label.slice(0, 28)}»`,
        () => api('payment_allocations', {
          method: 'POST',
          body: JSON.stringify([
            { tx_id: tx[0].id, cost_line_id: ann.id, amount: 1554, evidence: 'certificata',
              note: 'Allocazione §299: distinta del 20/08, fattura FPR 9/26 di Annalisa' },
            { tx_id: tx[0].id, cost_line_id: gab.id, amount: 1300, evidence: 'certificata',
              note: 'Allocazione §299: distinta del 20/08, fattura di Gabriele' },
          ]),
        }))
    }
  }

  line('═')
  console.log(APPLY
    ? '\nFatto. Rilancia verify-bank, verify-allocations e verify-month sui mesi toccati.\n'
    : '\nAnteprima. Rilancia con --apply per scrivere.\n')
}

main().catch(e => { console.error(e.message); process.exit(1) })
