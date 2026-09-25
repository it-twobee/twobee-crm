/**
 * §446 — il calendario, in un tipo solo.
 *
 * Eventi di Google, riunioni del tool, task, ferie, permessi e milestone
 * arrivavano ognuno con la sua forma, e ogni vista li ricombinava a mano: il mese
 * sapeva degli eventi e delle task, la settimana no, e le assenze non c'erano
 * proprio. Qui tutto diventa una `VoceCal`, e le viste disegnano voci — così un
 * filtro vale per tutte, e una voce nuova si aggiunge in un posto solo.
 *
 * Tutto a Roma: il giorno di una voce è quello dell'ufficio, non del browser.
 */

import { istanteRoma, giornoEOraRoma } from './sales-timeline'

export const TIPI_VOCE = ['evento', 'riunione', 'task', 'ferie', 'permesso', 'milestone'] as const
export type TipoVoceCal = typeof TIPI_VOCE[number]

/** i filtri come li legge chi li usa: ferie e permessi vanno insieme, come gli eventi con le riunioni */
export const FILTRI: { chiave: string; etichetta: string; tipi: TipoVoceCal[] }[] = [
  { chiave: 'eventi', etichetta: 'Eventi e riunioni', tipi: ['evento', 'riunione'] },
  { chiave: 'task', etichetta: 'Le mie task', tipi: ['task'] },
  { chiave: 'assenze', etichetta: 'Ferie e permessi', tipi: ['ferie', 'permesso'] },
  { chiave: 'milestone', etichetta: 'Milestone', tipi: ['milestone'] },
]

export type VoceCal = {
  id: string
  tipo: TipoVoceCal
  titolo: string
  /** ISO. Per una voce di tutto il giorno: la mezzanotte di Roma del primo giorno */
  inizio: string
  /** ISO, esclusivo. Tutto il giorno: la mezzanotte di Roma del giorno dopo l'ultimo */
  fine: string
  tuttoIlGiorno: boolean
  /** di chi è: il colore della persona. Null per le voci che non sono di nessuno */
  profileId: string | null
  /** il titolo non si vede: evento privato di un collega, o chi guarda non è dello staff */
  mascherato?: boolean
  privato?: boolean
  /** la si apre per modificarla (i propri eventi Google) */
  modificabile?: boolean
  /** una riga sotto il titolo: il progetto, il luogo, chi */
  dettaglio?: string | null
  /** dove porta un clic, se porta da qualche parte */
  link?: string | null
  /** la voce di partenza, per chi la apre (l'editor degli eventi) */
  origine?: unknown
}

const MIN = 60_000
const inizioGiorno = (g: string) => Date.parse(istanteRoma(g, '00:00') ?? `${g}T00:00:00Z`)
export const giornoDopo = (g: string, n = 1) => new Date(Date.parse(`${g}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** una voce di tutto il giorno, da `dal` a `al` compresi */
export function tuttoIlGiorno(dal: string, al: string = dal): { inizio: string; fine: string } {
  return { inizio: new Date(inizioGiorno(dal)).toISOString(), fine: new Date(inizioGiorno(giornoDopo(al))).toISOString() }
}

/** le voci che toccano quel giorno di Roma, anche quelle che cominciano prima */
export function delGiorno(voci: VoceCal[], giorno: string): VoceCal[] {
  const da = inizioGiorno(giorno), a = inizioGiorno(giornoDopo(giorno))
  return voci.filter(v => Date.parse(v.inizio) < a && Date.parse(v.fine) > da)
}

/** i giorni (di Roma) che una voce tocca: un evento di tre giorni sta su tre giorni */
export function giorniDi(v: VoceCal): string[] {
  const primo = giornoEOraRoma(Date.parse(v.inizio)).giorno
  const ultimo = giornoEOraRoma(Date.parse(v.fine) - 1).giorno
  const out: string[] = []
  for (let g = primo; g <= ultimo && out.length < 400; g = giornoDopo(g)) out.push(g)
  return out
}

export function filtra(voci: VoceCal[], o: { filtri: Set<string>; cerca?: string }): VoceCal[] {
  const tipi = new Set(FILTRI.filter(f => o.filtri.has(f.chiave)).flatMap(f => f.tipi))
  const q = o.cerca?.trim().toLowerCase()
  return voci.filter(v => tipi.has(v.tipo)
    && (!q || v.titolo.toLowerCase().includes(q) || (v.dettaglio ?? '').toLowerCase().includes(q)))
}

export type Disposta = {
  voce: VoceCal
  /** minuti dall'inizio della griglia, e durata in minuti, già tagliati sui bordi */
  daMin: number
  perMin: number
  corsia: number
  corsie: number
}

/**
 * Le voci a orario di un giorno, sistemate in corsie: due riunioni che si
 * sovrappongono stanno una accanto all'altra, non una sopra l'altra. Le corsie
 * si contano per **gruppo** di voci che si toccano, così un evento isolato alle
 * 9 prende tutta la larghezza anche se alle 15 ce ne sono tre insieme.
 */
export function disponi(voci: VoceCal[], giorno: string, griglia: { da: number; a: number } = { da: 7, a: 21 }): Disposta[] {
  const base = inizioGiorno(giorno)
  const lo = griglia.da * 60, hi = griglia.a * 60
  const orarie = voci
    .filter(v => !v.tuttoIlGiorno)
    .map(v => {
      const s = Math.max(lo, Math.round((Date.parse(v.inizio) - base) / MIN))
      const e = Math.min(hi, Math.round((Date.parse(v.fine) - base) / MIN))
      return { voce: v, s, e: Math.max(e, s + 15) }
    })
    .filter(x => x.s < hi && x.e > lo)
    .sort((a, b) => a.s - b.s || b.e - a.e)

  const out: Disposta[] = []
  let gruppo: typeof orarie = [], fineGruppo = -1
  const chiudi = () => {
    const corsie: number[] = []
    const posti = gruppo.map(x => {
      let c = corsie.findIndex(fine => fine <= x.s)
      if (c < 0) { c = corsie.length; corsie.push(x.e) } else corsie[c] = x.e
      return { x, c }
    })
    for (const { x, c } of posti) out.push({ voce: x.voce, daMin: x.s - lo, perMin: x.e - x.s, corsia: c, corsie: corsie.length })
    gruppo = []
  }
  for (const x of orarie) {
    if (gruppo.length && x.s >= fineGruppo) chiudi()
    gruppo.push(x)
    fineGruppo = Math.max(fineGruppo, x.e)
  }
  if (gruppo.length) chiudi()
  return out
}

/** i giorni di una settimana (da lunedì) o di un mese in griglia (6 settimane da lunedì) */
export function settimanaDi(giorno: string): string[] {
  const dow = (new Date(`${giorno}T12:00:00Z`).getUTCDay() + 6) % 7
  const lun = giornoDopo(giorno, -dow)
  return Array.from({ length: 7 }, (_, i) => giornoDopo(lun, i))
}
export function grigliaMese(giorno: string): string[] {
  const primo = `${giorno.slice(0, 8)}01`
  const inizio = settimanaDi(primo)[0]
  return Array.from({ length: 42 }, (_, i) => giornoDopo(inizio, i))
}
