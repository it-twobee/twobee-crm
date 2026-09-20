import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sincronizzaLead } from '@/lib/sales-sync'

/**
 * §370 — i lead dal foglio, una volta all'ora.
 *
 * Task pianificato di Coolify alle 03:00, come gli altri tre (§316, §337, §366):
 *   sh -c 'wget -qO- -T 120 --header="Authorization: Bearer $SALES_SYNC_SECRET" --post-data= http://127.0.0.1:3000/api/sales/sync'
 *
 * **Di notte e non ogni ora**, perché c'è il bottone. Un giro automatico
 * serve a non dover pensare al foglio; chi invece ci ha appena scritto dentro
 * non aspetta né la notte né l'ora — preme «Aggiorna dal foglio» e vede
 * subito se la riga è arrivata. Con il bottone, dodici giri al giorno
 * sarebbero dodici scaricamenti per trovare le stesse righe.
 *
 * La seconda porta resta per gli admin, ed è la stessa funzione che chiama il
 * bottone: se a mano e in automatico facessero due cose diverse, il giorno in
 * cui il cron sbaglia nessuno riuscirebbe a riprodurlo.
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
