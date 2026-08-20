'use server'

/**
 * Il dialogo dei movimenti del mese. (§303)
 *
 * Il motore è puro e sta in `lib/month-intake.ts`: qui c'è il caricamento di
 * quello che serve a decidere e l'esecuzione di quello che è stato deciso.
 *
 * **Non scrive niente da sé.** È la differenza con `pushAccountSpend`, che
 * questa funzione sostituisce: quello creava righe senza chiedere, e le doppie
 * di questa estate sono nate tutte lì. Qui si propone, una persona guarda, e si
 * esegue quello che ha confermato.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { intake, type Intake, type IntakeLine, type IntakeTx } from '@/lib/month-intake'
import { allocate } from '@/app/actions/allocations'
import { createCostFromTx } from '@/app/actions/reconcile'

const r2 = (n: number) => Math.round(n * 100) / 100

function rev(month: string) {
  revalidatePath('/economics')
  revalidatePath(`/economics?m=${month}`)
  revalidatePath('/economics/banca')
}

/**
 * Cosa il mese non spiega, e cosa farne.
 *
 * Guarda **le uscite del mese** di tutti i conti: un movimento non spiegato è
 * un'uscita che il conto economico non contiene, e da lì il margine è più alto
 * del vero. Le entrate hanno la loro strada — la spunta sulla riga, che parte
 * dal ricavo — e mescolarle qui darebbe una lista di cose disomogenee.
 */
export async function monthIntake(month: string): Promise<{
  rows: Intake[]
  summary: ReturnType<typeof intake>['summary']
  setupNeeded: boolean
}> {
  await requireAdmin()
  const admin = createAdminClient()

  const first = `${month.slice(0, 7)}-01`
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  const to = `${month.slice(0, 7)}-${String(last.getDate()).padStart(2, '0')}`

  const { data: mese } = await admin.from('pl_months').select('id, status').eq('month', first).maybeSingle()
  if (!mese) throw new Error(`Il mese ${first} non è ancora aperto nel conto economico`)
  const m = mese as { id: string; status: string }
  if (m.status === 'chiuso') throw new Error('Il mese è chiuso: è una fotografia, e non si riscrive')

  const [{ data: txRows }, { data: costRows }, { data: itemRows }] = await Promise.all([
    admin.from('bank_transactions')
      .select('id, booked_on, amount, description, counterparty, kind, no_match_needed')
      .eq('source', 'banca').lt('amount', 0)
      .gte('booked_on', first).lte('booked_on', to).order('booked_on'),
    admin.from('pl_cost_lines')
      .select('id, label, actual, budget, vat_applied, vat_rate, category, cost_item_id')
      .eq('month_id', m.id),
    /* §307 — **il fornitore, non solo l'etichetta.** La riga dell'acconto Seven
       si chiama «Subappalto — Digitalizzazione — CRM — Acconto» e non contiene
       «Affinity»: il nome non la trovava, e il bonifico da 3.000 € finiva
       sull'unica riga che quella parola conteneva — l'acconto ISF — con la
       frase «la controparte torna e questo movimento la chiude». Una risposta
       sicura e sbagliata. Col fornitore diventano due candidate e la proposta
       dice «scegli quale», che è la verità. */
    admin.from('cost_items').select('id, supplier'),
  ])

  /* Quanto è già allocato, su movimenti e righe. Senza la 214 la tabella non
     c'è: la lista funziona identica, solo senza sapere cosa è già spiegato —
     che è esattamente come funzionava prima. */
  let allocTx = new Map<string, number>()
  let allocLine = new Map<string, number>()
  let setupNeeded = false
  const { data: allocs, error } = await admin.from('payment_allocations')
    .select('tx_id, cost_line_id, amount')
  if (error) setupNeeded = error.code === '42P01'
  else {
    for (const a of (allocs ?? []) as { tx_id: string; cost_line_id: string | null; amount: number }[]) {
      allocTx.set(a.tx_id, r2((allocTx.get(a.tx_id) ?? 0) + Number(a.amount)))
      if (a.cost_line_id) {
        allocLine.set(a.cost_line_id, r2((allocLine.get(a.cost_line_id) ?? 0) + Number(a.amount)))
      }
    }
  }

  const txs: IntakeTx[] = ((txRows ?? []) as Record<string, unknown>[]).map(t => ({
    id: String(t.id), booked_on: String(t.booked_on).slice(0, 10),
    amount: Number(t.amount), description: String(t.description ?? ''),
    counterparty: (t.counterparty as string) ?? null, kind: String(t.kind ?? 'altro'),
    allocated: allocTx.get(String(t.id)) ?? 0,
    no_match_needed: t.no_match_needed === true,
  }))

  const supplierOf = new Map(((itemRows ?? []) as { id: string; supplier: string | null }[])
    .map(i => [String(i.id), i.supplier ?? '']))
  const lines: IntakeLine[] = ((costRows ?? []) as Record<string, unknown>[]).map(c => {
    const net = Number(c.actual) > 0 ? Number(c.actual) : Number(c.budget)
    return {
      id: String(c.id), label: String(c.label),
      gross: r2(net * (c.vat_applied ? 1 + Number(c.vat_rate) : 1)),
      allocated: allocLine.get(String(c.id)) ?? 0,
      who: [String(c.label), supplierOf.get(String(c.cost_item_id ?? '')) ?? ''].filter(Boolean).join(' '),
    }
  })

  return { ...intake(txs, lines), setupNeeded }
}

/**
 * §307 — Quanti movimenti non spiega **ogni** mese.
 *
 * Il dialogo apriva sul mese guardato e taceva sugli altri, quindi il lavoro
 * arretrato di luglio non si vedeva da agosto: bisognava cambiare mese in cima
 * alla pagina per scoprire se ce n'era. Qui c'è il conto di tutti, coi mesi
 * chiusi compresi — quelli non si toccano, ma sapere che contengono qualcosa è
 * il motivo per cui uno decide di riaprirli.
 */
export async function intakeOverview(): Promise<{
  month: string; status: string; movimenti: number; importo: number
}[]> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: mesi } = await admin.from('pl_months').select('id, month, status').order('month')
  const rows = (mesi ?? []) as { id: string; month: string; status: string }[]
  if (!rows.length) return []

  const [{ data: txAll }, { data: costAll }, { data: allocs }] = await Promise.all([
    admin.from('bank_transactions')
      .select('id, booked_on, amount, description, counterparty, kind, no_match_needed')
      .eq('source', 'banca').lt('amount', 0),
    admin.from('pl_cost_lines')
      .select('id, label, actual, budget, vat_applied, vat_rate, month_id, cost_item_id'),
    admin.from('payment_allocations').select('tx_id, cost_line_id, amount'),
  ])
  const { data: itemRows } = await admin.from('cost_items').select('id, supplier')
  const supplierOf = new Map(((itemRows ?? []) as { id: string; supplier: string | null }[])
    .map(i => [String(i.id), i.supplier ?? '']))

  const aT = new Map<string, number>(), aL = new Map<string, number>()
  for (const a of (allocs ?? []) as { tx_id: string; cost_line_id: string | null; amount: number }[]) {
    aT.set(a.tx_id, r2((aT.get(a.tx_id) ?? 0) + Number(a.amount)))
    if (a.cost_line_id) aL.set(a.cost_line_id, r2((aL.get(a.cost_line_id) ?? 0) + Number(a.amount)))
  }

  return rows.map(m => {
    const first = m.month.slice(0, 10)
    const last = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)
    const to = `${first.slice(0, 7)}-${String(last.getDate()).padStart(2, '0')}`

    const txs: IntakeTx[] = ((txAll ?? []) as Record<string, unknown>[])
      .filter(t => String(t.booked_on).slice(0, 10) >= first && String(t.booked_on).slice(0, 10) <= to)
      .map(t => ({
        id: String(t.id), booked_on: String(t.booked_on).slice(0, 10),
        amount: Number(t.amount), description: String(t.description ?? ''),
        counterparty: (t.counterparty as string) ?? null, kind: String(t.kind ?? 'altro'),
        allocated: aT.get(String(t.id)) ?? 0, no_match_needed: t.no_match_needed === true,
      }))
    const lines: IntakeLine[] = ((costAll ?? []) as Record<string, unknown>[])
      .filter(c => String(c.month_id) === m.id)
      .map(c => {
        const net = Number(c.actual) > 0 ? Number(c.actual) : Number(c.budget)
        return {
          id: String(c.id), label: String(c.label),
          who: [String(c.label), supplierOf.get(String(c.cost_item_id ?? '')) ?? ''].filter(Boolean).join(' '),
          gross: r2(net * (c.vat_applied ? 1 + Number(c.vat_rate) : 1)),
          allocated: aL.get(String(c.id)) ?? 0,
        }
      })

    const { rows: proposte, summary } = intake(txs, lines)
    const daFare = proposte.filter(x => x.action !== 'ignora')
    return {
      month: first, status: m.status,
      movimenti: daFare.length, importo: summary.scoperto,
    }
  })
}

export type IntakeDecision =
  | { txId: string; action: 'accorpa'; lineId: string; amount: number }
  /** §303 — la riga dice meno del vero: si alza e poi si alloca */
  | { txId: string; action: 'correggi'; lineId: string; amount: number; newGross: number }
  | { txId: string; action: 'aggiungi'; label: string; category: string }
  | { txId: string; action: 'ignora' }

/**
 * Esegue le decisioni, una per una e senza fermarsi alla prima che fallisce.
 *
 * Una lista di venti movimenti che si interrompe a metà lascia lo schermo che
 * dice una cosa e il database un'altra, e la seconda volta non si sa più da dove
 * ripartire. Quello che non è andato torna indietro col suo motivo.
 */
export async function applyIntake(month: string, decisions: IntakeDecision[]): Promise<{
  accorpati: number; corretti: number; creati: number; ignorati: number
  totale: number
  falliti: { txId: string; why: string }[]
}> {
  await requireAdmin()
  const admin = createAdminClient()

  let accorpati = 0, corretti = 0, creati = 0, ignorati = 0, totale = 0
  const falliti: { txId: string; why: string }[] = []

  for (const d of decisions) {
    try {
      if (d.action === 'ignora') {
        const { error } = await admin.from('bank_transactions')
          .update({ no_match_needed: true }).eq('id', d.txId)
        if (error) throw new Error(error.message)
        ignorati++
        continue
      }
      if (d.action === 'accorpa') {
        await allocate(d.txId, [{ target: 'costo', targetId: d.lineId, amount: d.amount }])
        accorpati++; totale = r2(totale + d.amount)
        continue
      }
      if (d.action === 'correggi') {
        /* Prima si alza l'importo, poi si alloca: nell'ordine inverso il trigger
           della 214 rifiuterebbe l'allocazione perché la riga non ha capienza.
           E l'imponibile si ricava dal lordo con l'aliquota **della riga** —
           scorporare a 22% dove l'IVA è al 5,25% è il modo di sbagliare di poco
           e per sempre (§299). */
        const { data: l } = await admin.from('pl_cost_lines')
          .select('vat_applied, vat_rate').eq('id', d.lineId).maybeSingle()
        const v = l as { vat_applied: boolean; vat_rate: number } | null
        const net = r2(d.newGross / (v?.vat_applied ? 1 + Number(v.vat_rate) : 1))
        const { error } = await admin.from('pl_cost_lines')
          .update({ actual: net, budget: net }).eq('id', d.lineId)
        if (error) throw new Error(error.message)
        await allocate(d.txId, [{ target: 'costo', targetId: d.lineId, amount: d.amount }])
        corretti++; totale = r2(totale + d.amount)
        continue
      }
      /* `createCostFromTx` esisteva già (§254) e fa esattamente questo: crea la
         voce col lordo del movimento e gliela aggancia. Riscriverlo qui avrebbe
         creato la seconda copia della stessa regola. */
      const r = await createCostFromTx({ txIds: [d.txId], month, category: d.category, label: d.label })
      creati++; totale = r2(totale + Number(r.importo ?? 0))
    } catch (e) {
      falliti.push({ txId: d.txId, why: e instanceof Error ? e.message : 'Errore' })
    }
  }

  rev(month)
  return { accorpati, corretti, creati, ignorati, totale, falliti }
}
