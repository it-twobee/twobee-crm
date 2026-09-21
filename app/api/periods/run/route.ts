import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apriPerProgetto } from '@/lib/periodi-apertura'

/**
 * §392 — il giro che apre i periodi di tutti i progetti.
 *
 * Task pianificato di Coolify alle 04:00, come gli altri quattro
 * (§316, §337, §366, §370):
 *   sh -c 'wget -qO- -T 300 --header="Authorization: Bearer $PERIODS_CRON_SECRET" --post-data= http://127.0.0.1:3000/api/periods/run'
 *
 * **Una volta al giorno e non più spesso**, perché un periodo si apre una
 * volta ogni due mesi: il giro serve a non doverci pensare, non a reagire
 * in fretta. Chi ha bisogno di un periodo adesso ha il bottone sulla
 * pagina del progetto, ed è la stessa funzione — se a mano e in automatico
 * facessero due cose diverse, il giorno in cui il cron sbaglia nessuno
 * riuscirebbe a riprodurlo (§288).
 *
 * **Un progetto che fallisce non ferma gli altri.** Con ventidue progetti
 * in fila, un errore su uno — uno scheletro con un nodo storto, un vincolo
 * violato — lascerebbe i venti dopo senza periodi e nessuno saprebbe
 * perché. Ognuno si prova da solo e i fallimenti si contano.
 *
 * Non c'è niente di distruttivo qui: il giro crea, non cancella e non
 * riscrive. Il peggio che può fare è aprire un periodo di troppo — e un
 * periodo di troppo si vede, mentre uno che manca no.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function fromCron(req: Request): boolean {
  const secret = process.env.PERIODS_CRON_SECRET ?? ''
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!secret || !token) return false
  const a = Buffer.from(secret), b = Buffer.from(token)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function fromAdmin(): Promise<{ ok: boolean; uid: string | null }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, uid: null }
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { ok: (p as { role?: string } | null)?.role === 'admin', uid: user.id }
}

export async function POST(req: Request) {
  const admin = await fromAdmin()
  if (!fromCron(req) && !admin.ok) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const db = createAdminClient()
  /* Solo i progetti **attivi**: una bozza non ha ancora un calendario, e un
     progetto completato non deve ricominciare a produrre trimestri. */
  const { data: progetti, error } = await db.from('projects')
    .select('id, name').eq('status', 'active')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /* Il cron non ha una persona dietro. `created_by` resta nullo invece di
     prendersi l'ultimo admin passato di qui: «Sistema» è la verità, e
     attribuire a qualcuno una corsia che non ha aperto è peggio di non
     attribuirla. */
  const uid = admin.uid

  let periodi = 0, tappe = 0, task = 0, toccati = 0
  const falliti: { progetto: string; motivo: string }[] = []

  for (const p of (progetti ?? []) as { id: string; name: string }[]) {
    try {
      const e = await apriPerProgetto(db, uid, p.id)
      if (e.creati.length) {
        toccati++
        periodi += e.creati.length
        tappe += e.tappe
        task += e.task
      }
    } catch (err) {
      falliti.push({ progetto: p.name, motivo: err instanceof Error ? err.message : 'errore' })
    }
  }

  return NextResponse.json({
    progetti: (progetti ?? []).length, toccati, periodi, tappe, task,
    falliti: falliti.slice(0, 10),
    fallitiTotali: falliti.length,
  })
}
