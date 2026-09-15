import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { runRecurrences } from '@/lib/recurrence-run'

/**
 * §337 — Materializza le ricorrenze, una volta al giorno.
 *
 * Chiamata dal task pianificato di Coolify, come il QA del tracking (§316):
 *   sh -c 'wget -qO- -T 300 --header="Authorization: Bearer $RECURRENCE_CRON_SECRET" --post-data= http://127.0.0.1:3000/api/recurrences/run'
 *
 * **Il cron sta qui e non nel database** perché nel database non è mai partito:
 * la 152 lo schedulava con `pg_cron` dentro un `EXCEPTION WHEN
 * undefined_function`, l'estensione non c'è, e per mesi 185 template attivi
 * hanno prodotto zero occorrenze senza che niente lo dicesse. Una schedulazione
 * che fallisce in silenzio è peggio di una che non c'è: quella almeno si nota.
 *
 * Due porte, e la seconda è il motivo per cui questa route risponde anche a una
 * sessione: un admin deve poterla lanciare **adesso**, dalla pagina, senza
 * aspettare le sei del mattino per sapere se una regola appena scritta produce
 * quello che si aspettava.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function fromCron(req: Request): boolean {
  const secret = process.env.RECURRENCE_CRON_SECRET ?? ''
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!secret || !token) return false
  const a = Buffer.from(secret), b = Buffer.from(token)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function fromAdmin(): Promise<boolean> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return (p as { role?: string } | null)?.role === 'admin'
}

export async function POST(req: Request) {
  if (!fromCron(req) && !(await fromAdmin())) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }
  try {
    const report = await runRecurrences(createAdminClient() as never)
    return NextResponse.json(report)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
