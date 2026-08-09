/**
 * Previsionale — quello che succederà, calcolato da quello che hai firmato.
 *
 * Il conto economico registra i mesi. Ma un accordo da 45.000 con acconto e
 * cinque rate fino a dicembre è già tutto deciso oggi: i mesi futuri non sono
 * un'incognita, sono una conseguenza. Mostrarli solo quando li apri a mano
 * significa scoprire a novembre che dicembre era scoperto.
 *
 * Entrate: canoni attivi e rate in scadenza, dai contratti dei clienti.
 * Uscite: piano dei costi interni **più** i subappalti, che sono costi con un
 * progetto attaccato e vanno in cassa esattamente come gli altri.
 *
 * Gli importi di **competenza** sono imponibili — IVA esclusa, come gli accordi.
 * Quelli di **cassa** (§224) sono lordi: dal conto esce il totale della fattura,
 * IVA compresa, e l'IVA la si ritrova a Fiscale & Tasse quando si versa.
 *
 * §224 — competenza e cassa non sono lo stesso mese, e il previsionale deve dire
 * tutte e due le cose. Un canone di giugno con pagamento a 30 giorni è margine di
 * giugno e cassa di luglio: un previsionale che li confonde promette soldi in un
 * mese in cui non ci sono. Le scadenze le decide `lib/cash-calendar.ts`, che è
 * l'unico posto dove quella regola vive.
 */

import { shiftMonth } from '@/lib/pl'
import { linesForMonth, type Installment, type RevenueStream } from '@/lib/revenue'
import { plannedForMonth, type CostItem } from '@/lib/costs'
import { dueOf, monthOf, collectionIndex, type CashLine } from '@/lib/cash-calendar'

export type ForecastMonth = {
  month: string
  /** il mese esiste già nel conto economico */
  open: boolean
  revenue: number
  /** costi interni: struttura, persone, software */
  internalCost: number
  /** lavorazioni affidate fuori, legate a un progetto */
  subcontractCost: number
  cost: number
  margin: number
  marginPct: number
  /** quante righe di entrata compongono il mese: serve a dire «da cosa» */
  revenueLines: number
  costLines: number
  /** §224 — quello che **entra dal conto** in questo mese, IVA inclusa */
  cashIn: number
  /** §224 — quello che **esce dal conto** in questo mese, IVA inclusa */
  cashOut: number
  cashNet: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, r2((m.get(k) ?? 0) + v))

export function forecast(
  from: string,
  count: number,
  streams: RevenueStream[],
  installments: Installment[],
  items: CostItem[],
  openMonths: Set<string>,
): ForecastMonth[] {
  const active = items.filter(i => i.is_active)

  /* §224 — la cassa si riempie da una finestra **più larga** dei mesi mostrati:
     quello che si incassa a gennaio può essere maturato a dicembre, e quello che
     matura nell'ultimo mese esce dopo. Guardare solo i mesi in tabella farebbe
     sparire i due estremi, ed è proprio dove il previsionale serve. */
  const cashIn = new Map<string, number>()
  const cashOut = new Map<string, number>()
  for (let k = -3; k < count + 2; k++) {
    const m = shiftMonth(from, k)
    const lines = linesForMonth(streams, installments, m)
    const asCash = (l: { amount_net: number; project_id: string | null; project_ids?: string[] }, i: number): CashLine & { projects: string[] } => ({
      id: `${m}:${i}`, side: 'entrata', month: m, amount: l.amount_net, paid: false,
      project_id: l.project_id, projects: l.project_ids ?? (l.project_id ? [l.project_id] : []),
    })
    // il subappalto si paga quando ha pagato il cliente: serve sapere quando
    const collection = collectionIndex(lines.map(asCash))

    for (const l of lines) {
      const due = dueOf({ id: '', side: 'entrata', month: m, amount: l.amount_net, paid: false })
      add(cashIn, monthOf(due), l.amount_net * (1 + l.vat_rate))
    }
    for (const it of plannedForMonth(active, m)) {
      const due = dueOf({
        id: '', side: 'uscita', month: m, amount: it.amount, paid: false,
        category: it.category, project_id: it.project_id ?? null,
      }, { collection })
      add(cashOut, monthOf(due), it.amount * (it.vat_applied ? 1 + it.vat_rate : 1))
    }
  }

  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(from, i)
    const lines = linesForMonth(streams, installments, month)
    const due = plannedForMonth(active, month)

    const revenue = r2(lines.reduce((s, l) => s + l.amount_net, 0))
    const sub = r2(due.filter(x => x.project_id).reduce((s, x) => s + x.amount, 0))
    const internal = r2(due.filter(x => !x.project_id).reduce((s, x) => s + x.amount, 0))
    const cost = r2(sub + internal)
    const margin = r2(revenue - cost)
    const cin = cashIn.get(month) ?? 0
    const cout = cashOut.get(month) ?? 0

    return {
      month,
      open: openMonths.has(month),
      revenue,
      internalCost: internal,
      subcontractCost: sub,
      cost,
      margin,
      marginPct: revenue > 0 ? margin / revenue : 0,
      revenueLines: lines.length,
      costLines: due.length,
      cashIn: cin, cashOut: cout, cashNet: r2(cin - cout),
    }
  })
}

/** I totali del periodo: la riga che dice se l'anno regge. */
export function forecastTotals(rows: ForecastMonth[]) {
  const revenue = r2(rows.reduce((s, r) => s + r.revenue, 0))
  const cost = r2(rows.reduce((s, r) => s + r.cost, 0))
  return {
    revenue, cost,
    subcontract: r2(rows.reduce((s, r) => s + r.subcontractCost, 0)),
    margin: r2(revenue - cost),
    marginPct: revenue > 0 ? (revenue - cost) / revenue : 0,
    /** mesi in perdita: sono quelli su cui intervenire adesso */
    negative: rows.filter(r => r.margin < 0).length,
    /** §224 — gli stessi mesi visti dalla cassa, IVA inclusa */
    cashIn: r2(rows.reduce((s, r) => s + r.cashIn, 0)),
    cashOut: r2(rows.reduce((s, r) => s + r.cashOut, 0)),
    cashNet: r2(rows.reduce((s, r) => s + r.cashNet, 0)),
    /** mesi in cui esce più di quanto entra: sono un'altra cosa dai mesi in perdita */
    cashNegative: rows.filter(r => r.cashNet < 0).length,
  }
}
