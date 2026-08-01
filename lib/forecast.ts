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
 * Tutti gli importi sono imponibili — IVA esclusa, come gli accordi. L'IVA si
 * calcola dove si versa, in Fiscale & Tasse.
 */

import { shiftMonth } from '@/lib/pl'
import { linesForMonth, type Installment, type RevenueStream } from '@/lib/revenue'
import { plannedForMonth, type CostItem } from '@/lib/costs'

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
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function forecast(
  from: string,
  count: number,
  streams: RevenueStream[],
  installments: Installment[],
  items: CostItem[],
  openMonths: Set<string>,
): ForecastMonth[] {
  const active = items.filter(i => i.is_active)

  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(from, i)
    const lines = linesForMonth(streams, installments, month)
    const due = plannedForMonth(active, month)

    const revenue = r2(lines.reduce((s, l) => s + l.amount_net, 0))
    const sub = r2(due.filter(x => x.project_id).reduce((s, x) => s + x.amount, 0))
    const internal = r2(due.filter(x => !x.project_id).reduce((s, x) => s + x.amount, 0))
    const cost = r2(sub + internal)
    const margin = r2(revenue - cost)

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
  }
}
