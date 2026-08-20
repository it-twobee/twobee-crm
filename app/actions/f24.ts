'use server'

/**
 * Scrivere un modello F24. (§301)
 *
 * Il motore è puro e sta in `lib/f24.ts`: qui c'è l'autorizzazione, il legame
 * coi due domini che il modello contiene, e la scrittura.
 *
 * **Il modello vince, e lo dice ai domini che contiene**: la riga IVA marca
 * versata la liquidazione del trimestre (§242), quelle di ritenute e contributi
 * marcano pagato il loro `hr_f24` (§182). Non li sostituisce — quelle tabelle
 * restano l'autorità del *loro* numero — ma è il documento a sapere **quando** i
 * soldi sono usciti, perché è l'unico che esiste come foglio.
 */

import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { check, split, netDue, type F24Doc, type F24Line } from '@/lib/f24'

const SETUP = 'Manca la migration 215_f24_documents.sql: i modelli F24 non hanno '
  + 'ancora un posto dove stare. Eseguila nel SQL Editor e questa sezione si accende da sé.'

function rev() {
  revalidatePath('/economics/fiscale')
  revalidatePath('/economics')
  revalidatePath('/economics/banca')
}

export type F24Input = {
  dueDate: string
  paidOn?: string | null
  total: number
  docRef?: string | null
  note?: string | null
  lines: F24Line[]
}

/**
 * Trascrive un modello, e solo se torna.
 *
 * Il controllo sta qui e non solo nel trigger perché il messaggio che serve a
 * chi ha il foglio davanti — «mancano 856 €, cercali» — un vincolo di database
 * non lo sa dire.
 */
export async function saveF24(input: F24Input): Promise<{ id: string; iva: number; personale: number }> {
  const uid = await requireAdmin()
  const admin = createAdminClient()

  const doc: F24Doc = {
    dueDate: input.dueDate, paidOn: input.paidOn ?? null,
    total: input.total, docRef: input.docRef ?? null, lines: input.lines,
  }
  const c = check(doc)
  if (!c.ok) throw new Error(c.why)

  const { data: head, error } = await createActorClient(uid).from('f24_documents').insert({
    due_date: input.dueDate, paid_on: input.paidOn ?? null,
    total: input.total, doc_ref: input.docRef ?? null, note: input.note ?? null,
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.code === '42P01' ? SETUP : error.message)
  const docId = (head as { id: string }).id

  /* Il legame coi domini si cerca **dal periodo del tributo**, non da quello del
     versamento: l'IVA versata il 20 agosto è quella del 2º trimestre, e le
     ritenute sono quelle di luglio. Confonderli attaccherebbe il modello al
     trimestre sbagliato. */
  const rows = await Promise.all(input.lines.map(async l => {
    let vatId: string | null = null
    let hrId: string | null = null
    if (l.kind === 'iva' && l.period) {
      const y = Number(l.period.slice(0, 4))
      const q = Math.floor((Number(l.period.slice(5, 7)) - 1) / 3) + 1
      const { data } = await admin.from('vat_settlements')
        .select('id').eq('year', y).eq('quarter', q).maybeSingle()
      vatId = (data as { id: string } | null)?.id ?? null
    }
    if ((l.kind === 'ritenute' || l.kind === 'inps' || l.kind === 'inail' || l.kind === 'credito') && l.period) {
      const { data } = await admin.from('hr_f24')
        .select('id').eq('month', `${l.period.slice(0, 7)}-01`).maybeSingle()
      hrId = (data as { id: string } | null)?.id ?? null
    }
    return {
      doc_id: docId, codice: l.codice, label: l.label, kind: l.kind,
      amount: l.amount, period: l.period ?? null,
      vat_settlement_id: vatId, hr_f24_id: hrId,
    }
  }))

  const { error: e2 } = await admin.from('f24_lines').insert(rows)
  if (e2) throw new Error(e2.message)

  if (input.paidOn) await markPaid(docId, input.paidOn)

  rev()
  const s = split(input.lines)
  return { id: docId, iva: s.vat, personale: s.payroll }
}

/**
 * Il modello è stato versato: lo dice ai domini che contiene.
 *
 * È l'unico posto che può farlo, perché è l'unico che sa che quei tributi sono
 * usciti **insieme**. Prima la data si scriveva a mano in due tabelle, e le due
 * mani potevano non essere d'accordo.
 */
export async function markPaid(docId: string, paidOn: string) {
  await requireAdmin()
  const admin = createAdminClient()

  await admin.from('f24_documents').update({ paid_on: paidOn, updated_at: new Date().toISOString() }).eq('id', docId)

  const { data: lines } = await admin.from('f24_lines')
    .select('kind, vat_settlement_id, hr_f24_id').eq('doc_id', docId)
  const l = (lines ?? []) as { kind: string; vat_settlement_id: string | null; hr_f24_id: string | null }[]

  for (const id of Array.from(new Set(l.map(x => x.vat_settlement_id).filter(Boolean))) as string[]) {
    await admin.from('vat_settlements').update({ paid_on: paidOn }).eq('id', id)
  }
  for (const id of Array.from(new Set(l.map(x => x.hr_f24_id).filter(Boolean))) as string[]) {
    await admin.from('hr_f24').update({ paid_on: paidOn }).eq('id', id)
  }
  rev()
}

/** I modelli, coi loro tributi. Sola lettura: la usa la sezione Fiscale. */
export async function loadF24(): Promise<(F24Doc & { id: string; lines: (F24Line & { id: string })[] })[]> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: docs, error } = await admin.from('f24_documents')
    .select('id, due_date, paid_on, total, doc_ref, note').order('due_date', { ascending: false })
  if (error) {
    if (error.code === '42P01') return []
    throw new Error(error.message)
  }
  const ids = (docs ?? []).map((d: { id: string }) => d.id)
  const { data: lines } = ids.length
    ? await admin.from('f24_lines').select('*').in('doc_id', ids)
    : { data: [] }

  return (docs ?? []).map((d: Record<string, unknown>) => ({
    id: String(d.id),
    dueDate: String(d.due_date).slice(0, 10),
    paidOn: d.paid_on ? String(d.paid_on).slice(0, 10) : null,
    total: Number(d.total),
    docRef: (d.doc_ref as string) ?? null,
    lines: ((lines ?? []) as Record<string, unknown>[])
      .filter(l => String(l.doc_id) === String(d.id))
      .map(l => ({
        id: String(l.id), codice: String(l.codice), label: String(l.label),
        kind: l.kind as F24Line['kind'], amount: Number(l.amount),
        period: l.period ? String(l.period).slice(0, 10) : null,
      })),
  }))
}

/** Toglie un modello. Le righe cadono col CASCADE; le allocazioni pure. */
export async function deleteF24(docId: string) {
  const uid = await requireAdmin()
  const { data: d } = await createAdminClient().from('f24_documents')
    .select('paid_on').eq('id', docId).maybeSingle()
  if ((d as { paid_on?: string | null } | null)?.paid_on) {
    throw new Error('Questo modello risulta versato: togliergli il documento lascerebbe '
      + "un'uscita in cassa senza niente che la spieghi. Prima togli la data del versamento.")
  }
  const { error } = await createActorClient(uid).from('f24_documents').delete().eq('id', docId)
  if (error) throw new Error(error.message)
  rev()
}

/** Quanto vale, per chi lo mostra senza voler ricalcolare. */
export const f24Split = (lines: F24Line[]) => ({ ...split(lines), net: netDue(lines) })
