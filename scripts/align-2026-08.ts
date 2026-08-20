/**
 * §289 — L'allineamento del 20 agosto 2026.
 *
 *   npx tsx scripts/align-2026-08.ts            # dice cosa farebbe, non scrive
 *   npx tsx scripts/align-2026-08.ts --apply    # scrive
 *
 * Gli estratti conto e le fatture entrano dai loro import (`import-bank-csv`,
 * `import-fatture`), che sono idempotenti. Qui restano le cose che un import non
 * può decidere da solo, e ognuna nasce da un fatto verificato sull'estratto conto:
 *
 *  1. **Il giroconto del 4 agosto** ha tutti e due i lati in archivio e nessuno
 *     li ha appaiati: la liquidità totale sembra scesa di 550 € che si sono solo
 *     spostati.
 *  2. **Due spunte gemelle senza un fatto dietro.** La rata ISF «35% alla
 *     consegna» (3.500 €) e la sua lavorazione esterna («35% alla consegna»,
 *     2.450 €) risultano incassata e pagata l'11 agosto. Quel giorno c'è **un**
 *     bonifico in entrata (4.270 €, «fattura n. 44») e **uno** in uscita
 *     (2.989 €, fattura Affinity FPR 10/26), e appartengono tutti e due alle
 *     rate di **luglio**. Della terza tranche non esiste fattura: né emessa né
 *     ricevuta. Si toglie la spunta, non la riga — il lavoro è vero, i soldi no.
 *  3. **Le due spunte di luglio restano, ma diventano certificate**: adesso il
 *     movimento che le dimostra è in archivio e va agganciato, o la §226
 *     continua a contarle fra le dichiarate.
 *  4. **F24 e liquidazione IVA sono usciti davvero.** 877,91 + 9.669,33 =
 *     10.547,24, che è al centesimo il pagamento all'Agenzia delle Entrate del
 *     20 agosto. Erano tutti e due senza data di pagamento.
 *
 * Quello che questo script **non** fa, ed è una scelta: non alloca i tre bonifici
 * cumulativi del 13 e del 20 agosto (compensi ai soci, retribuzioni, collaboratori).
 * Un bonifico che copre più righe per un importo che non combacia con nessuna di
 * esse non si spartisce indovinando: è esattamente il caso che il registro delle
 * allocazioni deve reggere. Finché non c'è, restano da decidere a mano.
 */
import { readFileSync } from 'fs'
import { transferPairs } from '@/lib/bank'
import { eur } from '@/lib/money'

const APPLY = process.argv.includes('--apply')

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
    },
  })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.status === 204 ? (null as T) : r.json() as Promise<T>
}

const patch = async (path: string, body: unknown, what: string) => {
  console.log(`   ${APPLY ? '→' : '·'} ${what}`)
  if (APPLY) await api(path, { method: 'PATCH', body: JSON.stringify(body) })
}

const line = (c = '─') => console.log(c.repeat(78))

async function main() {
  console.log(`\n${APPLY ? 'ALLINEAMENTO — scrivo' : 'ALLINEAMENTO — anteprima, non scrivo niente'}\n`)

  /* ── 1 · i due lati del giroconto ─────────────────────────────────────────── */
  line('═')
  console.log('1 · GIROCONTI SPAIATI')
  line()
  const soli = await api<{ id: string; account_id: string; booked_on: string; amount: number }[]>(
    'bank_transactions?select=id,account_id,booked_on,amount&kind=eq.giroconto&transfer_pair_id=is.null')
  const coppie = transferPairs(soli)
  if (!coppie.length) console.log('   nessuna coppia da fare')
  for (const { out, in: entrata } of coppie) {
    await patch(`bank_transactions?id=eq.${out.id}`,
      { transfer_pair_id: entrata.id, transfer_account_id: entrata.account_id, no_match_needed: true },
      `${out.booked_on} ${eur(out.amount)} ↔ ${eur(entrata.amount)}: appaiati`)
    await patch(`bank_transactions?id=eq.${entrata.id}`,
      { transfer_pair_id: out.id, transfer_account_id: out.account_id, no_match_needed: true },
      `e il lato in entrata punta al suo`)
  }
  console.log(`   ${soli.length - coppie.length * 2} lati restano soli`)

  /* ── 2 · le spunte senza un fatto dietro ──────────────────────────────────── */
  line('═')
  console.log('2 · SPUNTE SENZA UN MOVIMENTO CHE LE DIMOSTRI')
  line()
  const mesi = await api<{ id: string; month: string; status: string }[]>('pl_months?select=id,month,status')
  const agosto = mesi.find(m => m.month === '2026-08-01')!
  if (agosto.status !== 'aperto') throw new Error('agosto non è aperto: fermati e guarda')

  const rev = await api<{ id: string; label: string; amount_net: number; paid: boolean; paid_on: string | null }[]>(
    `pl_revenue_lines?select=id,label,amount_net,paid,paid_on&month_id=eq.${agosto.id}&paid=eq.true`)
  for (const r of rev) {
    const txs = await api<{ id: string }[]>(`bank_transactions?select=id&revenue_line_id=eq.${r.id}&source=eq.banca`)
    if (txs.length) { console.log(`   ✓ ${r.label.slice(0, 46)} — certificata da un movimento`); continue }
    await patch(`pl_revenue_lines?id=eq.${r.id}`, { paid: false, paid_on: null },
      `spunta tolta: ${r.label.slice(0, 44)} ${eur(r.amount_net)} (nessun bonifico, nessuna fattura emessa)`)
  }

  const cost = await api<{ id: string; label: string; actual: number | null; budget: number; paid: boolean }[]>(
    `pl_cost_lines?select=id,label,actual,budget,paid&month_id=eq.${agosto.id}&paid=eq.true&project_id=not.is.null`)
  for (const c of cost) {
    const txs = await api<{ id: string }[]>(`bank_transactions?select=id&cost_line_id=eq.${c.id}&source=eq.banca`)
    if (txs.length) { console.log(`   ✓ ${c.label.slice(0, 46)} — certificata`); continue }
    await patch(`pl_cost_lines?id=eq.${c.id}`, { paid: false, paid_on: null },
      `spunta tolta: ${c.label.slice(0, 44)} ${eur(Number(c.actual ?? c.budget))} (fattura del fornitore mai ricevuta)`)
  }

  /* ── 3 · i movimenti dell'11 agosto sulle righe che pagano ────────────────── */
  line('═')
  console.log('3 · I DUE PAGAMENTI DELL\'11 AGOSTO SULLE LORO RIGHE')
  line()
  const luglio = mesi.find(m => m.month === '2026-07-01')!
  const daPagare = await api<{ id: string; label: string; actual: number | null; budget: number }[]>(
    `pl_cost_lines?select=id,label,actual,budget&month_id=eq.${luglio.id}&project_id=not.is.null`)
  /* lordo del movimento contro imponibile della riga: l'IVA transita dal conto */
  const link: { tx: string; importo: number; match: (l: string) => boolean }[] = [
    { tx: '439ba703', importo: -2989, match: l => /ISF — 35% al 50%/.test(l) },
    { tx: 'e6cb7126', importo: -3260, match: l => /CRM — Rata 1/.test(l) },
  ]
  for (const l of link) {
    const tx = await api<{ id: string; description: string; cost_line_id: string | null }[]>(
      `bank_transactions?select=id,description,cost_line_id&amount=eq.${l.importo}&booked_on=eq.2026-08-11`)
    const riga = daPagare.find(r => l.match(r.label))
    if (!tx.length || !riga) { console.log(`   ⚠ non trovo ${l.importo}: salto`); continue }
    if (tx[0].cost_line_id) { console.log(`   ✓ ${eur(l.importo)} già agganciato`); continue }
    await patch(`bank_transactions?id=eq.${tx[0].id}`, { cost_line_id: riga.id, matched_at: new Date().toISOString() },
      `${eur(l.importo)} → «${riga.label.slice(0, 40)}» (${eur(Number(riga.actual ?? riga.budget))} + IVA)`)
  }

  /* ── 4 · F24 e IVA: usciti il 20 agosto ───────────────────────────────────── */
  line('═')
  console.log('4 · F24 E LIQUIDAZIONE IVA')
  line()
  const f24 = await api<{ id: string; month: string; total: number; paid_on: string | null }[]>(
    'hr_f24?select=id,month,total,paid_on&month=eq.2026-07-01')
  const iva = await api<{ id: string; year: number; quarter: number; to_pay: number; paid_on: string | null }[]>(
    'vat_settlements?select=id,year,quarter,to_pay,paid_on&year=eq.2026&quarter=eq.2')
  const somma = Number(f24[0]?.total ?? 0) + Number(iva[0]?.to_pay ?? 0)
  const mov = await api<{ amount: number }[]>(
    'bank_transactions?select=amount&booked_on=eq.2026-08-20&kind=eq.imposta')
  const uscito = Math.abs(mov.reduce((s, m) => s + Number(m.amount), 0))
  console.log(`   F24 luglio ${eur(Number(f24[0]?.total ?? 0))} + IVA 2º trim. ${eur(Number(iva[0]?.to_pay ?? 0))} = ${eur(somma)}`)
  console.log(`   pagamento all'Agenzia delle Entrate del 20/08: ${eur(uscito)}`)
  if (Math.abs(somma - uscito) > 0.01) {
    console.log('   ⚠ non combaciano: non scrivo la data')
  } else {
    if (f24[0] && !f24[0].paid_on) await patch(`hr_f24?id=eq.${f24[0].id}`, { paid_on: '2026-08-20' }, 'F24 luglio: pagato il 2026-08-20')
    if (iva[0] && !iva[0].paid_on) await patch(`vat_settlements?id=eq.${iva[0].id}`, { paid_on: '2026-08-20' }, 'IVA 2º trimestre: versata il 2026-08-20')
  }

  line('═')
  console.log(APPLY ? '\nFatto. Rilancia gli script di verifica.\n' : '\nAnteprima. Rilancia con --apply per scrivere.\n')
}

main().catch(e => { console.error(e.message); process.exit(1) })
