/**
 * §438 — la timeline del lead: cosa si registra, e come si legge.
 *
 * Il conto vero — ultimo contatto, tentativi, prossimo follow-up — lo fa il
 * database (`sales_ricalcola_contatto`), a ogni scrittura del diario: qui c'è
 * solo la forma di una voce e il modo di scriverla in italiano. Se il calcolo
 * vivesse anche qui, la scheda e l'elenco potrebbero dire due numeri diversi.
 */

export const TIPI = ['chiamata', 'email', 'whatsapp', 'meeting', 'nota'] as const
export type TipoVoce = typeof TIPI[number] | 'followup' | 'contatto'
export type Direzione = 'uscita' | 'entrata'
export type StatoVoce = 'fatta' | 'in_programma' | 'annullata'

export const ETICHETTA_TIPO: Record<TipoVoce, string> = {
  chiamata: 'Chiamata',
  email: 'Email',
  whatsapp: 'Messaggio',
  meeting: 'Meeting',
  nota: 'Nota',
  followup: 'Follow-up',
  contatto: 'Contatto',
}

/** gli esiti ammessi, per tipo. Email e messaggi non hanno esito: hanno un verso */
export const ESITI: Partial<Record<TipoVoce, readonly string[]>> = {
  chiamata: ['risposto', 'non_risposto', 'richiamare', 'segreteria'],
  meeting: ['fatto', 'non_presentato'],
}
export const ETICHETTA_ESITO: Record<string, string> = {
  risposto: 'Risposto',
  non_risposto: 'Non risposto',
  richiamare: 'Da richiamare',
  segreteria: 'Segreteria',
  fatto: 'Fatto',
  non_presentato: 'Non si è presentato',
}
export const ETICHETTA_VERSO: Record<Direzione, string> = { uscita: 'Inviato da noi', entrata: 'Ricevuto da lui' }

const CON_VERSO: TipoVoce[] = ['email', 'whatsapp']

export type Voce = {
  id: string
  type: TipoVoce
  outcome: string | null
  direction: Direzione | null
  stato: StatoVoce
  occurred_at: string
  has_time: boolean
  duration_min: number | null
  content: string | null
  google_event_id: string | null
  autore: string | null
  /** chi l'ha scritta, o un admin: deciso sul server */
  modificabile: boolean
}

/** le colonne del lead che il diario ricalcola, e che la riga deve rileggere */
export type Derivati = {
  last_interaction_at: string | null
  last_interaction_has_time: boolean
  tentativi: number
  ultimo_tentativo_at: string | null
  next_followup_at: string | null
}
export const CAMPI_DERIVATI = 'last_interaction_at,last_interaction_has_time,tentativi,ultimo_tentativo_at,next_followup_at'

export type NuovaVoce = {
  type: TipoVoce
  outcome: string | null
  direction: Direzione | null
  occurred_at: string
  has_time: boolean
  content: string | null
}

export type Esito<T> = { ok: true; valore: T } | { ok: false; motivo: string }

/** cinque minuti di margine: l'orologio del telefono non è quello del server */
const MARGINE_FUTURO = 5 * 60_000
const PIU_VECCHIA = Date.parse('2020-01-01T00:00:00Z')

/**
 * Una voce che arriva dal browser. Un file `'use server'` è un endpoint
 * (§329): tipo, esito e verso si ricontrollano qui, e il vincolo
 * `deal_activities_forma` li ricontrolla ancora nel database.
 *
 * Un contatto **fatto** non può stare nel futuro: un'ora sbagliata di un
 * giorno sposterebbe l'ultimo contatto a domani, e il lead non risulterebbe
 * mai fermo.
 */
export function validaVoce(raw: unknown, adessoMs: number, tipi: readonly TipoVoce[] = TIPI): Esito<NuovaVoce> {
  if (!raw || typeof raw !== 'object') return { ok: false, motivo: 'Dati dell’interazione mancanti' }
  const v = raw as Record<string, unknown>
  const type = v.type as TipoVoce
  if (!tipi.includes(type)) return { ok: false, motivo: 'Tipo di interazione non valido' }

  const esiti = ESITI[type]
  let outcome: string | null = null
  if (esiti) {
    if (typeof v.outcome !== 'string' || !esiti.includes(v.outcome)) return { ok: false, motivo: `Scegli com’è andata la ${ETICHETTA_TIPO[type].toLowerCase()}` }
    outcome = v.outcome
  }
  let direction: Direzione | null = null
  if (CON_VERSO.includes(type)) {
    if (v.direction !== 'uscita' && v.direction !== 'entrata') return { ok: false, motivo: 'Scegli se l’abbiamo inviato o ricevuto' }
    direction = v.direction
  }

  if (typeof v.occurred_at !== 'string') return { ok: false, motivo: 'Manca quando è successo' }
  const ms = Date.parse(v.occurred_at)
  if (!Number.isFinite(ms)) return { ok: false, motivo: 'Data e ora non valide' }
  if (ms > adessoMs + MARGINE_FUTURO) return { ok: false, motivo: 'Un contatto già avvenuto non può essere nel futuro: per quello c’è il follow-up' }
  if (ms < PIU_VECCHIA) return { ok: false, motivo: 'Data troppo lontana' }

  const testo = typeof v.content === 'string' ? v.content.trim() : ''
  if (testo.length > 2000) return { ok: false, motivo: 'La nota può essere lunga al massimo 2000 caratteri' }
  if (type === 'nota' && !testo) return { ok: false, motivo: 'Scrivi la nota' }

  return { ok: true, valore: {
    type, outcome, direction,
    occurred_at: new Date(ms).toISOString(),
    has_time: v.has_time !== false,
    content: testo || null,
  } }
}

/** «Chiamata · Non risposto», «Email · Inviato da noi», «Nota» */
export function titoloVoce(v: Pick<Voce, 'type' | 'outcome' | 'direction' | 'stato'>): string {
  const base = ETICHETTA_TIPO[v.type]
  if (v.type === 'followup') return v.stato === 'annullata' ? 'Follow-up annullato' : 'Follow-up in programma'
  if (v.outcome) return `${base} · ${ETICHETTA_ESITO[v.outcome] ?? v.outcome}`
  if (v.direction) return `${base} · ${ETICHETTA_VERSO[v.direction]}`
  return base
}

const FUSO = 'Europe/Rome'
const parti = (ms: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('it-IT', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  return { anno: +p.year, mese: +p.month, giorno: +p.day, ora: `${p.hour}:${p.minute}` }
}
/** il numero del giorno a Roma, per contare «ieri» senza sbagliare a mezzanotte */
const giornoN = (ms: number) => { const p = parti(ms); return Date.UTC(p.anno, p.mese - 1, p.giorno) / 86_400_000 }
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

/**
 * Quando, da leggere al volo: «Oggi 14:32», «Ieri 09:10», «3 giorni fa ·
 * 16:05», oltre la settimana «12 set 16:05». Senza ora quando l'ora non è
 * stata registrata: mezzanotte scritta in una riga sembrerebbe un orario vero.
 */
export function quandoContatto(iso: string | null | undefined, hasTime: boolean, adessoMs: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const p = parti(ms)
  const diff = giornoN(adessoMs) - giornoN(ms)
  const ora = hasTime ? p.ora : ''
  if (diff === 0) return ora ? `Oggi ${ora}` : 'Oggi'
  if (diff === 1) return ora ? `Ieri ${ora}` : 'Ieri'
  if (diff === -1) return ora ? `Domani ${ora}` : 'Domani'
  if (diff > 1 && diff < 7) return ora ? `${diff} giorni fa · ${ora}` : `${diff} giorni fa`
  const anno = p.anno === parti(adessoMs).anno ? '' : ` ${p.anno}`
  return `${p.giorno} ${MESI[p.mese - 1]}${anno}${ora ? ` ${ora}` : ''}`
}

/** per il foglio: «24/09/2026 14:32», o solo il giorno se l'ora non c'è */
export function giornoOraRoma(iso: string | null | undefined, hasTime = true): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const p = parti(ms)
  const g = `${String(p.giorno).padStart(2, '0')}/${String(p.mese).padStart(2, '0')}/${p.anno}`
  return hasTime ? `${g} ${p.ora}` : g
}

/** giorni interi a Roma fra `iso` e adesso: 0 oggi, 1 ieri */
export function giorniFa(iso: string | null | undefined, adessoMs: number): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? giornoN(adessoMs) - giornoN(ms) : null
}

/**
 * Da `YYYY-MM-DD` + `HH:MM` inteso a Roma all'istante vero. Il browser può
 * stare in un altro fuso: «le 9» di chi lavora qui sono le 9 di Roma.
 */
export function istanteRoma(giorno: string, ora: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !/^\d{2}:\d{2}$/.test(ora)) return null
  const [a, m, g] = giorno.split('-').map(Number)
  const [h, mi] = ora.split(':').map(Number)
  if (h > 23 || mi > 59) return null
  const ingenuo = Date.UTC(a, m - 1, g, h, mi)
  // due passate: la prima trova lo scarto, la seconda corregge il cambio d'ora
  let ms = ingenuo
  for (let i = 0; i < 2; i++) {
    const p = parti(ms)
    const [ph, pm] = p.ora.split(':').map(Number)
    const visto = Date.UTC(p.anno, p.mese - 1, p.giorno, ph, pm)
    ms += ingenuo - visto
  }
  const p = parti(ms)
  return p.anno === a && p.mese === m && p.giorno === g && p.ora === ora ? new Date(ms).toISOString() : null
}

/** il giorno e l'ora di Roma di un istante, per ripopolare un selettore */
export function giornoEOraRoma(ms: number): { giorno: string; ora: string } {
  const p = parti(ms)
  return { giorno: `${p.anno}-${String(p.mese).padStart(2, '0')}-${String(p.giorno).padStart(2, '0')}`, ora: p.ora }
}
