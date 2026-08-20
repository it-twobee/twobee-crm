'use server'

/**
 * Scrivere nel registro delle allocazioni. (§297)
 *
 * Il motore è puro e sta in `lib/allocations.ts`: qui c'è l'autorizzazione, il
 * caricamento di quello che serve a decidere, e la scrittura. Tre livelli si
 * guardano lo stesso vincolo, e non è ridondanza — la UI lo mostra **mentre**
 * si sceglie, l'azione lo applica perché un file `'use server'` esporta
 * endpoint, il trigger della 214 lo tiene anche per chi scrive da fuori.
 */

import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import {
  validate, evidenceOf, targetCoverage, txCoverage,
  type Allocation, type AllocDraft, type AllocTarget, type AllocTx,
} from '@/lib/allocations'

function rev() {
  revalidatePath('/economics/banca')
  revalidatePath('/economics')
}

const COL: Record<AllocTarget, 'revenue_line_id' | 'cost_line_id' | 'payout_id'> = {
  ricavo: 'revenue_line_id',
  costo: 'cost_line_id',
  compenso: 'payout_id',
}

type Row = {
  id: string; tx_id: string; amount: number; evidence: string
  revenue_line_id: string | null; cost_line_id: string | null; payout_id: string | null
}

const toAlloc = (r: Row): Allocation => ({
  id: r.id,
  txId: r.tx_id,
  target: r.revenue_line_id ? 'ricavo' : r.cost_line_id ? 'costo' : 'compenso',
  targetId: (r.revenue_line_id ?? r.cost_line_id ?? r.payout_id)!,
  amount: Number(r.amount),
  evidence: r.evidence === 'dichiarata' ? 'dichiarata' : 'certificata',
})

const SETUP = 'Manca la migration 214_payment_allocations.sql: il registro non esiste ancora. '
  + 'Eseguila nel SQL Editor e questa funzione si accende da sé — nel frattempo il legame resta '
  + 'quello diretto, un movimento e una riga.'

/**
 * Le allocazioni di un movimento, per sapere quanto è già spiegato.
 *
 * Senza la 214 la tabella non c'è: si dichiara invece di far uscire un errore
 * di Postgres, che a chi sta davanti allo schermo non dice cosa fare.
 */
export async function allocationsOf(txId: string): Promise<Allocation[]> {
  await requireAdmin()
  const { data, error } = await createAdminClient().from('payment_allocations')
    .select('id, tx_id, amount, evidence, revenue_line_id, cost_line_id, payout_id')
    .eq('tx_id', txId)
  if (error) throw new Error(error.code === '42P01' ? SETUP : error.message)
  return ((data ?? []) as Row[]).map(toAlloc)
}

/**
 * Alloca uno o più pezzi di un movimento.
 *
 * Non tocca `revenue_line_id`/`cost_line_id`: quelli restano il legame legacy e
 * i loro trigger continuano a marcare la riga pagata. Qui si scrive **quanto**,
 * che è la cosa che quei campi non sanno dire.
 */
export async function allocate(txId: string, drafts: AllocDraft[]): Promise<{
  scritte: number; leftover: number
  /** §300 — quante dichiarazioni ha spento questo fatto */
  spente: number
}> {
  const uid = await requireAdmin()
  const admin = createAdminClient()

  const { data: txRow, error: txErr } = await admin.from('bank_transactions')
    .select('id, amount, source').eq('id', txId).single()
  if (txErr) throw new Error(txErr.message)
  const tx = {
    id: String(txRow.id), amount: Number(txRow.amount), source: String(txRow.source),
  } satisfies AllocTx

  const esistenti = await allocationsOf(txId)
  const v = validate(tx, esistenti, drafts)
  if (!v.ok) throw new Error(v.why)

  /* §300 — un fatto spegne la dichiarazione che copriva la stessa riga, come fa
     `bank_on_match` per il legame diretto (§189). Senza, la riga risulta pagata
     due volte: una dalla spunta e una dalla banca. Si guardano **tutte** le
     allocazioni delle righe toccate, non solo quelle di questo movimento: la
     dichiarazione sta su un `derivato` che è un altro movimento. */
  let spente = 0
  if (evidenceOf(tx) === 'certificata') {
    for (const d of drafts) {
      const { data } = await admin.from('payment_allocations')
        .select('id, tx_id, amount, evidence, revenue_line_id, cost_line_id, payout_id')
        .eq(COL[d.target], d.targetId).eq('evidence', 'dichiarata')
      for (const r of (data ?? []) as Row[]) {
        await admin.from('payment_allocations').delete().eq('id', r.id)
        spente++
      }
    }
  }

  const rows = drafts.map(d => ({
    tx_id: txId,
    [COL[d.target]]: d.targetId,
    amount: d.amount,
    evidence: evidenceOf(tx),
    created_by: uid,
  }))
  const { error } = await createActorClient(uid).from('payment_allocations').insert(rows)
  if (error) throw new Error(error.message)

  await syncPaid(drafts)
  rev()
  return { scritte: rows.length, leftover: v.leftover, spente }
}

/** Toglie un'allocazione: il movimento torna scoperto di quella cifra. */
export async function deallocate(id: string) {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  const { data } = await admin.from('payment_allocations')
    .select('id, tx_id, amount, evidence, revenue_line_id, cost_line_id, payout_id')
    .eq('id', id).maybeSingle()

  const { error } = await createActorClient(uid).from('payment_allocations').delete().eq('id', id)
  if (error) throw new Error(error.message)

  if (data) {
    const a = toAlloc(data as Row)
    await syncPaid([{ target: a.target, targetId: a.targetId, amount: a.amount }])
  }
  rev()
}

/**
 * La spunta «pagato» segue il registro, non il contrario.
 *
 * Una riga è pagata quando le allocazioni la coprono, e torna scoperta quando
 * non la coprono più. Prima lo decideva la presenza di un legame — cioè
 * *qualcuno ha agganciato qualcosa*, senza guardare quanto: l'acconto Affinity
 * da 2.100 su una fattura da 2.562 risultava saldato, e i 462 € di IVA ancora
 * dovuti sparivano da ogni previsione.
 *
 * Il caso su cui non si tocca niente è **il mese chiuso**: è una fotografia, e
 * un'allocazione registrata oggi non riscrive quello che quel mese ha già
 * distribuito.
 */
async function syncPaid(drafts: AllocDraft[]) {
  const admin = createAdminClient()

  for (const t of Array.from(new Set(drafts.map(d => `${d.target}|${d.targetId}`)))) {
    const [target, id] = t.split('|') as [AllocTarget, string]
    const { data: allRows } = await admin.from('payment_allocations')
      .select('id, tx_id, amount, evidence, revenue_line_id, cost_line_id, payout_id')
      .eq(COL[target], id)
    const allocs = ((allRows ?? []) as Row[]).map(toAlloc)

    if (target === 'compenso') {
      const { data: p } = await admin.from('pl_payouts').select('amount').eq('id', id).maybeSingle()
      if (!p) continue
      const c = targetCoverage(Number((p as { amount: number }).amount), 'compenso', id, allocs)
      await admin.from('pl_payouts').update({ paid: c.state === 'coperto' }).eq('id', id)
      continue
    }

    const table = target === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'
    const cols = target === 'ricavo'
      ? 'amount_net, vat_rate, month_id'
      : 'actual, budget, vat_applied, vat_rate, month_id'
    const { data: line } = await admin.from(table).select(cols).eq('id', id).maybeSingle()
    if (!line) continue

    const l = line as unknown as {
      amount_net?: number; actual?: number; budget?: number
      vat_applied?: boolean; vat_rate: number; month_id: string
    }
    const { data: m } = await admin.from('pl_months').select('status').eq('id', l.month_id).maybeSingle()
    if ((m as { status?: string } | null)?.status === 'chiuso') continue

    const net = target === 'ricavo'
      ? Number(l.amount_net ?? 0)
      : (Number(l.actual ?? 0) > 0 ? Number(l.actual ?? 0) : Number(l.budget ?? 0))
    const gross = Math.round(net * (target === 'ricavo' || l.vat_applied ? 1 + Number(l.vat_rate) : 1) * 100) / 100

    const c = targetCoverage(gross, target, id, allocs)
    await admin.from(table).update({ paid: c.state === 'coperto' }).eq('id', id)
  }
}

/**
 * Quanto resta da spiegare di un movimento — per la UI, prima di scegliere.
 *
 * Sapere di aver sforato **dopo** aver premuto è sapere troppo tardi: a quel
 * punto la decisione è già stata presa e va disfatta.
 */
export async function txState(txId: string): Promise<{
  gross: number; allocated: number; remaining: number; state: string
}> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: t } = await admin.from('bank_transactions')
    .select('id, amount, source').eq('id', txId).single()
  const allocs = await allocationsOf(txId)
  const c = txCoverage(
    { id: String(t!.id), amount: Number(t!.amount), source: String(t!.source) }, allocs)
  return { gross: c.gross, allocated: c.allocated, remaining: c.remaining, state: c.state }
}
