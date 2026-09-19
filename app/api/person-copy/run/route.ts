import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { generaTutti } from '@/lib/person-copy-gen'
import { giornoAzienda } from '@/lib/person-copy'

/**
 * §360 — scrive la riga di saluto di tutti, una volta al giorno.
 *
 * Task pianificato di Coolify alle 05:30, come il QA del tracking (§316) e le
 * ricorrenze (§337):
 *   sh -c 'wget -qO- -T 600 --header="Authorization: Bearer $PERSON_COPY_CRON_SECRET" --post-data= http://127.0.0.1:3000/api/person-copy/run'
 *
 * **Alle 05:30 e non a mezzanotte**: i fatti sono quelli del giorno che sta per
 * cominciare — scadenze di oggi, colleghi in ferie oggi — e a mezzanotte in
 * fuso locale il giorno UTC è ancora quello prima. Mezz'ora prima del primo che
 * apre basta, e se il giro fallisce nessuno se ne accorge: resta il testo
 * deterministico di `task-mood.ts`.
 *
 * Seconda porta, per la stessa ragione di §337: un admin deve poter rilanciare
 * **adesso** dopo aver toccato il prompt, senza aspettare l'alba per sapere se
 * quello che ha scritto produce righe che passano il validatore. Il riepilogo
 * torna nella risposta, `ritentate` compreso: se sale, il prompt sta sbagliando
 * e senza quel numero non se ne accorge nessuno.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 600

function fromCron(req: Request): boolean {
  const secret = process.env.PERSON_COPY_CRON_SECRET ?? ''
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
  const oggi = giornoAzienda()
  try {
    return NextResponse.json(await generaTutti(createAdminClient(), oggi))
  } catch (e) {
    console.error('[person-copy] giro fallito:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'giro fallito' }, { status: 500 })
  }
}
