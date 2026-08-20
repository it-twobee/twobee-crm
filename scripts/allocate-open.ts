/**
 * §297 — Chiude col registro i movimenti che un campo solo non poteva spiegare.
 *
 *   npx tsx scripts/allocate-open.ts            # dice cosa farebbe
 *   npx tsx scripts/allocate-open.ts --apply    # scrive
 *
 * Fa **solo** i casi in cui non c'è niente da giudicare, e dichiara gli altri
 * invece di indovinare (§276). Due famiglie:
 *
 *   1. **La fattura copre due mesi.** Il canone di Fatima è 1.500 al mese, la
 *      fattura del 5 maggio è 3.000, e il bonifico del 13 maggio ne paga due.
 *      Il backfill ha potuto allocare solo la riga agganciata; l'altra è ferma a
 *      zero. Si chiude quando resta **una sola** riga possibile di quel cliente,
 *      con esattamente quel lordo: uno a uno in tutti e due i sensi.
 *
 *   2. **Il bonifico a una persona paga due compensi.** A Marco a luglio sono
 *      usciti 3.412 €: 3.191,12 di quota socio più 220,88 di provvigione — la
 *      sua, divisa a metà con Toto, che ne ha presi altrettanti per la ragione
 *      opposta. Un campo solo non può dirlo, ed è per questo che quei due
 *      bonifici sono fra i −6.029 € che il ponte (§199) non spiega.
 *
 * Quello che **non** fa, e per ognuno il perché sta scritto nell'esito: le
 * distinte del 20 agosto (le righe che dovrebbero coprire hanno un importo che
 * non combacia) e il pagamento all'Agenzia delle Entrate (è un F24 con dentro
 * IVA e ritenute: la sua sezione arriva dopo).
 */
import { readFileSync } from 'fs'
import { eur } from '@/lib/money'
import { propose, type AllocTx, type Candidate } from '@/lib/allocations'
import { PERSON_ALIASES } from '@/lib/bank'

const APPLY = process.argv.includes('--apply')
/* §226 — «il nome non basta: decide la classificazione». Alla stessa persona si
   bonifica per ragioni diverse, e i soci **emettono fattura** per il loro
   compenso: a Walter il 7 agosto sono usciti 3.000 € e la sua FPR 29/26 del 6
   agosto è di 3.000 esatti. Quel bonifico può pagare la parcella o la quota, e
   la differenza non si deduce dall'importo. Perciò i compensi si scrivono solo
   con un secondo consenso, esplicito. */
const COMPENSI = process.argv.includes('--compensi')

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
const r2 = (n: number) => Math.round(n * 100) / 100
const line = (c = '─') => console.log(c.repeat(78))

type Alloc = { tx_id: string; amount: number; revenue_line_id: string | null; cost_line_id: string | null; payout_id: string | null }

async function write(rows: Record<string, unknown>[]) {
  if (!APPLY || !rows.length) return
  await api('payment_allocations', { method: 'POST', body: JSON.stringify(rows) })
}

async function main() {
  console.log(`\n${APPLY ? 'ALLOCO' : 'ANTEPRIMA — non scrivo niente'}\n`)

  const [txs, allocs, rev, payouts, clients, months] = await Promise.all([
    api<Record<string, unknown>[]>('bank_transactions?select=*&source=eq.banca&order=booked_on'),
    api<Alloc[]>('payment_allocations?select=tx_id,amount,revenue_line_id,cost_line_id,payout_id'),
    api<Record<string, unknown>[]>('pl_revenue_lines?select=id,client_id,label,amount_net,vat_rate,month_id'),
    api<Record<string, unknown>[]>('pl_payouts?select=id,person_label,kind,amount,due_month,paid'),
    api<Record<string, unknown>[]>('clients?select=id,company_name'),
    api<Record<string, unknown>[]>('pl_months?select=id,month'),
  ])
  const monthOfId = new Map(months.map(m => [String(m.id), String(m.month).slice(0, 10)]))
  const nameOf = new Map(clients.map(c => [String(c.id), String(c.company_name)]))

  const usedTx = (id: string) =>
    r2(allocs.filter(a => a.tx_id === id).reduce((s, a) => s + num(a.amount), 0))
  /* §300 — quello che questo giro ha già proposto conta come allocato, o due
     movimenti trovano la stessa riga scoperta e la coprono due volte. È
     successo: il canone di aprile di Fatima si è preso 1.830 € dal bonifico del
     13 maggio **e** altri 1.830 da quello del 9 giugno, perché `allocs` era la
     fotografia di prima e non si aggiornava mentre si scriveva. */
  const inCorso = new Map<string, number>()
  const usedRev = (id: string) =>
    r2(allocs.filter(a => a.revenue_line_id === id).reduce((s, a) => s + num(a.amount), 0)
      + (inCorso.get(id) ?? 0))
  const usedPayout = (id: string) =>
    r2(allocs.filter(a => a.payout_id === id).reduce((s, a) => s + num(a.amount), 0))
  const grossRev = (r: Record<string, unknown>) => r2(num(r.amount_net) * (1 + num(r.vat_rate)))

  // ── 1 · la fattura che copre due mesi ─────────────────────────────────────
  line('═')
  console.log('1 · UN BONIFICO CHE PAGA DUE MESI DEL CANONE')
  line()
  const nuove: Record<string, unknown>[] = []
  const dubbi: string[] = []

  for (const t of txs.filter(x => num(x.amount) > 0)) {
    const libero = r2(Math.abs(num(t.amount)) - usedTx(String(t.id)))
    if (libero < 1) continue

    /* Il cliente lo dice l'allocazione che il backfill ha già scritto: è la
       parte del bonifico che si sa a chi appartiene, e l'altra metà appartiene
       allo stesso. Dedurlo dal nome sull'estratto conto sarebbe più fragile. */
    const gia = allocs.filter(a => a.tx_id === String(t.id) && a.revenue_line_id)
    const ancora = gia.map(a => rev.find(r => String(r.id) === a.revenue_line_id)).filter(Boolean)
    const clientId = ancora.length === 1 ? String(ancora[0]!.client_id ?? '') : ''
    if (!clientId) {
      dubbi.push(`${String(t.booked_on).slice(0, 10)} ${eur(Math.abs(num(t.amount)))} · `
        + `${libero > 0 ? eur(libero) + ' da spiegare' : ''} — non si sa di quale cliente sia la parte restante`)
      continue
    }

    /* **Un bonifico non può pagare una fattura che non è ancora stata emessa.**
       Senza questo, il canone di maggio di Fatima aveva tre candidate — aprile,
       luglio e agosto — e due delle tre erano nel futuro. Con il vincolo la
       risposta è una, e non è una scelta: è l'unica possibile. */
    const meseTx = `${String(t.booked_on).slice(0, 7)}-01`
    const candidate = rev
      .filter(r => String(r.client_id ?? '') === clientId)
      .filter(r => Math.abs(grossRev(r) - libero) < 0.02)
      .filter(r => usedRev(String(r.id)) < 0.01)
      .filter(r => (monthOfId.get(String(r.month_id)) ?? '9999') <= meseTx)

    if (candidate.length !== 1) {
      dubbi.push(`${String(t.booked_on).slice(0, 10)} ${nameOf.get(clientId) ?? '?'} · `
        + `${eur(libero)} da spiegare — ${candidate.length === 0
          ? 'nessuna riga scoperta con questo lordo'
          : `${candidate.length} righe possibili: la scelta è di una persona`}`)
      continue
    }

    const r = candidate[0]
    console.log(`   ${String(t.booked_on).slice(0, 10)} ${eur(libero).padStart(11)} → `
      + `${(nameOf.get(clientId) ?? '?').padEnd(22)} ${String(r.label).slice(0, 40)}`)
    nuove.push({
      tx_id: t.id, revenue_line_id: r.id, amount: libero,
      evidence: 'certificata', note: 'Allocazione §297: la fattura copriva due mesi',
    })
    inCorso.set(String(r.id), (inCorso.get(String(r.id)) ?? 0) + libero)
  }
  if (!nuove.length) console.log('   nessuno: niente da chiudere qui')

  // ── 2 · il bonifico che paga quota e provvigione ──────────────────────────
  line('═')
  console.log('2 · UN BONIFICO CHE PAGA QUOTA E PROVVIGIONE')
  line()
  const compensi: Record<string, unknown>[] = []

  /* Le persone di `pl_payouts` si riconoscono per **nome**, non per chiave
     (§244): la provvigione porta quella del commerciale e la quota quella del
     socio, e sono due spazi diversi. Il nome è quello che si legge sullo
     schermo, ed è quello che compare sull'estratto conto. */
  /* Un compenso **coperto a metà** resta un candidato per la parte che manca:
     escluderlo appena tocca un euro è il motivo per cui i 220,88 € della
     provvigione di Marco, già pagati a metà dal suo bonifico, non trovavano
     posto in quello di Toto. */
  const daPagare = payouts.filter(p => !p.paid && num(p.amount) - usedPayout(String(p.id)) > 0.01)

  /* **Un bonifico paga i compensi del mese in cui è atteso**, non quelli di un
     altro. Senza il vincolo, il bonifico a Marco del 1º giugno si prendeva le
     quote di agosto e settembre: numeri plausibili, mesi sbagliati. */
  const mese = (iso: string) => `${iso.slice(0, 7)}-01`

  /** il nome canonico nascosto in una descrizione di banca */
  const alias = (desc: string): string | null => {
    for (const [raw, vero] of Object.entries(PERSON_ALIASES)) {
      if (desc.includes(raw)) return vero
    }
    return null
  }

  /* Non si filtra per categoria: i bonifici ai soci di giugno sono classificati
     `finanziamento` e quelli del 13 agosto `pagamento`, perché `classify` legge
     la descrizione e quelle due sono scritte diversamente. Il segnale vero è
     **il nome della persona più il mese**, che non dipende da come la banca ha
     scritto la causale. */
  /* §298 — chi ha già detto «niente da abbinare» ha deciso: il bonifico a
     Walter del 7 agosto è la riconciliazione con GAV Sistemi, non una quota, e
     riproporlo ogni volta è il modo di far riconfermare la stessa cosa finché
     qualcuno sbaglia. */
  for (const t of txs.filter(x => num(x.amount) < 0 && x.no_match_needed !== true)) {
    const libero = r2(Math.abs(num(t.amount)) - usedTx(String(t.id)))
    if (libero < 1) continue
    const desc = String(t.description ?? '').toLowerCase()

    const mie = daPagare.filter(p => String(p.due_month).slice(0, 10) === mese(String(t.booked_on)))
      .filter(p => {
        /* Il nome sull'estratto conto e quello nel piano compensi non sono lo
           stesso: la banca scrive «salvatore piacente», `pl_partners` dice
           «Toto». `PERSON_ALIASES` (§226) è la mappa, ed è già l'unica: senza,
           il bonifico a Marco si allocava e il gemello di Toto no. */
        const chi = alias(desc)
        if (chi && chi === String(p.person_label)) return true
        const parole = String(p.person_label).toLowerCase().split(/\s+/).filter(w => w.length > 3)
        return parole.length > 0 && parole.every(w => desc.includes(w))
      })
    if (!mie.length) continue

    const scelte: Candidate[] = mie
      .sort((a, b) => num(b.amount) - num(a.amount))
      .map(p => ({
        target: 'compenso' as const, targetId: String(p.id),
        label: `${p.person_label} · ${p.kind}`,
        remaining: r2(num(p.amount) - usedPayout(String(p.id))),
      }))
    const tx: AllocTx = { id: String(t.id), amount: num(t.amount), source: 'banca' }
    const p = propose(tx, [], scelte)

    console.log(`   ${String(t.booked_on).slice(0, 10)} ${eur(libero).padStart(11)} — ${mie.length} compensi`)
    for (const d of p.drafts) {
      const c = scelte.find(x => x.targetId === d.targetId)!
      console.log(`      ${eur(d.amount).padStart(11)} → ${c.label}`
        + (d.amount < c.remaining - 0.01 ? `  (su ${eur(c.remaining)}: ne restano ${eur(c.remaining - d.amount)})` : ''))
      compensi.push({
        tx_id: t.id, payout_id: d.targetId, amount: d.amount,
        evidence: 'certificata', note: 'Allocazione §297: un bonifico, due compensi',
      })
    }
    if (p.leftover > 0.01) console.log(`      ${eur(p.leftover).padStart(11)} restano non allocati`)
    for (const s of p.short) console.log(`      · ${s.label}: mancano ancora ${eur(s.missing)}`)
  }
  if (!compensi.length) console.log('   nessuno: niente da chiudere qui')

  // ── 3 · quello che resta, e perché ────────────────────────────────────────
  line('═')
  console.log('3 · QUELLO CHE RESTA A UNA PERSONA')
  line()
  for (const d of dubbi) console.log(`   ⚠ ${d}`)
  const grossi = txs.filter(t => num(t.amount) < -1000
    && r2(Math.abs(num(t.amount)) - usedTx(String(t.id))) > 1
    && !compensi.some(c => c.tx_id === t.id))
  for (const t of grossi) {
    console.log(`   ⚠ ${String(t.booked_on).slice(0, 10)} ${eur(Math.abs(num(t.amount)))}`
      + ` · ${String(t.description).slice(0, 52)}`)
  }

  await write(nuove)
  if (COMPENSI) await write(compensi)

  line('═')
  const tot = nuove.reduce((s, r) => s + num(r.amount), 0)
  const totC = compensi.reduce((s, r) => s + num(r.amount), 0)
  console.log()
  if (APPLY) {
    console.log(`Scritte ${nuove.length} allocazioni sui canoni per ${eur(tot)}.`)
    console.log(COMPENSI
      ? `E ${compensi.length} sui compensi per ${eur(totC)}.`
      : `I ${compensi.length} compensi per ${eur(totC)} NON sono stati scritti: aggiungi --compensi`
        + ' se hai verificato che quei bonifici pagano la quota e non una fattura del socio.')
  } else {
    console.log(`${nuove.length} allocazioni sui canoni per ${eur(tot)} · --apply per scriverle.`)
    console.log(`${compensi.length} sui compensi per ${eur(totC)} · servono --apply e --compensi,`)
    console.log('perché un bonifico a un socio può pagare la sua parcella invece della quota (§226).')
  }
  console.log()
}

main().catch(e => { console.error(e.message); process.exit(1) })
