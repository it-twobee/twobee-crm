/**
 * §286 — «Prepara i compensi», da riga di comando.
 *
 *   npx tsx scripts/prepare-payouts.ts 2026-07-01           # dice cosa scriverebbe
 *   npx tsx scripts/prepare-payouts.ts 2026-07-01 --apply   # scrive
 *   npx tsx scripts/prepare-payouts.ts 2026-07-01 --date 2026-08-13 --apply
 *
 * Chiama `syncPayouts`, che è **lo stesso motore del pulsante**: non c'è una
 * seconda copia della regola, e quindi non c'è un secondo numero. Serve quando
 * il mese va riallineato dopo una correzione dei dati — l'importo delle righe
 * si copia quando si prepara (§243) e non si aggiorna da sé.
 *
 * Quello che è già uscito non si tocca: una riga **pagata** è un fatto, una
 * **decisa a mano** (§251) è una decisione.
 */
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

const eur = (n: number) =>
  `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const gg = (iso: string) => iso.split('-').reverse().join('/')

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { loadWindow, syncPayouts, partnerKey, ownerKey } = await import('@/lib/payouts-plan')

  const month = (process.argv[2] ?? '2026-07-01').slice(0, 7) + '-01'
  const apply = process.argv.includes('--apply')
  const iDate = process.argv.indexOf('--date')
  const forced = iDate > 0 ? process.argv[iDate + 1] : null
  const db = createAdminClient()

  /* §286 — la data dell'erogazione **cambia la base**: entra o esce quello che
     è stato incassato in mezzo. Si scrive prima di calcolare, o si calcolerebbe
     su una finestra e si scriverebbe su un'altra. */
  if (forced && apply) {
    const { data: row } = await db.from('pl_months').select('id').eq('month', month).maybeSingle()
    if (!row) throw new Error(`Il mese ${month} non esiste`)
    await db.from('pl_months').update({ payout_date: forced.slice(0, 10) }).eq('id', row.id)
  }

  const { w, t, monthRow, summary } = await loadWindow(db, month)
  const { data: existing } = await db.from('pl_payouts')
    .select('id, person_key, person_label, kind, amount, paid, paid_on, note')
    .eq('month_id', monthRow.id)
  const cur = new Map((existing ?? []).map((r: Record<string, unknown>) =>
    [`${r.person_key}|${r.kind}`, r as {
      person_label: string | null
      amount: number; paid: boolean; paid_on: string | null; note: string | null
    }]))

  console.log(`\n${'═'.repeat(72)}`)
  console.log(`COMPENSI DI ${month} — erogazione del ${gg(w.date)}`)
  console.log('═'.repeat(72))
  console.log(`  base: ${eur(summary.taken.amount)} su ${summary.taken.n} righe`
    + (summary.open.n ? ` · fuori ${eur(summary.open.amount)} non ancora incassati` : ''))
  console.log(`  i soldi escono ${w.dueMonth.slice(0, 7)}\n`)

  const righe = [
    ...t.perPartner.filter(p => p.total > 0.005).map(p => ({
      key: `${partnerKey(p.partner.id)}|socio`, who: p.partner.label,
      kind: 'socio', amount: Math.round(p.total * 100) / 100,
    })),
    ...t.salesByOwner.filter(s => s.amount > 0.005).map(s => ({
      key: `${ownerKey(s.label)}|commerciale`, who: s.label,
      kind: 'commerciale', amount: Math.round(s.amount * 100) / 100,
    })),
  ]

  for (const r of righe) {
    const old = cur.get(r.key)
    const bloccata = old?.paid ? 'PAGATA, non si tocca'
      : old?.note?.startsWith('Deciso a mano') ? 'decisa a mano, non si tocca' : null
    const delta = old && !bloccata ? r.amount - Number(old.amount) : null
    console.log(`  ${r.who.padEnd(20)} ${r.kind.padEnd(12)} ${eur(r.amount).padStart(12)}`
      + (bloccata ? `   ← ${bloccata} (${eur(Number(old!.amount))})`
        : delta === null ? '   ← nuova'
        : Math.abs(delta) < 0.005 ? '   invariata'
        : `   ← era ${eur(Number(old!.amount))} (${delta > 0 ? '+' : ''}${eur(delta)})`))
  }

  const keep = new Set(righe.map(r => r.key))
  for (const [k, o] of Array.from(cur.entries())) {
    if (keep.has(k) || o.paid || o.note?.startsWith('Deciso a mano')) continue
    console.log(`  ${String(o.person_label ?? k).padEnd(20)} ${'—'.padEnd(12)} ${eur(Number(o.amount)).padStart(12)}   ← non matura più: sparisce`)
  }

  const totale = righe.reduce((s, r) => s + r.amount, 0)
  console.log(`\n  ${'TOTALE'.padEnd(20)} ${''.padEnd(12)} ${eur(totale).padStart(12)}`)

  if (!apply) {
    console.log('\n  Sola lettura. Rilancia con --apply per scrivere.\n')
    return
  }
  const out = await syncPayouts(db, month)
  console.log(`\n  ✓ ${out.righe} righe allineate · ${eur(out.totale)} · erogazione del ${gg(out.data)}\n`)
}

main().catch(e => { console.error('\n✗', e instanceof Error ? e.message : e, '\n'); process.exit(1) })
