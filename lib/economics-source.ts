/**
 * Da dove viene un numero economico.
 *
 * §169: `clients.mrr`, `contract_start/end` e `payment_status` non si digitano
 * più — li scrivono i contratti (`revenue_streams`). Finché un cliente non ne
 * ha nemmeno uno resta il valore storico inserito a mano, e va detto.
 *
 * Un numero mostrato senza provenienza è un numero di cui nessuno si fida: chi
 * lo legge non sa se qualcuno l'ha battuto a tastiera tre mesi fa. Ogni punto
 * del tool che mostra un valore economico passa da qui, così la risposta alla
 * domanda «da dove esce questo 1.800?» è sempre la stessa.
 */

export type MrrSource = 'contratti' | 'anagrafica'

export type Origin = { derived: boolean; label: string; hint: string }

export function mrrOrigin(source: MrrSource | null | undefined, contracts?: number | null): Origin {
  if (source === 'contratti') {
    return {
      derived: true,
      label: contracts == null ? 'dai contratti' : `da ${contracts} contratt${contracts === 1 ? 'o' : 'i'}`,
      hint: 'Somma dei canoni ricorrenti attivi oggi. Per cambiarlo apri Economics e modifica il contratto: qui non si scrive.',
    }
  }
  return {
    derived: false,
    label: 'da anagrafica',
    hint: 'Valore storico inserito a mano: questo cliente non ha ancora nessun contratto. Creane uno in Economics e da lì in poi il numero si aggiorna da solo.',
  }
}

export const CONTRACT_PERIOD_HINT =
  'Dal primo contratto venduto all\'ultimo a scadere. Nessuna scadenza = canone a tempo indeterminato.'

export const PAYMENT_STATUS_HINT =
  'Dedotto dalle rate dei contratti e dai mesi di conto economico non incassati: scaduto se un mese passato non è stato pagato.'

/** Indice della tab Economics nella scheda cliente: un solo posto da cambiare. */
export const ECONOMICS_TAB = 5

export const economicsHref = (clientId: string) => `/clienti/${clientId}?tab=${ECONOMICS_TAB}`
