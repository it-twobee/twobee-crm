/**
 * §370 — il giro orario che porta i lead dal foglio a `deals`.
 *
 * **Inserisce e basta.** Le righe già viste non si toccano: è la decisione
 * presa quando si è scelto «il foglio crea, il tool governa», e qui è una
 * riga di codice — `NOT IN (già visti)`. Senza, l'editing in cella sarebbe
 * una promessa che il giro successivo rompe, e la prima volta che qualcuno
 * vede sparire una modifica smette di fidarsi dell'intero strumento.
 *
 * Non c'è niente di distruttivo qui dentro: nessun UPDATE, nessun DELETE.
 * Il peggio che può fare un giro sbagliato è non inserire qualcosa — e un
 * lead che manca si vede, mentre un lead riscritto no.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { leggiFoglio, type LeadImportato } from './sales-import'

type Admin = SupabaseClient

/** dove sta il foglio. Sta in una env perché il link cambia, e il codice no */
export const URL_FOGLIO = process.env.SALES_SHEET_CSV_URL ?? ''

export type RiepilogoSync = {
  letti: number
  nuovi: number
  giaPresenti: number
  scartati: number
  /** §378 — righe che qualcuno ha eliminato a mano: il giro non le rimette */
  ignorati: number
  errore?: string
}

/**
 * Scarica il CSV. Google risponde 200 con una pagina HTML di login quando il
 * foglio non è condiviso, quindi non basta guardare lo stato: se quello che
 * torna comincia con un tag, il foglio è privato e va detto con quelle
 * parole — «HTTP 200» manderebbe a cercare il problema dalla parte sbagliata.
 */
export async function scaricaFoglio(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  const testo = await res.text()
  if (!res.ok) {
    throw new Error(res.status === 401 || res.status === 403
      ? 'Il foglio non è leggibile: condividilo con «Chiunque abbia il link — Visualizzatore»'
      : `Il foglio ha risposto ${res.status}`)
  }
  if (/^\s*<(!doctype|html)/i.test(testo)) {
    throw new Error('Il foglio ha restituito una pagina di login invece del CSV: controlla la condivisione')
  }
  return testo
}

export async function sincronizzaLead(admin: Admin, url = URL_FOGLIO): Promise<RiepilogoSync> {
  const vuoto: RiepilogoSync = { letti: 0, nuovi: 0, giaPresenti: 0, scartati: 0, ignorati: 0 }
  if (!url) return { ...vuoto, errore: 'SALES_SHEET_CSV_URL non configurata: nessun foglio da leggere' }

  let csv: string
  try {
    csv = await scaricaFoglio(url)
  } catch (e) {
    return { ...vuoto, errore: e instanceof Error ? e.message : 'Scaricamento fallito' }
  }

  const righeTotali = csv.split('\n').filter(r => r.trim()).length - 1
  const lead = leggiFoglio(csv)
  const base: RiepilogoSync = {
    letti: lead.length,
    nuovi: 0,
    giaPresenti: 0,
    scartati: Math.max(0, righeTotali - lead.length),
    ignorati: 0,
  }
  if (!lead.length) return base

  /* Si chiede al database quali id conosce già, invece di fidarsi
     dell'indice unico e lasciar fallire gli insert: un conflitto gestito
     dall'errore funziona, ma non sa dire **quanti** erano nuovi — e quel
     numero è l'unica cosa che qualcuno guarderà del riepilogo. */
  const { data: noti, error: eLettura } = await admin
    .from('deals').select('sheet_row_id').in('sheet_row_id', lead.map(l => l.sheetRowId))
  if (eLettura) return { ...base, errore: `Lettura fallita: ${eLettura.message}` }

  /* §378 — le righe eliminate a mano non rientrano.
     Senza questa lettura «Elimina» sarebbe una promessa che il giro rompe la
     notte stessa: la riga cancellata non è più in `deals`, quindi al giro
     dopo risulta nuova e torna. La lapide è l'unica cosa che distingue «non
     l'abbiamo mai vista» da «l'abbiamo tolta apposta». */
  const { data: tolte, error: eTolte } = await admin
    .from('sales_sheet_ignored').select('sheet_row_id').in('sheet_row_id', lead.map(l => l.sheetRowId))
  if (eTolte) return { ...base, errore: `Lettura fallita: ${eTolte.message}` }

  const ignorati = new Set(((tolte ?? []) as { sheet_row_id: string }[]).map(r => r.sheet_row_id))
  const restanti = lead.filter(l => !ignorati.has(l.sheetRowId))
  base.ignorati = lead.length - restanti.length

  const visti = new Set(((noti ?? []) as { sheet_row_id: string | null }[])
    .map(r => r.sheet_row_id).filter(Boolean) as string[])
  const nuovi = restanti.filter(l => !visti.has(l.sheetRowId))
  base.giaPresenti = restanti.length - nuovi.length
  if (!nuovi.length) return base

  const adesso = new Date().toISOString()
  const { error } = await admin.from('deals').insert(nuovi.map(righa(adesso)))
  if (error) return { ...base, errore: `Inserimento fallito: ${error.message}` }

  base.nuovi = nuovi.length
  return base
}

/** da lead del foglio a riga di `deals`. Il titolo è l'azienda: è quello che si cerca */
const righa = (adesso: string) => (l: LeadImportato) => ({
  title: l.companyName,
  company_name: l.companyName,
  contact_name: l.contactName,
  contact_email: l.contactEmail,
  contact_phone: l.contactPhone,
  stage: l.stage,
  sheet_status: l.sheetStatus,
  notes: l.notes,
  source: 'Meta Ads',
  sheet_row_id: l.sheetRowId,
  imported_at: adesso,
  lead_origine: l.origine,
  /* La data del foglio, non quella di adesso: un lead di luglio importato
     oggi è un lead di luglio, e ordinare per «arrivo» metterebbe in cima i
     più vecchi solo perché li abbiamo letti per ultimi. */
  created_at: l.createdAt ?? adesso,
  last_interaction_at: l.createdAt ?? null,
})
