'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { computeMonth, rowToPlConfig, shiftMonth, type RevenueLine, type CostLine, type Partner } from '@/lib/pl'

/**
 * §243 — I compensi come righe che si possono spuntare.
 *
 * Il piano compensi si **ricalcola** a ogni lettura (§227), e va bene finché la
 * domanda è «quanto spetta». Quando la domanda diventa «l'ho pagato?» serve una
 * riga: una spunta ha bisogno di qualcosa su cui stare, e dedurre l'erogato dai
 * bonifici (§226) non basta — un bonifico a un socio che è anche commerciale
 * non dice quale dei due lavori sta pagando.
 *
 * Come per le entrate, **l'importo si copia**: un mese chiuso deve restare
 * quello che era anche se domani una rata si sposta. Rigenerare aggiorna solo le
 * righe **non ancora pagate**: quello che è uscito è un fatto, e un fatto non si
 * riscrive perché la base di calcolo è cambiata dopo.
 */
function rev(month: string) {
  revalidatePath('/economics')
  revalidatePath('/economics/prospetto')
  revalidatePath(`/economics?m=${month}`)
}

/** La chiave della persona, la stessa di `mergePeople`: socio o nome libero. */
const partnerKey = (id: string) => `p:${id}`
const ownerKey = (label: string) => `o:${label}`

export async function materializePayouts(month: string): Promise<{ righe: number; totale: number }> {
  await requireAdmin()
  const db = createAdminClient()

  const { data: monthRow } = await db.from('pl_months')
    .select('id, status').eq('month', month).maybeSingle()
  if (!monthRow) throw new Error('Apri prima il mese dal conto economico')

  const [{ data: cfgRow }, { data: partnerRows }, { data: revRows }, { data: costRows }, { data: clients }] =
    await Promise.all([
      db.from('pl_config').select('*').eq('id', true).maybeSingle(),
      db.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
      db.from('pl_revenue_lines').select('*').eq('month_id', monthRow.id),
      db.from('pl_cost_lines').select('*').eq('month_id', monthRow.id),
      db.from('clients').select('id, sales_owner_name'),
    ])

  const num = (v: unknown) => Number(v ?? 0)
  const config = rowToPlConfig((cfgRow ?? {}) as Record<string, unknown>)
  const partners = (partnerRows ?? []).map((p: Record<string, unknown>) => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual,
  })) as Partner[]
  const ownerOf = new Map((clients ?? []).map((c: Record<string, unknown>) =>
    [String(c.id), (c.sales_owner_name as string) ?? null]))

  const revenue = (revRows ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as RevenueLine),
    amount_net: num(r.amount_net), vat_rate: num(r.vat_rate),
    kind: r.kind === 'digital' ? 'digital' : 'growth',
    paid: r.paid === true, pass_through: r.pass_through === true,
    client_sales_owner: r.client_id ? ownerOf.get(String(r.client_id)) ?? null : null,
  })) as RevenueLine[]
  const costs = (costRows ?? []).map((c: Record<string, unknown>) => ({
    ...(c as unknown as CostLine), budget: num(c.budget), actual: num(c.actual),
    paid: c.paid === true,
  })) as CostLine[]

  const t = computeMonth(revenue, costs, config, partners)
  /* §224 — matura in questo mese ed esce nel prossimo, come il costo del
     lavoro: il conto economico non può dire che il compenso di luglio è in
     ritardo il 2 luglio. */
  const due = shiftMonth(month, 1)

  type PayoutRow = {
    month_id: string; person_key: string; person_label: string
    kind: 'socio' | 'commerciale'; amount: number; due_month: string
  }
  const rows: PayoutRow[] = [
    ...t.perPartner.filter(p => p.total > 0.005).map(p => ({
      month_id: monthRow.id, person_key: partnerKey(p.partner.id), person_label: p.partner.label,
      kind: 'socio' as const, amount: Math.round(p.total * 100) / 100, due_month: due,
    })),
    ...t.salesByOwner.filter(s => s.amount > 0.005).map(s => ({
      month_id: monthRow.id, person_key: ownerKey(s.label), person_label: s.label,
      kind: 'commerciale' as const, amount: Math.round(s.amount * 100) / 100, due_month: due,
    })),
  ]

  /* Le righe già **pagate** non si toccano: quello che è uscito è un fatto, e
     riscriverlo perché la base di calcolo è cambiata dopo cancellerebbe un
     bonifico che è avvenuto davvero. Le altre si allineano. */
  const { data: existing } = await db.from('pl_payouts')
    .select('id, person_key, kind, paid, note').eq('month_id', monthRow.id)
  const byKey = new Map((existing ?? []).map((r: Record<string, unknown>) =>
    [`${r.person_key}|${r.kind}`, r as { id: string; paid: boolean; note: string | null }]))

  let touched = 0
  for (const r of rows) {
    const cur = byKey.get(`${r.person_key}|${r.kind}`)
    /* §251 — una riga pagata è un fatto e una decisa a mano è una decisione:
       né l'uno né l'altra si riscrivono perché la base di calcolo è cambiata. */
    if (cur?.paid || cur?.note?.startsWith('Deciso a mano')) continue
    const { error } = cur
      ? await db.from('pl_payouts').update({ amount: r.amount, due_month: r.due_month, person_label: r.person_label }).eq('id', cur.id)
      : await db.from('pl_payouts').insert(r as Record<string, unknown>)
    if (error) throw new Error(error.message)
    touched++
  }
  /* Chi non matura più niente e non è stato pagato sparisce: una riga a zero
     che resta in elenco fa credere che a qualcuno spetti qualcosa. */
  const keep = new Set(rows.map(r => `${r.person_key}|${r.kind}`))
  for (const [k, cur] of Array.from(byKey.entries())) {
    if (!keep.has(k) && !cur.paid && !cur.note?.startsWith('Deciso a mano')) {
      await db.from('pl_payouts').delete().eq('id', cur.id)
    }
  }

  rev(month)
  return { righe: touched, totale: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100 }
}

/**
 * La spunta. La data la scrive il trigger con **oggi** (§224): chiederla a mano
 * significa averla sbagliata la metà delle volte, e toglierla la porta via.
 */
export async function setPayoutPaid(id: string, paid: boolean, month: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_payouts').update({ paid }).eq('id', id)
  if (error) throw new Error(error.message)
  rev(month)
}

/** La data si può correggere: il bonifico può essere di ieri. */
export async function setPayoutDate(id: string, paidOn: string | null, month: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_payouts')
    .update({ paid_on: paidOn, paid: !!paidOn }).eq('id', id)
  if (error) throw new Error(error.message)
  rev(month)
}

/**
 * §251 — L'importo deciso a mano.
 *
 * Il piano calcola una percentuale; una **scelta strategica** è per definizione
 * fuori dalla formula. A giugno 2026 Marco e Toto hanno preso 3.000 € a testa
 * invece della loro quota, e senza un posto dove scriverlo quel numero sarebbe
 * rimasto solo in banca — dove un bonifico non dice se paga la quota, la
 * provvigione, o una decisione presa in riunione.
 *
 * Due garanzie, o diventerebbe un modo per far tornare i conti a mano:
 *
 * **La riga dichiara di essere stata decisa**, e conserva quanto diceva il
 * piano. Un numero scritto sopra un calcolo, senza il calcolo accanto, è un
 * numero che nessuno può più contestare.
 *
 * **Rigenerare non lo cancella**: `materializePayouts` salta le righe pagate, e
 * da qui in poi anche quelle decise a mano. Il piano non deve poter riscrivere
 * una decisione presa da una persona.
 */
export async function setPayoutAmount(id: string, amount: number, why: string, month: string) {
  await requireAdmin()
  const db = createAdminClient()
  const { data: cur } = await db.from('pl_payouts')
    .select('amount, note, person_label').eq('id', id).maybeSingle()
  if (!cur) throw new Error('Riga non trovata')

  const value = Math.round(Number(amount) * 100) / 100
  if (!Number.isFinite(value) || value < 0) throw new Error('Importo non valido')
  const reason = why.trim()
  if (!reason) throw new Error('Serve la ragione: un importo deciso a mano senza il perché non si legge')

  const piano = Number((cur as { amount: number }).amount)
  const note = `Deciso a mano: ${reason}. Il piano ne calcolava `
    + `${piano.toFixed(2).replace('.', ',')} €.`

  const { error } = await db.from('pl_payouts').update({ amount: value, note }).eq('id', id)
  if (error) throw new Error(error.message)
  rev(month)
}

/**
 * §260 — Il bonifico che paga un compenso.
 *
 * Un compenso non è una riga di conto economico — si ricalcola (§227) — quindi
 * `bank_transactions` non ha una colonna che punti a lui: `revenue_line_id` e
 * `cost_line_id` sono le uniche due, e nessuna delle due è giusta. Qui il legame
 * si scrive dove può stare: sul movimento, in nota, e con `no_match_needed`
 * perché smetta di comparire fra quelli da riconciliare.
 *
 * Non è la soluzione elegante — quella sarebbe una terza colonna, o
 * `bank_tx_lines` esteso ai compensi — ma è quella onesta finché il compenso
 * resta una cosa che si ricalcola: una colonna che punta a una riga che nessuno
 * ha scritto è una colonna che punta al vuoto.
 */
export async function reconcilePayout(txId: string, payoutId: string) {
  await requireAdmin()
  const db = createAdminClient()
  const { data: p } = await db.from('pl_payouts')
    .select('person_label, kind, amount').eq('id', payoutId).maybeSingle()
  if (!p) throw new Error('Compenso non trovato')
  const r = p as { person_label: string; kind: string; amount: number }
  const { error } = await db.from('bank_transactions').update({
    no_match_needed: true,
    note: `Compenso ${r.kind} a ${r.person_label} · ${r.amount.toFixed(2).replace('.', ',')} € (§260)`,
    matched_at: new Date().toISOString(),
  }).eq('id', txId)
  if (error) throw new Error(error.message)
  revalidatePath('/economics')
  revalidatePath('/economics/banca')
}
