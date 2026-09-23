import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * §410 — riceve il battito e lo consegna al database, che decide.
 *
 * La rotta non si fida di niente di quello che arriva: il numero di interazioni
 * lo taglia la funzione SQL, e **chi** sta interagendo non è nel corpo della
 * richiesta — lo legge `auth.uid()` dentro `registra_presenza`. È la sola
 * ragione per cui questa misura vale qualcosa: un battito che porta con sé l'id
 * di chi lo manda è un contatore che chiunque può scrivere sul conto di
 * chiunque, sé stesso compreso, a ritroso.
 *
 * Risponde 204 e non racconta niente: chi sta lavorando non deve accorgersi di
 * essere misurato più di quanto lo dica la pagina che glielo dichiara.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 401 })

  let body: { portale?: unknown; route?: unknown; interazioni?: unknown } = {}
  try { body = await request.json() } catch { /* corpo illeggibile: valgono i default */ }

  const route = typeof body.route === 'string' ? body.route.split('?')[0].slice(0, 200) : '/'
  const portale = typeof body.portale === 'string' ? body.portale : 'altro'
  const interazioni = typeof body.interazioni === 'number' && Number.isFinite(body.interazioni)
    ? Math.trunc(body.interazioni)
    : 0

  await supabase.rpc('registra_presenza', {
    p_portale: portale,
    p_route: route,
    p_interazioni: interazioni,
  })

  return new NextResponse(null, { status: 204 })
}
