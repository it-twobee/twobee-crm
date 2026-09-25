/**
 * §439 — quando fissare un follow-up: le scorciatoie, i conflitti, il primo
 * buco libero. Tutto puro e tutto a Roma: il browser di chi pianifica può
 * stare in un altro fuso, «domani alle 9» è quello dell'ufficio.
 *
 * L'orario è uno per tutti, **9–18 dal lunedì al venerdì**, e i festivi sono
 * quelli di `calendario-lavorativo`. Un conflitto **avvisa e non blocca**: chi
 * fissa una call alle 19 con un cliente che la vuole alle 19 sa cosa sta
 * facendo, e un selettore che glielo impedisce lo fa tornare al calendario di
 * Google.
 */

import { nonLavorativo, nomeFestivo, isWeekend } from './calendario-lavorativo'
import { giornoEOraRoma, istanteRoma } from './sales-timeline'

export const ORARIO = { da: '09:00', a: '18:00' } as const
export const PASSO_MIN = 15
export const DURATE = [15, 30, 45, 60] as const

export type TipoImpegno = 'google' | 'interno' | 'followup' | 'ferie' | 'task'

export type Impegno = {
  id: string
  tipo: TipoImpegno
  titolo: string
  /** ISO; per un impegno di tutto il giorno la mezzanotte di Roma del primo giorno */
  inizio: string
  fine: string
  tuttoIlGiorno: boolean
  /** se occupa l'orario: una task in scadenza è un promemoria, non un impegno */
  occupa: boolean
  /** una ferie da approvare avvisa, non occupa */
  daConfermare?: boolean
}

export type Conflitto =
  | { tipo: 'sovrapposizione'; impegno: Impegno }
  | { tipo: 'fuori_orario' }
  | { tipo: 'non_lavorativo'; perche: string }
  | { tipo: 'ferie'; impegno: Impegno }
  | { tipo: 'passato' }

const MIN = 60_000

/** i confini della giornata lavorativa di un giorno, o null se non si lavora */
export function giornataLavorativa(giorno: string): { da: number; a: number } | null {
  if (nonLavorativo(giorno)) return null
  const da = istanteRoma(giorno, ORARIO.da)
  const a = istanteRoma(giorno, ORARIO.a)
  return da && a ? { da: Date.parse(da), a: Date.parse(a) } : null
}

const sovrappone = (i: Impegno, da: number, a: number) =>
  Date.parse(i.inizio) < a && Date.parse(i.fine) > da

/** perché quel momento non va bene, se non va bene; lista vuota = libero */
export function conflitti(inizioMs: number, durataMin: number, impegni: Impegno[], adessoMs: number): Conflitto[] {
  const fineMs = inizioMs + durataMin * MIN
  const out: Conflitto[] = []
  if (inizioMs < adessoMs - 5 * MIN) out.push({ tipo: 'passato' })

  const giorno = giornoEOraRoma(inizioMs).giorno
  const festa = nomeFestivo(giorno)
  if (festa) out.push({ tipo: 'non_lavorativo', perche: festa })
  else if (isWeekend(giorno)) out.push({ tipo: 'non_lavorativo', perche: 'è nel fine settimana' })
  else {
    const g = giornataLavorativa(giorno)
    if (g && (inizioMs < g.da || fineMs > g.a)) out.push({ tipo: 'fuori_orario' })
  }

  for (const i of impegni) {
    if (!sovrappone(i, inizioMs, fineMs)) continue
    if (i.tipo === 'ferie') out.push({ tipo: 'ferie', impegno: i })
    else if (i.occupa) out.push({ tipo: 'sovrapposizione', impegno: i })
  }
  return out
}

/** in italiano, per l'avviso: una riga per conflitto */
export function spiegaConflitto(c: Conflitto): string {
  switch (c.tipo) {
    case 'passato': return 'È già passato'
    case 'fuori_orario': return `Fuori dall’orario di lavoro (${ORARIO.da}–${ORARIO.a})`
    case 'non_lavorativo': return `Non è un giorno lavorativo: ${c.perche}`
    case 'ferie': return c.impegno.daConfermare ? 'Hai una richiesta di ferie da approvare in quel giorno' : 'Quel giorno sei in ferie'
    case 'sovrapposizione': {
      const d = giornoEOraRoma(Date.parse(c.impegno.inizio)).ora
      const a = giornoEOraRoma(Date.parse(c.impegno.fine)).ora
      return `Si sovrappone a «${c.impegno.titolo}» (${d}–${a})`
    }
  }
}

/** arrotonda in avanti al quarto d'ora */
export const alPasso = (ms: number) => Math.ceil(ms / (PASSO_MIN * MIN)) * PASSO_MIN * MIN

/**
 * Il primo momento libero da `daMs` in poi, dentro l'orario, fuori da ferie e
 * festivi, senza sovrapposizioni. Cerca per `giorniMax` giorni: oltre, un buco
 * trovato non è un suggerimento, è un'altra settimana.
 */
export function primoLibero(daMs: number, durataMin: number, impegni: Impegno[], giorniMax = 14): number | null {
  const bloccanti = impegni.filter(i => i.occupa && !i.daConfermare)
  let giorno = giornoEOraRoma(daMs).giorno
  for (let n = 0; n <= giorniMax; n++) {
    const g = giornataLavorativa(giorno)
    if (g) {
      let t = alPasso(Math.max(daMs, g.da))
      while (t + durataMin * MIN <= g.a) {
        const fine = t + durataMin * MIN
        const ostacolo = bloccanti.find(i => sovrappone(i, t, fine))
        if (!ostacolo) return t
        // salta alla fine dell'ostacolo: provare ogni quarto d'ora dentro una riunione di tre ore è lavoro inutile
        t = alPasso(Math.max(t + PASSO_MIN * MIN, Date.parse(ostacolo.fine)))
      }
    }
    giorno = dopo(giorno, 1)
  }
  return null
}

const dopo = (giorno: string, n: number) => {
  const d = new Date(Date.parse(`${giorno}T12:00:00Z`) + n * 86_400_000)
  return d.toISOString().slice(0, 10)
}
/** il prossimo giorno lavorativo dopo `giorno` (escluso), saltando fine settimana e festivi */
export function prossimoLavorativo(giorno: string, quanti = 1): string {
  let g = giorno
  let contati = 0
  while (contati < quanti) { g = dopo(g, 1); if (!nonLavorativo(g)) contati++ }
  return g
}

const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const nomeGiorno = (giorno: string) => GIORNI[new Date(`${giorno}T12:00:00Z`).getUTCDay()]

export type Scorciatoia = { chiave: string; etichetta: string; istante: string }

/**
 * I momenti che si scelgono più spesso, a un clic. L'etichetta dice il giorno
 * vero: «Domani 9:30» di venerdì sarebbe sabato, quindi diventa «Lunedì 9:30».
 */
export function scorciatoie(adessoMs: number): Scorciatoia[] {
  const { giorno: oggi } = giornoEOraRoma(adessoMs)
  const out: Scorciatoia[] = []
  const aggiungi = (chiave: string, etichetta: string, giorno: string, ora: string) => {
    const i = istanteRoma(giorno, ora)
    if (i && Date.parse(i) > adessoMs) out.push({ chiave, etichetta, istante: i })
  }
  const traUnOra = alPasso(adessoMs + 60 * MIN)
  out.push({ chiave: 'tra1h', etichetta: `Tra un’ora · ${giornoEOraRoma(traUnOra).ora}`, istante: new Date(traUnOra).toISOString() })

  if (!nonLavorativo(oggi)) aggiungi('oggi15', 'Oggi pomeriggio · 15:00', oggi, '15:00')

  const domani = prossimoLavorativo(oggi)
  const nome = domani === dopo(oggi, 1) ? 'Domani' : nomeGiorno(domani)
  aggiungi('domani930', `${nome} mattina · 9:30`, domani, '09:30')
  aggiungi('domani15', `${nome} pomeriggio · 15:00`, domani, '15:00')

  aggiungi('tre', `Tra 3 giorni lavorativi · ${nomeGiorno(prossimoLavorativo(oggi, 3)).toLowerCase()} 10:00`, prossimoLavorativo(oggi, 3), '10:00')

  const dow = new Date(`${oggi}T12:00:00Z`).getUTCDay()
  let lunedi = dopo(oggi, ((8 - dow) % 7) || 7)
  if (nonLavorativo(lunedi)) lunedi = prossimoLavorativo(lunedi)
  aggiungi('lunedi', `${lunedi === dopo(oggi, ((8 - dow) % 7) || 7) ? 'Lunedì prossimo' : nomeGiorno(lunedi)} · 10:00`, lunedi, '10:00')

  let duesett = dopo(oggi, 14)
  if (nonLavorativo(duesett)) duesett = prossimoLavorativo(duesett)
  aggiungi('duesett', 'Tra due settimane · 10:00', duesett, '10:00')

  // la stessa ora ripetuta non è una scelta in più
  const viste = new Set<string>()
  return out.filter(s => !viste.has(s.istante) && viste.add(s.istante))
}

/** le fasce del giorno da disegnare: dalle 8 alle 18, più quelle fuori orario occupate da quello che si sta guardando */
export function fasce(giorno: string, passoMin = 30): number[] {
  const da = istanteRoma(giorno, '07:00')
  const a = istanteRoma(giorno, '20:00')
  if (!da || !a) return []
  const out: number[] = []
  for (let t = Date.parse(da); t < Date.parse(a); t += passoMin * MIN) out.push(t)
  return out
}

export type NuovoFollowup = { inizio: string; durata: number; titolo: string }

/**
 * Un follow-up dal browser (§329: un file `'use server'` è un endpoint). Nel
 * passato no — per quello c'è «registra un contatto» — con cinque minuti di
 * margine per chi preme «tra un'ora» e ci mette un po' a salvare.
 */
export function validaFollowup(raw: unknown, adessoMs: number): { ok: true; valore: NuovoFollowup } | { ok: false; motivo: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, motivo: 'Dati del follow-up mancanti' }
  const v = raw as Record<string, unknown>
  const ms = typeof v.inizio === 'string' ? Date.parse(v.inizio) : NaN
  if (!Number.isFinite(ms)) return { ok: false, motivo: 'Scegli giorno e ora' }
  if (ms < adessoMs - 5 * MIN) return { ok: false, motivo: 'È già passato: per un contatto fatto usa «Registra»' }
  if (ms > adessoMs + 366 * 86_400_000) return { ok: false, motivo: 'Al massimo fra un anno' }
  if (!Number.isInteger(v.durata) || (v.durata as number) < 5 || (v.durata as number) > 1440) return { ok: false, motivo: 'La durata va da 5 minuti a 24 ore' }
  const titolo = typeof v.titolo === 'string' ? v.titolo.trim() : ''
  if (!titolo || titolo.length > 200) return { ok: false, motivo: 'Il titolo va da 1 a 200 caratteri' }
  return { ok: true, valore: { inizio: new Date(ms).toISOString(), durata: v.durata as number, titolo } }
}
