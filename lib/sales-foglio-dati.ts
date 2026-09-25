import type { SupabaseClient } from '@supabase/supabase-js'
import { FASI_SEME, etichettaFase, ordinate, type Fase } from './sales-stages'
import { ETICHETTA_QUALIFICA } from './sales-table'
import { type LeadRitorno } from './sales-foglio-ritorno'
import { giornoOraRoma } from './sales-timeline'

/* §434 — quello che il ritorno scrive, letto dal database. Sta fuori dal modulo
   che parla con Google perché quello è `server-only`, e questo lo usa anche la
   prova a secco (`scripts/check-sales-ritorno.ts`), che deve poter calcolare le
   celle senza scriverne nessuna. */

/** quello che il tool sa dei lead venuti dal foglio, già in parole */
export async function leadDelTool(admin: SupabaseClient, fasi: Fase[]): Promise<LeadRitorno[]> {
  const [{ data: righe }, { data: motivi }] = await Promise.all([
    admin.from('deals').select('id, sheet_row_id, stage, qualifica, motivo_perso, last_interaction_at, last_interaction_has_time')
      .not('sheet_row_id', 'is', null),
    admin.from('sales_motivi_perso').select('chiave, etichetta'),
  ])
  const deals = (righe ?? []) as { id: string; sheet_row_id: string; stage: string | null; qualifica: string | null; motivo_perso: string | null; last_interaction_at: string | null; last_interaction_has_time: boolean | null }[]
  const { data: legami } = deals.length
    ? await admin.from('deal_owners').select('deal_id, profile_id').in('deal_id', deals.map(d => d.id))
    : { data: [] }
  const idPersone = Array.from(new Set((legami ?? []).map(l => l.profile_id as string)))
  const { data: persone } = idPersone.length
    ? await admin.from('profiles').select('id, full_name').in('id', idPersone)
    : { data: [] }
  const nome = new Map((persone ?? []).map(p => [p.id as string, (p.full_name as string | null) ?? '']))
  const motivo = new Map((motivi ?? []).map(m => [m.chiave as string, m.etichetta as string]))
  const owner = new Map<string, string[]>()
  for (const l of (legami ?? []) as { deal_id: string; profile_id: string }[]) {
    owner.set(l.deal_id, [...(owner.get(l.deal_id) ?? []), nome.get(l.profile_id) || 'Senza nome'])
  }
  return deals.map(d => ({
    sheetRowId: d.sheet_row_id,
    'Fase OS': d.stage ? etichettaFase(fasi, d.stage) : '',
    'Qualifica OS': d.qualifica ? ETICHETTA_QUALIFICA[d.qualifica] ?? d.qualifica : '',
    'Owner OS': (owner.get(d.id) ?? []).sort((a, b) => a.localeCompare(b, 'it')).join(', '),
    /* §438 — giorno e ora, come nel tool; solo il giorno se l'ora non l'ha
       segnata nessuno (i contatti registrati prima della timeline) */
    'Ultimo contatto OS': giornoOraRoma(d.last_interaction_at, d.last_interaction_has_time !== false),
    'Motivo perso OS': d.motivo_perso ? motivo.get(d.motivo_perso) ?? d.motivo_perso : '',
  }))
}

/* Le fasi col service role e non con `leggiFasi`: di notte non c'è una sessione,
   `leggiFasi` tornerebbe al seme, e sul foglio finirebbero i nomi di partenza di
   qualunque fase qualcuno abbia rinominato. */
export async function fasiVere(admin: SupabaseClient): Promise<Fase[]> {
  const { data, error } = await admin.from('sales_stages')
    .select('chiave, etichetta, ruolo, tinta, ordine, attiva, descrizione').order('ordine')
  return error || !data?.length ? FASI_SEME : ordinate(data as unknown as Fase[])
}

