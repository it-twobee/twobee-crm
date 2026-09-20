import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sincronizzaLead } from '@/lib/sales-sync'

/**
 * §370 — i lead dal foglio, una volta all'ora.
 *
 * Task pianificato di Coolify, come gli altri tre (§316, §337, §366):
 *   sh -c 'wget -qO- -T 120 --header="Authorization: Bearer $SALES_SYNC_SECRET" --post-data= http://127.0.0.1:3000/api/sales/sync'
 *
 * **Ogni ora e non ogni cinque minuti**: un lead che arriva alle 10:05 e
 * compare alle 11:00 è arrivato in tempo — nessuno richiama entro l'ora — e
 * dodici giri più frequenti sarebbero dodici scaricamenti in più per trovare
 * le stesse ventotto righe.
 *
 * Seconda porta per gli admin, come le ricorrenze: chi aggiunge una riga al
 * foglio deve poterla vedere **adesso** invece di scoprire all'ora dopo che
 * la colonna si chiamava in un altro modo. Il riepilogo torna nella risposta.
 *
 * Il giro non cancella e non riscrive niente: inserisce solo quello che non
 * c'era. Il peggio che può fare è non inserire — e un lead che manca si vede,
 * mentre un lead riscritto no.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function fromCron(req: Request): boolean {
  const secret = process.env.SALES_SYNC_SECRET ?? ''
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
    return NextResponse.json(await sincronizzaLead(createAdminClient()))
  } catch (e) {
    console.error('[sales-sync] giro fallito:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Giro fallito' }, { status: 500 })
  }
}
