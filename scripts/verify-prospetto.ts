/**
 * Il prospetto, letto dal database. (§312)
 *
 *   npx tsx scripts/verify-prospetto.ts [2026-08-01]
 *
 * Sola lettura, e verifica le due cose che la pagina afferma in testa e in fondo:
 *
 *   1. **il conto del mese** — apertura + entrato − uscito = chiusura, e sul mese
 *      in corso la chiusura deve essere il saldo vero di Banca. Se non lo è, uno
 *      dei due numeri è ricostruito male e la prima risposta della pagina è
 *      sbagliata.
 *   2. **i compensi cumulativi** — maturato contro erogato, persona per persona,
 *      con la linea del consolidato applicata (§230).
 */
import { readFileSync } from 'fs'
import { eur } from '@/lib/money'
import { monthKey, monthLabel } from '@/lib/pl'
import { loadProspetto } from '@/lib/prospetto-load'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), KEY = env.SUPABASE_SERVICE_ROLE_KEY

/* `loadProspetto` vuole un client Supabase e ne usa una fetta sola: `from(t)`
   con `select`. Ricostruirla sopra REST è il modo di far girare **lo stesso**
   caricamento della pagina — uno script che rifà le query a modo suo verifica
   sé stesso, non il codice che gira in pagina (§287). */
const client = {
  from(table: string) {
    const q: string[] = []
    const api = {
      select(cols: string) { q.push(`select=${encodeURIComponent(cols)}`); return api },
      eq(c: string, v: unknown) { q.push(`${c}=eq.${encodeURIComponent(String(v))}`); return api },
      gte(c: string, v: unknown) { q.push(`${c}=gte.${encodeURIComponent(String(v))}`); return api },
      lte(c: string, v: unknown) { q.push(`${c}=lte.${encodeURIComponent(String(v))}`); return api },
      order(c: string, o?: { ascending?: boolean }) {
        q.push(`order=${c}.${o?.ascending === false ? 'desc' : 'asc'}`); return api
      },
      limit(n: number) { q.push(`limit=${n}`); return api },
      /* `maybeSingle` restituisce **una riga**, non un array: dimenticarlo dava
         a `rowToPlConfig` una lista e quindi tutti i valori di default — la
         linea del consolidato sparita e il cumulato contato da sempre. */
      maybeSingle() {
        return api.then(r => ({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }))
      },
      single() {
        return api.then(r => ({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }))
      },
      then(res?: (v: { data: unknown; error: unknown }) => unknown) {
        const p = fetch(`${URL}/rest/v1/${table}?${q.join('&')}`, {
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
        }).then(async r => (r.ok
          ? { data: await r.json(), error: null }
          : { data: null, error: { message: await r.text() } }))
        return res ? p.then(res) : p
      },
    }
    return api
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

async function main() {
  const arg = process.argv[2]
  const month = arg ? monthKey(new Date(arg)) : monthKey(new Date())
  const today = new Date().toISOString().slice(0, 10)
  const d = await loadProspetto(client, month, today)
  if (d.setupNeeded) { console.log('Le tabelle del conto economico non esistono.'); return }

  console.log(`\nPROSPETTO — ${monthLabel(month)}\n${'─'.repeat(70)}`)

  const b = d.bankMonth
  if (!b) {
    console.log('\nNessun conto caricato: la prima sezione non compare.')
  } else {
    const closing = Math.round((b.opening + b.inflow - b.outflow) * 100) / 100
    console.log('\n1 · IL CONTO DEL MESE (solo movimenti veri)')
    console.log(`  partiva da    ${eur(b.opening).padStart(12)}`)
    console.log(`  entrato       ${('+' + eur(b.inflow)).padStart(12)}`)
    console.log(`  uscito        ${('−' + eur(b.outflow)).padStart(12)}`)
    console.log(`  rimane        ${eur(closing).padStart(12)}`)
    console.log(`  estratto conto fino al ${b.lastStatement ?? 'n/d'}`)
    /* Il controllo che rende utile lo script: sul mese in corso la chiusura
       ricostruita e il saldo vero devono essere lo stesso numero. Due cifre
       diverse con lo stesso nome è il difetto che il prospetto aveva prima
       (§265), e si ripresenta appena una delle due si calcola su una finestra. */
    if (month === monthKey(new Date(today)) && d.bank) {
      const scarto = Math.round((closing - d.bank.balance) * 100) / 100
      console.log(`  saldo vero in Banca      ${eur(d.bank.balance).padStart(12)}`
        + (Math.abs(scarto) < 0.01 ? '   ✓ combacia' : `   ✗ scarto ${eur(scarto)}`))
    }
  }

  console.log(`\n2 · COMPENSI CUMULATIVI${d.ledgerSince ? ` (da ${monthLabel(d.ledgerSince)})` : ''}`)
  for (const kind of ['socio', 'commerciale'] as const) {
    const mie = d.ledger.filter(r => r.kind === kind)
    if (!mie.length) continue
    console.log(`  ${kind === 'socio' ? 'Soci' : 'Commerciali'}`)
    for (const r of mie) {
      const open = Math.round((r.accrued - r.paid) * 100) / 100
      console.log(`    ${r.who.padEnd(22)} maturato ${eur(r.accrued).padStart(11)}`
        + ` · erogato ${eur(r.paid).padStart(11)}`
        + ` · ${open <= 0.5 ? 'erogato' : r.never ? `MAI UN BONIFICO ${eur(open)}` : `resta ${eur(open)}`}`
        + (r.fromAlways ? '  (da sempre)' : ''))
    }
    console.log(`    ${'—'.padEnd(22)} maturato ${eur(mie.reduce((n, r) => n + r.accrued, 0)).padStart(11)}`
      + ` · erogato ${eur(mie.reduce((n, r) => n + r.paid, 0)).padStart(11)}`)
  }
  console.log()
}

main().catch(e => { console.error(e); process.exit(1) })
