'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { buildSchedule, type RevenueStream, type ScheduleSpec } from '@/lib/revenue'
import {
  realignLines, moveInstallmentLine, syncInstallmentAmount, dropInstallmentLines,
} from '@/lib/pl-realign'
import { shiftMonth, monthLabel } from '@/lib/pl'
import { canValidate, canUnvalidate, type StreamState } from '@/lib/stream-validation'

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

  /* §306 — **la barriera sta qui, non nella select.** Lo stato di un accordo si
     cambiava da una tendina senza nessun controllo: si poteva riportare in bozza
     un contratto con rate già incassate — e da lì il canone sparisce
     dall'economics mentre i soldi restano in cassa senza niente che li spieghi —
     o attivare una manutenzione il cui progetto è ancora in corso, scavalcando
     `activateStream` che quel controllo lo faceva. Una regola che vive in un
     percorso e non nell'altro non è una regola. */
  if (patch.status) await guardStatus(id, patch.status)

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

/**
 * §306 — Il cambio di stato passa dalla stessa regola dei due gesti dedicati.
 *
 * Solo le due transizioni che possono fare danno sono controllate: verso
 * `attivo` (un accordo senza importo, o una manutenzione il cui lavoro è in
 * corso) e verso `bozza` (un accordo che ha già prodotto). `sospeso` e
 * `concluso` non toccano quello che è già stato scritto — chiudono il futuro,
 * non riscrivono il passato.
 */
async function guardStatus(id: string, next: StreamState) {
  const admin = createAdminClient()
  const { data: s } = await admin.from('revenue_streams')
    .select('status, amount, activates_after_id').eq('id', id).maybeSingle()
  if (!s) return
  const cur = String(s.status) as StreamState
  if (cur === next) return

  if (next === 'attivo') {
    let parent: { label: string; status: StreamState } | null = null
    if (s.activates_after_id) {
      const { data: p } = await admin.from('revenue_streams')
        .select('status, label').eq('id', s.activates_after_id).maybeSingle()
      if (p) parent = { label: String(p.label), status: String(p.status) as StreamState }
    }
    /* Da `sospeso` ad `attivo` è una ripresa, non una validazione: la regola
       vale sul passaggio dalla bozza, dove l'accordo non è ancora venduto. */
    if (cur === 'bozza') {
      const v = canValidate({ status: cur, amount: Number(s.amount ?? 0), parent })
      if (!v.can) throw new Error(`${v.why}. ${v.how}`)
    }
    return
  }

  if (next === 'bozza') {
    const { data: inst } = await admin.from('revenue_installments').select('id').eq('stream_id', id)
    const ids = ((inst ?? []) as { id: string }[]).map(x => x.id)
    let materialized = 0, paid = 0, closedMonth: string | null = null
    if (ids.length) {
      const { data: lines } = await admin.from('pl_revenue_lines')
        .select('paid, month_id').in('installment_id', ids)
      const rows = (lines ?? []) as { paid: boolean; month_id: string }[]
      materialized = rows.length
      paid = rows.filter(r => r.paid).length
      if (rows.length) {
        const { data: months } = await admin.from('pl_months')
          .select('month, status').in('id', Array.from(new Set(rows.map(r => r.month_id))))
        const chiuso = ((months ?? []) as { month: string; status: string }[])
          .filter(m => m.status === 'chiuso').map(m => m.month).sort()[0]
        closedMonth = chiuso ? monthLabel(chiuso.slice(0, 10)).toLowerCase() : null
      }
    }
    const v = canUnvalidate({
      status: cur, amount: Number(s.amount ?? 0), materialized, paid, closedMonth,
    })
    if (!v.can) throw new Error(`${v.why}. ${v.how}`)
  }
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
 * §306 — Valida un accordo: da 'bozza' ad 'attivo'.
 *
 * Ogni contratto nasce in bozza, e la bozza **non entra mai** — non fa canone,
 * non genera righe nel mese, non conta nel valore venduto del lavoro (§186). È
 * la regola giusta, ma finché questo gesto esisteva solo per le manutenzioni in
 * attesa del loro progetto, un accordo scritto normalmente restava invisibile a
 * tutto l'economics **per sempre**: l'importo nella scheda, il conto economico
 * che non ne sapeva niente, e nessuno dei due che diceva perché.
 *
 * Il controllo sta qui e non nel database: validare un accordo è una decisione
 * commerciale, non un effetto collaterale della chiusura di un progetto.
 */
export async function activateStream(id: string, ctx: RevCtx) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: s, error } = await admin.from('revenue_streams')
    .select('activates_after_id, status, amount').eq('id', id).single()
  if (error) throw new Error(error.message)

  let parent: { label: string; status: StreamState } | null = null
  if (s.activates_after_id) {
    const { data: p } = await admin.from('revenue_streams')
      .select('status, label').eq('id', s.activates_after_id).single()
    if (p) parent = { label: String(p.label), status: String(p.status) as StreamState }
  }

  const v = canValidate({
    status: String(s.status) as StreamState, amount: Number(s.amount ?? 0), parent,
  })
  if (!v.can) throw new Error(`${v.why}. ${v.how}`)

  const { error: eUp } = await admin.from('revenue_streams')
    .update({ status: 'attivo', updated_at: new Date().toISOString() }).eq('id', id)
  if (eUp) throw new Error(eUp.message)
  rev(ctx)
}

/**
 * §306 — Riporta un accordo in bozza.
 *
 * Serve quando un accordo è stato validato per sbaglio, o quando il cliente si
 * tira indietro prima di pagare. Non serve — e non si può — per riscrivere la
 * storia: una rata **incassata** ha dei soldi dietro, e un mese **chiuso** ha
 * già distribuito i compensi calcolati su quel ricavo.
 *
 * Le rate già materializzate nel mese non bloccano, ma restano dove sono: chi
 * riporta in bozza le trova ancora lì, e va detto prima — o il mese continua a
 * fatturare un contratto che non è più venduto.
 */
export async function unvalidateStream(id: string, ctx: RevCtx): Promise<{ warn?: string }> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: s, error } = await admin.from('revenue_streams')
    .select('status, amount').eq('id', id).single()
  if (error) throw new Error(error.message)

  /* Quanto ha già prodotto: le righe di ricavo che portano una sua rata, e in
     quali mesi stanno. È la sola cosa che decide se si può tornare indietro. */
  const { data: inst } = await admin.from('revenue_installments').select('id').eq('stream_id', id)
  const ids = ((inst ?? []) as { id: string }[]).map(x => x.id)
  let materialized = 0, paid = 0, closedMonth: string | null = null
  if (ids.length) {
    const { data: lines } = await admin.from('pl_revenue_lines')
      .select('paid, month_id').in('installment_id', ids)
    const rows = (lines ?? []) as { paid: boolean; month_id: string }[]
    materialized = rows.length
    paid = rows.filter(r => r.paid).length
    if (rows.length) {
      const { data: months } = await admin.from('pl_months')
        .select('month, status').in('id', Array.from(new Set(rows.map(r => r.month_id))))
      const chiuso = ((months ?? []) as { month: string; status: string }[])
        .filter(m => m.status === 'chiuso').map(m => m.month).sort()[0]
      closedMonth = chiuso ? monthLabel(chiuso.slice(0, 10)).toLowerCase() : null
    }
  }

  const v = canUnvalidate({
    status: String(s.status) as StreamState, amount: Number(s.amount ?? 0),
    materialized, paid, closedMonth,
  })
  if (!v.can) throw new Error(`${v.why}. ${v.how}`)

  const { error: eUp } = await admin.from('revenue_streams')
    .update({ status: 'bozza', updated_at: new Date().toISOString() }).eq('id', id)
  if (eUp) throw new Error(eUp.message)
  rev(ctx)
  return v.warn ? { warn: v.warn } : {}
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
