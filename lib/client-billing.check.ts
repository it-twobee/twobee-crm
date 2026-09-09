/* Verifica del ciclo di fatturazione per cliente. Esegui: npx tsx lib/client-billing.check.ts */
import { clientBilling, BILLING_LABEL, type RevenueRef } from '@/lib/client-billing'
import { segmentOf, isGiro, isInternalWork, needsQuote, SEGMENT_LABEL } from '@/lib/clients'
import type { Invoice } from '@/lib/invoices'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(56)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const eq = (label: string, got: number, want: number) => {
  const ok = Math.abs(got - want) < 0.01
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(56)} ${got.toFixed(2).padStart(11)}${ok ? '' : `  atteso ${want.toFixed(2)}`}`)
}

const OGGI = '2026-09-09'
const F = (o: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', direction: 'emessa', docType: 'TD01', number: 'FPR 1/26', issuedOn: '2026-07-03',
  counterpartyName: 'ACME SRL', counterpartyVat: '01', clientId: 'c1',
  taxable: 1000, vatAmount: 220, total: 1220, sign: 1,
  dueDate: '2026-07-15', paidOn: null, ...o,
})
const R = (o: Partial<RevenueRef> = {}): RevenueRef =>
  ({ clientId: 'c1', month: '2026-09-01', amountNet: 1000, invoiceId: 'i1', ...o })

console.log('\n— §326: i tre stati, e cosa fa fare ciascuno —')
{
  /* Non pagato: la fattura è partita, i soldi no. L'azione è telefonare, e la
     cifra che serve è quanto — cumulativo, non del mese. */
  const b = clientBilling(
    [F({ id: 'a', total: 1220, dueDate: '2026-07-15' }),
     F({ id: 'b', total: 2440, dueDate: '2026-08-14' }),
     F({ id: 'c', total: 500, dueDate: '2026-09-30' }),
     F({ id: 'd', total: 900, paidOn: '2026-08-01' })],
    [], OGGI)
  is('con fatture aperte lo stato è «non pagato»', b.state, 'non_pagato')
  eq('scaduto cumulativo: le due oltre il termine', b.overdue, 3660)
  is('e quante sono', b.overdueCount, 2)
  eq('aperto in tutto, anche quella nei termini', b.open, 4160)
  is('il ritardo peggiore', b.worstLate, 56)
  is('il perché nomina il più vecchio', /56 giorni/.test(b.why), true)
  is('con uno scaduto il tono è rosso', b.tone, 'error')
}
{
  /* Aperto ma nei termini è ancora «non pagato» — la fattura non è rientrata —
     ma non è un'emergenza, e il colore lo deve dire. */
  const b = clientBilling([F({ dueDate: '2026-09-30' })], [], OGGI)
  is('nei termini resta non pagato', b.state, 'non_pagato')
  eq('ma lo scaduto è zero', b.overdue, 0)
  is('e il tono è d\'attesa, non d\'allarme', b.tone, 'warning')
}

console.log('\n— §326: «da emettere» è un ritardo nostro, non del cliente —')
{
  const b = clientBilling(
    [F({ paidOn: '2026-08-01' })],
    [R({ invoiceId: null, amountNet: 1800 }), R({ invoiceId: 'i1', amountNet: 1000 })],
    OGGI)
  is('competenza senza documento sotto', b.state, 'da_emettere')
  eq('e quanto manca da fatturare', b.toInvoice, 1800)
  is('il perché lo dice di chi è il ritardo', /è nostro/.test(b.why), true)
  /* Ordine: prima il non pagato. Un cliente che ha entrambe le cose si guarda
     per i soldi già dovuti, non per la fattura da scrivere. */
  const doppio = clientBilling([F({ dueDate: '2026-07-15' })], [R({ invoiceId: null })], OGGI)
  is('col non pagato accanto vince il non pagato', doppio.state, 'non_pagato')
  eq('ma il da fatturare resta leggibile', doppio.toInvoice, 1000)
}

console.log('\n— §326: pagato, e il caso in cui non si sa —')
{
  const b = clientBilling([F({ paidOn: '2026-07-20' })], [R()], OGGI)
  is('tutto rientrato e niente scoperto', b.state, 'pagato')
  eq('senza scaduto', b.overdue, 0)
  /* §177 — senza rate e senza righe lo stato non è calcolabile: dirlo è meglio
     di mostrare una parola che nessun dato sostiene. */
  const vuoto = clientBilling([], [], OGGI)
  is('senza niente non si inventa uno stato', vuoto.state, 'nessuna_scadenza')
  is('e lo dichiara', /non è calcolabile/.test(vuoto.why), true)
  is('le etichette sono quelle chieste',
    [BILLING_LABEL.pagato, BILLING_LABEL.da_emettere, BILLING_LABEL.non_pagato],
    ['pagato', 'da emettere fattura', 'non pagato'])
}

console.log('\n— §326: le ricevute non sono affari di questa colonna —')
{
  /* Una fattura che ci hanno mandato è un debito nostro: metterla qui direbbe
     che il cliente non ci ha pagato quando è il contrario. */
  const b = clientBilling([F({ direction: 'ricevuta', dueDate: '2026-07-01' })], [], OGGI)
  is('una ricevuta aperta non rende il cliente moroso', b.state, 'nessuna_scadenza')
  eq('e non entra nello scaduto', b.overdue, 0)
}

console.log('\n— §326: tre aree, non una lista sola —')
{
  const cliente = { is_internal: false, client_label: 'stabile' as const }
  const giro = { is_internal: true, internal_kind: 'giro' as const, client_label: 'stabile' as const }
  const interno = { is_internal: true, internal_kind: 'progetto' as const, client_label: 'stabile' as const }
  is('un cliente è un cliente', segmentOf(cliente), 'cliente')
  is('GAV Sistemi è una società collegata', segmentOf(giro), 'giro')
  is('Metroquadro è un progetto interno', segmentOf(interno), 'interno')
  is('e i predicati concordano', [isGiro(giro), isInternalWork(interno)], [true, true])
  /* Un interno senza genere è un giro: è la scelta prudente, perché un giro
     compare nei conti e un lavoro interno no — e far comparire una riga di
     troppo si vede, farne sparire una no. */
  is('un interno senza genere è un giro',
    segmentOf({ is_internal: true, client_label: 'stabile' as const }), 'giro')
  is('le aree hanno un nome', SEGMENT_LABEL.giro, 'Società collegate')

  /* §326 — «da quotare» va chiesto solo a chi può avere un contratto. Su GAV e
     su TwoBee non c'è niente da quotare, e chiederlo mette in cima a una lista
     di cose da fare due righe che non si chiuderanno mai. */
  is('a un cliente senza contratti si chiede', needsQuote(cliente, 0), true)
  is('a GAV Sistemi no', needsQuote(giro, 0), false)
  is('a TwoBee nemmeno', needsQuote(interno, 0), false)
  is('e a chi il contratto ce l\'ha, neanche', needsQuote(cliente, 2), false)
  /* Non si quota chi se n'è andato. Ma un lead sì — è il solo motivo per cui
     esiste (§321) — e un fermo pure, perché il giorno che riparte serve un
     contratto: la regola è «chi può firmare qualcosa», non «chi conta». */
  is('a un perso non si chiede', needsQuote({ ...cliente, client_label: 'perso' }, 0), false)
  is('a un lead sì, è il suo motivo', needsQuote({ ...cliente, client_label: 'lead' }, 0), true)
  is('e a un fermo pure', needsQuote({ ...cliente, client_label: 'pending' }, 0), true)
}

console.log('\n— §326: spostare un\'anagrafica muove due colonne, non una —')
{
  /* Il caso vero: Elettra Group è stata segnata interna **dopo** il backfill
     della 220, è rimasta senza genere, ed è finita fra le società collegate.
     Il default non era sbagliato — far comparire una riga di troppo si vede,
     farne sparire una no — era sbagliato che ci fosse un modo di scrivere una
     sola delle due colonne. `patchFor` è quello che l'azione scrive. */
  const patchFor = (seg: 'cliente' | 'giro' | 'interno') => seg === 'cliente'
    ? { is_internal: false, internal_kind: null }
    : { is_internal: true, internal_kind: seg === 'giro' ? 'giro' : 'progetto' }

  for (const seg of ['cliente', 'giro', 'interno'] as const) {
    const p = patchFor(seg)
    is(`«${seg}» torna in «${seg}»`, segmentOf(p as never), seg)
  }
  is('tornando cliente il genere si azzera', patchFor('cliente').internal_kind, null)
  is('e non resta interno', patchFor('cliente').is_internal, false)
  /* La rotta di ritorno chiude il cerchio: qualunque area si scelga, rileggerla
     dà la stessa area. Senza questo, uno spostamento potrebbe non essere
     reversibile e nessuna pagina se ne accorgerebbe. */
  is('nessuna area lascia un\'anagrafica senza genere',
    (['cliente', 'giro', 'interno'] as const)
      .every(seg => segmentOf(patchFor(seg) as never) === seg), true)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
