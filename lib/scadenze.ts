/**
 * §448 — lo scadenzario fiscale unico: tutto quello che va pagato, in una lista.
 *
 * L'IVA, la LIPE e le imposte d'impresa stavano nello scadenzario di Fiscale
 * (`fiscalCalendar`); l'F24 del personale — ritenute, contributi, INAIL — non
 * stava da nessuna parte, e si pagava ogni 16 del mese guardando il PDF del
 * consulente. Qui entra anche lui, con la sua data (il 16 del mese dopo, o il
 * primo giorno lavorativo dopo), il suo importo e da dove viene: l'F24 caricato
 * se c'è, altrimenti la somma dei cedolini — dichiarata stima — altrimenti
 * niente numero, e lo si dice. I bolli non si calcolano: il tool non sa quali
 * fatture sono esenti, e un importo inventato qui è peggio di una riga vuota.
 */

import { nonLavorativo } from './calendario-lavorativo'
import type { Deadline } from './tax'

export type TipoScadenza = 'iva' | 'imposte' | 'dichiarazione' | 'personale' | 'f24_personale'

export type Scadenza = {
  id: string
  data: string
  etichetta: string
  dettaglio: string
  tipo: TipoScadenza
  importo: number | null
  /** da dove viene l'importo */
  fonte: 'documento' | 'cedolini' | 'stima' | 'nessuna'
  pagata: boolean
  pagataIl: string | null
}

const giornoDopo = (g: string) => new Date(Date.parse(`${g}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** il 16 del mese dopo quello di competenza, spostato al primo giorno lavorativo */
export function scadenzaF24(competenza: string): string {
  const [a, m] = competenza.split('-').map(Number)
  const d = new Date(Date.UTC(a, m, 16))
  let g = d.toISOString().slice(0, 10)
  while (nonLavorativo(g)) g = giornoDopo(g)
  return g
}

/**
 * Gli F24 del personale dei mesi dati. Per ogni mese di competenza:
 * l'F24 registrato (`hr_f24`) se c'è, altrimenti ritenute e contributi dei
 * cedolini, altrimenti niente importo.
 */
export function scadenzeF24Personale(
  mesi: string[],
  f24: { month: string; total: number; paidOn: string | null }[],
  cedolini: Map<string, { trattenute: number; oneri: number; n: number }>,
): Scadenza[] {
  return mesi.map(m => {
    const doc = f24.find(f => f.month.slice(0, 10) === m)
    const ced = cedolini.get(m)
    const importo = doc ? doc.total : ced && ced.n > 0 ? Math.round((ced.trattenute + ced.oneri) * 100) / 100 : null
    const fonte: Scadenza['fonte'] = doc ? 'documento' : ced && ced.n > 0 ? 'cedolini' : 'nessuna'
    const nome = `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
    return {
      id: `f24p:${m}`, data: scadenzaF24(m), tipo: 'f24_personale' as const,
      etichetta: `F24 personale · ${nome}`,
      dettaglio: fonte === 'documento' ? 'dall’F24 registrato'
        : fonte === 'cedolini' ? `stima dai ${ced!.n} cedolini: ritenute, contributi e INAIL`
        : 'né F24 né cedolini: l’importo lo dirà il consulente',
      importo, fonte, pagata: !!doc?.paidOn, pagataIl: doc?.paidOn ?? null,
    }
  })
}

/** le scadenze di Fiscale, nella stessa forma */
export function daFiscale(d: Deadline[]): Scadenza[] {
  return d.map(x => ({
    id: x.id, data: x.date, etichetta: x.label, dettaglio: x.detail, tipo: x.kind,
    importo: x.amount, fonte: x.amount == null ? 'nessuna' as const : 'stima' as const, pagata: false, pagataIl: null,
  }))
}

/** tutto insieme, per data; le pagate in fondo al loro giorno */
export function scadenzario(...liste: Scadenza[][]): Scadenza[] {
  return liste.flat().sort((a, b) => a.data.localeCompare(b.data) || Number(a.pagata) - Number(b.pagata) || a.etichetta.localeCompare(b.etichetta))
}
