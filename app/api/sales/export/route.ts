import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { CAMPI_RIGA } from '@/lib/sales-table'
import { leggiCampi, leggiFasi, leggiMotiviPerso, leggiScelte } from '@/lib/sales-fasi'
import { giornoOraRoma } from '@/lib/sales-timeline'
import {
  TIPO_MIME, csv, nomeFile, puoEsportare, tabellaContatti, tabellaInterazioni, tabellaLead, validaRichiesta,
  type Contesto, type VoceExport,
} from '@/lib/sales-export'
import { pdf, xlsx } from '@/lib/sales-export-file'

export const dynamic = 'force-dynamic'

/**
 * §441 — l'export dei lead e dei contatti.
 *
 * **Solo super admin, founder e admin**, guardando `app_role` riletto dal database, non
 * `role` (la mappatura grossolana della RLS) e non quello che dice il browser:
 * un file con tutti i recapiti esce dal tool e non si richiama più, e questa
 * route è un endpoint che chiunque abbia il codice sa chiamare (§329).
 *
 * Il browser manda gli **id** delle righe, nell'ordine in cui le vede — la
 * selezione, o quello che i filtri mostrano — e qui si rileggono dal database:
 * il file dice quello che c'è, non quello che la pagina aveva in memoria.
 */
export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Accesso richiesto' }, { status: 401 })
  const { data: me } = await sb.from('profiles').select('app_role, email, full_name, is_active').eq('id', user.id).single()
  if (!me || me.is_active === false || !puoEsportare(me.app_role, me.email, SUPER_ADMIN_EMAILS)) {
    return NextResponse.json({ error: 'L’export è riservato a founder e amministratori' }, { status: 403 })
  }

  let corpo: unknown
  try { corpo = await req.json() } catch { return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 }) }
  const r = validaRichiesta(corpo)
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 400 })

  const admin = createAdminClient()
  const { data: grezzi, error } = await admin.from('deals').select(CAMPI_RIGA.join(',')).in('id', r.ids)
  if (error) return NextResponse.json({ error: 'Lettura dei lead non riuscita' }, { status: 500 })
  const perId = new Map(((grezzi ?? []) as unknown as Record<string, unknown>[]).map(d => [d.id as string, d]))
  // l'ordine è quello che l'utente vedeva: un file ordinato diversamente dall'elenco sembra un altro elenco
  const deals = r.ids.map(id => perId.get(id)).filter((d): d is Record<string, unknown> => !!d) as (Record<string, unknown> & { id: string; owners?: string[] })[]
  if (!deals.length) return NextResponse.json({ error: 'Nessuno di questi lead esiste più' }, { status: 404 })

  const ids = deals.map(d => d.id)
  const [{ data: legami }, { data: extra }, fasi, scelte, motivi, campi] = await Promise.all([
    admin.from('deal_owners').select('deal_id, profile_id').in('deal_id', ids),
    admin.from('deals').select('id, campi_extra').in('id', ids),
    leggiFasi(), leggiScelte(), leggiMotiviPerso(), leggiCampi(),
  ])
  const owner = new Map<string, string[]>()
  for (const l of (legami ?? []) as { deal_id: string; profile_id: string }[]) owner.set(l.deal_id, [...(owner.get(l.deal_id) ?? []), l.profile_id])
  const extraDi = new Map(((extra ?? []) as { id: string; campi_extra: Record<string, unknown> | null }[]).map(e => [e.id, e.campi_extra ?? {}]))
  for (const d of deals) { d.owners = owner.get(d.id) ?? []; d.campi_extra = extraDi.get(d.id) ?? {} }

  // le interazioni solo per l'export completo: la rubrica dei contatti non le chiede
  const voci = new Map<string, VoceExport[]>()
  const idPersone = new Set<string>(Array.from(owner.values()).flat())
  if (r.tipo === 'lead') {
    const { data: att } = await admin.from('deal_activities')
      .select('deal_id, type, outcome, direction, stato, occurred_at, has_time, content, created_by')
      .in('deal_id', ids).order('occurred_at', { ascending: false })
    for (const a of (att ?? []) as (Omit<VoceExport, 'autore'> & { created_by: string | null })[]) {
      if (a.created_by) idPersone.add(a.created_by)
      voci.set(a.deal_id, [...(voci.get(a.deal_id) ?? []), { ...a, autore: a.created_by }])
    }
  }
  const { data: profili } = idPersone.size
    ? await admin.from('profiles').select('id, full_name').in('id', Array.from(idPersone))
    : { data: [] as { id: string; full_name: string | null }[] }
  const persone = new Map((profili ?? []).map(p => [p.id as string, (p.full_name as string | null) ?? 'Senza nome']))
  for (const lista of Array.from(voci.values())) for (const v of lista) v.autore = v.autore ? persone.get(v.autore) ?? 'Ex collega' : null

  const ctx: Contesto = { fasi, scelte, motivi: new Map(motivi.map(m => [m.chiave, m.etichetta])), persone, campi }
  const adesso = Date.now()
  const file = nomeFile(r.tipo, r.formato, adesso)
  const intestazione = [
    `${deals.length} ${r.tipo === 'lead' ? 'lead' : deals.length === 1 ? 'contatto' : 'contatti'}`,
    r.filtri ? `Filtri: ${r.filtri}` : 'Nessun filtro',
    `Esportato da ${me.full_name ?? me.email ?? 'un admin'} il ${giornoOraRoma(new Date(adesso).toISOString())}`,
  ].join(' · ')

  let corpoFile: Buffer | string
  if (r.tipo === 'contatti') {
    const t = tabellaContatti(deals, ctx)
    corpoFile = r.formato === 'csv' ? csv(t)
      : r.formato === 'xlsx' ? await xlsx([{ nome: 'Contatti', tabella: t }])
      : pdf({ titolo: 'Contatti · TwoBee', sottotitolo: intestazione, tabelle: [{ tabella: t }] })
  } else if (r.formato === 'csv') {
    // un CSV ha un foglio solo: le interazioni stanno in una colonna, una per riga
    corpoFile = csv(tabellaLead(deals, ctx, voci))
  } else if (r.formato === 'xlsx') {
    corpoFile = await xlsx([
      { nome: 'Lead', tabella: tabellaLead(deals, ctx) },
      { nome: 'Interazioni', tabella: tabellaInterazioni(deals, voci) },
    ])
  } else {
    /* il PDF è per leggere e stampare: le colonne che si guardano, non le
       trenta del foglio, e sotto il diario */
    const t = tabellaLead(deals, ctx)
    const colonne = ['Company', 'Status', 'Contact Person', 'Phone', 'Email', 'Account Owner', 'Last Contact', 'Tentativi', 'Prossimo follow-up', 'Note']
      .map(n => t.intestazioni.indexOf(n)).filter(i => i >= 0)
    const inter = tabellaInterazioni(deals, voci)
    corpoFile = pdf({ titolo: 'Lead · TwoBee', sottotitolo: intestazione, tabelle: [
      { tabella: t, colonne },
      ...(inter.righe.length ? [{ titolo: 'Interazioni', tabella: inter }] : []),
    ] })
  }

  return new NextResponse(typeof corpoFile === 'string' ? corpoFile : new Uint8Array(corpoFile), {
    headers: {
      'Content-Type': TIPO_MIME[r.formato],
      'Content-Disposition': `attachment; filename="${file}"`,
      'Cache-Control': 'no-store',
    },
  })
}
