import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSeeEconomics } from '@/lib/permissions'
import { loadWindow } from '@/lib/payouts-plan'
import { payoutReportHtml, type PayoutLineRef } from '@/lib/payout-report'
import { monthKey } from '@/lib/pl'

/**
 * §334 — Il foglio dell'erogazione, da stampare o mandare a chi lo riceve.
 * Il documento lo compone `lib/payout-report.ts`; qui c'è solo la porta.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  /* §234 — una route è un endpoint HTTP come una server action, e nasconderne
     il link non è una barriera: il controllo sta qui, non nel pulsante. */
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return new NextResponse('Non autenticato', { status: 401 })
  const { data: profile } = await sb.from('profiles')
    .select('email, app_role, full_name').eq('id', user.id).maybeSingle()
  if (!canSeeEconomics(profile)) return new NextResponse('Permesso negato', { status: 403 })

  const m = req.nextUrl.searchParams.get('m')
  const month = m ? monthKey(new Date(m)) : monthKey(new Date())
  const today = new Date().toISOString().slice(0, 10)

  const admin = createAdminClient()
  /* Lo stesso motore del pannello e dello script (§286): un secondo posto che
     ricalcola i compensi è un secondo posto che un giorno dirà un numero
     diverso, e su un foglio che si allega a un bonifico è il danno peggiore. */
  let loaded
  try {
    loaded = await loadWindow(admin, month)
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Mese non disponibile', { status: 400 })
  }
  const { monthRow, w, t, config, summary } = loaded

  const [{ data: clients }, { data: payoutRows }] = await Promise.all([
    admin.from('clients').select('id, display_name, company_name, sales_owner_name'),
    admin.from('pl_payouts').select('*').eq('month_id', monthRow.id),
  ])

  const clientNames = Object.fromEntries((clients ?? []).map((c: Record<string, unknown>) =>
    [String(c.id), String(c.display_name || c.company_name)]))
  const lines: PayoutLineRef[] = (payoutRows ?? []).map((r: Record<string, unknown>) => ({
    personKey: String(r.person_key), personLabel: String(r.person_label),
    kind: r.kind === 'commerciale' ? 'commerciale' : 'socio',
    amount: Number(r.amount ?? 0), paid: r.paid === true,
    paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
  }))

  /* §226 — il cognome del socio arriva dall'anagrafica dei clienti, non da chi
     ha incassato questo mese: un nome che si accorcia nei mesi magri farebbe
     due intestazioni diverse per lo stesso bonifico. */
  const owners = Array.from(new Set((clients ?? [])
    .map((c: Record<string, unknown>) => String(c.sales_owner_name ?? '')).filter(Boolean)))

  const html = payoutReportHtml({
    month, today, w, t, config, clientNames, lines, owners,
    autore: String((profile as { full_name?: string } | null)?.full_name ?? ''),
    open: { n: summary.open.n, amount: summary.open.amount },
    next: { n: summary.next.n, amount: summary.next.amount },
  })
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
