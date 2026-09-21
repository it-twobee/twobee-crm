/**
 * §393 — le ricorrenze commerciali: quando cadono e quando si comincia.
 *
 * La libreria è una tabella con dieci voci e una regola per ognuna (§388).
 * Qui si risponde alle due domande che servono per proporle in un wizard:
 * **quale occorrenza è la prossima**, e **da che giorno ha senso aprire la
 * corsia**.
 *
 * La prossima non è «quella di quest'anno»: il 21 settembre il Black Friday
 * è ancora davanti, ma San Valentino è passato da sette mesi e quello che
 * interessa è quello dell'anno dopo. Si guarda la data dell'evento e, se è
 * passata, si prende l'anno successivo — e per il Natale, che si prepara
 * con settantacinque giorni di anticipo, si guarda **l'inizio del lavoro**:
 * il 20 ottobre il Natale non è passato, ma il lavoro sì.
 *
 * I saldi non si calcolano (§388): le date le fissano le Regioni. Se
 * nessuno le ha scritte la voce esiste lo stesso e dice «data da
 * confermare» — proporla senza data è meglio che non proporla, perché chi
 * la vede si ricorda che esiste.
 *
 * Gate: `npx tsx lib/ricorrenze-commerciali.check.ts`.
 */

import { dataEvento, inizioLavoro } from './periodi'

export type Ricorrenza = {
  id: string
  slug: string
  name: string
  date_rule: string
  lead_days: number
  /** le aree in cui si propone: `growth`, `marketing` */
  areas: string[]
  description?: string | null
  active?: boolean
}

/** le date scritte a mano, per quelle che nessuna formula sa */
export type DataScritta = { event_id: string; year: number; event_date: string | null }

export type Occorrenza = {
  ricorrenza: Ricorrenza
  anno: number
  /** il giorno dell'evento, o `null` se nessuno l'ha ancora scritto */
  data: string | null
  /** da quando ha senso lavorarci: la data meno l'anticipo */
  dal: string | null
  /** come si chiamerebbe la corsia: «Black Friday 2026» */
  etichetta: string
}

const annoDi = (iso: string) => Number(iso.slice(0, 4))

/**
 * La prossima occorrenza, a partire da oggi.
 *
 * Si guarda **l'inizio del lavoro**, non il giorno dell'evento: con
 * settantacinque giorni di anticipo, il 20 ottobre il Natale è ancora
 * davanti ma la finestra per prepararlo è già aperta da un mese — e
 * proporre quello dell'anno dopo, in ottobre, sarebbe assurdo. Si passa
 * all'anno successivo solo quando **anche** il giorno dell'evento è alle
 * spalle.
 */
export function prossimaOccorrenza(
  r: Ricorrenza, oggi: string, scritte: DataScritta[] = [],
): Occorrenza {
  const anno = annoDi(oggi)
  const scrittaDi = (a: number) =>
    scritte.find(s => s.event_id === r.id && s.year === a)?.event_date ?? null
  const calcola = (a: number): string | null =>
    r.date_rule === 'manuale' ? scrittaDi(a) : (scrittaDi(a) ?? dataEvento(r.date_rule, a))

  const diQuestAnno = calcola(anno)
  /* Se la data non si sa, non si può dire se è passata: si resta
     sull'anno in corso e si dichiara l'incertezza. Saltare all'anno dopo
     sarebbe una scelta travestita da calcolo. */
  const scelto = diQuestAnno && diQuestAnno < oggi ? anno + 1 : anno
  const data = scelto === anno ? diQuestAnno : calcola(scelto)

  return {
    ricorrenza: r,
    anno: scelto,
    data,
    dal: data ? inizioLavoro(data, r.lead_days) : null,
    etichetta: `${r.name} ${scelto}`,
  }
}

/**
 * Le ricorrenze da proporre su un progetto di quest'area, in ordine di
 * quando servono.
 *
 * L'ordine è per **inizio del lavoro** e non per data dell'evento: quello
 * che va aperto prima viene prima, ed è l'unica cosa che interessa a chi
 * sta creando un progetto. Quelle senza data vanno in fondo — non perché
 * contino meno, ma perché non si può dire quando servono.
 */
export function daProporre(
  elenco: Ricorrenza[], area: string, oggi: string, scritte: DataScritta[] = [],
): Occorrenza[] {
  return elenco
    .filter(r => r.active !== false && r.areas.includes(area))
    .map(r => prossimaOccorrenza(r, oggi, scritte))
    .sort((a, b) => {
      if (a.dal && b.dal) return a.dal.localeCompare(b.dal)
      if (a.dal) return -1
      if (b.dal) return 1
      return a.ricorrenza.name.localeCompare(b.ricorrenza.name)
    })
}

/** la frase sotto il nome: dice quando cade e da quando si lavora */
export function quandoDice(o: Occorrenza): string {
  if (!o.data) return 'data da confermare: la fissano le Regioni'
  const g = (iso: string) => new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  return `${g(o.data)} · si comincia il ${g(o.dal!)}`
}
