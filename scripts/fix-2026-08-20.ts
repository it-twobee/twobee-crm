/**
 * §298 — Le distinte del 20 agosto, e la busta di giugno rimasta in luglio.
 *
 *   npx tsx scripts/fix-2026-08-20.ts            # dice cosa farebbe
 *   npx tsx scripts/fix-2026-08-20.ts --apply    # scrive
 *
 * Tre cose confermate guardando l'estratto conto, e ognuna nasce da un numero
 * che il registro delle allocazioni (§297) ha messo accanto al suo movimento:
 *
 *  1. **La riga di luglio del personale porta la busta di giugno.** Dice 3.868 €
 *     — che è esattamente quello che era uscito il 17 luglio per le retribuzioni
 *     di giugno — mentre la distinta del 20 agosto, che paga luglio, è di
 *     **4.077 €**. Il mese è stato preparato copiando quello prima, e nessuno se
 *     n'è accorto perché senza il movimento accanto 3.868 è un numero
 *     plausibile. Da qui il costo del lavoro di luglio è sottostimato di 209 €.
 *
 *  2. **Il bonifico a Walter del 7 agosto non è un compenso.** È la
 *     riconciliazione con GAV Sistemi — giro di fatture fra società collegate,
 *     fuori dalle statistiche (§226) — e contarlo come quota gli avrebbe chiuso
 *     uno scoperto che invece esiste. Si marca «niente da abbinare» col perché
 *     scritto, o ogni proposta automatica lo ripesca.
 *
 *  3. **La distinta di 4.077 € si alloca sulla riga corretta**, e da lì la riga
 *     risulta pagata perché il registro la copre — non perché qualcuno ha
 *     spuntato una casella.
 *
 * Quello che resta fuori è la seconda distinta, 2.854 €: sono Gabriele 1.300 più
 * Annalisa, ma le sue due fatture sono 1.530 (FPR 8/26, 15/06–15/07) e 1.554
 * (FPR 9/26, 15/07–15/08), e la riga di luglio porta 1.530 mentre l'importo
 * uscito combacia con 1.554. Quale delle due paga quella distinta è una domanda
 * che il tool non può risolvere: 1.300 + 1.530 fa 2.830, non 2.854.
 */
import { readFileSync } from 'fs'
import { eur } from '@/lib/money'

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

async function main() {
  console.log(`\n${APPLY ? 'CORREGGO' : 'ANTEPRIMA — non scrivo niente'}\n`)

  const months = await api<{ id: string; month: string; status: string }[]>('pl_months?select=id,month,status')
  const luglio = months.find(m => m.month === '2026-07-01')
  if (!luglio) throw new Error('luglio non esiste')
  if (luglio.status === 'chiuso') throw new Error('luglio è chiuso: riaprilo prima, è una fotografia')

  // ── 1 · la busta di giugno rimasta in luglio ──────────────────────────────
  line('═')
  console.log('1 · LA RIGA DI LUGLIO PORTA LA BUSTA DI GIUGNO')
  line()
  const righe = await api<{ id: string; label: string; actual: number; budget: number; vat_applied: boolean; vat_rate: number }[]>(
    `pl_cost_lines?select=id,label,actual,budget,vat_applied,vat_rate&month_id=eq.${luglio.id}&label=like.*Beneficiari*`)
  if (righe.length !== 1) throw new Error(`attese 1 riga «Beneficiari», trovate ${righe.length}`)
  const riga = righe[0]

  const tx = await api<{ id: string; amount: number; booked_on: string; description: string; cost_line_id: string | null }[]>(
    'bank_transactions?select=id,amount,booked_on,description,cost_line_id&booked_on=eq.2026-08-20&amount=eq.-4077')
  if (tx.length !== 1) throw new Error(`atteso 1 bonifico da 4.077 il 20/08, trovati ${tx.length}`)
  const distinta = tx[0]

  console.log(`   riga «${riga.label}» ${eur(num(riga.actual))} · distinta del 20/08 ${eur(4077)}`)
  await step(`effettivo da ${eur(num(riga.actual))} a ${eur(4077)} (le retribuzioni di luglio, non di giugno)`,
    () => api(`pl_cost_lines?id=eq.${riga.id}`, {
      method: 'PATCH', body: JSON.stringify({ actual: 4077, budget: 4077 }),
    }))

  // ── 2 · l'allocazione, e da lì la spunta ──────────────────────────────────
  line('═')
  console.log('2 · LA DISTINTA SULLA SUA RIGA')
  line()
  const gia = await api<{ id: string }[]>(
    `payment_allocations?select=id&tx_id=eq.${distinta.id}`)
  if (gia.length) {
    console.log('   già allocata: non tocco niente')
  } else {
    await step(`${eur(4077)} → «${riga.label}» · la riga risulta pagata perché il registro la copre`,
      () => api('payment_allocations', {
        method: 'POST',
        body: JSON.stringify([{
          tx_id: distinta.id, cost_line_id: riga.id, amount: 4077,
          evidence: 'certificata',
          note: 'Allocazione §298: distinta delle retribuzioni di luglio',
        }]),
      }))
    await step('e la spunta «pagato» segue il registro',
      () => api(`pl_cost_lines?id=eq.${riga.id}`, {
        method: 'PATCH', body: JSON.stringify({ paid: true, paid_on: '2026-08-20' }),
      }))
  }

  // ── 3 · il bonifico a Walter non è un compenso ────────────────────────────
  line('═')
  console.log('3 · IL BONIFICO A WALTER DEL 7 AGOSTO')
  line()
  const walter = await api<{ id: string; amount: number; no_match_needed: boolean; note: string | null }[]>(
    'bank_transactions?select=id,amount,no_match_needed,note&booked_on=eq.2026-08-07&amount=eq.-3000')
  if (walter.length !== 1) {
    console.log(`   atteso 1 bonifico da 3.000 il 07/08, trovati ${walter.length}: non tocco niente`)
  } else if (walter[0].no_match_needed) {
    console.log('   già marcato: non tocco niente')
  } else {
    await step('marcato «niente da abbinare»: è la riconciliazione con GAV Sistemi, non una quota (§226)',
      () => api(`bank_transactions?id=eq.${walter[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          no_match_needed: true,
          note: 'Riconciliazione con GAV Sistemi — giro fra società collegate, '
            + 'fuori dalle statistiche. Non è un compenso a Walter (§226/§298).',
        }),
      }))
  }

  line('═')
  console.log(APPLY
    ? '\nFatto. Rilancia verify-bank e verify-month su luglio.\n'
    : '\nAnteprima. Rilancia con --apply per scrivere.\n')
}

main().catch(e => { console.error(e.message); process.exit(1) })
