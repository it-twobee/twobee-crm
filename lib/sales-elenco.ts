/**
 * §426 — come si legge l'elenco dei lead.
 *
 * Due regole, nate dalla stessa osservazione: **nell'elenco si cerca chi
 * chiamare adesso**, e tutto quello che non risponde a quella domanda è rumore
 * che si scorre.
 *
 * 1. **I persi stanno in fondo, in un blocco chiuso.** Sono un terzo
 *    dell'archivio — dodici righe su trentasei — e stanno in mezzo a quelli
 *    vivi: chi scorre li legge, capisce che non servono, e ricomincia. Non si
 *    nascondono però: una riga che sparisce fa credere di averla persa, e
 *    riprendere in mano un perso è un lavoro vero. Quindi si incapsulano,
 *    chiusi di default, col numero scritto sopra.
 *
 * 2. **Si guarda il ruolo, non la chiave.** «Perso» è una fase che qualcuno
 *    può rinominare o duplicare dalle impostazioni (§424): l'elenco chiede chi
 *    ha ruolo `perso`, così vale anche per la fase «Non in target» che
 *    qualcuno creerà domani.
 *
 * Il vinto **non** scende in fondo, ed è una scelta: un cliente acquisito è un
 * risultato e vederlo fa piacere; un perso è una pratica chiusa.
 *
 * Gate: `npx tsx lib/sales-elenco.check.ts`.
 */

import { ruoloDi, type Fase } from './sales-stages'

export type RigaElenco = { stage?: string | null; notes?: unknown }

export function dividiPersi<T extends RigaElenco>(
  fasi: Fase[], righe: T[],
): { vive: T[]; persi: T[] } {
  const vive: T[] = []
  const persi: T[] = []
  for (const r of righe) (ruoloDi(fasi, r.stage) === 'perso' ? persi : vive).push(r)
  return { vive, persi }
}

/**
 * La nota, ridotta a una riga leggibile.
 *
 * Le note del foglio arrivano con gli a capo dentro la cella — «Call venerdì 7
 * agosto alle ore 15.00» sta sotto tre righe di altro — e messe in elenco così
 * com'è spaccherebbero la riga in cinque. Si appiattiscono, si accorciano, e si
 * taglia **su una parola** e non a metà di una: «Call vener…» non dice niente
 * di più di «Call».
 *
 * Non si mette un troncamento CSS al posto di questo: `text-overflow` taglia a
 * metà lettera e non sa che il testo era su più righe.
 */
export function notaInRiga(v: unknown, max = 110): string | null {
  if (typeof v !== 'string') return null
  const piatta = v.replace(/\s+/g, ' ').trim()
  if (!piatta) return null
  if (piatta.length <= max) return piatta
  const tagliata = piatta.slice(0, max)
  const spazio = tagliata.lastIndexOf(' ')
  return `${(spazio > max * 0.6 ? tagliata.slice(0, spazio) : tagliata).trimEnd()}…`
}
