'use server'

import { revalidatePath } from 'next/cache'
import { createActorClient, createAdminClient } from '@/lib/supabase/admin'
import { requireDealAccess } from '@/lib/sales-guard'
import { uuid } from '@/lib/sales'
import { CAMPI_DERIVATI, TIPI, validaVoce, type Derivati, type TipoVoce, type Voce } from '@/lib/sales-timeline'

/**
 * §438 — il diario del lead.
 *
 * Ogni azione passa da `requireDealAccess`: la voce appartiene a un lead, e chi
 * non vede il lead non scrive nel suo diario. Si scrive con
 * `createActorClient`, perché `deal_activities` ha la cronologia e il
 * ricalcolo tocca `deals`, che ce l'ha anche lui: senza, tutte e due le voci
 * direbbero «Sistema».
 *
 * Ogni scrittura restituisce le colonne ricalcolate del lead, così l'elenco
 * si riallinea senza ricaricare la pagina.
 */

const COLONNE_VOCE = 'id,type,outcome,direction,stato,occurred_at,has_time,duration_min,content,google_event_id,created_by'

function refresh() {
  revalidatePath('/commerciale')
  revalidatePath('/workspace/commerciale')
}

function errore(e: { code?: string; message: string }): never {
  if (['42703', '42P01', 'PGRST204'].includes(e.code ?? '')) throw new Error('Timeline da attivare: manca la migration sul database')
  if (e.code === '23514') throw new Error('Questa combinazione di tipo ed esito non è ammessa')
  console.error('Timeline', e.code, e.message)
  throw new Error('Operazione non riuscita. Riprova.')
}

async function derivati(dealId: string): Promise<Derivati> {
  const { data, error } = await createAdminClient().from('deals').select(CAMPI_DERIVATI).eq('id', dealId).single()
  if (error) errore(error)
  return data as unknown as Derivati
}

type VoceDb = { deal_id: string; created_by: string | null; stato: string; type: TipoVoce }

/** la voce e il suo lead. Il permesso lo chiede chi la chiama, con il lead in mano */
async function voceDi(id: unknown): Promise<VoceDb> {
  uuid(id)
  const { data, error } = await createAdminClient()
    .from('deal_activities').select('deal_id,created_by,stato,type').eq('id', id).maybeSingle()
  if (error) errore(error)
  if (!data) throw new Error('Questa interazione non c’è più: ricarica la scheda')
  return data as unknown as VoceDb
}

/** chi la può correggere: chi l'ha scritta, o un admin */
const puoToccare = (voce: VoceDb, c: { actor: string; access: string | null }) =>
  c.access === 'admin' || (!!voce.created_by && voce.created_by === c.actor)

export async function leggiTimeline(dealId: string): Promise<{ voci: Voce[]; derivati: Derivati }> {
  const { actor, access } = await requireDealAccess(dealId)
  const admin = createAdminClient()
  const { data, error } = await admin.from('deal_activities')
    .select(COLONNE_VOCE).eq('deal_id', dealId).order('occurred_at', { ascending: false }).limit(300)
  if (error) errore(error)
  const righe = (data ?? []) as unknown as (Omit<Voce, 'autore' | 'modificabile'> & { created_by: string | null })[]
  const ids = Array.from(new Set(righe.map(r => r.created_by).filter((x): x is string => !!x)))
  const { data: profili } = ids.length
    ? await admin.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nome = new Map((profili ?? []).map(p => [p.id as string, (p.full_name as string | null) ?? 'Senza nome']))
  const voci: Voce[] = righe.map(({ created_by, ...r }) => ({
    ...r,
    autore: created_by ? nome.get(created_by) ?? 'Ex collega' : null,
    modificabile: access === 'admin' || (!!created_by && created_by === actor),
  }))
  return { voci, derivati: await derivati(dealId) }
}

export async function registraVoce(dealId: string, input: unknown) {
  const { actor } = await requireDealAccess(dealId)
  const v = validaVoce(input, Date.now())
  if (!v.ok) throw new Error(v.motivo)
  const { data, error } = await createActorClient(actor).from('deal_activities')
    .insert({ deal_id: dealId, ...v.valore, stato: 'fatta', created_by: actor })
    .select('id').single()
  if (error) errore(error)
  refresh()
  return { id: data.id as string, derivati: await derivati(dealId) }
}

export async function modificaVoce(id: string, input: unknown) {
  const voce = await voceDi(id)
  const contesto = await requireDealAccess(voce.deal_id)
  const { actor } = contesto
  if (!puoToccare(voce, contesto)) throw new Error('La correggono chi l’ha scritta e gli amministratori')
  /* un follow-up si sposta dal calendario e si chiude con l'esito; un
     contatto storico si corregge diventando una voce vera, di un tipo vero */
  if (voce.type === 'followup') throw new Error('Un follow-up si sposta dal calendario, o si chiude con l’esito')
  const v = validaVoce(input, Date.now(), TIPI)
  if (!v.ok) throw new Error(v.motivo)
  const { error } = await createActorClient(actor).from('deal_activities')
    .update({ ...v.valore, updated_at: new Date().toISOString(), updated_by: actor }).eq('id', id)
  if (error) errore(error)
  refresh()
  return { derivati: await derivati(voce.deal_id) }
}

export async function eliminaVoce(id: string) {
  const voce = await voceDi(id)
  const contesto = await requireDealAccess(voce.deal_id)
  const { actor } = contesto
  if (!puoToccare(voce, contesto)) throw new Error('La eliminano chi l’ha scritta e gli amministratori')
  if (voce.type === 'followup' && voce.stato === 'in_programma') {
    throw new Error('È un appuntamento in calendario: annullalo dal riquadro dei follow-up')
  }
  const { error } = await createActorClient(actor).from('deal_activities').delete().eq('id', id)
  if (error) errore(error)
  refresh()
  return { derivati: await derivati(voce.deal_id) }
}

/**
 * Com'è andato un follow-up passato. La voce **diventa** l'interazione che è
 * stata — una chiamata risposta, un meeting a cui non si è presentato — e
 * solo da lì conta come contatto: un appuntamento in agenda non vuol dire che
 * la chiamata ci sia stata. «Non fatto» lo chiude senza contarlo.
 */
export async function esitoFollowup(id: string, input: unknown) {
  const voce = await voceDi(id)
  const { actor } = await requireDealAccess(voce.deal_id)
  if (voce.type !== 'followup' || voce.stato !== 'in_programma') throw new Error('Questo follow-up ha già un esito')
  const db = createActorClient(actor)
  const base = { updated_at: new Date().toISOString(), updated_by: actor }

  if ((input as { annulla?: boolean })?.annulla === true) {
    const { error } = await db.from('deal_activities').update({ ...base, stato: 'annullata' }).eq('id', id)
    if (error) errore(error)
  } else {
    const v = validaVoce(input, Date.now(), ['chiamata', 'email', 'whatsapp', 'meeting'])
    if (!v.ok) throw new Error(v.motivo)
    const { content, ...resto } = v.valore
    const { error } = await db.from('deal_activities')
      .update({ ...base, ...resto, ...(content ? { content } : {}), stato: 'fatta' }).eq('id', id)
    if (error) errore(error)
  }
  refresh()
  return { derivati: await derivati(voce.deal_id) }
}
