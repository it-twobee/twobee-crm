import {
  billing, relationship, forecast, rfmRaw, rfmScore, rfmLabel, trend, upsell, contribution,
  type ClientInput,
} from '@/lib/client-economics'
import { DEFAULT_PL_CONFIG as C } from '@/lib/pl'
import type { RevenueStream } from '@/lib/revenue'

let fail = 0
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${l.padEnd(56)} ${JSON.stringify(got)}${ok ? '' : ` atteso ${JSON.stringify(want)}`}`)
}
const S = (o: Partial<RevenueStream>): RevenueStream => ({
  id: 's', project_id: 'p', client_id: 'c', label: 'x', service_type: null, service_subtype: null,
  price_source: 'custom', kind: 'growth', billing: 'recurring', amount: 0, vat_rate: 0.22,
  start_date: null, end_date: null, status: 'attivo', sales_owner_id: null, activates_after_id: null, ...o,
})
const base = (o: Partial<ClientInput> = {}): ClientInput => ({
  id: 'c', name: 'Test', contract_start: '2026-01-01', contract_end: null, client_label: 'stabile',
  risk_score: null, history: [], streams: [], installments: [], projects: [], lastInteraction: null, ...o,
})
const TODAY = '2026-07-01'

console.log('— Cliente senza storico: dichiara, non inventa —')
const vuoto = base()
eq('fatturato non pronto', billing(vuoto, TODAY).lifetime.ready, false)
eq('e non finge zero', billing(vuoto, TODAY).lifetime.basis, 'nessun mese di conto economico registrato')
eq('media non calcolabile', billing(vuoto, TODAY).avgMonth.ready, false)
eq('previsionale senza contratti', forecast(vuoto, 6, TODAY).total.ready, false)
eq('tendenza senza sei mesi', trend(vuoto, TODAY).ready, false)

console.log('\n— Cliente con storico —')
const storico = base({
  history: [
    { month: '2026-01-01', amount: 3000, paid: 3000 },
    { month: '2026-02-01', amount: 3000, paid: 3000 },
    { month: '2026-03-01', amount: 3000, paid: 0 },
    { month: '2026-04-01', amount: 4000, paid: 4000 },
    { month: '2026-05-01', amount: 4000, paid: 4000 },
    { month: '2026-06-01', amount: 4000, paid: 0 },
  ],
})
const b = billing(storico, TODAY)
eq('fatturato complessivo', b.lifetime.value, 21000)
eq('incassato', b.collected.value, 14000)
eq('da incassare', b.unpaid.value, 7000)
eq('media mensile', b.avgMonth.value, 3500)
eq('crescita ultimi 3 su 3 precedenti', trend(storico, TODAY).value, 0.33)

console.log('\n— Durata del rapporto: la dice il primo contratto (§179) —')
const conStorico = base({
  streams: [S({ id: 'a', start_date: '2026-01-01' }), S({ id: 'b', start_date: '2026-04-01' })],
})
eq('sei mesi dal primo contratto', relationship(conStorico, '2026-07-01').months.value, 6)
eq('senza contratti non si calcola',
  relationship(base(), '2026-07-01').months.ready, false)
eq('e lo dice perché', relationship(base(), '2026-07-01').months.basis,
  'nessun contratto: il rapporto si misura dal primo che vendi')
eq('la data in anagrafica non conta più',
  relationship(base({ contract_start: '2020-01-01' }), '2026-07-01').months.ready, false)
eq('una bozza non apre il rapporto',
  relationship(base({ streams: [S({ start_date: '2026-01-01', status: 'bozza' })] }), '2026-07-01').months.ready, false)
eq('cliente perso: rapporto chiuso alla data di perdita',
  relationship(base({
    streams: [S({ start_date: '2026-01-01' })], client_label: 'perso', lost_at: '2026-04-15',
  }), '2026-07-01').months.value, 3)

console.log('\n— Rinnovo: l\'ultimo contratto a scadere, se non c\'è un indeterminato —')
eq('scadenza dal contratto',
  relationship(base({ streams: [S({ start_date: '2026-01-01', end_date: '2026-09-30' })] }), '2026-07-01').renewalInDays, 91)
eq('un canone indeterminato non ha rinnovo',
  relationship(base({
    streams: [S({ start_date: '2026-01-01', end_date: '2026-09-30' }), S({ id: 'z', start_date: '2026-02-01' })],
  }), '2026-07-01').renewalInDays, null)

console.log('\n— Previsionale: somma dei contratti, non una stima —')
const conContratti = base({
  streams: [
    S({ id: 'a', amount: 3000, start_date: '2026-01-01' }),
    S({ id: 'b', amount: 500, start_date: '2026-01-01', end_date: '2026-09-01' }),
  ],
})
const f = forecast(conContratti, 6, TODAY)
eq('agosto: entrambi i canoni', f.rows[0].amount, 3500)
eq('ottobre: il secondo è scaduto', f.rows[2].amount, 3000)
eq('totale sei mesi', f.total.value, 19000)
eq('contratto in scadenza segnalato', f.expiring.map(s => s.id), ['b'])

console.log('\n— RFM: relativo, e lo dice quando non lo è —')
const soli = [rfmRaw(storico, TODAY)]
eq('con un cliente solo non si scora', rfmScore(soli[0], soli).ready, false)
const parco = Array.from({ length: 6 }, (_, i) => ({
  recencyDays: i * 30, frequency: i + 1, monetary: (i + 1) * 1000,
}))
const forte = rfmScore({ recencyDays: 0, frequency: 6, monetary: 9000 }, parco)
eq('cliente al top su tutto', [forte.r, forte.f, forte.m], [5, 5, 5])
eq('etichetta', forte.label, 'Campione')
const dormiente = rfmScore({ recencyDays: 400, frequency: 1, monetary: 500 }, parco)
eq('recency vecchia + poca frequenza', dormiente.label, 'Dormiente')
eq('etichetta da recuperare', rfmLabel(1, 3, 5), 'Da recuperare')

console.log('\n— Contributo e opportunità —')
eq('residuo growth (10% di 21.000)', contribution(storico, C, 'growth').residual.value, 2100)
eq('fondo rischio', contribution(storico, C, 'growth').riskFund.value, 2100)
const cat = [
  { service_type: 'lead_generation', service_subtype: null, label: 'Lead Gen', standard_price: 1500 },
  { service_type: 'branding', service_subtype: null, label: 'Branding', standard_price: null },
]
eq('servizi mai venduti',
  upsell(base({ streams: [S({ service_type: 'lead_generation' })] }), cat).map(s => s.label), ['Branding'])

console.log(fail === 0 ? '\nTutti i controlli passano.' : `\n${fail} falliti.`)
process.exit(fail ? 1 : 0)
