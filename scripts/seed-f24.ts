/**
 * §301 — Trascrive i due modelli F24 veri e li aggancia ai loro movimenti.
 *
 *   npx tsx scripts/seed-f24.ts            # dice cosa farebbe
 *   npx tsx scripts/seed-f24.ts --apply    # scrive
 *
 * Due modelli, e la differenza fra loro è il motivo per cui il documento serve:
 *
 *   · **16 luglio, 941,42 €** — solo costo del lavoro: ritenute di giugno, il
 *     credito dell'indennità L. 207/2024 che rientra, i contributi INPS. Nessuna
 *     IVA, perché il 1º trimestre scadeva il 16 maggio.
 *   · **20 agosto, 10.547,24 €** — due mondi nello stesso foglio: 9.669,33 di
 *     IVA del 2º trimestre (cod. 6032) più 877,91 di ritenute e contributi di
 *     luglio. È il movimento che nessuna riga del tool poteva spiegare, perché
 *     nessuna valeva quella cifra.
 *
 * Da qui la voce «Amministrazione» del conto economico può **scorporare l'IVA**:
 * dei 10.547,24 solo 877,91 sono un costo, il resto è un debito che si estingue
 * e non era nostro nemmeno il giorno prima (§225).
 */
import { readFileSync } from 'fs'
import { eur2 } from '@/lib/money'
import { check, split, type F24Doc, type F24Line } from '@/lib/f24'

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
const line = (c = '─') => console.log(c.repeat(78))

const l = (codice: string, kind: F24Line['kind'], amount: number, label: string, period: string): F24Line =>
  ({ codice, kind, amount, label, period })

const MODELLI: (F24Doc & { movimento: number; quando: string })[] = [
  {
    dueDate: '2026-07-16', paidOn: '2026-07-17', total: 941.42,
    docRef: 'F24 16/07/2026', movimento: -941.42, quando: '2026-07-17',
    lines: [
      l('1001', 'ritenute', 246.46, 'Ritenute su redditi di lavoro dipendente', '2026-06-01'),
      l('1701', 'credito', 107.04, 'Indennità L. 207/2024 recuperata', '2026-06-01'),
      l('DM10', 'inps', 802, 'Contributi INPS', '2026-06-01'),
    ],
  },
  {
    dueDate: '2026-08-20', paidOn: '2026-08-20', total: 10547.24,
    docRef: 'F24 20/08/2026', movimento: -10547.24, quando: '2026-08-20',
    lines: [
      l('6032', 'iva', 9669.33, 'IVA 2º trimestre 2026', '2026-06-01'),
      l('1001', 'ritenute', 239.48, 'Ritenute su redditi di lavoro dipendente', '2026-07-01'),
      l('1701', 'credito', 217.57, 'Indennità L. 207/2024 recuperata', '2026-07-01'),
      l('DM10', 'inps', 856, 'Contributi INPS', '2026-07-01'),
    ],
  },
]

async function main() {
  console.log(`\n${APPLY ? 'TRASCRIVO' : 'ANTEPRIMA — non scrivo niente'}\n`)

  try { await api('f24_documents?select=id&limit=1') }
  catch {
    console.log('La 215 non è ancora eseguita: i modelli non hanno un posto dove stare.\n')
    return
  }

  const [vat, hr] = await Promise.all([
    api<{ id: string; year: number; quarter: number }[]>('vat_settlements?select=id,year,quarter'),
    api<{ id: string; month: string }[]>('hr_f24?select=id,month'),
  ])

  for (const m of MODELLI) {
    line('═')
    console.log(`${m.docRef} · versato il ${m.paidOn}`)
    line()

    const c = check(m)
    if (!c.ok) { console.log(`   ✗ ${c.why}`); continue }
    const s = split(m.lines)
    for (const x of m.lines) {
      console.log(`   ${x.kind === 'credito' ? '−' : ' '}${eur2(x.amount).padStart(11)}`
        + `  ${x.codice.padEnd(6)} ${x.label.slice(0, 44)}`)
    }
    console.log(`   ${'─'.repeat(60)}`)
    console.log(`   ${eur2(m.total).padStart(12)}  versati · IVA ${eur2(s.vat)} · costo del lavoro ${eur2(s.payroll)}`)

    const esiste = await api<{ id: string }[]>(
      `f24_documents?select=id&due_date=eq.${m.dueDate}&total=eq.${m.total}`)
    if (esiste.length) { console.log('   già trascritto: non tocco niente'); continue }

    if (!APPLY) { console.log('   · da trascrivere'); continue }

    const [head] = await api<{ id: string }[]>('f24_documents', {
      method: 'POST',
      body: JSON.stringify([{
        due_date: m.dueDate, paid_on: m.paidOn, total: m.total, doc_ref: m.docRef,
        note: 'Trascritto dal modello (§301)',
      }]),
    })

    /* Il legame lo decide **il periodo del tributo**, non quello del versamento:
       l'IVA versata il 20 agosto è quella del 2º trimestre. Confonderli
       attaccherebbe il modello al trimestre sbagliato. */
    await api('f24_lines', {
      method: 'POST',
      body: JSON.stringify(m.lines.map(x => {
        const q = x.kind === 'iva' && x.period
          ? vat.find(v => v.year === Number(x.period!.slice(0, 4))
              && v.quarter === Math.floor((Number(x.period!.slice(5, 7)) - 1) / 3) + 1)
          : null
        const h = x.kind !== 'iva' && x.period
          ? hr.find(v => v.month.slice(0, 7) === x.period!.slice(0, 7))
          : null
        return {
          doc_id: head.id, codice: x.codice, label: x.label, kind: x.kind,
          amount: x.amount, period: x.period,
          vat_settlement_id: q?.id ?? null, hr_f24_id: h?.id ?? null,
        }
      })),
    })
    console.log(`   → trascritto, ${m.lines.length} tributi`)

    // il movimento che l'ha pagato: da qui il ponte sa cos'era
    const tx = await api<{ id: string }[]>(
      `bank_transactions?select=id&booked_on=eq.${m.quando}&amount=eq.${m.movimento}`)
    if (tx.length !== 1) {
      console.log(`   ⚠ atteso 1 movimento da ${eur2(m.movimento)} il ${m.quando}, trovati ${tx.length}`)
      continue
    }
    const gia = await api<{ id: string }[]>(`payment_allocations?select=id&tx_id=eq.${tx[0].id}`)
    if (gia.length) { console.log('   movimento già allocato'); continue }
    await api('payment_allocations', {
      method: 'POST',
      body: JSON.stringify([{
        tx_id: tx[0].id, f24_id: head.id, amount: m.total,
        evidence: 'certificata', note: 'Allocazione §301: versamento del modello F24',
      }]),
    })
    console.log(`   → ${eur2(m.total)} allocati al movimento del ${m.quando}`)
  }

  line('═')
  console.log(APPLY ? '\nFatto. Rilancia verify-bank.\n' : '\nRilancia con --apply per scrivere.\n')
}

main().catch(e => { console.error(e.message); process.exit(1) })
