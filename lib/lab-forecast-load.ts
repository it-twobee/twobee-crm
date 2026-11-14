import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabEconomics } from '@/lib/lab-economics-load'
import { readLabRows } from '@/lib/lab-read'
import { labForecast, type ForecastOptions } from '@/lib/lab-forecast'
import { vatPeriods } from '@/lib/lab-vat'

export async function loadLabForecast(today: string, options: ForecastOptions) {
  await requireLabAdmin()
  const [economics, settlements] = await Promise.all([
    loadLabEconomics(`${today.slice(0, 7)}-01`, today),
    readLabRows('vat_settlements', 'id,year,quarter,to_pay,doc_ref,paid_on', today).catch(() => null),
  ])
  if (!economics.ok || settlements == null) return { ok: false as const, message: 'Una fonte della base o delle scadenze non è disponibile: proiezioni n/d, nessun dato viene sostituito con zero.' }
  try {
    const i = economics.input
    return { ok: true as const, observedAt: economics.observedAt, input: i, result: labForecast(i, options),
      blockers: economics.accrual.blockers,
      deadlines: vatPeriods(i.months.filter(m => String(m.month) <= today), i.revenue, i.costs, settlements, i.invoices, today) }
  } catch {
    return { ok: false as const, message: 'Profili o calendari incompleti: simulazione n/d. Verifica le fonti prima di proseguire.' }
  }
}
