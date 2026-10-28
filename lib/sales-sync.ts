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
import { analizzaFoglio, type LeadImportato } from './sales-import'
import { schedeDa, schedeDaHtml, schedeNonLette, type Scheda, type StatoScheda } from './sales-schede'

type Admin = SupabaseClient

/** dove sta il foglio. Sta in una env perché il link cambia, e il codice no.
    §494 — è un elenco di schede (`Etichetta|url; Etichetta|url`): vedi `sales-schede.ts` */
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

/** §494 — lo stesso riepilogo, scheda per scheda */
export type RiepilogoScheda = RiepilogoSync & { etichetta: string }

/**
 * Scarica il CSV. Google risponde 200 con una pagina HTML di login quando il
 * foglio non è condiviso, quindi non basta guardare lo stato: se quello che
 * torna comincia con un tag, il foglio è privato e va detto con quelle
 * parole — «HTTP 200» manderebbe a cercare il problema dalla parte sbagliata.
 */
export async function scaricaFoglio(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(30_000) })
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

/** quali di questi id il tool conosce già, e quali sono stati tolti apposta (§378) */
async function giaVisti(admin: Admin, ids: string[]) {
  const [{ data: noti, error: eLettura }, { data: tolte, error: eTolte }] = await Promise.all([
    admin.from('deals').select('sheet_row_id').in('sheet_row_id', ids),
    admin.from('sales_sheet_ignored').select('sheet_row_id').in('sheet_row_id', ids),
  ])
  const errore = eLettura?.message ?? eTolte?.message
  return {
    errore: errore ? `Lettura fallita: ${errore}` : undefined,
    visti: new Set(((noti ?? []) as { sheet_row_id: string | null }[]).map(r => r.sheet_row_id).filter(Boolean) as string[]),
    ignorati: new Set(((tolte ?? []) as { sheet_row_id: string }[]).map(r => r.sheet_row_id)),
  }
}

/** una scheda: scarica, controlla le intestazioni, inserisce solo quello che manca */
export async function sincronizzaScheda(admin: Admin, scheda: Scheda): Promise<RiepilogoScheda> {
  const vuoto: RiepilogoScheda = { etichetta: scheda.etichetta, letti: 0, nuovi: 0, giaPresenti: 0, scartati: 0, ignorati: 0 }

  let analisi: ReturnType<typeof analizzaFoglio>
  try {
    analisi = analizzaFoglio(await scaricaFoglio(scheda.url), scheda.etichetta)
  } catch (e) {
    return { ...vuoto, errore: e instanceof Error ? e.message : 'Scaricamento fallito' }
  }

  const lead = analisi.lead
  const base: RiepilogoScheda = {
    ...vuoto,
    letti: lead.length,
    scartati: analisi.scartati + analisi.duplicati,
  }
  if (!lead.length) return base

  /* Si chiede al database quali id conosce già, invece di fidarsi
     dell'indice unico e lasciar fallire gli insert: un conflitto gestito
     dall'errore funziona, ma non sa dire **quanti** erano nuovi — e quel
     numero è l'unica cosa che qualcuno guarderà del riepilogo.

     §378 — e le righe eliminate a mano non rientrano. Senza la lapide
     «Elimina» sarebbe una promessa che il giro rompe la notte stessa: la riga
     cancellata non è più in `deals`, quindi al giro dopo risulta nuova e torna. */
  const { errore, visti, ignorati } = await giaVisti(admin, lead.map(l => l.sheetRowId))
  if (errore) return { ...base, errore }

  const restanti = lead.filter(l => !ignorati.has(l.sheetRowId))
  base.ignorati = lead.length - restanti.length
  const nuovi = restanti.filter(l => !visti.has(l.sheetRowId))
  base.giaPresenti = restanti.length - nuovi.length
  if (!nuovi.length) return base

  const adesso = new Date().toISOString()
  const { error } = await admin.from('deals').insert(nuovi.map(righa(adesso)))
  if (error) return { ...base, errore: `Inserimento fallito: ${error.message}` }

  base.nuovi = nuovi.length
  return base
}

/**
 * §494 — tutte le schede, una dopo l'altra.
 *
 * In fila e non in parallelo: se lo stesso id comparisse in due schede (una
 * riga copiata a mano), due insert contemporanei lo farebbero cadere
 * sull'indice unico. In fila, la seconda lo trova già dentro.
 *
 * **Una scheda che fallisce non ferma le altre**: i lead del Modulo 1 non
 * devono aspettare che qualcuno sistemi un'intestazione del modulo IA. Il
 * riepilogo somma, e `errore` c'è solo se non è passata nessuna scheda — è
 * il caso in cui chi ha premuto il bottone deve fermarsi a leggere. Gli errori
 * delle singole stanno in `schede`.
 */
export async function sincronizzaLead(admin: Admin, config = URL_FOGLIO): Promise<RiepilogoSync & { schede: RiepilogoScheda[] }> {
  const totale = { letti: 0, nuovi: 0, giaPresenti: 0, scartati: 0, ignorati: 0 }
  const schede = schedeDa(config)
  if (!schede.length) return { ...totale, schede: [], errore: 'SALES_SHEET_CSV_URL non configurata: nessun foglio da leggere' }

  const esiti: RiepilogoScheda[] = []
  for (const s of schede) esiti.push(await sincronizzaScheda(admin, s))
  for (const e of esiti) {
    totale.letti += e.letti; totale.nuovi += e.nuovi; totale.giaPresenti += e.giaPresenti
    totale.scartati += e.scartati; totale.ignorati += e.ignorati
  }
  const falliti = esiti.filter(e => e.errore)
  const errore = falliti.length === esiti.length
    ? falliti.map(e => esiti.length > 1 ? `${e.etichetta}: ${e.errore}` : e.errore).join(' · ')
    : undefined
  return { ...totale, schede: esiti, ...(errore ? { errore } : {}) }
}

/**
 * §494 — il Controllo sul foglio: scheda per scheda, quanti lead ci sono e
 * quanti sono nel tool, più le schede del documento che il giro non legge.
 *
 * **Legge e basta**: non inserisce niente, nemmeno quando trova un lead
 * mancante. Chi guarda il Controllo deve poter guardare senza cambiare lo
 * stato che sta guardando; per far entrare c'è «Aggiorna dal foglio».
 */
export async function statoSchede(admin: Admin, config = URL_FOGLIO): Promise<{
  schede: StatoScheda[]
  /** le schede del documento che nessuna voce legge; `null` se non si è riusciti a saperlo */
  nonLette: { nome: string; gid: number }[] | null
}> {
  const schede = schedeDa(config)
  const stati: StatoScheda[] = []
  for (const s of schede) {
    const vuoto: StatoScheda = { etichetta: s.etichetta, righe: 0, scartati: 0, lead: 0, nelTool: 0, eliminati: 0, mancanti: 0, ultimo: null, assenti: [] }
    try {
      const a = analizzaFoglio(await scaricaFoglio(s.url), s.etichetta)
      const ids = a.lead.map(l => l.sheetRowId)
      const { errore, visti, ignorati } = ids.length ? await giaVisti(admin, ids) : { errore: undefined, visti: new Set<string>(), ignorati: new Set<string>() }
      if (errore) { stati.push({ ...vuoto, errore }); continue }
      const date = a.lead.map(l => l.createdAt).filter(Boolean).sort() as string[]
      stati.push({
        ...vuoto,
        righe: a.righe,
        scartati: a.scartati + a.duplicati,
        lead: ids.length,
        nelTool: ids.filter(id => visti.has(id)).length,
        eliminati: ids.filter(id => ignorati.has(id) && !visti.has(id)).length,
        mancanti: ids.filter(id => !visti.has(id) && !ignorati.has(id)).length,
        ultimo: date[date.length - 1] ?? null,
        assenti: a.assenti,
      })
    } catch (e) {
      stati.push({ ...vuoto, errore: e instanceof Error ? e.message : 'Scaricamento fallito' })
    }
  }

  const documenti = Array.from(new Set(schede.map(s => s.foglio?.id).filter(Boolean) as string[]))
  const nelDocumento = new Map<string, { nome: string; gid: number }[]>()
  for (const id of documenti) {
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/htmlview`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      const elenco = res.ok ? schedeDaHtml(await res.text()) : []
      if (!elenco.length) return { schede: stati, nonLette: null }
      nelDocumento.set(id, elenco)
    } catch { return { schede: stati, nonLette: null } }
  }
  return { schede: stati, nonLette: documenti.length ? schedeNonLette(schede, nelDocumento) : null }
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
  /* §438 — niente ultimo contatto: l'arrivo non è un contatto, e scriverlo
     qui faceva sembrare già sentito un lead che nessuno aveva chiamato. Lo
     scrive il diario, quando qualcuno lo sente davvero. */
})
