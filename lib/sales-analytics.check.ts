/* I numeri del commerciale (§372). Esegui: npx tsx lib/sales-analytics.check.ts

   Un tasso di conversione è un numero che qualcuno userà per spostare del
   budget. Quindi qui non si controlla che «faccia una divisione»: si
   controlla che il **denominatore** sia quello dichiarato, che una
   percentuale su tre righe venga marcata come inaffidabile, e che quando non
   c'è niente da dividere esca «n/d» e non uno zero — perché uno zero per
   cento e «non lo sappiamo ancora» portano a due decisioni opposte. */

import {
  tassoDi, imbuto, perDimensione, daOrigine, giorniPerChiudere, perCento,
  SOGLIA_AFFIDABILITA, type RigaAnalisi,
} from '@/lib/sales-analytics'
import { FASI } from '@/lib/sales-stages'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const r = (stage: string, extra: Partial<RigaAnalisi> = {}): RigaAnalisi => ({ stage, ...extra })

console.log('\n— Il denominatore è quello dichiarato —')
/* Vinti su conclusi, non su tutti: chi è ancora in trattativa non è una
   sconfitta, è un'attesa. Contarlo farebbe sembrare peggiore una campagna
   aperta da tre giorni di una chiusa da sei mesi. */
const misto = [
  ...Array(3).fill(0).map(() => r('active_client')),
  ...Array(1).fill(0).map(() => r('lost')),
  ...Array(6).fill(0).map(() => r('qualified')),
]
const t = tassoDi(misto)
is('tre vinti', t.vinti, 3)
is('un perso', t.persi, 1)
is('quattro conclusi, non dieci', t.conclusi, 4)
is('sei ancora aperti', t.aperti, 6)
is('il tasso è tre su quattro', t.tasso, 0.75)
is('non tre su dieci', t.tasso !== 0.3, true)
is('«Inactive Client» conta come perso', tassoDi([r('active_client'), r('inactive_client')]).tasso, 0.5)

console.log('\n— Senza denominatore si dice, non si scrive zero —')
/* La regola più vecchia del progetto: un numero plausibile e sbagliato è la
   sola categoria di errore che nessuno va a controllare. Uno zero per cento
   e «non lo sappiamo» portano a due decisioni opposte. */
is('nessuna conclusa: il tasso è null', tassoDi([r('new_lead'), r('contacting')]).tasso, null)
is('e si scrive n/d, non 0%', perCento(null), 'n/d')
is('mentre uno zero vero si scrive zero', perCento(0), '0%')
is('nessuna riga: null', tassoDi([]).tasso, null)
is('e i conti restano a zero', tassoDi([]).conclusi, 0)

console.log('\n— Una percentuale su tre righe è un aneddoto —')
is(`sotto ${SOGLIA_AFFIDABILITA} conclusi non è affidabile`,
  tassoDi([r('active_client'), r('lost')]).affidabile, false)
is('alla soglia sì',
  tassoDi(Array(SOGLIA_AFFIDABILITA).fill(0).map(() => r('lost'))).affidabile, true)
is('ma il tasso si calcola lo stesso: avvisare non è nascondere',
  tassoDi([r('active_client'), r('lost')]).tasso, 0.5)

console.log('\n— L\'imbuto è una fotografia, e lo dice —')
const f = imbuto([r('new_lead'), r('new_lead'), r('qualified'), r('lost')])
is('una voce per ogni fase, sempre', f.length, FASI.length)
is('nell\'ordine di Notion', f[0].etichetta, 'Lost')
is('conta chi c\'è adesso', f.find(x => x.chiave === 'new_lead')?.quante, 2)
is('e le fasi vuote restano, con zero',
  f.find(x => x.chiave === 'contratto')?.quante, 0)

console.log('\n— Per dimensione: si ordina per clienti, non per percentuale —')
/* Una campagna al cento per cento con un cliente sta sotto una al trenta con
   nove: il budget si sposta su quello che porta gente, non su quello che ha
   la frazione più bella. */
const campagne: RigaAnalisi[] = [
  ...Array(3).fill(0).map(() => r('active_client', { lead_origine: { campagna: 'Grande' } })),
  ...Array(7).fill(0).map(() => r('lost', { lead_origine: { campagna: 'Grande' } })),
  r('active_client', { lead_origine: { campagna: 'Piccola' } }),
]
const perCampagna = perDimensione(campagne, daOrigine('campagna'))
is('la campagna con più clienti sta in cima', perCampagna[0].valore, 'Grande')
is('anche se converte peggio', [perCampagna[0].tasso, perCampagna[1].tasso], [0.3, 1])
is('e quella piccola è marcata inaffidabile', perCampagna[1].affidabile, false)
is('chi non ha il campo finisce in un gruppo che si chiama',
  perDimensione([r('lost')], daOrigine('campagna'))[0].valore, 'Non indicato')
is('il totale del gruppo comprende gli aperti',
  perDimensione([r('active_client'), r('qualified')], () => 'x')[0].totale, 2)

console.log('\n— Quanto ci mette: mediana, non media —')
/* Un lead firmato dopo otto mesi sposterebbe la media di settimane e farebbe
   pianificare su un numero che non è successo a nessuno. */
const chiuse = [
  r('active_client', { created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-11T00:00:00Z' }),
  r('active_client', { created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-21T00:00:00Z' }),
  r('active_client', { created_at: '2026-01-01T00:00:00Z', closed_at: '2026-09-01T00:00:00Z' }),
]
is('la mediana ignora il caso estremo', giorniPerChiudere(chiuse).mediana, 20)
is('e dichiara su quante righe è calcolata', giorniPerChiudere(chiuse).campione, 3)
is('senza righe chiuse non si inventa', giorniPerChiudere([r('qualified')]).mediana, null)
is('una riga senza date non entra nel campione',
  giorniPerChiudere([r('active_client')]).campione, 0)
is('con due valori è la media dei due centrali', giorniPerChiudere(chiuse.slice(0, 2)).mediana, 15)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
