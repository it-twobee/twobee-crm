import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadWindow } from '@/lib/payouts-plan'
import { payoutReportHtml, type PayoutLineRef } from '@/lib/payout-report'
import { monthKey, monthLabel } from '@/lib/pl'
import { monthParam } from '@/lib/report-access'
import { reportGate, reportRequest, type GateCtx } from '@/lib/report-gate'

/** Una riga rimasta fuori dalla finestra, ridotta a quello che il foglio mostra. */
const openLine = (l: {
  label: string; client_id: string | null; month?: string | null
  amount_net: number; pass_through?: boolean
}) => ({
  label: l.label, clientId: l.client_id, month: l.month ?? null,
  amount: l.amount_net, passThrough: l.pass_through === true,
})


/**
 * §334 — Il foglio dell'erogazione, da stampare o mandare a chi lo riceve.
 * Il documento lo compone `lib/payout-report.ts`; qui c'è solo la porta.
 */
export const dynamic = 'force-dynamic'

/** Il mese chiesto nell'indirizzo, o quello in corso se non è un mese. */
const meseDi = (req: NextRequest) =>
  monthParam(req.nextUrl.searchParams.get('m')) ?? monthKey(new Date())

const ctxDi = (month: string): GateCtx => ({
  resource: 'compensi', scope: month,
  titolo: `Compensi di ${monthLabel(month)}`,
  link: `/economics?m=${month}#compensi`,
})

/**
 * §344 — chi ha chiesto e ha avuto il sì manda il modulo qui: la richiesta
 * viaggia sullo stesso indirizzo del documento, così il link che gira è uno.
 */
export async function POST(req: NextRequest) {
  const month = meseDi(req)
  return reportRequest(req, ctxDi(month))
}

export async function GET(req: NextRequest) {
  const month = meseDi(req)
  /* §234 — una route è un endpoint HTTP come una server action, e nasconderne
     il link non è una barriera: il controllo sta qui, non nel pulsante. §344 —
     ma a chi non può si dà una strada, non tre parole di rifiuto. */
  const gate = await reportGate(req, ctxDi(month))
  if (gate.kind === 'stop') return gate.res

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
    autore: gate.autore,
    /* §335 — non solo quante, ma **quali**: la domanda che arriva davanti a un
       compenso più basso del previsto è «chi non ha pagato». */
    open: { n: summary.open.n, amount: summary.open.amount, rows: summary.open.rows.map(openLine) },
    next: { n: summary.next.n, amount: summary.next.amount, rows: summary.next.rows.map(openLine) },
    already: { n: summary.already.n, amount: summary.already.amount,
      rows: summary.already.rows.map(openLine) },
  })
  /* §344 — il foglio adesso lo può vedere anche un ospite approvato: non deve
     restare in nessuna cache intermedia dopo che il permesso è scaduto. */
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
