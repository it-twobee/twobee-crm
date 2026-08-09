/**
 * §256 — Le uscite del conto economico **sono** le uscite dei conti.
 *
 *   npx tsx scripts/rebuild-costs.ts            (prova)
 *   npx tsx scripts/rebuild-costs.ts --apply
 *
 * Due regole, e la seconda è quella che cambia tutto:
 *
 *   A. **Pagato vuol dire che c'è un movimento.** Una riga spuntata che nessun
 *      addebito dimostra torna a essere un previsionale: non sparisce — il
 *      preventivato serve — ma smette di far cumulo. Erano 51 righe.
 *   B. **Ogni uscita vera ha la sua riga.** Gli addebiti che nessuna voce
 *      spiega diventano una riga per controparte e per mese, con l'importo che
 *      è la somma di quello che è uscito, e i movimenti agganciati.
 *
 * Fuori restano `giroconto` (i due lati di uno spostamento fra conti propri non
 * sono un costo) e `finanziamento` (i compensi ai soci non sono righe di conto
 * economico: si ricalcolano, §227).
 */
import { readFileSync } from 'fs'
import { eur2 } from '@/lib/money'
import { personName } from '@/lib/bank'
import { merchant } from '@/lib/bank-import'
const env = Object.fromEntries(readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const g = async (p: string) => (await fetch(`${URL}/rest/v1/${p}`, { headers: H })).json()
const num = (v: unknown) => Number(v ?? 0)
const r2 = (n: number) => Math.round(n * 100) / 100
const APPLY = process.argv.includes('--apply')
const FUORI = ['giroconto', 'finanziamento']

/** Le persone in organico: quello che esce verso di loro è costo del lavoro. */
const RISORSE = /gabriele|saraiello|annalisa|smiraglia|michele|cristallo|sabrina|nastro|agostino|abate|beneficiari vari/i
/** I soci: quello che esce verso di loro non è un costo (§227), è erogato o capitale. */
const SOCI = /^(walter|marco|toto)$/i

/**
 * Dove finisce un addebito, e **come si chiama**.
 *
 * Le commissioni sono il caso che decide la forma di tutto: trentaquattro
 * addebiti da un euro e mezzo, ognuno con un riferimento diverso nella causale.
 * Presi uno per uno fanno trentaquattro righe che nessuno guarderà mai; sotto un
 * nome solo fanno un numero vero. Perciò per loro il nome **non** viene dal
 * movimento: viene dalla categoria.
 */
function classifica(kind: string, who: string): { area: string; label: string } | null {
  if (kind === 'commissione') return { area: 'Banca', label: 'Commissioni bancarie' }
  if (kind === 'imposta') return { area: 'Banca', label: 'F24 e imposte' }
  if (SOCI.test(who.trim())) return null   // non è un costo: si vede nei compensi
  if (kind === 'stipendio' || RISORSE.test(who)) return { area: 'Personale', label: who }
  const w = who.toLowerCase()
  if (/meta|google|facebook|ads|klaviyo/.test(w)) return { area: 'Marketing TwoBee', label: who }
  if (/slack|canva|anthropic|openai|chatgpt|claude|ai tools|aruba|ovh|plaud|asana|notion/.test(w)) {
    return { area: 'Software & Tool', label: who }
  }
  if (/affinity|annunziata|gialeda|talenti/.test(w)) return { area: 'Delivery & Fornitori', label: who }
  return { area: 'Spese fuori piano', label: who }
}

async function main() {
  const [ms, tx, cost, centers] = await Promise.all([
    g('pl_months?select=id,month,status&order=month'),
    g('bank_transactions?select=*'), g('pl_cost_lines?select=*'),
    g('cost_centers?select=id,name'),
  ])
  const centerId = new Map(centers.map((c: { id: string; name: string }) => [c.name, c.id]))
  const attached = new Map<string, string[]>()   // costLineId → txIds
  for (const t of tx) {
    if (t.cost_line_id && (t.source === 'banca' || t.source === 'manuale')) {
      attached.set(String(t.cost_line_id), [...(attached.get(String(t.cost_line_id)) ?? []), String(t.id)])
    }
  }

  let unpaid = 0, created = 0, linked = 0
  for (const m of ms) {
    const mm = m.month.slice(0, 7)
    const righe = cost.filter((c: Record<string, unknown>) => c.month_id === m.id)

    // ── A · pagato senza movimento → torna previsionale ─────────────────────
    const finte = righe.filter((c: Record<string, unknown>) =>
      c.paid === true && !(attached.get(String(c.id))?.length))
    // ── B · uscite vere senza riga ──────────────────────────────────────────
    const liberi = tx.filter((t: Record<string, unknown>) =>
      (t.source === 'banca' || t.source === 'manuale')
      && num(t.amount) < 0 && !t.cost_line_id && !t.revenue_line_id
      && !FUORI.includes(String(t.kind))
      && String(t.booked_on).slice(0, 7) === mm)

    const gruppi = new Map<string, { who: string; area: string; ids: string[]; tot: number }>()
    let esclusi = 0
    for (const t of liberi) {
      const raw = String(t.counterparty ?? t.description ?? '')
      const who = personName(merchant(raw).name || raw).slice(0, 50)
      const c = classifica(String(t.kind), who)
      if (!c) { esclusi++; continue }
      const k = `${c.area}|${c.label}`
      const cur = gruppi.get(k) ?? { who: c.label, area: c.area, ids: [], tot: 0 }
      cur.ids.push(String(t.id)); cur.tot = r2(cur.tot + Math.abs(num(t.amount)))
      gruppi.set(k, cur)
    }

    console.log(`\n── ${mm} ${m.status === 'chiuso' ? '(chiuso)' : ''}`)
    console.log(`   ${finte.length} righe spuntate senza movimento → tornano previsionali`)
    console.log(`   ${liberi.length} uscite vere senza riga → ${gruppi.size} voci nuove`
      + (esclusi ? ` · ${esclusi} verso i soci, non sono costi` : ''))
    Array.from(gruppi.values()).sort((a, b) => b.tot - a.tot).forEach(x =>
      console.log(`     ${x.area.padEnd(22)} ${x.who.slice(0, 30).padEnd(32)} ${eur2(x.tot).padStart(11)} · ${x.ids.length} mov.`))

    if (!APPLY) { unpaid += finte.length; created += gruppi.size; linked += liberi.length; continue }

    for (const c of finte) {
      await fetch(`${URL}/rest/v1/pl_cost_lines?id=eq.${c.id}`, { method: 'PATCH', headers: H,
        body: JSON.stringify({ paid: false, paid_on: null }) })
      unpaid++
    }
    for (const x of Array.from(gruppi.values())) {
      const label = x.ids.length > 1 && !/Commissioni|F24/.test(x.who)
        ? `${x.who} (${x.ids.length} addebiti)` : x.who
      const res = await fetch(`${URL}/rest/v1/pl_cost_lines`, { method: 'POST', headers: H,
        body: JSON.stringify({
          month_id: m.id, center_id: centerId.get(x.area) ?? null, category: x.area,
          label, cost_type: 'V', budget: 0, actual: x.tot, paid: true, vat_applied: false,
          note: `Dai movimenti di banca (§256): ${x.ids.length} addebit${x.ids.length === 1 ? 'o' : 'i'}`,
        }) })
      if (!res.ok) { console.error('   ✗', x.who, await res.text()); continue }
      const id = (await res.json())[0].id
      created++
      for (const txId of x.ids) {
        await fetch(`${URL}/rest/v1/bank_transactions?id=eq.${txId}`, { method: 'PATCH', headers: H,
          body: JSON.stringify({ cost_line_id: id, matched_at: new Date().toISOString() }) })
        linked++
      }
    }
  }
  console.log(`\n${APPLY ? '✓' : '(prova)'} ${unpaid} righe tornate previsionali · ${created} voci create · ${linked} movimenti agganciati`)
  if (!APPLY) console.log('  --apply per scrivere')
}
main().catch(e => { console.error(e); process.exit(1) })
