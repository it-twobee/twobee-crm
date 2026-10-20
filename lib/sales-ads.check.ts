/* Etichette ads e fatturato dichiarato (§480).
   Esegui: npx tsx lib/sales-ads.check.ts */

import { tipiAds, fatturatoDichiarato, rangoFatturato } from '@/lib/sales-ads'
import { ordina, applica, opzioni, type Riga } from '@/lib/sales-filtri'
import { FASI_SEME as F } from '@/lib/sales-stages'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Tipo di ads —')
is('annuncio «…IA usato al 2%»', tipiAds({ campagna: 'TwoBee_2026_Lug_Contatti_Campagna Lancio 1', adset: 'TwoBee_Adv+_Broad_Adv+_NA', annuncio: 'Video_9x16_23s_IA usato al 2%' }), ['IA'])
is('«Italia» non è IA', tipiAds({ adset: 'TwoBee_Adv+_Centro-Nord Italia_Adv+_NA', annuncio: 'Video_9x16_23s_Margine' }), [])
is('e-commerce in campagna', tipiAds({ campagna: 'TwoBee_Ecommerce_Lead' }), ['E-commerce'])
is('«E-commerce» con trattino', tipiAds({ adset: 'Broad E-commerce' }), ['E-commerce'])
is('campagna «Test» è e-commerce', tipiAds({ campagna: 'TwoBee_2026_Test' }), ['E-commerce'])
is('«test» nell\'annuncio non basta', tipiAds({ campagna: 'Lancio', annuncio: 'Video test A' }), [])
is('entrambi', tipiAds({ campagna: 'IA', annuncio: 'ecommerce' }), ['IA', 'E-commerce'])
is('senza origine', tipiAds(null), [])

console.log('\n— Fatturato dichiarato (testi del modulo) —')
is('oltre 5', rangoFatturato({ fatturato_dichiarato: 'Oltre 5 m€ / anno' }), 4)
is('1–5 M', rangoFatturato({ fatturato_dichiarato: '1 m€ – 5 m€ / anno' }), 3)
is('500k–1M', rangoFatturato({ fatturato_dichiarato: '500.000 € – 1 m€ / anno' }), 2)
is('meno di 500k', rangoFatturato({ fatturato_dichiarato: 'Meno di 500.000 € / anno' }), 1)
is('lead di prova → null, non 0', fatturatoDichiarato({ fatturato_dichiarato: '<test lead: dummy data for qual_è_il_tuo_fatturato_annuo?>' }), null)

console.log('\n— Ordine e filtro —')
const righe: Riga[] = [
  { company_name: 'senza', lead_origine: {} },
  { company_name: 'piccolo', lead_origine: { fatturato_dichiarato: 'Meno di 500.000 € / anno', campagna: 'x IA' } },
  { company_name: 'grande', lead_origine: { fatturato_dichiarato: 'Oltre 5 m€ / anno', adset: 'ecommerce' } },
  { company_name: 'medio', lead_origine: { fatturato_dichiarato: '1 m€ – 5 m€ / anno' } },
]
is('fatturato in discesa, vuoti in fondo', ordina(F, righe, 'fatturato_rango', 'giu').map(r => r.company_name), ['grande', 'medio', 'piccolo', 'senza'])
is('filtro IA', applica(righe, { tipo_ads: ['IA'] }).map(r => r.company_name), ['piccolo'])
is('opzioni', opzioni(righe, { campo: 'tipo_ads' }).map(o => o.valore).sort(), ['E-commerce', 'IA'])

console.log(fail ? `\n${fail} controlli falliti` : '\nTutti i controlli passano')
process.exit(fail ? 1 : 0)
