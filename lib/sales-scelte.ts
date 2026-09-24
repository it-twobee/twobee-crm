/**
 * §436 — priorità e membership, gli elenchi chiusi di una riga commerciale.
 *
 * Dalla 236 erano scritti due volte, in una costante e in un CHECK, e per
 * aggiungere una voce servivano una migration e un rilascio. Adesso sono due
 * tabelle (`sales_priorita`, `sales_membership`) come i motivi del perso, e
 * scendono dal server come le fasi (§424).
 *
 * **La chiave è il valore salvato sul lead**, e non cambia: `High`, `Not
 * Member`. Quello che cambia è l'etichetta che si legge. Il seme qui sotto è lo
 * stesso della migration, e serve quando le tabelle non si leggono — prima che
 * la migration sia applicata, o se la lettura fallisce: meglio l'elenco di
 * partenza, dichiaratamente vecchio, che una cella senza scelte.
 *
 * Qui dentro nessun database: lo prova `lib/sales-scelte.check.ts`.
 */

import { PRIORITA, MEMBERSHIP } from './sales-table'
import { problemiElenco, problemiMotivi, type Motivo } from './sales-motivi'

export type Voce = Motivo
export const LISTE = ['priority', 'membership'] as const
export type Lista = (typeof LISTE)[number]
export type Scelte = Record<Lista, Voce[]>

export const TABELLA: Record<Lista, string> = { priority: 'sales_priorita', membership: 'sales_membership' }
export const TITOLO_LISTA: Record<Lista, string> = { priority: 'Priorità', membership: 'Membership' }

const seme = (valori: readonly string[]): Voce[] =>
  valori.map((v, i) => ({ chiave: v, etichetta: v, ordine: (i + 1) * 10, attivo: true }))

export const SCELTE_SEME: Scelte = {
  priority: seme(PRIORITA),
  membership: seme(['Member', 'Potential', 'Not Member'].filter(v => (MEMBERSHIP as readonly string[]).includes(v))),
}

export const eLista = (campo: string): campo is Lista => (LISTE as readonly string[]).includes(campo)

/** l'etichetta di un valore salvato; un valore sconosciuto si mostra com'è, non si nasconde */
export function etichettaScelta(scelte: Scelte, campo: string, valore: string | null | undefined): string {
  if (!valore) return ''
  if (!eLista(campo)) return valore
  return scelte[campo].find(v => v.chiave === valore)?.etichetta ?? valore
}

/**
 * Le voci da offrire in un menu: quelle in uso, in ordine, più quella che la
 * riga ha già se nel frattempo è stata ritirata — altrimenti il menu mostrerebbe
 * «—» su una riga che un valore ce l'ha.
 */
export function vociPer(scelte: Scelte, campo: Lista, attuale?: string | null): Voce[] {
  const tutte = [...scelte[campo]].sort((a, b) => a.ordine - b.ordine)
  return tutte.filter(v => v.attivo || v.chiave === attuale)
}

/** le chiavi ammesse per campo, per chi valida una cella: anche le ritirate, che le righe vecchie hanno */
export const ammesse = (scelte: Scelte): Record<string, string[]> =>
  Object.fromEntries(LISTE.map(l => [l, scelte[l].map(v => v.chiave)]))

/** l'ordine per campo, per chi ordina: una priorità si ordina per urgenza, non per alfabeto */
export const ordini = (scelte: Scelte): Record<string, string[]> =>
  Object.fromEntries(LISTE.map(l => [l, [...scelte[l]].sort((a, b) => a.ordine - b.ordine).map(v => v.chiave)]))

/** §436 — i tre elenchi che si governano dalle impostazioni, e le regole di ognuno */
export type TipoElenco = 'motivi' | Lista

export function problemiDi(tipo: TipoElenco, voci: Voce[]): string[] {
  if (tipo === 'motivi') return problemiMotivi(voci)
  return problemiElenco(voci, {
    perche: tipo === 'priority' ? 'un lead deve poter avere una priorità.' : 'un lead deve poter avere una membership.',
  })
}
