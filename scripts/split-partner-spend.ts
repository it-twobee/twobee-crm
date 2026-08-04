/**
 * Divide fra i soci le spese personali di un mese, già uscite dal conto.
 *
 *   npx tsx scripts/split-partner-spend.ts 2026-07-01 [--dry]
 *
 * **Da usare solo per l'erogato.** Una cena aziendale con un cliente, il pieno per
 * andarci, la carta per la stampante sono costi della **società**: attribuirli a un
 * socio gli abbasserebbe il compenso per un lavoro fatto per l'azienda. Quelli si
 * portano dentro col pulsante «Porta nel conto economico» in Banca, che li
 * registra come spese fuori piano e non tocca le quote di nessuno.
 *
 * Questo script serve al caso opposto: la quota personale di un socio uscita da un
 * conto che non è il suo sottoconto — perché il sottoconto non esisteva ancora, o
 * perché ha pagato lui per tutti e tre.
 *
 * Divide in parti uguali fra i soci attivi, raggruppa per famiglia di spesa —
 * che è il livello a cui cambia il trattamento fiscale — e marca i movimenti come
 * ripartiti invece di agganciarli a una riga sola: `cost_line_id` è un legame
 * uno-a-uno, e puntarne uno di tre direbbe una cosa falsa.
 */
import { readFileSync } from 'fs'
import { treatment, FAMILY_LABEL, CHECK_FAMILIES, type SpendFamily } from '@/lib/bank-import'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = {
  apikey: KEY, Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json', Prefer: 'return=representation',
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: H })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.status === 204 ? ([] as unknown as T) : (r.json() as Promise<T>)
}
const r2 = (n: number) => Math.round(n * 100) / 100
const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  const month = process.argv[2]
  const dry = process.argv.includes('--dry')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(month ?? '')) {
    throw new Error('uso: npx tsx scripts/split-partner-spend.ts 2026-07-01 [--dry]')
  }
  const first = `${month.slice(0, 7)}-01`
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  const to = `${month.slice(0, 7)}-${String(last.getDate()).padStart(2, '0')}`

  const [mesi, soci, centri] = await Promise.all([
    api<{ id: string }[]>(`pl_months?select=id&month=eq.${first}`),
    api<{ id: string; label: string }[]>('pl_partners?select=id,label&is_active=eq.true&order=sort_order'),
    api<{ id: string }[]>('cost_centers?select=id&name=ilike.Spese%20soci'),
  ])
  if (!mesi.length) throw new Error(`il mese ${first} non è aperto nel conto economico`)
  if (!soci.length) throw new Error('nessun socio attivo')
  const monthId = mesi[0].id
  const centerId = centri[0]?.id ?? null
  if (!centerId) console.log('⚠ area «Spese soci» assente: le righe restano senza area')

  const txs = await api<{
    id: string; amount: number; counterparty: string | null; description: string; booked_on: string
  }[]>(`bank_transactions?select=id,amount,counterparty,description,booked_on`
    + `&booked_on=gte.${first}&booked_on=lte.${to}&amount=lt.0&kind=neq.giroconto`)

  // solo le famiglie che chiedono un nome sopra: ads e software sono della società
  const mie = txs.filter(t => CHECK_FAMILIES.includes(treatment(t.counterparty ?? t.description).family))
  if (!mie.length) { console.log('\nNessuna spesa da attribuire in questo mese.\n'); return }

  const groups = new Map<string, {
    partner: { id: string; label: string }; family: SpendFamily
    total: number; count: number; cost: number; vat: number; why: string
  }>()
  for (const t of mie) {
    const tr = treatment(t.counterparty ?? t.description)
    const importo = Math.abs(Number(t.amount))
    const quota = r2(importo / soci.length)
    soci.forEach((p, i) => {
      // l'ultimo assorbe l'arrotondamento: 91,00 su tre non fa tre volte 30,33
      const share = i === soci.length - 1 ? r2(importo - quota * (soci.length - 1)) : quota
      const key = `${p.id}|${tr.family}`
      const cur = groups.get(key)
        ?? { partner: p, family: tr.family, total: 0, count: 0, cost: tr.cost, vat: tr.vat, why: tr.why }
      cur.total = r2(cur.total + share)
      cur.count += 1
      groups.set(key, cur)
    })
  }

  const esistenti = await api<{ id: string; label: string }[]>(
    `pl_cost_lines?select=id,label&month_id=eq.${monthId}&partner_id=not.is.null`)
  const have = new Map(esistenti.map(r => [r.label, r.id]))

  console.log(`\n${mie.length} spese da attribuire in ${first}, divise fra ${soci.map(s => s.label).join(', ')}\n`)
  let totale = 0
  for (const key of Array.from(groups.keys()).sort()) {
    const g = groups.get(key)!
    const label = `${g.partner.label} · ${FAMILY_LABEL[g.family]}`
    totale += g.total
    const dedotto = r2(g.total * g.cost)
    console.log(`  ${label.padEnd(38)} ${eur(g.total).padStart(9)}`
      + `  deducibile ${(g.cost * 100).toFixed(0).padStart(3)}% = ${eur(dedotto).padStart(8)}`
      + `  ${have.has(label) ? '(aggiorna)' : '(nuova)'}`)
    if (dry) continue

    const row = {
      month_id: monthId, center_id: centerId, partner_id: g.partner.id,
      category: 'Spese soci', label, cost_type: 'V',
      budget: g.total, actual: g.total, paid: true,
      vat_applied: g.vat > 0, vat_rate: 0.22,
      deductible_pct: g.cost, vat_deductible_pct: g.vat,
      note: `Quota di ${g.count} spese divise fra ${soci.map(s => s.label).join(', ')}. ${g.why}`,
    }
    const id = have.get(label)
    if (id) {
      await api(`pl_cost_lines?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({
        actual: g.total, budget: g.total, note: row.note }) })
    } else {
      await api('pl_cost_lines', { method: 'POST', body: JSON.stringify(row) })
    }
  }

  if (!dry) {
    await api(`bank_transactions?id=in.(${mie.map(t => t.id).join(',')})`, {
      method: 'PATCH',
      body: JSON.stringify({ no_match_needed: true, note: `Divisa fra ${soci.map(s => s.label).join(', ')}` }),
    })
  }
  console.log(`\n  ${'TOTALE'.padEnd(38)} ${eur(totale).padStart(9)}`)
  console.log(dry ? '\n(prova: niente scritto)\n' : `\n${mie.length} movimenti marcati come ripartiti.\n`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
