/**
 * §370 — i lead dal foglio, una volta all'ora.
 *
 * Il foglio non è un foglio: è l'export di **Meta Lead Ads**, con dentro
 * campagna, adset, annuncio, form, piattaforma e le risposte del modulo. Chi
 * lo tiene ci scrive sopra a mano due colonne — `STATUS` e `Note` — e sono
 * quelle che valgono più di tutte le altre messe insieme, perché sono le
 * uniche che qualcuno ha guardato.
 *
 * **Il foglio crea, il tool governa.** Entrano solo le righe che non c'erano:
 * una riga già importata non viene più toccata, mai, per nessun motivo. Da lì
 * in poi la verità è qui, dove si modifica in cella. È l'unico modo perché
 * l'editing non sia una promessa che la sincronizzazione successiva rompe —
 * e vale anche quando il foglio ha ragione: se qualcuno corregge un telefono
 * là, va corretto anche qui, a mano, da chi se ne accorge.
 *
 * Qui dentro non c'è nessuna rete e nessun database: si entra con del testo
 * CSV e si esce con delle righe pronte. È il motivo per cui il gate può
 * provarlo sul foglio vero senza scaricare niente.
 *
 * Gate: `npx tsx lib/sales-import.check.ts`.
 */

import { FASE_INGRESSO } from './sales-stages'

// ── leggere il CSV ───────────────────────────────────────────────────────────

/**
 * Un lettore CSV minimo, e la ragione per cui non se ne importa uno.
 *
 * I campi di questo foglio contengono virgole (gli indirizzi), virgolette (le
 * note) e **a capo dentro la cella** (i follow-up scritti su più righe): uno
 * `split(',')` li spezzerebbe a metà, e il danno non si vedrebbe — la riga
 * arriverebbe con il telefono al posto della mail. Le regole del formato sono
 * quattro e stanno in venti righe; una dipendenza in più per venti righe è
 * una dipendenza da aggiornare per sempre.
 */
export function leggiCsv(testo: string): string[][] {
  const righe: string[][] = []
  let campo = ''
  let riga: string[] = []
  let dentroVirgolette = false

  // il BOM di Excel finirebbe dentro il nome della prima colonna
  const t = testo.replace(/^﻿/, '')

  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (dentroVirgolette) {
      // due virgolette di fila sono una virgoletta, non la fine del campo
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; continue }
      if (c === '"') { dentroVirgolette = false; continue }
      campo += c
      continue
    }
    if (c === '"') { dentroVirgolette = true; continue }
    if (c === ',') { riga.push(campo); campo = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue }
    campo += c
  }
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga) }
  return righe.filter(r => r.some(x => x.trim() !== ''))
}

/** dalle righe grezze a oggetti con le intestazioni come chiavi */
export function conIntestazioni(righe: string[][]): Record<string, string>[] {
  if (!righe.length) return []
  const testa = righe[0].map(h => h.trim())
  return righe.slice(1).map(r =>
    Object.fromEntries(testa.map((h, i) => [h, (r[i] ?? '').trim()])))
}

// ── ripulire quello che Meta ci mette davanti ───────────────────────────────

/** `p:+39320…` → `+39320…`, `l:1036…` → `1036…`. Il prefisso è di Meta, non del dato */
const senzaPrefisso = (v: string) => v.replace(/^[a-z]+:/i, '').trim()

/**
 * `azienda_pmi_(piccola_media_impresa)_` → `Azienda pmi (piccola media impresa)`.
 *
 * Meta consegna le risposte del modulo in minuscolo, con gli spazi diventati
 * underscore e un underscore di troppo in fondo. Così com'è non si legge; e
 * non si butta, perché è l'unica cosa che il lead ha detto **di sé**.
 */
export function leggibile(v: string): string {
  const t = v.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '')
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

/**
 * Le righe di prova di Meta, che nel foglio ci sono davvero: tre su
 * trentuno. Si riconoscono da `lead_status`, ma anche dal contenuto — un
 * lead di prova arriva con `<test lead: dummy data for …>` dentro i campi, e
 * capita che `lead_status` sia stato corretto a mano e il resto no.
 */
export function eDiProva(r: Record<string, string>): boolean {
  if ((r.lead_status ?? '').trim().toUpperCase() === 'TEST') return true
  return Object.values(r).some(v => /test lead: dummy data/i.test(v))
}

// ── lo STATUS del foglio verso le fasi di Notion ────────────────────────────

/**
 * Sette valori scritti a mano sul foglio, dodici fasi su Notion.
 *
 * La traduzione si applica **solo quando la riga entra**: dopo, la fase la
 * governa il tool. Senza, ventotto lead entrerebbero tutti come «New Lead» e
 * si perderebbe il lavoro già fatto — qualcuno è già qualificato, qualcuno ha
 * già una proposta in mano.
 *
 * `Chiuso` vuol dire **perso**: è ambiguo di suo — poteva essere «chiuso
 * vinto» — e l'ha deciso chi il foglio lo compila, non chi scrive il codice.
 * Quello che non è qui dentro entra dalla porta d'ingresso con il testo
 * originale conservato in `sheet_status`: meglio una riga da guardare che una
 * fase inventata.
 */
export const DA_STATUS_FOGLIO: Record<string, string> = {
  'da richiamare': 'contacting',
  'call/meeting audit prenotata': 'audit_richiesto',
  'qualificato': 'qualified',
  'proposta inviare/inviata': 'strategia_preventivo',
  'pending': 'pending',
  'non in target (forse)': 'lost',
  'chiuso': 'lost',
}

export const faseDaStatus = (s: string | null | undefined): string =>
  DA_STATUS_FOGLIO[(s ?? '').trim().toLowerCase()] ?? FASE_INGRESSO

// ── la riga pronta ──────────────────────────────────────────────────────────

export type LeadImportato = {
  /** l'id Meta senza prefisso: la chiave con cui non si reimporta due volte */
  sheetRowId: string
  companyName: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  stage: string
  /** lo STATUS com'era scritto sul foglio, anche quando è stato tradotto */
  sheetStatus: string | null
  notes: string | null
  createdAt: string | null
  /** campagna, annuncio, piattaforma, risposte del modulo: si legge, non si edita */
  origine: Record<string, string>
}

const oppureNull = (v: string | undefined) => {
  const t = (v ?? '').trim()
  return t && t !== '-' ? t : null
}

/**
 * Da riga del foglio a riga nostra, o `null` se non è un lead.
 *
 * Scarta le prove e le righe **senza un'azienda**: un lead senza nome azienda
 * non si può mettere in un CRM di aziende — comparirebbe come una riga vuota
 * che nessuno sa cosa sia, e in tre giorni ce ne sarebbero dieci. Se manca
 * l'azienda ma c'è il nome della persona, quello diventa il nome: chi ha
 * compilato il modulo di corsa ha scritto sé stesso, ed è comunque un lead.
 */
export function normalizza(r: Record<string, string>): LeadImportato | null {
  if (eDiProva(r)) return null

  const id = senzaPrefisso(r.id ?? '')
  if (!id) return null

  const azienda = oppureNull(r.company_name)
  const persona = oppureNull(r.full_name)
  const nome = azienda ?? persona
  if (!nome) return null

  const note = [oppureNull(r.Note), oppureNull(r['Follow up'])].filter(Boolean).join('\n')

  const origine: Record<string, string> = {}
  const metti = (k: string, v: string | null) => { if (v) origine[k] = v }
  metti('piattaforma', oppureNull(r.platform))
  metti('campagna', oppureNull(r.campaign_name))
  metti('adset', oppureNull(r.adset_name))
  metti('annuncio', oppureNull(r.ad_name))
  metti('form', oppureNull(r.form_name))
  metti('organico', (r.is_organic ?? '').trim() === 'true' ? 'sì' : null)
  const chiedi = (k: string) => {
    const v = oppureNull(r[k])
    return v ? leggibile(v) : null
  }
  metti('tipologia', chiedi('dicci_la_tipologia_della_tua_attività:'))
  metti('fatturato_dichiarato', chiedi('qual_è_il_tuo_fatturato_annuo?'))
  metti('tempistica', chiedi('quando_vuoi_partire_con_un_sistema_di_marketing_efficiente?'))

  return {
    sheetRowId: id,
    companyName: nome,
    // se l'azienda manca, la persona è già diventata il nome: non si ripete
    contactName: azienda ? persona : null,
    contactEmail: oppureNull(r.work_email),
    contactPhone: oppureNull(r.phone_number) ? senzaPrefisso(r.phone_number) : null,
    stage: faseDaStatus(r.STATUS),
    sheetStatus: oppureNull(r.STATUS),
    notes: note || null,
    createdAt: oppureNull(r.created_time),
    origine,
  }
}

/** il foglio intero: solo i lead veri, senza doppioni di id */
export function leggiFoglio(csv: string): LeadImportato[] {
  const visti = new Set<string>()
  const out: LeadImportato[] = []
  for (const r of conIntestazioni(leggiCsv(csv))) {
    const lead = normalizza(r)
    if (!lead || visti.has(lead.sheetRowId)) continue
    visti.add(lead.sheetRowId)
    out.push(lead)
  }
  return out
}
