/**
 * §389 — chi decide quali periodi aprire, e cosa lasciare stare.
 *
 * Sta separato da chi scrive per una ragione precisa: questo è il pezzo che
 * può sbagliare in modo costoso — aprire due corsie per lo stesso trimestre
 * su venti progetti — e un pezzo così va potuto provare senza un database.
 * Entrano lo stato di un progetto e una data, escono delle decisioni.
 *
 * **Non basta guardare cosa abbiamo già aperto noi.** In archivio ci sono
 * nove corsie che *sono* un periodo senza saperlo: si chiamano «Set-Dic
 * 2026», hanno le date di Q4, e sono state fatte a mano prima che questo
 * codice esistesse. Un generatore che guarda solo `project_periods` le
 * ignora e apre Q4 accanto: due corsie per lo stesso trimestre, sullo
 * stesso progetto, e chi ci lavora non sa in quale mettere le task.
 *
 * Perciò si guardano anche le **date** delle corsie che ci sono. Non i
 * nomi: «Set-Dic 2026» è un nome fra i tanti, e il prossimo sarà «Q4» o
 * «Autunno» o «Campagne fine anno». Le date invece dicono la verità — e
 * quando coprono il periodo per metà, il periodo c'è già.
 *
 * Nessuna decisione è silenziosa: quello che si salta lo dice, con il
 * motivo e il nome della corsia che lo copre. Un generatore che tace su
 * quello che non ha fatto è un generatore di cui non ci si accorge quando
 * smette di funzionare.
 *
 * Gate: `npx tsx lib/generatore-periodi.check.ts`.
 */

import { periodiDaAprire, type Forma, type Periodo } from './periodi'

/** quanto avanti si guarda, per forma. In giorni, non in periodi (§388) */
export const ORIZZONTE: Record<Exclude<Forma, 'none'>, number> = {
  quarter: 45,
  month: 90,
}

export type CorsiaEsistente = {
  id: string
  name: string
  /** le date della corsia. Senza, non può coprire niente */
  dal: string | null
  al: string | null
}

export type Decisione =
  | { fare: 'crea'; periodo: Periodo }
  | { fare: 'salta'; periodo: Periodo; perche: string; corsia?: string }

const giorni = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1

/**
 * La corsia che copre già questo periodo, se c'è.
 *
 * La soglia è **metà del periodo**: una corsia che ne copre tre giorni non
 * è quel periodo — è una campagna che ci capita dentro — mentre una che ne
 * copre la metà è la stessa cosa chiamata in un altro modo. Sotto la metà
 * si crea, e se il doppione c'è davvero lo si vede subito; sopra, si salta
 * e si dice quale corsia lo copriva, perché saltare senza dire quale è
 * indistinguibile da un generatore rotto.
 */
export function giaCoperto(
  p: Periodo, corsie: CorsiaEsistente[], soglia = 0.5,
): CorsiaEsistente | null {
  const durata = giorni(p.dal, p.al)
  for (const c of corsie) {
    if (!c.dal || !c.al) continue
    const inizio = c.dal > p.dal ? c.dal : p.dal
    const fine = c.al < p.al ? c.al : p.al
    if (inizio > fine) continue
    if (giorni(inizio, fine) / durata >= soglia) return c
  }
  return null
}

/**
 * Cosa fare su questo progetto, oggi.
 *
 * L'ordine dei controlli è quello del danno: prima si esclude quello che
 * abbiamo già aperto noi (certo, per chiave), poi quello che copre già
 * qualcun altro (probabile, per date). Invertirli vorrebbe dire scrivere
 * «coperto da una corsia» su un periodo che avevamo aperto noi il mese
 * prima, e mandare a cercare un doppione che non c'è.
 */
export function decidi(input: {
  oggi: string
  forma: Forma
  /** le chiavi già in `project_periods` per questo progetto */
  chiaviAperte: string[]
  /** le corsie a termine del progetto, con le loro date */
  corsie: CorsiaEsistente[]
  orizzonte?: number
  /**
   * §400 — **appena creato non c'è niente da coprire.** Le corsie di un
   * progetto appena nato sono quelle che il wizard ha appena scritto, e
   * prendono le date del progetto: «Advertising» da gennaio a dicembre copre
   * il trimestre al cento per cento senza essere quel trimestre, e il primo
   * periodo non nascerebbe mai. La copertura serve contro le nove corsie in
   * archivio (§389), che per definizione qui non esistono ancora.
   */
  coperture?: boolean
}): Decisione[] {
  const { oggi, forma, chiaviAperte, corsie } = input
  if (forma === 'none') return []
  const orizzonte = input.orizzonte ?? ORIZZONTE[forma]
  const aperte = new Set(chiaviAperte)

  return periodiDaAprire(oggi, forma, orizzonte).map((periodo): Decisione => {
    if (aperte.has(periodo.chiave)) {
      return { fare: 'salta', periodo, perche: 'già aperto' }
    }
    /* Le date contano solo per i trimestri: un mese è una **tappa** dentro
       una corsia continuativa, non una corsia, quindi non c'è niente che
       possa coprirlo per sovrapposizione. */
    if (forma === 'quarter' && input.coperture !== false) {
      const c = giaCoperto(periodo, corsie)
      if (c) return { fare: 'salta', periodo, perche: 'coperto da una corsia che c’è già', corsia: c.name }
    }
    return { fare: 'crea', periodo }
  })
}

/** il riepilogo da mostrare a chi ha premuto: cosa è stato fatto e cosa no */
export function riassumi(d: Decisione[]): string {
  const creati = d.filter(x => x.fare === 'crea').length
  const saltati = d.filter(x => x.fare === 'salta')
  if (!d.length) return 'Questo servizio non ha periodi'
  if (!creati) {
    const coperti = saltati.filter(x => x.fare === 'salta' && x.corsia).length
    return coperti
      ? `Niente da aprire: ${coperti} già coperti da corsie esistenti`
      : 'Niente da aprire: ci sono già tutti'
  }
  const coda = saltati.length ? ` · ${saltati.length} già c’erano` : ''
  return creati === 1 ? `1 periodo aperto${coda}` : `${creati} periodi aperti${coda}`
}
