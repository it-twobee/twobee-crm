import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Ingresso pubblico dei lead da form: landing page, sito, Typeform, WordPress —
 * qualunque cosa sappia fare una POST.
 *
 * Il token nell'URL è l'unica credenziale, quindi è trattato come un segreto:
 * vive in `client_integration_secrets` (RLS deny-all) e si cerca solo con il
 * service role. Chi lo possiede può scrivere lead su quel cliente e nient'altro.
 *
 * Nessuna autenticazione utente: il form di un cliente non ha una sessione.
 * Le difese sono: token non indovinabile, campi in whitelist, honeypot,
 * limite di lunghezza. Un token compromesso si rigenera dalla UI e il vecchio
 * smette di funzionare all'istante.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LEN = 500
const clip = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, MAX_LEN) : null
}

/** I browser preflightano se il form invia JSON da un dominio diverso. */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}

const cors = { 'Access-Control-Allow-Origin': '*' }

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'token non valido' }, { status: 401, headers: cors })
  }

  // Accetta sia JSON sia il classico form urlencoded, che è quello che manda
  // un <form> HTML senza JavaScript.
  let body: Record<string, unknown> = {}
  const ct = req.headers.get('content-type') ?? ''
  try {
    if (ct.includes('application/json')) {
      body = await req.json()
    } else {
      const fd = await req.formData()
      body = Object.fromEntries(Array.from(fd.entries()).map(([k, v]) => [k, String(v)]))
    }
  } catch {
    return NextResponse.json({ error: 'payload illeggibile' }, { status: 400, headers: cors })
  }

  // Honeypot: un campo che gli umani non compilano mai e i bot sì.
  // Si risponde 200 per non insegnare al bot che è stato scoperto.
  const honeypot = body._hp ?? body.website_url ?? body.fax
  if (typeof honeypot === 'string' && honeypot.trim()) {
    return NextResponse.json({ ok: true }, { headers: cors })
  }

  const admin = createAdminClient()

  const { data: secret } = await admin
    .from('client_integration_secrets')
    .select('integration_id')
    .eq('access_token', token)
    .maybeSingle()

  if (!secret) {
    return NextResponse.json({ error: 'token non riconosciuto' }, { status: 401, headers: cors })
  }

  const { data: integ } = await admin
    .from('client_integrations')
    .select('id, client_id, project_id, provider, is_active, config')
    .eq('id', (secret as { integration_id: string }).integration_id)
    .single()

  const it = integ as {
    id: string; client_id: string; project_id: string | null
    provider: string; is_active: boolean; config: Record<string, unknown>
  } | null

  if (!it || !it.is_active || it.provider !== 'web_form') {
    return NextResponse.json({ error: 'collegamento non attivo' }, { status: 403, headers: cors })
  }

  // Alias configurabili: ogni form chiama i campi a modo suo.
  const map = (it.config?.field_map ?? {}) as Record<string, string>
  const pick = (canonical: string, fallbacks: string[]): string | null => {
    const custom = map[canonical]
    if (custom && body[custom] != null) return clip(body[custom])
    for (const f of [canonical, ...fallbacks]) {
      if (body[f] != null) { const v = clip(body[f]); if (v) return v }
    }
    return null
  }

  const full_name = pick('full_name', ['name', 'nome', 'nome_cognome', 'fullname'])
  const email = pick('email', ['mail', 'e_mail'])
  const phone = pick('phone', ['telefono', 'tel', 'cellulare'])

  if (!email && !phone) {
    return NextResponse.json(
      { error: 'serve almeno email o telefono' }, { status: 422, headers: cors },
    )
  }

  // Tutto il resto finisce in metadata: meglio conservarlo che perderlo, e i
  // form cambiano campi senza avvisare.
  const known = new Set(['full_name', 'name', 'nome', 'nome_cognome', 'fullname',
    'email', 'mail', 'e_mail', 'phone', 'telefono', 'tel', 'cellulare',
    '_hp', 'website_url', 'fax', ...Object.values(map)])
  const metadata: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (!known.has(k)) metadata[k] = typeof v === 'string' ? v.slice(0, MAX_LEN) : v
  }
  metadata._source_url = req.headers.get('referer') ?? null
  metadata._received_at = new Date().toISOString()

  const { error } = await admin.from('lead_contacts').insert({
    client_id: it.client_id,
    project_id: it.project_id,
    integration_id: it.id,
    source: 'website',
    full_name,
    email,
    phone,
    status: 'nuovo',
    metadata,
  } as never)

  if (error) {
    // 23505 = duplicato sull'indice (integration_id, external_id). Qui non
    // valorizziamo external_id, ma se un domani lo faremo il form non deve
    // vedere un errore per un lead già registrato.
    if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true }, { headers: cors })
    await admin.from('client_integrations')
      .update({ status: 'errore', last_error: error.message } as never).eq('id', it.id)
    return NextResponse.json({ error: 'impossibile registrare il lead' }, { status: 500, headers: cors })
  }

  await admin.from('client_integrations')
    .update({ status: 'attiva', last_sync_at: new Date().toISOString(), last_error: null } as never)
    .eq('id', it.id)

  return NextResponse.json({ ok: true }, { headers: cors })
}
