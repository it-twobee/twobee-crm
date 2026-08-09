/**
 * §276 — Gli abbinamenti che non richiedono un giudizio — calcoli puri.
 *
 * Riconciliare **non è automatico** (§189), e la ragione non è cambiata: un
 * abbinamento sbagliato dichiara incassata una fattura che nessuno ha pagato,
 * ed è un errore che poi nessuno va a cercare. Ma su sessanta movimenti
 * importati ce ne sono venti in cui non c'è niente da giudicare — l'importo
 * lordo combacia **al centesimo** e il nome è quello — e chiederne venti
 * conferme separate è il modo in cui non se ne conferma nessuna.
 *
 * Qui si isolano quei venti. Non è un abbinamento automatico: è la stessa
 * conferma umana, chiesta **una volta invece che venti**, su un elenco che si
 * legge prima di premere. Tutto il resto resta dov'era, da guardare a mano.
 *
 * Tre condizioni, e devono valere **tutte**:
 *
 *   1. **importo lordo esatto**, entro un centesimo. Non «vicino»: vicino vuol
 *      dire che manca l'IVA, o che è un'altra fattura dello stesso cliente.
 *   2. **il nome torna** — una parola piena del cliente nella descrizione o
 *      nella controparte, oppure il numero del documento dentro l'etichetta
 *      della riga. L'importo da solo abbina due canoni uguali di due clienti.
 *   3. **uno a uno**: se quel movimento potrebbe essere due righe, o quella riga
 *      due movimenti, non è più un fatto — è una scelta, e la scelta resta a
 *      chi guarda. È la condizione che rende sicuro il resto, e l'unica che il
 *      punteggio di `matchCandidates` non poteva dare.
 */

import { grossOf, type BankTx, type PlLineRef } from '@/lib/bank'

const r2 = (n: number) => Math.round(n * 100) / 100
/** Le parole che identificano qualcuno: sotto le quattro lettere non lo fanno. */
const parole = (s: string) => new Set((s ?? '').toLowerCase()
  .split(/[^a-zà-ù0-9]+/).filter(w => w.length >= 4))

export type SureMatch = {
  txId: string
  lineId: string
  kind: 'ricavo' | 'costo'
  /** l'importo del movimento, che è anche il lordo della riga */
  amount: number
  date: string
  label: string
  who: string
  /** perché è certo: si legge prima di premere */
  why: string
}

export type Ambiguous = {
  txId: string
  amount: number
  date: string
  who: string
  /** quante righe potrebbero essere questo movimento */
  count: number
  why: string
}

export function sureMatches(
  txs: BankTx[],
  lines: PlLineRef[],
  tolerance = 0.01,
): { pairs: SureMatch[]; ambiguous: Ambiguous[] } {
  /* Solo i movimenti veri e ancora liberi: un `derivato` nasce da una spunta e
     userebbe la dichiarazione per confermare se stessa (§189). */
  const liberi = txs.filter(t =>
    (t.source === 'banca' || t.source === 'manuale')
    && !t.no_match_needed && !t.revenue_line_id && !t.cost_line_id)
  const aperte = lines.filter(l => !l.paid)

  /** Le righe che quel movimento potrebbe essere, senza margine di dubbio. */
  const per = (t: BankTx) => {
    const dir = t.amount > 0 ? 'in' : 'out'
    const abs = r2(Math.abs(t.amount))
    const desc = parole(`${t.counterparty ?? ''} ${t.description ?? ''}`)
    /* «FPR 41/26» e «28/26» vogliono dire la stessa cosa: il numero è la prima
       cifra utile, non quello che sta prima della barra. Sotto le due cifre non
       identifica niente e aggancerebbe qualunque etichetta con un «1» dentro. */
    const num = t.doc_ref?.match(/\d{2,}/)?.[0] ?? null
    return aperte.filter(l => {
      if (l.direction !== dir) return false
      if (Math.abs(grossOf(l) - abs) > tolerance) return false
      const nome = Array.from(parole(l.clientName ?? '')).some(w => desc.has(w))
      const doc = !!num && new RegExp(`(^|[^0-9])${num}([^0-9]|$)`).test(l.label)
      return nome || doc
    })
  }

  const candidati = liberi.map(t => ({ t, ls: per(t) })).filter(x => x.ls.length > 0)

  /* Una riga contesa da due movimenti è ambigua quanto un movimento conteso da
     due righe: incassarla col primo che passa lascerebbe l'altro orfano e la
     riga chiusa dall'importo sbagliato. */
  const quanti = new Map<string, number>()
  for (const { ls } of candidati) for (const l of ls) quanti.set(l.id, (quanti.get(l.id) ?? 0) + 1)

  const pairs: SureMatch[] = []
  const ambiguous: Ambiguous[] = []
  for (const { t, ls } of candidati) {
    const who = (t.counterparty ?? t.description ?? '').slice(0, 40)
    if (ls.length > 1) {
      ambiguous.push({
        txId: t.id, amount: t.amount, date: t.booked_on, who, count: ls.length,
        why: `${ls.length} righe hanno questo importo e questo nome: la scelta è tua`,
      })
      continue
    }
    const l = ls[0]
    if ((quanti.get(l.id) ?? 0) > 1) {
      ambiguous.push({
        txId: t.id, amount: t.amount, date: t.booked_on, who, count: quanti.get(l.id)!,
        why: `${quanti.get(l.id)} movimenti uguali per la stessa riga: uno solo la paga`,
      })
      continue
    }
    pairs.push({
      txId: t.id, lineId: l.id, kind: l.direction === 'in' ? 'ricavo' : 'costo',
      amount: t.amount, date: t.booked_on, label: l.label, who: l.clientName ?? who,
      why: `${r2(Math.abs(t.amount)).toFixed(2).replace('.', ',')} € esatti`
        + (Array.from(parole(l.clientName ?? '')).some(w =>
            parole(`${t.counterparty ?? ''} ${t.description ?? ''}`).has(w))
          ? ' · nome che torna' : ` · numero ${t.doc_ref ?? ''} nella riga`),
    })
  }

  return {
    pairs: pairs.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    ambiguous: ambiguous.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
  }
}
