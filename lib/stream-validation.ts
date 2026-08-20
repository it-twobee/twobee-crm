/**
 * Quando un accordo diventa vero. (§306)
 *
 * `revenue_streams.status` ha quattro valori dalla 164 e la regola è chiara —
 * **un contratto in `bozza` non entra mai**: non fa MRR, non genera righe nel
 * mese, non conta nel valore venduto del progetto (§186), non apre la durata del
 * rapporto (§179). È quotato, non venduto.
 *
 * Il difetto non era la regola: era che **ogni contratto nasce in bozza e non
 * c'era un modo di uscirne.** `activateStream` esisteva, ma nella UI compariva
 * solo per le manutenzioni in attesa del progetto che le genera. Un accordo
 * scritto normalmente restava invisibile a tutto l'economics per sempre, e la
 * cosa non si vedeva: la scheda mostrava l'importo, il conto economico non ne
 * sapeva niente, e nessuno dei due diceva perché.
 *
 * Tre stati e due gesti, e ognuno ha un blocco che nasce da un danno diverso:
 *
 *   · **da quotare** → non esiste nessun accordo. Non è uno stato del contratto:
 *     è l'assenza di contratti, e il pannello lo dice già.
 *   · **bozza** → si valida. È il gesto che mancava.
 *   · **attivo** → si può riportare in bozza **solo se non ha ancora prodotto
 *     niente**: una rata già materializzata nel mese ha un ricavo dietro, e su
 *     quel ricavo sono già stati calcolati compensi e IVA.
 */

export type StreamState = 'bozza' | 'attivo' | 'sospeso' | 'concluso'

export type ValidationInput = {
  status: StreamState
  /** l'importo concordato: un accordo da zero non è un accordo */
  amount: number
  /** §169 — la manutenzione parte quando il lavoro che la genera è chiuso */
  parent?: { label: string; status: StreamState } | null
  /** quante rate sono già state materializzate in un mese del conto economico */
  materialized?: number
  /** quante di quelle risultano incassate */
  paid?: number
  /** il mese più vecchio fra quelli che la contengono, se è chiuso */
  closedMonth?: string | null
}

export type Verdict =
  | { can: true; warn?: string }
  | { can: false; why: string; how: string }

/** Si può portare questo accordo da bozza ad attivo? */
export function canValidate(s: ValidationInput): Verdict {
  if (s.status === 'attivo') {
    return { can: false, why: 'È già validato', how: 'Non c\'è niente da fare.' }
  }
  if (s.status !== 'bozza') {
    return {
      can: false,
      why: `È ${s.status}`,
      how: 'Solo una bozza si valida. Un accordo sospeso si riprende, uno concluso è finito.',
    }
  }
  if (s.amount <= 0) {
    return {
      can: false,
      why: 'Non ha un importo',
      how: 'Scrivi quanto paga il cliente: un accordo da zero euro entrerebbe nel '
        + 'conto economico come una riga che non dice niente.',
    }
  }
  /* §169 — una manutenzione non parte prima del lavoro che la genera: se
     partisse, fatturerebbe il canone di un servizio che nessuno sta ancora
     erogando. */
  if (s.parent && s.parent.status !== 'concluso') {
    return {
      can: false,
      why: `«${s.parent.label}» non è ancora concluso`,
      how: 'Questa manutenzione parte da lì: finché il lavoro è in corso, il canone '
        + 'fatturerebbe un servizio che nessuno sta erogando.',
    }
  }
  return { can: true }
}

/**
 * Si può riportarlo in bozza?
 *
 * L'ordine dei rifiuti è quello che serve a chi guarda: prima l'ostacolo più a
 * monte. A chi ha davanti una rata incassata dentro un mese chiuso non serve
 * sapere della materializzazione — quei soldi sono arrivati.
 */
export function canUnvalidate(s: ValidationInput): Verdict {
  if (s.status !== 'attivo') {
    return { can: false, why: `È ${s.status}`, how: 'Solo un accordo validato si riporta in bozza.' }
  }
  if ((s.paid ?? 0) > 0) {
    return {
      can: false,
      why: `${s.paid} rat${s.paid === 1 ? 'a risulta incassata' : 'e risultano incassate'}`,
      how: 'I soldi sono arrivati: riportare in bozza l\'accordo che li spiega lascerebbe '
        + 'in cassa un incasso senza niente dietro.',
    }
  }
  if (s.closedMonth) {
    return {
      can: false,
      why: `Ha una rata in ${s.closedMonth}, che è chiuso`,
      how: 'Un mese chiuso è una fotografia, e i compensi di quel mese sono stati '
        + 'calcolati su quel ricavo. Riapri il mese, o lascia l\'accordo com\'è.',
    }
  }
  if ((s.materialized ?? 0) > 0) {
    return {
      can: true,
      warn: `${s.materialized} rat${s.materialized === 1 ? 'a è' : 'e sono'} già nel conto economico. `
        + 'Riportando l\'accordo in bozza restano lì: vanno togliere a mano, o il mese '
        + 'continua a fatturare un contratto che non è più venduto.',
    }
  }
  return { can: true }
}

/** Cosa un accordo in questo stato **non fa**, detto per chi lo guarda. */
export function stateNote(status: StreamState): string | null {
  switch (status) {
    case 'bozza':
      return 'Quotato, non venduto: non fa canone, non genera righe nel mese e non conta '
        + 'nel valore del lavoro. Validalo quando il cliente ha detto sì.'
    case 'sospeso':
      return 'Sospeso: resta nello storico e non genera più righe.'
    case 'concluso':
      return 'Concluso: quello che ha prodotto resta, da qui in poi non produce più.'
    default:
      return null
  }
}
