/**
 * §318 — L'allineamento del 7 settembre 2026.
 *
 *   npx tsx scripts/align-2026-09.ts            # dice cosa farebbe, non scrive
 *   npx tsx scripts/align-2026-09.ts --apply    # scrive
 *
 * Estratto conto e fatture entrano dai loro import (`import-bank-csv`,
 * `import-fatture`), che sono idempotenti. Qui restano le cose che un import non
 * può decidere, e ognuna nasce da un documento verificato:
 *
 *  1. **iCura AI Digital Trainer.** La FPR 55/26 del 31 agosto fattura 20.000 €
 *     di «acconto contrattuale per kick-off» di un progetto che nel tool non
 *     esiste: iCura aveva tre lavori (lead gen, social, sito) e un canone da
 *     3.600. Si crea il progetto, il contratto e la rata, e la riga di agosto
 *     nasce da lì — non a mano, o sarebbe un numero senza provenienza (§194).
 *     **Fondo rischio acceso** (§186): il valore venduto tocca la soglia dei
 *     20.000 e la scelta è dell'admin, riga per riga.
 *
 *  2. **Tre bonifici che le fatture nuove rendono non ambigui.** Seven 7.930 €
 *     del 7/9 è la FPR 53/26; Fatima 3.812,50 € del 7/9 è la FPR 48/26, che
 *     copre **due** righe di agosto (1.982,50 + 1.830 = 3.812,50 al centesimo,
 *     §297); Marietta 1.464 € del 25/8 certifica la spunta che era solo
 *     dichiarata (§226). Prima delle fatture erano tre importi con più righe
 *     possibili, e il tool si rifiutava — giustamente — di indovinare.
 *
 *  3. **Il documento sotto la riga** (§302). Sette righe di agosto avevano la
 *     spunta «fatturata» e nessuna fattura sotto: adesso il documento c'è, e
 *     una riga che porta il numero della fattura è l'unica che regge davanti
 *     all'erario. Comprese le due lavorazioni esterne, che Affinity ha
 *     fatturato il 1º settembre.
 *
 * Quello che questo script **non** fa, ed è una scelta:
 *
 *  · **non apre settembre.** Un mese mai aperto si legge dal contratto e dal
 *    piano (§262), ed è la lettura giusta il 7: le fatture del mese si emettono
 *    a fine mese, e aprirlo adesso significherebbe fotografare un mese vuoto.
 *  · **non tocca l'incasso ISF da 2.196 € del 6 agosto.** Quell'importo torna su
 *    quattro righe di due clienti diversi (Affinity ha lo stesso canone), e
 *    attaccarlo alla sbagliata dichiara incassata una fattura che nessuno ha
 *    pagato — l'errore che poi nessuno va a cercare (§189).
 *  · **non corregge le tre uscite di agosto** che il dialogo dei movimenti sa
 *    già proporre (§303): due Meta Ads da accorpare e un carburante da
 *    aggiungere, 148,91 € in tutto.
 */
import { readFileSync } from 'fs'
import { targetCoverage, type Allocation } from '@/lib/allocations'
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
const post = async <T>(t: string, body: unknown) => (await api<T[]>(t, { method: 'POST', body: JSON.stringify(body) }))[0]
const patch = (t: string, body: unknown) => api(t, { method: 'PATCH', body: JSON.stringify(body) })
const line = (c = '─') => console.log(c.repeat(78))
const say = (s: string) => console.log(`   ${APPLY ? '→' : '·'} ${s}`)

type Row = Record<string, any>

async function main() {
  console.log(`\n${APPLY ? 'ALLINEAMENTO 2026-09-07 — scrivo' : 'ALLINEAMENTO 2026-09-07 — anteprima, non scrivo niente'}\n`)

  const [ago] = await api<Row[]>('pl_months?select=id,month,status&month=eq.2026-08-01')
  if (!ago) throw new Error('agosto non esiste')
  if (ago.status === 'chiuso') throw new Error('agosto è chiuso: riaprilo prima')
  const rev = await api<Row[]>(`pl_revenue_lines?select=*&month_id=eq.${ago.id}`)
  const costs = await api<Row[]>(`pl_cost_lines?select=*&month_id=eq.${ago.id}`)
  const inv = await api<Row[]>('invoices?select=id,number,total,taxable,counterparty_name,issued_on,direction')
  const byNum = (n: string) => inv.find(i => i.number === n)
  const lordo = (r: Row) => Math.round(Number(r.amount_net) * (1 + Number(r.vat_rate)) * 100) / 100

  /* ── 1 · iCura AI Digital Trainer ─────────────────────────────────────────── */
  line('═'); console.log('1 · iCURA AI DIGITAL TRAINER — il progetto che la fattura dichiara'); line()

  const f55 = byNum('FPR 55/26')
  if (!f55) throw new Error('FPR 55/26 non è in archivio: importa prima le fatture')
  const [icura] = await api<Row[]>('clients?select=id,company_name,sales_owner_name&company_name=ilike.*cura*')
  const gemella = rev.find(r => r.client_id === icura.id)   // il canone: da lì commerciale e origine

  const NOME = 'iCura Impresa · Digital · iCura AI Digital Trainer'
  let [prj] = await api<Row[]>(`projects?select=id,name&name=eq.${encodeURIComponent(NOME)}`)
  if (prj) say(`progetto già presente: ${prj.name}`)
  else {
    say(`progetto «${NOME}»`)
    if (APPLY) prj = await post<Row>('projects', {
      client_id: icura.id, name: NOME, area: 'digital',
      service_type: 'digital_transformation', service_subtype: 'custom_application',
      operating_model: 'una_tantum', revenue_model: 'fixed',
      status: 'active', priority: 'alta', visibility: 'internal', start_date: '2026-08-01',
    })
  }

  const ETICHETTA = 'iCura AI Digital Trainer — piattaforma SaaS AI (sicurezza, DVR, formazione)'
  let [stream] = await api<Row[]>(`revenue_streams?select=id,label,amount&label=eq.${encodeURIComponent(ETICHETTA)}`)
  if (stream) say(`contratto già presente: ${eur(stream.amount)}`)
  else {
    say(`contratto digital ${eur(20000)} · attivo dal 2026-08-01 · una tantum`)
    if (APPLY) stream = await post<Row>('revenue_streams', {
      client_id: icura.id, project_id: prj?.id ?? null, label: ETICHETTA,
      kind: 'digital', billing: 'one_off', amount: 20000, vat_rate: 0.22,
      start_date: '2026-08-01', status: 'attivo',
      note: 'Acconto di kick-off fatturato con la FPR 55/26 del 31/08/2026, «imputato al '
        + 'corrispettivo complessivo del progetto». Il corrispettivo totale non è ancora '
        + 'nel tool: quando c\'è, si alza l\'importo e si aggiungono le rate — il valore '
        + 'venduto decide il fondo rischio (§186), e finché è 20.000 la soglia è toccata appena.',
    })
  }

  let [rata] = stream ? await api<Row[]>(`revenue_installments?select=id,amount,due_month&stream_id=eq.${stream.id}`) : [undefined]
  if (rata) say(`rata già presente: ${rata.due_month} ${eur(rata.amount)}`)
  else if (stream) {
    say(`rata «Acconto kick-off» ${eur(20000)} su agosto · fatturata`)
    if (APPLY) rata = await post<Row>('revenue_installments', {
      stream_id: stream.id, due_month: '2026-08-01', label: 'Acconto kick-off',
      amount: 20000, invoiced: true, paid: false, sort_order: 0, invoice_id: f55.id,
    })
  }

  const già = rev.find(r => r.stream_id && stream && r.stream_id === stream.id)
  if (già) say(`riga di agosto già presente: ${eur(già.amount_net)}`)
  else if (stream && rata) {
    say(`riga di agosto ${eur(20000)} · digital · FONDO RISCHIO ACCESO · fattura FPR 55/26`)
    if (APPLY) await post('pl_revenue_lines', {
      month_id: ago.id, client_id: icura.id, project_id: prj?.id ?? null,
      stream_id: stream.id, installment_id: rata.id, invoice_id: f55.id,
      label: 'iCura AI Digital Trainer — Acconto kick-off',
      plan_amount: 20000, amount_net: 20000, vat_rate: 0.22, invoices: 1,
      invoice_sent: true, paid: false, kind: 'digital',
      sales_owner: gemella?.sales_owner ?? icura.sales_owner_name ?? null,
      sales_owner_id: gemella?.sales_owner_id ?? null,
      sales_origin: gemella?.sales_origin ?? 'diretto',
      origin: 'contratto', risk_fund: true, pass_through: false, sort_order: 0,
    })
  }

  /* ── 2 · il documento sotto la riga ───────────────────────────────────────── */
  line('═'); console.log('2 · LA FATTURA SOTTO LA RIGA (§302)'); line()

  const legami: [string, Row | undefined, 'ricavo' | 'costo'][] = [
    ['FPR 53/26', rev.find(r => lordo(r) === 7930), 'ricavo'],
    ['FPR 54/26', rev.find(r => lordo(r) === 4270), 'ricavo'],
    ['FPR 49/26', rev.find(r => lordo(r) === 1464), 'ricavo'],
    ['FPR 48/26', rev.find(r => lordo(r) === 1982.5), 'ricavo'],
    ['FPR 12/26', costs.find(r => /Rata 2 di 6/.test(r.label)), 'costo'],
    ['FPR 13/26', costs.find(r => /35% alla consegna/.test(r.label)), 'costo'],
  ]
  const collegate = new Map<string, Row[]>()
  const f48 = byNum('FPR 48/26')
  const altraFatima = rev.find(r => lordo(r) === 1830)
  if (f48 && altraFatima) legami.push(['FPR 48/26', altraFatima, 'ricavo'])

  for (const [num, riga, kind] of legami) {
    const f = byNum(num)
    if (!f || !riga) { console.log(`   ⚠ ${num}: ${!f ? 'fattura' : 'riga'} non trovata`); continue }
    if (kind === 'ricavo') collegate.set(num, [...(collegate.get(num) ?? []), riga])
    if (riga.invoice_id === f.id) { say(`${num} già collegata a «${riga.label.slice(0, 34)}»`); continue }
    say(`${num} → «${riga.label.slice(0, 40)}»`)
    if (APPLY) await patch(`${kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'}?id=eq.${riga.id}`, { invoice_id: f.id })
  }

  /* ── 3 · i bonifici che le fatture rendono non ambigui ────────────────────── */
  line('═'); console.log('3 · LE ALLOCAZIONI CHE LE FATTURE RISOLVONO (§297)'); line()

  const txs = await api<Row[]>('bank_transactions?select=id,booked_on,amount,counterparty,source,kind&booked_on=gte.2026-08-25&amount=gt.0&order=booked_on')
  const allocs = await api<Row[]>('payment_allocations?select=id,tx_id,amount,evidence,revenue_line_id,cost_line_id,payout_id')
  const toAlloc = (r: Row): Allocation => ({
    id: r.id, txId: r.tx_id, amount: Number(r.amount), evidence: r.evidence,
    target: r.revenue_line_id ? 'ricavo' : r.cost_line_id ? 'costo' : 'compenso',
    targetId: r.revenue_line_id ?? r.cost_line_id ?? r.payout_id,
  })

  /* Le righe di un caso sono quelle che portano **quella fattura** (§302): il
     documento dice chi e quanto, ed è l'unica cosa che distingue le due righe di
     Fatima da qualunque altra dello stesso importo. */
  const perFattura = (num: string) => collegate.get(num) ?? []
  const casi: { quando: string; chi: string; importo: number; fattura: string }[] = [
    { quando: '2026-09-07', chi: 'Seven', importo: 7930, fattura: 'FPR 53/26' },
    { quando: '2026-09-07', chi: 'Leo Fatima', importo: 3812.5, fattura: 'FPR 48/26' },
    { quando: '2026-08-25', chi: 'Marietta', importo: 1464, fattura: 'FPR 49/26' },
  ]

  for (const c of casi) {
    const righe = perFattura(c.fattura)
    const tx = txs.find(t => t.booked_on === c.quando && Number(t.amount) === c.importo && t.source === 'banca')
    if (!tx) { console.log(`   ⚠ ${c.quando} ${eur(c.importo)} ${c.chi}: movimento non trovato`); continue }
    const mie = allocs.filter(a => a.tx_id === tx.id)
    if (mie.length) { say(`${c.quando} ${eur(c.importo)} ${c.chi}: già allocato`); continue }
    const somma = righe.reduce((n, r) => n + lordo(r), 0)
    if (!righe.length || Math.abs(somma - c.importo) > 0.005) {
      console.log(`   ⚠ ${c.quando} ${eur(c.importo)} ${c.chi}: ${righe.length} righe per ${eur(somma)} — non combacia, lascio stare`)
      continue
    }
    say(`${c.quando} ${eur(c.importo)} ${c.chi} → ${righe.length} riga/e: ${righe.map(r => r.label.slice(0, 30)).join(' + ')}`)
    for (const r of righe) {
      // §300 — un fatto spegne la dichiarazione che copriva la stessa riga
      const dich = allocs.filter(a => a.revenue_line_id === r.id && a.evidence === 'dichiarata')
      for (const d of dich) {
        say(`   spengo la dichiarazione da ${eur(d.amount)} su «${r.label.slice(0, 28)}»`)
        if (APPLY) await api(`payment_allocations?id=eq.${d.id}`, { method: 'DELETE' })
      }
      if (APPLY) {
        await post('payment_allocations', {
          tx_id: tx.id, revenue_line_id: r.id, amount: lordo(r), evidence: 'certificata',
        })
        const dopo = (await api<Row[]>(`payment_allocations?select=id,tx_id,amount,evidence,revenue_line_id,cost_line_id,payout_id&revenue_line_id=eq.${r.id}`)).map(toAlloc)
        const cov = targetCoverage(lordo(r), 'ricavo', r.id, dopo)
        await patch(`pl_revenue_lines?id=eq.${r.id}`, { paid: cov.state === 'coperto' })
      }
    }
  }

  /* ── 4 · le spunte che il registro impone ─────────────────────────────────── */
  line('═'); console.log('4 · «PAGATO» SEGUE IL REGISTRO (§297)'); line()

  /* Trovato oggi: `allocate-open` scriveva le allocazioni e **non** allineava
     `paid` — quello lo faceva solo l'azione. Sul bonifico a Walter del 27
     agosto le due allocazioni c'erano e il prospetto diceva «erogato 0»: la
     regola viveva in un percorso e non nell'altro, che è come non averla. Lo
     script è stato corretto; qui si rimette in pari quello che era rimasto
     indietro. */
  const tuttePayout = await api<Row[]>('payment_allocations?select=id,tx_id,amount,evidence,revenue_line_id,cost_line_id,payout_id&payout_id=not.is.null')
  const compensi = await api<Row[]>('pl_payouts?select=id,person_label,kind,amount,paid,due_month')
  for (const p of compensi) {
    const sue = tuttePayout.filter(a => a.payout_id === p.id).map(toAlloc)
    if (!sue.length) continue
    const cov = targetCoverage(Number(p.amount), 'compenso', p.id, sue)
    const deve = cov.state === 'coperto'
    if (deve === p.paid) continue
    /* §307 — al centesimo, o due numeri che differiscono di 35 cent si leggono
       uguali e la riga sembra dire una sciocchezza. */
    const c2 = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    say(`${p.person_label} (${p.kind}, esce ${String(p.due_month).slice(0, 7)}): `
      + `${c2(cov.allocated)} su ${c2(Number(p.amount))} → pagato = ${deve ? 'sì' : 'no'}`
      + (!deve && cov.allocated > 0 ? ` · restano scoperti ${c2(Number(p.amount) - cov.allocated)}` : ''))
    if (APPLY) await patch(`pl_payouts?id=eq.${p.id}`, { paid: deve })
  }

  line('═')
  console.log(APPLY
    ? '\nFatto. Adesso: npx tsx scripts/prepare-payouts.ts 2026-08-01 --apply\n'
    : '\n(anteprima. --apply per scrivere)\n')
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
