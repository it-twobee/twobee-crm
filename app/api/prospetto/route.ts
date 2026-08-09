import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canSeeEconomics } from '@/lib/permissions'
import { loadProspetto } from '@/lib/prospetto-load'
import { reportHtml } from '@/lib/prospetto-report'
import { monthKey } from '@/lib/pl'

/**
 * §268 — Il report del mese, da stampare o allegare a un verbale.
 * Il documento lo compone `lib/prospetto-report.ts`; qui c'è solo la porta.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  /* Il dominio economico è chiuso in un posto solo (§234): una route è un
     endpoint HTTP come una server action, e nasconderne il link non è una
     barriera. */
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return new NextResponse('Non autenticato', { status: 401 })
  const { data: profile } = await sb.from('profiles')
    .select('email, app_role, full_name').eq('id', user.id).maybeSingle()
  if (!canSeeEconomics(profile)) return new NextResponse('Permesso negato', { status: 403 })

  const today = new Date().toISOString().slice(0, 10)
  const m = req.nextUrl.searchParams.get('m')
  const month = m ? monthKey(new Date(m)) : monthKey(new Date())

  const d = await loadProspetto(sb, month, today)
  if (d.setupNeeded) return new NextResponse('Conto economico non configurato', { status: 400 })

  const html = reportHtml(d, month, today,
    String((profile as { full_name?: string } | null)?.full_name ?? ''))
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
