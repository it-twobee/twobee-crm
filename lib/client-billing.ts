/**
 * §326 — Dove sta il ciclo di fatturazione di un cliente. Calcoli puri.
 *
 * La lista clienti aveva una colonna «Pagamenti» che leggeva
 * `clients.payment_status` — una parola scritta dal cron notturno (§177) — e
 * accanto una colonna «Settore» con il ramo merceologico, che non serve a
 * decidere niente. Restava fuori la domanda che si fa davvero guardando quella
 * riga: **a che punto è il giro dei soldi con questo cliente**.
 *
 * Sono tre stati, e ognuno è un'azione diversa:
 *
 *   · **da emettere fattura** — il mese ha ricavo di competenza e nessun
 *     documento sotto. Non è un ritardo del cliente: è **nostro**, e finché
 *     dura non c'è niente da incassare perché non abbiamo chiesto niente.
 *   · **non pagato** — la fattura è partita e i soldi non sono arrivati. Qui
 *     l'azione è telefonare, e la cifra che serve è **quanto**, cumulativo.
 *   · **pagato** — tutto quello che è stato fatturato è rientrato, e non c'è
 *     competenza scoperta. È l'unico stato in cui non si fa niente.
 *
 * L'ordine non è alfabetico ed è la parte che conta: **prima il non pagato**,
 * perché sono soldi già dovuti; poi il da emettere, che è lavoro nostro. Un
 * cliente che ha entrambi si guarda per il primo.
 *
 * Le tre sezioni parlano la stessa lingua per costruzione: lo scaduto esce da
 * `isOpen` di `lib/invoices.ts` — la stessa porta della Fatturazione — e la
 * data di incasso viene dal movimento agganciato in banca. Se qui comparisse
 * un numero diverso da quello del «da incassare» di Fatturazione, una delle due
 * pagine starebbe mentendo, e non si saprebbe quale.
 */

import { isOpen, signedTotal, type Invoice } from '@/lib/invoices'

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (ns: number[]) => r2(ns.reduce((a, b) => a + b, 0))

export type BillingState = 'pagato' | 'da_emettere' | 'non_pagato' | 'nessuna_scadenza'

export const BILLING_LABEL: Record<BillingState, string> = {
  pagato: 'pagato',
  da_emettere: 'da emettere fattura',
  non_pagato: 'non pagato',
  nessuna_scadenza: 'nessuna scadenza',
}

export type ClientBilling = {
  state: BillingState
  label: string
  tone: 'success' | 'warning' | 'error' | 'muted'
  /** da dove viene lo stato: senza, è un'etichetta di cui fidarsi a metà */
  why: string
  /** §326 — quanto deve **adesso**: il cumulativo delle fatture oltre la scadenza */
  overdue: number
  overdueCount: number
  /** il più vecchio scaduto, in giorni: un credito di 90 giorni non è uno di 5 */
  worstLate: number
  /** aperto in tutto, scaduto compreso: quello che deve ancora rientrare */
  open: number
  openCount: number
  /** competenza del mese che nessuna fattura copre */
  toInvoice: number
}

/** Una riga di ricavo del mese, come la vede questa domanda. */
export type RevenueRef = {
  clientId: string | null
  month: string
  amountNet: number
  /** la fattura sotto la riga, quando c'è (§211) */
  invoiceId: string | null
}

const DAY = 86400000
const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY)

/**
 * Lo stato di un cliente, dalle sue fatture e dalle righe del mese.
 *
 * `invoices` sono **le sue emesse, tutte**, non quelle di un mese: uno scaduto
 * di marzo è dovuto anche a settembre, e filtrare per mese lo farebbe sparire
 * proprio dalla colonna che esiste per mostrarlo.
 */
export function clientBilling(
  invoices: Invoice[],
  monthLines: RevenueRef[],
  today: string,
): ClientBilling {
  const mie = invoices.filter(i => i.direction === 'emessa')
  const aperte = mie.filter(isOpen)
  const scadute = aperte.filter(i => i.dueDate && i.dueDate < today)
  const overdue = sum(scadute.map(signedTotal))
  const open = sum(aperte.map(signedTotal))
  const worstLate = scadute.length
    ? Math.max(...scadute.map(i => daysBetween(i.dueDate!, today)))
    : 0

  /* §211 — una riga di conto economico senza `invoice_id` è competenza che
     nessun documento copre. Non è un sospetto: è il collegamento che manca. */
  const scoperte = monthLines.filter(l => !l.invoiceId)
  const toInvoice = sum(scoperte.map(l => l.amountNet))

  const base = { overdue, overdueCount: scadute.length, worstLate, open, openCount: aperte.length, toInvoice }

  /* Senza fatture e senza righe non c'è un ciclo da raccontare, e inventarne
     uno sarebbe peggio di dire che non si sa (§177). */
  if (!mie.length && !monthLines.length) {
    return {
      ...base, state: 'nessuna_scadenza', tone: 'muted', label: BILLING_LABEL.nessuna_scadenza,
      why: 'nessuna fattura e nessuna riga di conto economico: il ciclo non è calcolabile',
    }
  }

  if (aperte.length) {
    const scaduto = scadute.length > 0
    return {
      ...base, state: 'non_pagato', tone: scaduto ? 'error' : 'warning',
      label: BILLING_LABEL.non_pagato,
      why: scaduto
        ? `${scadute.length} fattur${scadute.length === 1 ? 'a' : 'e'} oltre la scadenza`
          + `, la più vecchia da ${worstLate} giorni`
        : `${aperte.length} fattur${aperte.length === 1 ? 'a emessa' : 'e emesse'} e non ancora rientrat`
          + `${aperte.length === 1 ? 'a' : 'e'}, tutte nei termini`,
    }
  }

  if (toInvoice > 0.005) {
    return {
      ...base, state: 'da_emettere', tone: 'warning', label: BILLING_LABEL.da_emettere,
      why: `${scoperte.length} rig${scoperte.length === 1 ? 'a' : 'he'} di competenza del mese`
        + ' senza una fattura sotto: non è un ritardo del cliente, è nostro',
    }
  }

  return {
    ...base, state: 'pagato', tone: 'success', label: BILLING_LABEL.pagato,
    why: mie.length
      ? `${mie.length} fattur${mie.length === 1 ? 'a' : 'e'} emesse, tutte rientrate`
      : 'niente da fatturare in questo mese',
  }
}
