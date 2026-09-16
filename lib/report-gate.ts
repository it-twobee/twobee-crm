/**
 * §344 — La porta di un documento riservato: chiede un nome e lo fa sapere a
 * chi può aprire.
 *
 * Il dominio (quando un permesso vale, cosa è un nome) sta in
 * `lib/report-access.ts` e si prova senza database; qui c'è solo il traffico:
 * la sessione, il cookie, la riga, la notifica.
 *
 * **Chi può vedere non passa mai di qui.** La prima domanda resta quella di
 * §234 — `canSeeEconomics` — e una richiesta approvata non la sostituisce: la
 * affianca per un documento e per qualche giorno. Il service role si usa perché
 * chi chiede non ha una sessione: non c'è una RLS che possa rispondere per lui.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSeeEconomics, ADMIN_ROLES } from '@/lib/permissions'
import {
  ACCESS_COOKIE, COOKIE_DAYS, MAX_PENDING, RESOURCE_LABELS,
  checkNames, fullName, newToken, normName, scopeLabel, viewState, type AccessRow,
} from '@/lib/report-access'
import { gatePageHtml, type GateKind } from '@/lib/report-gate-html'

const TABLE = 'report_access_requests'

export type GateCtx = {
  resource: string
  /** Il documento chiesto: il mese, non la persona. */
  scope: string
  /** Come si intitola per chi nel tool non entra. */
  titolo: string
  /** Dove porta la notifica di chi deve decidere. */
  link: string
}

export type Gate =
  | { kind: 'pass'; autore: string }
  | { kind: 'stop'; res: NextResponse }

type Me = { email?: string | null; app_role?: string | null; full_name?: string | null }

const htmlRes = (html: string) => new NextResponse(html, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
})

async function findRow(
  admin: ReturnType<typeof createAdminClient>, token: string, ctx: GateCtx,
): Promise<AccessRow | null> {
  const { data } = await admin.from(TABLE).select('*')
    .eq('token', token).eq('resource', ctx.resource).eq('scope', ctx.scope).maybeSingle()
  return (data as AccessRow | null) ?? null
}

/** Chi ha già scritto il proprio nome non lo riscrive: né qui, né il mese dopo. */
function prefill(row: AccessRow | null, me: Me | null): [string, string] {
  if (row) return [row.first_name, row.last_name]
  const parts = normName(me?.full_name ?? '').split(' ').filter(Boolean)
  if (parts.length < 2) return [parts[0] ?? '', '']
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]]
}

async function readMe(): Promise<{ id: string | null; me: Me | null }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { id: null, me: null }
  const { data } = await sb.from('profiles')
    .select('email, app_role, full_name').eq('id', user.id).maybeSingle()
  return { id: user.id, me: (data as Me | null) ?? { email: user.email } }
}

/**
 * Chi sta guardando il documento, se può: l'admin di sempre, oppure l'ospite a
 * cui un admin ha detto sì. Chi non è né l'uno né l'altro riceve una pagina che
 * gli dice cosa fare — non tre parole di rifiuto.
 */
export async function reportGate(req: NextRequest, ctx: GateCtx): Promise<Gate> {
  const { me } = await readMe()
  if (canSeeEconomics(me)) return { kind: 'pass', autore: me?.full_name ?? '' }

  const admin = createAdminClient()
  const token = req.cookies.get(ACCESS_COOKIE)?.value ?? ''
  const row = token ? await findRow(admin, token, ctx) : null
  const now = new Date().toISOString()
  const stato = viewState(row, now)

  if (stato === 'aperto' && row) {
    /* Se e quante volte il foglio è stato aperto: chi ha dato il permesso deve
       poter vedere se è servito — e un permesso mai usato è il primo da
       togliere. */
    await admin.from(TABLE)
      .update({ opened_at: now, opened_n: (row.opened_n ?? 0) + 1 }).eq('id', row.id)
    return { kind: 'pass', autore: fullName(row) }
  }

  /* Scaduto torna al modulo, non al rifiuto: la scadenza è nostra, non una
     decisione contro chi ha chiesto. */
  const kind: GateKind = stato === 'attesa' ? 'attesa' : stato === 'negato' ? 'negato' : 'form'
  const [first, last] = prefill(row, me)
  return {
    kind: 'stop',
    res: htmlRes(gatePageHtml({
      kind, titolo: ctx.titolo, scope: ctx.scope,
      action: req.nextUrl.pathname + req.nextUrl.search,
      first, last, chi: row ? fullName(row) : undefined,
    })),
  }
}

/** Il modulo appena inviato. */
export async function reportRequest(req: NextRequest, ctx: GateCtx): Promise<NextResponse> {
  const action = req.nextUrl.pathname + req.nextUrl.search
  const form = await req.formData().catch(() => null)
  const first = normName(String(form?.get('nome') ?? ''))
  const last = normName(String(form?.get('cognome') ?? ''))

  const page = (kind: GateKind, error?: string) => htmlRes(gatePageHtml({
    kind, titolo: ctx.titolo, scope: ctx.scope, action, first, last, error,
  }))

  const { id: userId, me } = await readMe()
  // Chi può già vedere non deve chiedersi il permesso da solo.
  if (canSeeEconomics(me)) return seeOther(action)

  const err = checkNames(first, last)
  if (err) return page('form', err)

  const admin = createAdminClient()
  const token = req.cookies.get(ACCESS_COOKIE)?.value || newToken()
  const esistente = await findRow(admin, token, ctx)
  /* Un no si dà una volta: riaprire il modulo dopo un rifiuto trasformerebbe la
     decisione dell'admin nell'inizio di un ciclo. */
  if (esistente?.status === 'denied') return page('negato')
  if (esistente?.status === 'pending') return seeOther(action, token)

  const { count } = await admin.from(TABLE).select('id', { count: 'exact', head: true })
    .eq('resource', ctx.resource).eq('scope', ctx.scope).eq('status', 'pending')
  if ((count ?? 0) >= MAX_PENDING) return page('pieno')

  const now = new Date().toISOString()
  const { error } = await admin.from(TABLE).upsert({
    token, resource: ctx.resource, scope: ctx.scope,
    first_name: first, last_name: last,
    requester_email: me?.email ?? null, requester_id: userId,
    /* Un permesso scaduto che viene richiesto riparte da zero: la vecchia
       decisione non si trascina dietro né la data né chi l'aveva presa. */
    status: 'pending', decided_by: null, decided_at: null, expires_at: null,
    opened_at: null, opened_n: 0, created_at: now,
  }, { onConflict: 'token,resource,scope' })
  if (error) return page('form', 'Non è stato possibile inviare la richiesta. Riprova.')

  await notifyAdmins(admin, ctx, `${first} ${last}`, me?.email ?? null)
  return seeOther(action, token)
}

/**
 * 303 sulla stessa pagina: da lì in poi un ricarico rilegge lo stato, non
 * rimanda il modulo. La chiave del browser viaggia solo qui, e solo sotto
 * `/api`: è l'unico posto in cui serve.
 */
function seeOther(action: string, token?: string): NextResponse {
  const res = new NextResponse(null, {
    status: 303, headers: { Location: action, 'Cache-Control': 'no-store' },
  })
  if (token) res.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/api', maxAge: COOKIE_DAYS * 86_400,
  })
  return res
}

/**
 * La campanella di chi può decidere. Senza questa riga la richiesta resterebbe
 * in una tabella che nessuno apre, e chi ha chiesto aspetterebbe un sì che
 * nessuno sa di dover dare.
 */
async function notifyAdmins(
  admin: ReturnType<typeof createAdminClient>, ctx: GateCtx, chi: string, email: string | null,
) {
  const { data: admins } = await admin.from('profiles')
    .select('id').eq('is_active', true).in('app_role', ADMIN_ROLES)
  const rows = (admins ?? []).map((a: { id: string }) => ({
    user_id: a.id, profile_id: a.id,
    type: 'access_request',
    title: `Richiesta di accesso — ${chi}`,
    body: `${RESOURCE_LABELS[ctx.resource] ?? ctx.resource} di ${scopeLabel(ctx.scope)}`
      + (email ? ` · ${email}` : ' · senza account'),
    link: ctx.link,
  }))
  if (rows.length) await admin.from('notifications').insert(rows)
}
