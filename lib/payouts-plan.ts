/**
 * §286/§243 — Il motore dei compensi: la finestra, le quote, le righe spuntabili.
 *
 * Sta qui e non nell'azione per una ragione sola: **la riga di comando e il
 * pulsante devono fare la stessa cosa**. Un secondo posto che ricalcola i
 * compensi è un secondo posto che un giorno dirà un numero diverso, e sui
 * compensi «due numeri con lo stesso nome» è il modo più veloce per non
 * fidarsi di nessuno dei due. L'azione ci mette il controllo dei permessi e la
 * revalidazione, che sono le sole cose che qui non c'entrano.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { computeMonth, rowToPlConfig, shiftMonth, type Partner } from '@/lib/pl'
import {
  buildWindow, takenIn, marginCostsFor, windowSummary, DEFAULT_PAYOUT_DAY,
} from '@/lib/payout-window'
import { rowContext, toRevenueLines, toCostLines } from '@/lib/pl-rows'

type Db = ReturnType<typeof createAdminClient>

/** La chiave della persona, la stessa di `mergePeople`: socio o nome libero. */
export const partnerKey = (id: string) => `p:${id}`
export const ownerKey = (label: string) => `o:${label}`

/**
 * §286 — Cosa entra nell'erogazione di questo mese, e cosa resta fuori.
 *
 * Il calcolo non parte più dal maturato del mese ma dalla **finestra**: le righe
 * maturate fino a questo mese e rientrate fra l'erogazione scorsa e quella che
 * si sta preparando. Il caricamento perciò non può fermarsi al mese — una
 * fattura di luglio incassata il 3 agosto sta nel mese di luglio ma nella
 * finestra di adesso, e una di luglio incassata il 25 agosto sta nel mese di
 * luglio e nella finestra **prossima**.
 */
export async function loadWindow(db: ReturnType<typeof createAdminClient>, month: string) {
  const { data: monthRow } = await db.from('pl_months')
    .select('id, status, payout_date').eq('month', month).maybeSingle()
  if (!monthRow) throw new Error('Apri prima il mese dal conto economico')

  const prev = shiftMonth(month, -1)
  const [{ data: cfgRow }, { data: partnerRows }, { data: monthRows }, { data: clients },
    { data: streamRows }, { data: coverRows }] =
    await Promise.all([
      db.from('pl_config').select('*').eq('id', true).maybeSingle(),
      db.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
      // `select('*')`: `payout_date` arriva con la 212 e prima non c'è
      db.from('pl_months').select('*').lte('month', month),
      db.from('clients').select('id, sales_owner_name'),
      /* §272 — le righe devono uscire **intere**. Senza il valore venduto del
         progetto nessuna riga risulta eleggibile al fondo rischio (§186: sopra
         i 20.000 € ciascun socio scende dal 28% al 25%) e questa azione — che
         è quella che **scrive** i compensi — copierebbe numeri più alti del
         dovuto: su Seven 4.340,78 € a socio invece di 4.045,95. Plausibili, e
         per questo nessuno li andrebbe a controllare. */
      db.from('revenue_streams').select('id, amount, status, project_id'),
      db.from('revenue_stream_projects').select('stream_id, project_id'),
    ])

  const config = rowToPlConfig((cfgRow ?? {}) as Record<string, unknown>)
  const cfg = (cfgRow ?? {}) as Record<string, unknown>
  const w = buildWindow({
    month,
    date: (monthRow as { payout_date?: string | null }).payout_date ?? null,
    previousDate: (monthRows ?? []).find(m => m.month === prev)?.payout_date ?? null,
    day: Number(cfg.payout_day ?? DEFAULT_PAYOUT_DAY) || DEFAULT_PAYOUT_DAY,
    settledFrom: config.settled_from,
  })

  /* Solo i mesi che la finestra può guardare: dal consolidato a questo. Caricare
     tutto lo storico per poi buttarlo via è un giro di rete che cresce ogni mese. */
  const scope = (monthRows ?? []).filter(m => !w.from || m.month >= w.from)
  const ids = scope.map(m => m.id)

  const [{ data: revRows }, { data: costRows }] = await Promise.all([
    db.from('pl_revenue_lines').select('*').in('month_id', ids),
    db.from('pl_cost_lines').select('*').in('month_id', ids),
  ])

  const partners = (partnerRows ?? []).map((p: Record<string, unknown>) => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual,
  })) as Partner[]
  /* §287 — le righe si costruiscono in **un posto solo**: dieci copie di questa
     mappatura portavano dieci sottoinsiemi diversi dei campi, e qui — l'azione
     che *scrive* i compensi — mancava `project_value`, quindi il fondo rischio
     non risultava mai eleggibile e Seven copiava in tabella 4.340,78 € a socio
     invece di 4.045,95. */
  const ctx = rowContext({
    month, months: scope as { id: unknown; month: unknown }[],
    clients: (clients ?? []) as Record<string, unknown>[],
    streams: (streamRows ?? []) as Record<string, unknown>[],
    streamProjects: (coverRows ?? []) as { stream_id: string; project_id: string }[],
  })
  const revenue = toRevenueLines(revRows as Record<string, unknown>[], ctx)
  const costs = toCostLines(costRows as Record<string, unknown>[], ctx)

  const taken = takenIn(revenue, w)
  const mesi = new Set(taken.map(l => l.month ?? month))
  /* §232 — i subappalti restano quelli **di competenza** delle righe prese: il
     margine digital è un rapporto fra la rata e il fornitore di quel progetto e
     di quel mese, e filtrarne una gamba sola distribuirebbe soldi già di
     qualcun altro. §285 — il denominatore è il ricavo **intero** di quei mesi,
     non le sole righe incassate. */
  const marginCosts = marginCostsFor(costs, mesi, month)
  const marginRevenue = revenue.filter(l => mesi.has(l.month ?? month))
  const t = computeMonth(taken, marginCosts, config, partners, marginCosts, marginRevenue)

  return {
    monthRow: monthRow as { id: string; status: string; payout_date: string | null },
    w, t, config, partners, revenue, taken,
    summary: windowSummary(revenue, w),
  }
}


export type PayoutSync = {
  righe: number; totale: number; data: string; scoperto: number
}

/**
 * Scrive le righe spuntabili del mese, allineandole alla finestra.
 *
 * Non tocca quello che una persona ha deciso o che è già uscito: una riga
 * **pagata** è un fatto, una **decisa a mano** (§251) è una decisione, e
 * nessuna delle due si riscrive perché la base di calcolo è cambiata dopo.
 */
export async function syncPayouts(db: Db, month: string): Promise<PayoutSync> {
  const { monthRow, w, t, summary } = await loadWindow(db, month)
  /* §224 — matura in questo mese ed esce nel prossimo, come il costo del
     lavoro: il conto economico non può dire che il compenso di luglio è in
     ritardo il 2 luglio. */
  const due = w.dueMonth

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

  /* La data della finestra si scrive sul mese: da lì riparte quella dopo, e
     senza un limite inferiore un incasso in ritardo o si perde o si conta due
     volte (§286). Si scrive solo se non c'era: cambiarla è una decisione, e la
     prende `setPayoutDate`, non un pulsante che dice «genera». */
  if (!monthRow.payout_date) {
    await db.from('pl_months').update({ payout_date: w.date }).eq('id', monthRow.id)
  }


  return {
    righe: touched,
    totale: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    data: w.date,
    scoperto: summary.open.amount,
  }
}
