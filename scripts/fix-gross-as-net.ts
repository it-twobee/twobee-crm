/**
 * §299 — Righe che portano il lordo dove il tool si aspetta l'imponibile.
 *
 *   npx tsx scripts/fix-gross-as-net.ts            # dice cosa farebbe
 *   npx tsx scripts/fix-gross-as-net.ts --apply    # scrive, solo nei mesi aperti
 *
 * Le ha trovate il registro delle allocazioni (§297) mettendo la riga accanto al
 * suo movimento: prima non c'era modo di vederle, perché una riga da 366 € è un
 * numero plausibile quanto una da 300.
 *
 * **Dal conto passa il lordo, la riga è imponibile** — è la regola di §296, e
 * quando una riga porta il lordo con `vat_applied` acceso il tool ci aggiunge il
 * 22% e si aspetta un'uscita che non arriverà mai.
 *
 * Ma lo **scorporo cieco al 22% sbaglia**, e le due fatture in archivio lo
 * dimostrano: Talenti è 300 + 66, cioè esattamente il 22%, e lo scorporo la
 * indovinerebbe; Gialeda è 134 + **7,04**, cioè il 5,25%, perché una pratica
 * CCIAA ha dentro diritti esenti. Quindi vale §182: **il documento batte la
 * stima**, e dove il documento non c'è non si inventa un'aliquota.
 *
 * Tre casi, tre risposte:
 *
 *   · **c'è la fattura** → imponibile e aliquota vengono da lei;
 *   · **fornitore estero senza fattura italiana** (Asana) → l'IVA non è stata
 *     pagata a nessuno: `vat_applied` si spegne e il costo è quello che è
 *     uscito. Scorporare inventerebbe un credito che non esiste;
 *   · **IVA indetraibile** (la spesa al supermercato) → il costo **è** il lordo,
 *     e `vat_applied` resta spento. Qui l'errore è solo un fattore cento.
 *
 * I mesi chiusi non si toccano: sono fotografie, e cambiare l'imponibile di un
 * mese chiuso muove il suo margine e le quote già distribuite. Vengono elencati
 * con quanto vale la correzione, perché la decisione di riaprire è di una persona.
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

/**
 * Le correzioni, una per una e ognuna con la sua ragione. Non si deducono da una
 * regola generale: se ci fosse una regola generale l'errore non sarebbe nato.
 */
const FIX: {
  match: RegExp
  month: string
  /** l'imponibile giusto; `null` = il costo è il lordo e l'IVA si spegne */
  net: number | null
  rate?: number
  why: string
}[] = [
  { match: /^Supermercato$/, month: '2026-07-01', net: null,
    why: 'La spesa GIAL del 22/07 è 37,51 € — la riga porta 3.751, un fattore cento. '
      + "L'IVA sugli alimentari è indetraibile, quindi il costo è il lordo (§191)" },
  { match: /^Talenti/, month: '2026-06-01', net: 300, rate: 0.22,
    why: 'Fattura 392/SL-2026: 300 + 66 di IVA = 366. La riga portava il totale' },
  { match: /^Gialeda/, month: '2026-05-01', net: 134, rate: 0.0525,
    why: 'Fattura 90/2026: 134 + 7,04 = 141,04. L\'aliquota vera è il 5,25%, non il 22%: '
      + 'una pratica CCIAA ha dentro diritti esenti' },
  { match: /^Asana$/, month: '2026-05-01', net: null,
    why: 'Fornitore irlandese, nessuna fattura italiana: l\'IVA non è stata pagata a nessuno. '
      + 'Scorporare inventerebbe un credito che non esiste' },
  { match: /^Asana$/, month: '2026-06-01', net: null,
    why: 'Come sopra' },
]

async function main() {
  console.log(`\n${APPLY ? 'CORREGGO — solo nei mesi aperti' : 'ANTEPRIMA — non scrivo niente'}\n`)

  const months = await api<{ id: string; month: string; status: string }[]>('pl_months?select=id,month,status')
  const chiusi: string[] = []
  let fatte = 0

  for (const f of FIX) {
    const m = months.find(x => x.month === f.month)
    if (!m) continue
    const righe = await api<{ id: string; label: string; actual: number; budget: number; vat_applied: boolean; vat_rate: number }[]>(
      `pl_cost_lines?select=id,label,actual,budget,vat_applied,vat_rate&month_id=eq.${m.id}`)
    const riga = righe.find(r => f.match.test(r.label))
    if (!riga) { console.log(`   ⚠ ${f.month.slice(0, 7)} nessuna riga per ${f.match}`); continue }

    const era = num(riga.actual) > 0 ? num(riga.actual) : num(riga.budget)
    const patch = f.net == null
      ? { actual: f.match.source === '^Supermercato$' ? 37.51 : era, vat_applied: false }
      : { actual: f.net, budget: f.net, vat_applied: true, vat_rate: f.rate ?? 0.22 }
    const dopo = num(patch.actual)
    const lordoDopo = Math.round(dopo * (patch.vat_applied ? 1 + Number(patch.vat_rate ?? 0) : 1) * 100) / 100
    const lordoPrima = Math.round(era * (riga.vat_applied ? 1 + num(riga.vat_rate) : 1) * 100) / 100

    console.log(`   ${m.status === 'chiuso' ? '🔒' : '  '} ${f.month.slice(0, 7)} ${riga.label.slice(0, 32).padEnd(33)}`
      + ` ${eur2(era)} → ${eur2(dopo)} · lordo atteso ${eur2(lordoPrima)} → ${eur2(lordoDopo)}`)
    console.log(`        ${f.why}`)

    if (m.status === 'chiuso') { chiusi.push(`${f.month.slice(0, 7)} ${riga.label}`); continue }
    if (APPLY) { await api(`pl_cost_lines?id=eq.${riga.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); fatte++ }
    else fatte++
  }

  line('═')
  if (chiusi.length) {
    console.log(`\n${chiusi.length} stanno in mesi **chiusi** e non le tocco:`)
    for (const c of chiusi) console.log(`   🔒 ${c}`)
    console.log('   Cambiare l\'imponibile di un mese chiuso ne muove il margine e le quote')
    console.log('   già distribuite. Riaprire il mese è una decisione, non un dettaglio.')
  }
  console.log(APPLY
    ? `\n${fatte} corrette nei mesi aperti.\n`
    : `\n${fatte} pronte nei mesi aperti · --apply per scriverle.\n`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
