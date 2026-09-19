/**
 * §361 — le date che tornano ogni anno: compleanni, anniversari di assunzione,
 * e il compleanno di TwoBee.
 *
 * **Non sono festivi.** `lib/calendario-lavorativo.ts` risponde a «oggi si
 * consegna?», e una data lì dentro spegne una colonna del calendario milestone
 * (§355) e sposta le scadenze. Il 10 marzo si lavora: è una ricorrenza, non un
 * giorno di chiusura. E non sono nemmeno date marketing (§357), che rispondono
 * a «cosa muove il piano editoriale di un cliente»: il nostro compleanno non
 * muove il piano di nessuno. Terza domanda, terzo posto.
 *
 * **Lo zero non è un anniversario.** TwoBee è nata il 10 marzo 2026: quel
 * giorno l'azienda non ha compiuto un anno, è nata. Il primo anniversario è il
 * 10 marzo 2027. Vale identico per le persone — il giorno dell'assunzione non
 * è l'anniversario dell'assunzione — ed è la ragione per cui `anni` è
 * `number | null` invece di un intero che a volte vale zero: uno zero si
 * scrive per sbaglio, un null no.
 *
 * Gate: `npx tsx lib/ricorrenze-azienda.check.ts`.
 */

const MS = 86_400_000
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const pad = (n: number) => String(n).padStart(2, '0')

/** TwoBee SRL, costituita il 10 marzo 2026 */
export const FONDAZIONE = '2026-03-10'

export type Ricorrenza = {
  /** la data del prossimo giro, ISO */
  data: string
  /** giorni che mancano; 0 = è oggi */
  inGiorni: number
  /** quanti anni compie quel giorno, o null se è il primo giro (nascere non è un compleanno) */
  anni: number | null
}

/**
 * Il 29 febbraio negli anni normali cade il 28, non il 1° marzo.
 *
 * Per il codice civile l'effetto slitta al primo giorno utile dopo; per un
 * saluto no — chi è nato il 29 lo festeggia a febbraio, e augurare buon
 * compleanno il 1° marzo è l'unico modo di sbagliare una data che non sbaglia
 * nessuno.
 */
function nelAnno(anno: number, mmdd: string): string {
  const [m, g] = mmdd.split('-').map(Number)
  const ultimo = new Date(Date.UTC(anno, m, 0)).getUTCDate()
  return `${anno}-${pad(m)}-${pad(Math.min(g, ultimo))}`
}

/**
 * Il prossimo ritorno annuale di una data, da oggi compreso.
 *
 * `entro` è la finestra oltre la quale non è una notizia: `0` vuol dire «solo
 * se è oggi». Una data di partenza nel futuro — un'assunzione già firmata che
 * comincia il mese prossimo — non produce anniversari, produce `anni: null`.
 */
export function prossima(dataIso: string | null, oggi: string, entro = 366): Ricorrenza | null {
  if (!dataIso || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return null
  const partenza = Number(dataIso.slice(0, 4))
  const annoOggi = Number(oggi.slice(0, 4))
  for (const anno of [annoOggi, annoOggi + 1]) {
    const data = nelAnno(anno, dataIso.slice(5))
    if (data < oggi) continue
    const inGiorni = Math.round((utc(data) - utc(oggi)) / MS)
    if (inGiorni > entro) return null
    const anni = anno - partenza
    return { data, inGiorni, anni: anni >= 1 ? anni : null }
  }
  return null
}

/**
 * Il compleanno di TwoBee, se è vicino.
 *
 * Quattordici giorni e non uno, perché è l'unica ricorrenza qui dentro che si
 * **organizza**: un compleanno personale si augura il giorno stesso, il
 * compleanno dell'azienda lo si sa prima o non lo si festeggia.
 */
export const compleannoTwoBee = (oggi: string, entro = 14) => prossima(FONDAZIONE, oggi, entro)

/** gli anni che TwoBee ha compiuto a oggi: 0 nel primo anno di vita */
export function etaTwoBee(oggi: string): number {
  const anni = Number(oggi.slice(0, 4)) - Number(FONDAZIONE.slice(0, 4))
  return Math.max(0, oggi.slice(5) >= FONDAZIONE.slice(5) ? anni : anni - 1)
}
