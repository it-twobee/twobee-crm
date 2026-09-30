/**
 * La vista Foglio del commerciale: la parte pura.
 *
 * Il componente disegna, questo file decide: quali colonne esistono, cosa
 * scrive ogni cella come testo, come si ordina, si filtra per colonna, si
 * raggruppa e si esporta. Sta fuori da React perché il gate la verifichi senza
 * montare niente (`npx tsx lib/sales-foglio.check.ts`).
 *
 * **Un solo testo per cella.** Quello che si vede, quello che si ordina, quello
 * che si spunta nel filtro di colonna e quello che finisce nel TSV sono la
 * stessa stringa: se fossero quattro calcoli, una cella direbbe «Ieri» sullo
 * schermo e «2026-09-28» negli appunti, e il filtro offrirebbe un valore che non
 * si legge da nessuna parte.
 */

import { COLONNE, ETICHETTA_QUALIFICA, QUALIFICHE, modificabile, validaCella, colonnaDi } from './sales-table'
import { dividiPersi } from './sales-elenco'
import { giorniFa } from './sales-timeline'
import type { Fase } from './sales-stages'

export type TipoFoglio = 'testo' | 'fase' | 'data' | 'numero' | 'persone' | 'etichette' | 'si_no'

export type ColFoglio = {
  chiave: string
  etichetta: string
  /** larghezza di partenza, in px */
  largh: number
  tipo: TipoFoglio
  /** calcolata al volo: si legge e basta */
  calcolata?: boolean
}

export type RigaFoglio = Record<string, unknown> & { id: string; stage?: string | null }

export type CtxFoglio = {
  etichettaFase: (k: string | null | undefined) => string
  nomeDi: (id: string) => string
  adessoMs: number
}

const TIPO_DA_CELLA: Record<string, TipoFoglio> = {
  fase: 'fase', data: 'data', numero: 'numero', persone: 'persone', etichette: 'etichette', si_no: 'si_no',
}

const CALCOLATE: ColFoglio[] = [
  { chiave: 'next_followup_at', etichetta: 'Richiamo', largh: 110, tipo: 'data', calcolata: true },
  { chiave: 'giorni_contatto', etichetta: 'Giorni dal contatto', largh: 110, tipo: 'numero', calcolata: true },
  { chiave: 'eta_giorni', etichetta: 'Età (giorni)', largh: 90, tipo: 'numero', calcolata: true },
  { chiave: 'piattaforma', etichetta: 'Piattaforma', largh: 100, tipo: 'testo', calcolata: true },
]

/** tutte le colonne del foglio: quelle di `COLONNE` più le calcolate */
export const COLONNE_FOGLIO: ColFoglio[] = [
  ...COLONNE.map((c): ColFoglio => ({
    chiave: c.campo, etichetta: c.etichetta, largh: Math.round(c.largh * 10),
    tipo: TIPO_DA_CELLA[c.tipo] ?? 'testo',
  })),
  ...CALCOLATE,
]

/** quelle che si vedono la prima volta; il resto sta nel menu «Colonne» */
export const VISIBILI_DI_PARTENZA = [
  'company_name', 'contact_name', 'contact_phone', 'contact_email',
  'stage', 'qualifica', 'tentativi', 'notes', 'next_followup_at',
  'owners', 'source', 'last_interaction_at', 'giorni_contatto', 'created_at',
]

export const colFoglio = (chiave: string): ColFoglio | null =>
  COLONNE_FOGLIO.find(c => c.chiave === chiave) ?? null

export type Gruppazione = 'nessuno' | 'fase' | 'owner' | 'origine'
export const ETICHETTA_GRUPPAZIONE: Record<Gruppazione, string> = {
  nessuno: 'Nessun gruppo', fase: 'Per fase', owner: 'Per responsabile', origine: 'Per origine',
}

export type StatoFoglio = {
  visibili: string[]
  /** l'ordine di tutte le colonne, visibili o no */
  ordine: string[]
  larghezze: Record<string, number>
  sort: { chiave: string; dir: 'asc' | 'desc' } | null
  filtri: Record<string, string[]>
  gruppo: Gruppazione
}

export const STATO_FOGLIO: StatoFoglio = {
  visibili: VISIBILI_DI_PARTENZA,
  ordine: COLONNE_FOGLIO.map(c => c.chiave),
  larghezze: {},
  sort: null,
  filtri: {},
  gruppo: 'nessuno',
}

/**
 * Rilegge lo stato salvato e lo riallinea alle colonne che esistono adesso:
 * una chiave sparita dal codice non deve lasciare una colonna fantasma, e una
 * colonna nata dopo deve comparire nell'ordine invece di non esserci mai.
 */
export function leggiStato(grezzo: unknown): StatoFoglio {
  const g = (grezzo && typeof grezzo === 'object' ? grezzo : {}) as Partial<StatoFoglio>
  const esiste = (k: unknown): k is string => typeof k === 'string' && !!colFoglio(k)
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter(esiste) : [])
  const ordineSalvato = lista(g.ordine)
  const ordine = [...ordineSalvato, ...COLONNE_FOGLIO.map(c => c.chiave).filter(k => !ordineSalvato.includes(k))]
  const visibili = Array.isArray(g.visibili) ? lista(g.visibili) : VISIBILI_DI_PARTENZA
  const larghezze: Record<string, number> = {}
  for (const [k, v] of Object.entries(g.larghezze ?? {})) {
    if (esiste(k) && typeof v === 'number' && v >= 40 && v <= 800) larghezze[k] = v
  }
  const filtri: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(g.filtri ?? {})) {
    if (esiste(k) && Array.isArray(v) && v.length) filtri[k] = v.map(String)
  }
  const sort = g.sort && esiste(g.sort.chiave) && (g.sort.dir === 'asc' || g.sort.dir === 'desc') ? g.sort : null
  const gruppo = (['nessuno', 'fase', 'owner', 'origine'] as const).find(x => x === g.gruppo) ?? 'nessuno'
  return { visibili: visibili.length ? visibili : VISIBILI_DI_PARTENZA, ordine, larghezze, sort, filtri, gruppo }
}

/** le colonne da disegnare: visibili, nell'ordine scelto */
export const colonneVisibili = (s: StatoFoglio): ColFoglio[] =>
  s.ordine.filter(k => s.visibili.includes(k)).map(k => colFoglio(k)).filter((c): c is ColFoglio => !!c)

const giorno = (iso: unknown): string => {
  if (typeof iso !== 'string' || !iso) return ''
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

const piatto = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** la cella come testo: la stessa stringa per schermo, filtro, ordine ed export */
export function testoCella(r: RigaFoglio, chiave: string, ctx: CtxFoglio): string {
  const v = r[chiave]
  switch (chiave) {
    case 'stage': return ctx.etichettaFase(r.stage as string)
    case 'owners': {
      const ids = Array.isArray(v) ? (v as string[]) : []
      return ids.map(ctx.nomeDi).join(', ')
    }
    case 'qualifica': return typeof v === 'string' ? (ETICHETTA_QUALIFICA[v] ?? v) : ''
    case 'giorni_contatto': {
      const n = giorniFa(r.last_interaction_at as string | null, ctx.adessoMs)
      return n === null ? '' : String(n)
    }
    case 'eta_giorni': {
      const n = giorniFa(r.created_at as string | null, ctx.adessoMs)
      return n === null ? '' : String(n)
    }
    case 'piattaforma': {
      const o = (r.lead_origine ?? {}) as Record<string, unknown>
      return piatto(o.piattaforma)
    }
    case 'tentativi': return v === null || v === undefined ? '0' : String(v)
  }
  const c = colFoglio(chiave)
  if (!c) return ''
  if (c.tipo === 'data') return giorno(v)
  if (c.tipo === 'etichette') return Array.isArray(v) ? v.join(', ') : ''
  if (c.tipo === 'si_no') return v === true ? 'Sì' : ''
  if (c.tipo === 'numero') return v === null || v === undefined || v === '' ? '' : String(v)
  return piatto(v)
}

/** il valore su cui si ordina: numeri come numeri, date come istanti, il resto come testo */
function chiaveOrdine(r: RigaFoglio, c: ColFoglio, ctx: CtxFoglio): number | string | null {
  if (c.tipo === 'data') {
    const ms = Date.parse(String(r[c.chiave] ?? ''))
    return Number.isFinite(ms) ? ms : null
  }
  const t = testoCella(r, c.chiave, ctx)
  if (t === '') return null
  if (c.tipo === 'numero') { const n = Number(t); return Number.isFinite(n) ? n : null }
  return t.toLowerCase()
}

/** i vuoti stanno sempre in fondo, in entrambe le direzioni: ordinare non deve portare in cima il niente */
export function ordinaRighe<T extends RigaFoglio>(righe: T[], sort: StatoFoglio['sort'], ctx: CtxFoglio): T[] {
  const c = sort ? colFoglio(sort.chiave) : null
  if (!sort || !c) return righe
  const verso = sort.dir === 'asc' ? 1 : -1
  return righe
    .map((r, i) => ({ r, i, k: chiaveOrdine(r, c, ctx) }))
    .sort((a, b) => {
      if (a.k === null || b.k === null) return a.k === b.k ? a.i - b.i : a.k === null ? 1 : -1
      const d = typeof a.k === 'number' && typeof b.k === 'number'
        ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'it')
      return d ? d * verso : a.i - b.i
    })
    .map(x => x.r)
}

/** «(vuote)» è il valore del filtro per le celle senza niente */
export const VUOTE = '(vuote)'

/** i valori che una cella offre al filtro: una cella a più valori (owner, tag) ne offre uno per ciascuno */
export function valoriFiltro(r: RigaFoglio, chiave: string, ctx: CtxFoglio): string[] {
  const c = colFoglio(chiave)
  const t = testoCella(r, chiave, ctx)
  if (!t) return [VUOTE]
  return c && (c.tipo === 'persone' || c.tipo === 'etichette') ? t.split(', ') : [t]
}

export function filtraColonne<T extends RigaFoglio>(righe: T[], filtri: StatoFoglio['filtri'], ctx: CtxFoglio): T[] {
  const attivi = Object.entries(filtri).filter(([, v]) => v.length)
  if (!attivi.length) return righe
  return righe.filter(r => attivi.every(([k, ammessi]) =>
    valoriFiltro(r, k, ctx).some(v => ammessi.includes(v))))
}

/** i valori distinti di una colonna con quante righe li hanno, per il menu del filtro */
export function distinti(righe: RigaFoglio[], chiave: string, ctx: CtxFoglio): { valore: string; quante: number }[] {
  const m = new Map<string, number>()
  for (const r of righe) for (const v of valoriFiltro(r, chiave, ctx)) m.set(v, (m.get(v) ?? 0) + 1)
  return Array.from(m, ([valore, quante]) => ({ valore, quante }))
    .sort((a, b) => (a.valore === VUOTE ? 1 : b.valore === VUOTE ? -1 : a.valore.localeCompare(b.valore, 'it')))
}

export type Sezione<T> = { chiave: string; titolo: string; righe: T[]; persi?: boolean }

/**
 * I persi stanno sempre in un blocco a parte, in fondo (§426), qualunque sia il
 * raggruppamento: la regola guarda il ruolo della fase, non il gruppo scelto.
 * Con `nessuno` le vive sono un'unica sezione senza titolo.
 */
export function raggruppa<T extends RigaFoglio>(
  fasi: Fase[], righe: T[], gruppo: Gruppazione, ctx: CtxFoglio,
): Sezione<T>[] {
  const { vive, persi } = dividiPersi(fasi, righe)
  const sezioni: Sezione<T>[] = []
  if (gruppo === 'nessuno') {
    if (vive.length) sezioni.push({ chiave: 'tutte', titolo: '', righe: vive })
  } else {
    const per = new Map<string, T[]>()
    for (const r of vive) {
      const chiavi = gruppo === 'fase' ? [testoCella(r, 'stage', ctx)]
        : gruppo === 'owner' ? (testoCella(r, 'owners', ctx).split(', ').filter(Boolean))
        : [testoCella(r, 'piattaforma', ctx) || testoCella(r, 'source', ctx)]
      for (const k of chiavi.length ? chiavi : ['']) per.set(k, [...(per.get(k) ?? []), r])
    }
    const senza = gruppo === 'owner' ? 'Senza responsabile' : gruppo === 'origine' ? 'Origine non indicata' : 'Senza fase'
    const ordineFasi = new Map(fasi.map((f, i) => [ctx.etichettaFase(f.chiave), i]))
    const chiavi = Array.from(per.keys()).sort((a, b) => {
      if (a === '' || b === '') return a === '' ? 1 : -1
      if (gruppo === 'fase') return (ordineFasi.get(a) ?? 99) - (ordineFasi.get(b) ?? 99)
      return a.localeCompare(b, 'it')
    })
    for (const k of chiavi) sezioni.push({ chiave: `g:${k}`, titolo: k || senza, righe: per.get(k)! })
  }
  if (persi.length) sezioni.push({ chiave: 'persi', titolo: 'Persi', righe: persi, persi: true })
  return sezioni
}

/** il riepilogo in fondo: quante righe, e i tentativi a vuoto totali */
export function totali(righe: RigaFoglio[], ctx: CtxFoglio): { righe: number; tentativi: number } {
  return {
    righe: righe.length,
    tentativi: righe.reduce((s, r) => s + (Number(testoCella(r, 'tentativi', ctx)) || 0), 0),
  }
}

const pulisciTsv = (t: string) => t.replace(/[\t\r\n]+/g, ' ')

/** TSV con l'intestazione: si incolla in Google Sheets e le colonne restano colonne */
export function comeTsv(righe: RigaFoglio[], colonne: ColFoglio[], ctx: CtxFoglio): string {
  return [colonne.map(c => pulisciTsv(c.etichetta)).join('\t'),
    ...righe.map(r => colonne.map(c => pulisciTsv(testoCella(r, c.chiave, ctx))).join('\t'))].join('\n')
}

const cellaCsv = (t: string) => (/[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)

/** CSV col punto e virgola, come lo vuole Excel in italiano; con BOM perché gli accenti reggano */
export function comeCsv(righe: RigaFoglio[], colonne: ColFoglio[], ctx: CtxFoglio): string {
  return `﻿${[colonne.map(c => cellaCsv(c.etichetta)).join(';'),
    ...righe.map(r => colonne.map(c => cellaCsv(testoCella(r, c.chiave, ctx))).join(';'))].join('\r\n')}`
}

// ── modifica ────────────────────────────────────────────────────────────────

/** una colonna si scrive solo se è un campo di `deals` che `validaCella` accetta: le calcolate e le derivate no */
export const colonnaModificabile = (chiave: string): boolean => {
  const c = colonnaDi(chiave)
  return !!c && modificabile(c)
}

const p2 = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

/**
 * Una data come la scrive chi ha fretta: `12/10`, `12/10/26`, `domani`, `+7g`,
 * `+2s`, o già in ISO. Senza anno vale il **prossimo** in cui quel giorno cade
 * (una data d'incontro scritta a settembre come «12/1» è gennaio, non il
 * passato). Restituisce `AAAA-MM-GG` o `null` se non la capisce: mai una data
 * inventata.
 */
export function leggiData(testo: string, oggi: Date): string | null {
  const t = testo.trim().toLowerCase()
  if (!t) return null
  const base = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  const giorni = (n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d) }
  if (t === 'oggi') return giorni(0)
  if (t === 'domani') return giorni(1)
  if (t === 'ieri') return giorni(-1)
  let m = /^([+-])(\d{1,3})\s*([gds])$/.exec(t)
  if (m) return giorni((m[1] === '-' ? -1 : 1) * Number(m[2]) * (m[3] === 's' ? 7 : 1))
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return valida(t)
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t)
  if (!m) return null
  const g = Number(m[1]), me = Number(m[2])
  if (m[3]) return valida(`${m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])}-${p2(me)}-${p2(g)}`)
  const quest = valida(`${base.getFullYear()}-${p2(me)}-${p2(g)}`)
  if (!quest) return null
  return quest >= iso(base) ? quest : valida(`${base.getFullYear() + 1}-${p2(me)}-${p2(g)}`)
}

/** `2026-02-31` non è una data anche se ha la forma giusta */
function valida(s: string): string | null {
  const d = new Date(`${s}T12:00:00`)
  return Number.isNaN(d.getTime()) || iso(d) !== s ? null : s
}

/**
 * Il testo incollato dagli appunti (TSV di Sheets/Excel) come righe di celle.
 * Le celle con a capo dentro arrivano fra virgolette e non spezzano la riga.
 */
export function leggiTsv(testo: string): string[][] {
  const righe: string[][] = []
  let riga: string[] = [], cella = '', dentro = false
  const chiudiRiga = () => { riga.push(cella); righe.push(riga); riga = []; cella = '' }
  const t = testo.replace(/\r\n?/g, '\n')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (dentro) {
      if (ch === '"' && t[i + 1] === '"') { cella += '"'; i++ }
      else if (ch === '"') dentro = false
      else cella += ch
    } else if (ch === '"' && cella === '') dentro = true
    else if (ch === '\t') { riga.push(cella); cella = '' }
    else if (ch === '\n') chiudiRiga()
    else cella += ch
  }
  if (cella !== '' || riga.length) chiudiRiga()
  return righe
}

export type CtxInterpreta = {
  fasi: Fase[]
  ammesse: Record<string, string[]>
  motivi: { chiave: string; etichetta: string }[]
  persone: { id: string; nome: string }[]
  etichettaScelta: (campo: string, chiave: string) => string
  oggi: Date
}

export type Interpretato = { ok: true; valore: unknown } | { ok: false; motivo: string }

const uguale = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Da quello che c'è scritto in una cella (a mano o incollato) al valore che il
 * database accetta. Le etichette tornano chiavi — «Nuovo lead» → `nuovo_lead`,
 * «In target» → `in_target`, il nome di un collega → il suo id — poi passa da
 * `validaCella`, la stessa porta del server: se qui passa, lì passa.
 * Il responsabile lo scioglie **fra le persone assegnabili** (§409), quindi un
 * nome che non è fra loro è un errore e non un id inventato.
 */
export function interpreta(chiave: string, testo: string, ctx: CtxInterpreta): Interpretato {
  const c = colonnaDi(chiave)
  if (!c || !modificabile(c)) return { ok: false, motivo: 'Questa colonna non si modifica' }
  const t = testo.trim()

  if (chiave === 'owners') {
    if (!t) return { ok: true, valore: [] }
    const ids: string[] = []
    for (const nome of t.split(/[,;]/).map(x => x.trim()).filter(Boolean)) {
      const p = ctx.persone.find(x => uguale(x.nome, nome))
      if (!p) return { ok: false, motivo: `«${nome}» non è fra chi può seguire un lead` }
      if (!ids.includes(p.id)) ids.push(p.id)
    }
    return { ok: true, valore: ids }
  }

  let grezzo: unknown = t
  if (c.tipo === 'fase') {
    const f = ctx.fasi.find(x => uguale(x.chiave, t) || uguale(x.etichetta, t))
    grezzo = f ? f.chiave : t
  } else if (c.tipo === 'motivo') {
    grezzo = ctx.motivi.find(m => uguale(m.chiave, t) || uguale(m.etichetta, t))?.chiave ?? t
  } else if (chiave === 'qualifica') {
    grezzo = QUALIFICHE.find(q => uguale(q, t) || uguale(ETICHETTA_QUALIFICA[q], t)) ?? t
  } else if (c.tipo === 'scelta') {
    const ammessi = ctx.ammesse[chiave] ?? c.valori ?? []
    grezzo = ammessi.find(v => uguale(v, t) || uguale(ctx.etichettaScelta(chiave, v), t)) ?? t
  } else if (c.tipo === 'data' && t) {
    const d = leggiData(t, ctx.oggi)
    if (!d) return { ok: false, motivo: `«${t}» non è una data: scrivi 12/10, domani o +7g` }
    grezzo = d
  } else if (c.tipo === 'si_no') {
    grezzo = /^(s[iì]|true|x|1|vero)$/i.test(t)
  }
  const v = validaCella(chiave, grezzo, ctx.fasi, ctx.ammesse)
  return v.ok ? { ok: true, valore: v.valore } : { ok: false, motivo: v.motivo }
}

/** i valori che l'editor mostra all'apertura: il testo del valore, non quello della cella */
export function testoEditor(v: unknown, chiave: string, ctx: CtxFoglio): string {
  if (chiave === 'owners') return (Array.isArray(v) ? (v as string[]) : []).map(ctx.nomeDi).join(', ')
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? 'Sì' : ''
  if (colFoglio(chiave)?.tipo === 'data') {
    const g = String(v).slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(g) ? `${g.slice(8)}/${g.slice(5, 7)}/${g.slice(0, 4)}` : String(v)
  }
  return String(v)
}

/** uguaglianza di due valori di cella: vuoto è vuoto, l'ordine di tag e owner non conta */
export function stessoValore(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): string | boolean | null => {
    if (v === undefined || v === null || v === '') return null
    if (Array.isArray(v)) return v.length ? JSON.stringify(v.map(String).sort()) : null
    if (typeof v === 'boolean') return v || null
    return String(v)
  }
  return norm(a) === norm(b)
}

/** riempimento: il blocco sorgente ripetuto in ciclo per `n` righe (Ctrl+D e trascinamento) */
export function ripeti<T>(sorgente: T[][], n: number): T[][] {
  if (!sorgente.length) return []
  return Array.from({ length: n }, (_, i) => sorgente[i % sorgente.length])
}
