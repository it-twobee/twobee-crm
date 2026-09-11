/* Verifica degli stati del cliente. Esegui: npx tsx lib/clients.check.ts */
import { isLost, isPaused, isLead, countsInStats, countsInDelivery, pausedDays, paymentLabel } from '@/lib/clients'
import type { ClientLabel } from '@/lib/types/database'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const c = (client_label: ClientLabel, is_internal = false) => ({ client_label, is_internal })

/* I cinque stati sono un insieme chiuso: se ne arriva un sesto, questa lista è
   il posto in cui qualcuno deve decidere se conta o no. Un `default` implicito
   lo farebbe entrare nelle statistiche in silenzio. */
const TUTTI: ClientLabel[] = ['stabile', 'in_bilico', 'pending', 'lead', 'perso', 'partner']

console.log('\n— Chi è cosa —')
is('perso', TUTTI.filter(l => isLost(c(l))), ['perso'])
is('sospeso', TUTTI.filter(l => isPaused(c(l))), ['pending'])
is('lead', TUTTI.filter(l => isLead(c(l))), ['lead'])

console.log('\n— Chi entra nelle statistiche —')
/* §321 — il lead non fattura ancora, quindi sta fuori come il sospeso. Il
   partner invece è un rapporto vivo che produce numeri: dentro. */
is('dentro', TUTTI.filter(l => countsInStats(c(l))), ['stabile', 'in_bilico', 'partner'])
is('fuori', TUTTI.filter(l => !countsInStats(c(l))), ['pending', 'lead', 'perso'])
is('l\'interno è fuori comunque', countsInStats(c('stabile', true)), false)
is('anche un partner interno', countsInStats(c('partner', true)), false)

console.log('\n— Chi entra nel calendario delle lavorazioni (§328) —')
/* Non è la stessa domanda delle statistiche: un lavoro interno non conta
   nell'MRR ma ha milestone vere, un giro ha solo fatture e non avrà mai un
   progetto — una riga «0 progetti» per lui è un allarme che non si spegne. */
is('dentro', TUTTI.filter(l => countsInDelivery(c(l))), ['stabile', 'in_bilico', 'partner'])
is('il lavoro interno si presidia', countsInDelivery({ ...c('stabile', true), internal_kind: 'progetto' }), true)
is('il giro no', countsInDelivery({ ...c('stabile', true), internal_kind: 'giro' }), false)
is('interno senza genere è un giro', countsInDelivery(c('stabile', true)), false)
is('senza label conta', countsInDelivery({}), true)

console.log('\n— Un lead non è un perso —')
/* La distinzione non è cosmetica: il churn conta i persi, e un lead contato lì
   direbbe che abbiamo perso qualcuno che non abbiamo mai avuto. */
is('il lead non è perso', isLost(c('lead')), false)
is('il lead non è sospeso', isPaused(c('lead')), false)
is('il perso non è un lead', isLead(c('perso')), false)

console.log('\n— Campi assenti: si conta, non si esclude —')
/* Una riga senza label è un cliente vero con un dato mancante: toglierla dalle
   statistiche sarebbe peggio che tenerla, perché sparirebbe senza dirlo. */
is('senza label conta', countsInStats({}), true)
is('senza label non è niente', [isLost({}), isPaused({}), isLead({})], [false, false, false])

console.log('\n— Da quanto è fermo —')
is('nessuna data, nessun conteggio', pausedDays(null), null)
is('undefined uguale', pausedDays(undefined), null)
/* Le due date si costruiscono nello stesso fuso di `pausedDays`, che parte da
   mezzanotte locale: mescolare una `Z` con una locale sposta il conteggio di
   un giorno a seconda di dove gira il test. */
is('cinque giorni', pausedDays('2026-08-01', new Date('2026-08-06T00:00:00')), 5)
is('mezza giornata si arrotonda', pausedDays('2026-08-01', new Date('2026-08-06T12:00:00')), 6)
is('mai negativo', pausedDays('2026-09-01', new Date('2026-08-06T00:00:00')), 0)

console.log('\n— Lo stato pagamenti si legge, non si stampa —')
is('in_attesa è «da pagare»', paymentLabel('in_attesa'), 'Da pagare')
is('scaduto è «non pagato»', paymentLabel('scaduto'), 'Non pagato')
is('ignoto è un trattino', paymentLabel('boh'), '—')
is('nullo è un trattino', paymentLabel(null), '—')

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)
