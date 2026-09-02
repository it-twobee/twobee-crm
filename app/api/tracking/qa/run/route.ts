import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { runQa } from '@/lib/tracking/qa'
import { errorMessage, isTrackingError } from '@/lib/tracking/errors'

/**
 * §316 — QA giornaliero, chiamato dal task pianificato di Coolify alle 07:00:
 *   sh -c 'wget -qO- -T 900 --header="Authorization: Bearer $TRACKING_CRON_SECRET" --post-data= http://127.0.0.1:3000/api/tracking/qa/run'
 *
 * Nessuna sessione: autorizza solo il segreto. Il giro è sincrono (Node
 * standalone, nessun limite serverless) e risponde col riepilogo. Il client
 * admin si crea dentro il handler: `next build` valuta le route e non deve
 * avere bisogno delle chiavi.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 600

function authorized(req: Request): boolean {
  const secret = process.env.TRACKING_CRON_SECRET ?? ''
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!secret || !token) return false
  const a = Buffer.from(secret), b = Buffer.from(token)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  try {
    const summary = await runQa(createAdminClient(), 'cron')
    return NextResponse.json(summary)
  } catch (e) {
    const status = isTrackingError(e) ? e.status : 500
    if (status >= 500) console.error('[qa] cron fallito:', e)
    return NextResponse.json({ error: errorMessage(e) }, { status })
  }
}
