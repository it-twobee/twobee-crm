'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { buildSchedule, type RevenueStream, type ScheduleSpec } from '@/lib/revenue'
import {
  realignLines, moveInstallmentLine, syncInstallmentAmount, dropInstallmentLines,
} from '@/lib/pl-realign'
import { shiftMonth } from '@/lib/pl'

const PL_PATH = '/economics'


/**
 * Lo stesso contratto si modifica da due posti — la scheda del progetto e
 * l'economics del cliente — e da un terzo si legge (il conto economico).
 * Chi chiama dice da dove sta guardando, così si aggiornano tutte e tre.
 */
export type RevCtx = { projectId?: string | null; clientId?: string | null }

function rev(ctx: RevCtx) {
  if (ctx.projectId) revalidatePath(`/progetti/${ctx.projectId}`)
  if (ctx.clientId) revalidatePath(`/clienti/${ctx.clientId}`)
  revalidatePath('/economics')
  revalidatePath('/clienti')
}

export type StreamInput = {
  label: string
  project_id?: string | null
  client_id?: string | null
  service_type?: string | null
  service_subtype?: string | null
  price_source?: 'standard' | 'custom'
  kind?: 'growth' | 'digital'
  billing?: 'recurring' | 'one_off'
  amount?: number
  vat_rate?: number
  start_date?: string | null
  end_date?: string | null
  status?: 'bozza' | 'attivo' | 'sospeso' | 'concluso'
  sales_owner_id?: string | null
  activates_after_id?: string | null
  /** §174: come si paga, non solo quanto — «30gg d.f.f.m.», «40/30/30 a SAL» */
  payment_terms?: string | null
  note?: string | null
}

export async function addStream(input: StreamInput, ctx: RevCtx) {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  // senza progetto il cliente è l'unica ancora: il trigger non ha da dove dedurlo
  const client_id = input.project_id ? undefined : (input.client_id ?? ctx.clientId ?? null)
  const { data, error } = await admin.from('revenue_streams')
    .insert({ ...input, created_by: uid, ...(client_id !== undefined ? { client_id } : {}) })
    .select('*').single()
  if (error) throw new Error(error.message)
  rev(ctx)
  return data
}

export async function updateStream(id: string, patch: Partial<StreamInput>, ctx: RevCtx) {
  await requireAdmin()
  // staccare un contratto da un progetto non deve lasciarlo senza cliente
  const extra = patch.project_id === null && !patch.client_id && ctx.clientId
    ? { client_id: ctx.clientId }
    : {}
  const { error } = await createAdminClient().from('revenue_streams')
    .update({ ...patch, ...extra, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)

  /* §207 — il conto economico non rilegge il contratto: se lo è copiato quando
     il mese è stato preparato. Portare «Tipo» da growth a digital senza toccare
     i mesi già aperti lascia in giro righe che pagano il 15% su un lavoro al 6%,
     e la pagina che le mostra ha un lucchetto che rimanda proprio a qui. I mesi
     chiusi restano come sono: sono una fotografia. */
  const realigned = await realignLines({ streamIds: [id] })

  rev(ctx)
  return { realigned }
}

export async function deleteStream(id: string, ctx: RevCtx) {
  await requireAdmin()
  const { error } = await createAdminClient().from('revenue_streams').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(ctx)
}

/**
 * Rate di un lavoro a corpo. Sostituisce quelle esistenti: un piano di
 * fatturazione si rifà intero, non si somma a quello vecchio.
 *
 * `mode` 'even' divide in parti uguali su `count` mesi, 'percent' segue le
 * percentuali date (40/30/30). In entrambi i casi l'ultima rata assorbe
 * l'arrotondamento, così la somma fa esattamente il totale del contratto.
 */
export async function generateInstallments(streamId: string, spec: ScheduleSpec, ctx: RevCtx) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: s, error: e0 } = await admin.from('revenue_streams')
    .select('amount, billing').eq('id', streamId).single()
  if (e0) throw new Error(e0.message)
  if (s.billing !== 'one_off') throw new Error('Le rate valgono solo sui lavori a corpo')

  const drafts = buildSchedule(Number(s.amount), spec)
  if (!drafts.length) throw new Error('Piano vuoto: controlla le percentuali')

  /* §209 — un piano di fatturazione si rifà intero, e le righe già materializzate
     dalle rate vecchie devono sparire con loro: `installment_id` è SET NULL,
     quindi resterebbero nel mese come ricavo senza contratto, sommate a quelle
     nuove. Il mese fatturerebbe due volte lo stesso lavoro. */
  const { data: old } = await admin.from('revenue_installments')
    .select('id').eq('stream_id', streamId)
  await dropInstallmentLines(((old ?? []) as { id: string }[]).map(i => i.id))

  const { error: eDel } = await admin.from('revenue_installments').delete().eq('stream_id', streamId)
  if (eDel) throw new Error(eDel.message)

  const { error } = await admin.from('revenue_installments').insert(
    drafts.map((d, i) => ({ stream_id: streamId, ...d, sort_order: i * 10 })),
  )
  if (error) throw new Error(error.message)
  rev(ctx)
  return drafts.length
}

/**
 * Una rata in più, a mano. I piani veri non stanno sempre in uno schema: un
 * cliente chiede di spostare un pezzo a gennaio e basta, e deve poterlo fare
 * senza rifare tutto il piano.
 */
export async function addInstallment(streamId: string, ctx: RevCtx) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: rows } = await admin.from('revenue_installments')
    .select('due_month, sort_order').eq('stream_id', streamId).order('due_month')
  const last = rows?.[rows.length - 1]
  const nextMonth = last
    ? shiftMonth(last.due_month.slice(0, 8) + '01', 1)
    : new Date().toISOString().slice(0, 8) + '01'

  const { error } = await admin.from('revenue_installments').insert({
    stream_id: streamId, due_month: nextMonth, label: 'Nuova rata', amount: 0,
    sort_order: ((last?.sort_order ?? 0) + 10),
  })
  if (error) throw new Error(error.message)
  rev(ctx)
}

export async function updateInstallment(
  id: string,
  patch: Partial<{ due_month: string; label: string | null; amount: number; invoiced: boolean; paid: boolean }>,
  ctx: RevCtx,
) {
  await requireAdmin()
  const { error } = await createAdminClient().from('revenue_installments').update(patch).eq('id', id)
  if (error) throw new Error(error.message)

  /* §209 — la riga del conto economico segue la rata. Spostare la scadenza e
     lasciare la riga dov'era sbaglia **due** mesi: quello che la perde continua
     a contarla, quello che la riceve non la vede. E sul digital sposta anche il
     margine, perché il subappalto si toglie dalla rata dello stesso mese. */
  const moved = patch.due_month ? await moveInstallmentLine(id) : null
  if (patch.amount !== undefined) await syncInstallmentAmount(id, patch.amount)

  rev(ctx)
  if (moved?.moved) revalidatePath(PL_PATH)
  return moved
}

export async function deleteInstallment(id: string, ctx: RevCtx) {
  await requireAdmin()
  // prima la riga del mese: il vincolo è SET NULL, e una riga senza più la sua
  // rata resterebbe a fatturare nel conto economico senza che nessuno la trovi
  await dropInstallmentLines([id])
  const { error } = await createAdminClient().from('revenue_installments').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(ctx)
  revalidatePath(PL_PATH)
}

/**
 * Porta in 'attivo' una manutenzione la cui lavorazione è conclusa.
 * Il controllo sta qui e non nel database: attivare un canone è una decisione
 * commerciale, non un effetto collaterale della chiusura di un progetto.
 */
export async function activateStream(id: string, ctx: RevCtx) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: s, error } = await admin.from('revenue_streams')
    .select('activates_after_id, status').eq('id', id).single()
  if (error) throw new Error(error.message)
  if (s.status !== 'bozza') throw new Error('Questo contratto non è in bozza')

  if (s.activates_after_id) {
    const { data: parent } = await admin.from('revenue_streams')
      .select('status, label').eq('id', s.activates_after_id).single()
    if (parent && parent.status !== 'concluso') {
      throw new Error(`«${parent.label}» non è ancora concluso: la manutenzione parte da lì`)
    }
  }

  const { error: eUp } = await admin.from('revenue_streams')
    .update({ status: 'attivo', updated_at: new Date().toISOString() }).eq('id', id)
  if (eUp) throw new Error(eUp.message)
  rev(ctx)
}

/** Prezzo di listino di un servizio: alimenta il default in fase di quotazione. */
export async function setServicePrice(id: string, price: number | null, unit: 'mese' | 'una_tantum') {
  await requireAdmin()
  const { error } = await createAdminClient().from('service_catalog')
    .update({ standard_price: price, price_unit: unit }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni/catalogo')
}

export type { RevenueStream }
