/**
 * §437 — i campi personalizzati della scheda lead.
 *
 * Un amministratore aggiunge un campo dalle impostazioni e lo trova nella
 * scheda, nel riquadro che ha scelto, con lo stesso gesto delle celle di sempre:
 * clic, scrivi, Invio. Solo nella scheda — non in elenco, non nei filtri, non
 * nei numeri: un campo che nasce per un modo di lavorare non deve cambiare la
 * pagina che usano tutti.
 *
 * Qui dentro ci sono le regole, pure, perché le chiamano in tre (editor, azione,
 * gate): cosa rende salvabile un elenco di campi, e cosa rende salvabile un
 * valore. Gate: `npx tsx lib/sales-campi.check.ts`.
 *
 * **Non c'è un tipo «importo».** Un valore economico scritto a mano su un lead,
 * prima di un contratto, è esattamente quello che l'invariante del prodotto
 * vieta: il valore nasce dal contratto, in Economics.
 */

import { chiaveDa } from './sales-motivi'
import { COLONNE, GRUPPI_SCHEDA, type Colonna, type GruppoScheda, type TipoCella } from './sales-table'

export const TIPI_CAMPO = ['testo', 'lunga', 'numero', 'data', 'si_no', 'scelta', 'url', 'telefono', 'email'] as const
export type TipoCampo = (typeof TIPI_CAMPO)[number]

export const NOME_TIPO: Record<TipoCampo, string> = {
  testo: 'Testo breve', lunga: 'Testo lungo', numero: 'Numero', data: 'Data', si_no: 'Sì / No',
  scelta: 'Scelta da un elenco', url: 'Link', telefono: 'Telefono', email: 'Email',
}
/** una riga sotto il tipo, nell'editor: a cosa serve, detto con un esempio */
export const ESEMPIO_TIPO: Record<TipoCampo, string> = {
  testo: 'Un nome, un codice: «Settore ATECO»', lunga: 'Più righe: «Com\'è andata la demo»',
  numero: 'Una quantità: «Dipendenti»', data: 'Un giorno: «Scadenza contratto attuale»',
  si_no: 'Una casella: «Ha già un sito?»', scelta: 'Una voce fra poche: «Gestionale usato»',
  url: 'Un indirizzo: «Profilo LinkedIn»', telefono: 'Un numero da chiamare: «Cellulare del titolare»',
  email: 'Un indirizzo da scrivere: «Email amministrazione»',
}

/** i riquadri in cui un campo può stare: tutti tranne la provenienza, che è di sola lettura */
export const RIQUADRI = GRUPPI_SCHEDA.filter(g => g !== 'provenienza') as Exclude<GruppoScheda, 'provenienza'>[]
export type Riquadro = (typeof RIQUADRI)[number]

export type Campo = {
  chiave: string
  etichetta: string
  tipo: TipoCampo
  opzioni: string[]
  riquadro: Riquadro
  aiuto: string | null
  ordine: number
  attivo: boolean
}

export const MAX_CAMPI = 30
export const MAX_OPZIONI = 20
const CHIAVE = /^[a-z][a-z0-9_]{1,40}$/

/** le chiavi delle colonne vere: un campo nostro non si chiama come una di loro */
export const RISERVATE = COLONNE.map(c => c.campo)

/** la chiave di un campo, dal nome, libera fra le esistenti e le colonne vere */
export const chiaveCampo = (etichetta: string, esistenti: string[]) =>
  chiaveDa(etichetta || 'campo', [...esistenti, ...RISERVATE])

export function nuovoCampo(esistenti: string[]): Campo {
  return { chiave: chiaveCampo('Nuovo campo', esistenti), etichetta: '', tipo: 'testo', opzioni: [], riquadro: 'trattativa', aiuto: null, ordine: 0, attivo: true }
}

/** le cose che non stanno in piedi, in parole: vuoto vuol dire che si può salvare */
export function problemiCampi(campi: Campo[]): string[] {
  const out: string[] = []
  if (campi.length > MAX_CAMPI) out.push(`Al massimo ${MAX_CAMPI} campi: una scheda con di più non si legge.`)
  const base = new Set(COLONNE.map(c => c.etichetta.toLowerCase()))
  const chiavi = new Set<string>()
  const nomi = new Set<string>()
  for (const c of campi) {
    const e = c.etichetta.trim()
    const chi = e || 'Un campo'
    if (!e) out.push('C\'è un campo senza nome.')
    else if (e.length > 40) out.push(`«${e.slice(0, 20)}…» è troppo lungo: al massimo 40 caratteri.`)
    /* Un campo «Email» accanto all'Email del referente: due caselle con lo
       stesso nome, e ognuno compila quella che vede per prima. */
    if (e && base.has(e.toLowerCase())) out.push(`«${e}» c'è già nella scheda: scegli un nome diverso.`)
    if (e && nomi.has(e.toLowerCase())) out.push(`«${e}» compare due volte.`)
    if (e) nomi.add(e.toLowerCase())
    if (!CHIAVE.test(c.chiave) || chiavi.has(c.chiave) || RISERVATE.includes(c.chiave)) out.push(`${chi} ha una chiave non valida o ripetuta.`)
    chiavi.add(c.chiave)
    if (!(TIPI_CAMPO as readonly string[]).includes(c.tipo)) out.push(`${chi} ha un tipo sconosciuto.`)
    if (!(RIQUADRI as readonly string[]).includes(c.riquadro)) out.push(`${chi} sta in un riquadro che non esiste.`)
    if ((c.aiuto ?? '').length > 120) out.push(`Il suggerimento di «${chi}» è troppo lungo: al massimo 120 caratteri.`)
    if (c.tipo === 'scelta') {
      const ops = c.opzioni.map(o => o.trim()).filter(Boolean)
      if (!ops.length) out.push(`«${chi}» è una scelta senza voci: aggiungine almeno una.`)
      if (ops.length > MAX_OPZIONI) out.push(`«${chi}» ha più di ${MAX_OPZIONI} voci: per un elenco così serve un testo.`)
      if (new Set(ops.map(o => o.toLowerCase())).size !== ops.length) out.push(`«${chi}» ha una voce ripetuta.`)
      if (ops.some(o => o.length > 40)) out.push(`«${chi}» ha una voce oltre i 40 caratteri.`)
    }
  }
  return out
}

/** «a, b ,, c» → ['a', 'b', 'c']: le voci di una scelta si scrivono separate da virgole */
export const opzioniDa = (testo: string): string[] =>
  Array.from(new Set(testo.split(',').map(o => o.trim()).filter(Boolean)))

export type Esito = { ok: true; valore: string | number | boolean | null } | { ok: false; motivo: string }

/**
 * Un valore portato al tipo del campo, o il motivo per cui non ci sta.
 *
 * `null` vuol dire «togli»: una casella svuotata non salva una stringa vuota,
 * perché «non compilato» è l'assenza del dato. Il numero si accetta scritto
 * all'italiana (`1.250,5`) — è così che lo scrive chi lo scrive — e si salva
 * come numero.
 */
export function validaExtra(campo: Pick<Campo, 'tipo' | 'opzioni' | 'etichetta'>, grezzo: unknown): Esito {
  if (campo.tipo === 'si_no') {
    if (grezzo === null || grezzo === undefined || grezzo === '') return { ok: true, valore: null }
    return { ok: true, valore: grezzo === true || grezzo === 'true' }
  }
  const v = typeof grezzo === 'string' ? grezzo.trim() : grezzo === null || grezzo === undefined ? '' : String(grezzo).trim()
  if (!v) return { ok: true, valore: null }
  const no = (motivo: string): Esito => ({ ok: false, motivo: `«${campo.etichetta}»: ${motivo}` })
  switch (campo.tipo) {
    case 'testo': return v.length <= 300 ? { ok: true, valore: v } : no('al massimo 300 caratteri')
    case 'lunga': return v.length <= 5000 ? { ok: true, valore: v } : no('al massimo 5000 caratteri')
    case 'numero': {
      const pulito = /,/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v
      const n = Number(pulito.replace(/\s/g, ''))
      return Number.isFinite(n) ? { ok: true, valore: n } : no('non è un numero')
    }
    case 'data': {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
      return d && d.toISOString().slice(0, 10) === v ? { ok: true, valore: v } : no('serve una data vera, AAAA-MM-GG')
    }
    case 'scelta':
      return campo.opzioni.includes(v) ? { ok: true, valore: v } : no(`«${v}» non è fra le voci`)
    case 'url': {
      const conSchema = /^https?:\/\//i.test(v) ? v : `https://${v}`
      try { const u = new URL(conSchema); return u.hostname.includes('.') ? { ok: true, valore: conSchema } : no('non sembra un indirizzo') }
      catch { return no('non sembra un indirizzo') }
    }
    case 'telefono':
      return /^[+\d][\d\s().-]{4,29}$/.test(v) ? { ok: true, valore: v } : no('non sembra un numero di telefono')
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200 ? { ok: true, valore: v } : no('non sembra un indirizzo email')
  }
}

/**
 * Il campo come la cella lo sa disegnare. Si riusa `CrmCella` invece di
 * scriverne un'altra: una cella diversa per i campi nostri vorrebbe dire due
 * modi di modificare nella stessa scheda, e l'utente non sa quale sta usando.
 */
export function comeColonna(c: Campo): Colonna {
  return {
    campo: c.chiave, etichetta: c.etichetta, tipo: c.tipo as TipoCella, largh: 12,
    valori: c.tipo === 'scelta' ? c.opzioni : undefined, gruppo: c.riquadro,
  }
}

/** le definizioni che la scheda mostra: in uso, e quelle ritirate solo se la riga ha un valore */
export function campiDaMostrare(campi: Campo[], valori: Record<string, unknown> | null | undefined): Campo[] {
  const ha = (k: string) => valori?.[k] !== undefined && valori?.[k] !== null && valori?.[k] !== ''
  return [...campi].sort((a, b) => a.ordine - b.ordine).filter(c => c.attivo || ha(c.chiave))
}
