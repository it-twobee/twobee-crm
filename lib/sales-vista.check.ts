/* Lo stato dell'elenco dei lead (§440).
   Esegui: npx tsx lib/sales-vista.check.ts

   Le cose da non sbagliare: un link incollato che apre un'altra vista, un
   parametro inventato che diventa un filtro che esclude tutto, «da richiamare»
   che ci mette dentro chi ha già un follow-up la settimana prossima, e un
   intervallo di date che perde l'ultimo giorno. */

import { FASI_SEME as F } from '@/lib/sales-stages'
import { applicaStato, dentroData, etichettaFiltroData, inRapida, leggi, scrivi, VUOTO, type StatoElenco } from '@/lib/sales-vista'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(66)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

// giovedì 25 settembre 2026, 11:00 a Roma
const ADESSO = Date.parse('2026-09-25T09:00:00Z')
const IO = 'io'
const ctx = { fasi: F, io: IO, adessoMs: ADESSO }
const r = (id: string, x: Record<string, unknown> = {}) => ({ id, stage: 'in_contatto', company_name: id, created_at: '2026-09-01T10:00:00Z', owners: [], ...x })

console.log('\n— Le date, sui giorni di Roma —')
is('oggi comprende le 00:30 di Roma', dentroData('2026-09-24T22:30:00Z', { tipo: 'oggi' }, ADESSO), true)
is('oggi non comprende le 23:30 di ieri a Roma', dentroData('2026-09-24T21:30:00Z', { tipo: 'oggi' }, ADESSO), false)
is('ultimi 7 giorni: da venerdì scorso', [dentroData('2026-09-19T08:00:00Z', { tipo: 'ultimi', giorni: 7 }, ADESSO), dentroData('2026-09-18T08:00:00Z', { tipo: 'ultimi', giorni: 7 }, ADESSO)], [true, false])
is('più di 7 giorni fa', [dentroData('2026-09-18T08:00:00Z', { tipo: 'piu_vecchio', giorni: 7 }, ADESSO), dentroData('2026-09-19T08:00:00Z', { tipo: 'piu_vecchio', giorni: 7 }, ADESSO)], [true, false])
is('mai sentito: il vuoto, non lo zero', [dentroData(null, { tipo: 'vuoto' }, ADESSO), dentroData('2026-09-19T08:00:00Z', { tipo: 'vuoto' }, ADESSO)], [true, false])
is('intervallo: l\'ultimo giorno è incluso fino a mezzanotte di Roma',
  [dentroData('2026-09-10T21:59:00Z', { tipo: 'intervallo', dal: '2026-09-01', al: '2026-09-10' }, ADESSO),
   dentroData('2026-09-10T22:01:00Z', { tipo: 'intervallo', dal: '2026-09-01', al: '2026-09-10' }, ADESSO)], [true, false])
is('intervallo aperto a sinistra', dentroData('2020-01-01T10:00:00Z', { tipo: 'intervallo', dal: null, al: '2026-09-10' }, ADESSO), true)
is('scaduto: prima di adesso', [dentroData('2026-09-25T08:00:00Z', { tipo: 'scaduto' }, ADESSO), dentroData('2026-09-25T10:00:00Z', { tipo: 'scaduto' }, ADESSO)], [true, false])
is('le etichette', [etichettaFiltroData('last_interaction_at', { tipo: 'vuoto' }), etichettaFiltroData('created_at', { tipo: 'intervallo', dal: '2026-09-01', al: '2026-09-10' })],
  ['Mai sentito', '01/09/2026 – 10/09/2026'])

console.log('\n— Le viste rapide —')
is('miei: fra gli Account Owner', [inRapida('miei', r('a', { owners: [IO] }), ctx), inRapida('miei', r('b', { owners: ['altro'] }), ctx)], [true, false])
is('da richiamare: follow-up scaduto', inRapida('richiamare', r('a', { next_followup_at: '2026-09-24T08:00:00Z' }), ctx), true)
is('da richiamare: follow-up di oggi pomeriggio', inRapida('richiamare', r('a', { next_followup_at: '2026-09-25T13:00:00Z' }), ctx), true)
is('non da richiamare: follow-up la settimana prossima, anche se fermo', inRapida('richiamare', r('a', { next_followup_at: '2026-09-30T08:00:00Z', last_interaction_at: '2026-08-01T08:00:00Z' }), ctx), false)
is('da richiamare: fermo senza niente in programma', inRapida('richiamare', r('a', { last_interaction_at: '2026-09-10T08:00:00Z' }), ctx), true)
is('mai sentito e arrivato da un mese: fermo', inRapida('fermi', r('a', { last_interaction_at: null }), ctx), true)
is('un perso non è fermo, e non è da richiamare', [inRapida('fermi', r('a', { stage: 'perso' }), ctx), inRapida('richiamare', r('a', { stage: 'perso', next_followup_at: '2026-09-24T08:00:00Z' }), ctx)], [false, false])
is('sentito ieri: non fermo', inRapida('fermi', r('a', { last_interaction_at: '2026-09-24T08:00:00Z' }), ctx), false)

console.log('\n— Filtrare e ordinare insieme —')
const righe = [
  r('Beta', { stage: 'call_fissata', last_interaction_at: '2026-09-20T08:00:00Z' }),
  r('Alfa', { stage: 'call_fissata', last_interaction_at: '2026-09-24T08:00:00Z' }),
  r('Gamma', { stage: 'nuovo_lead', last_interaction_at: null }),
  r('Delta', { stage: 'in_contatto', last_interaction_at: '2026-09-22T08:00:00Z', owners: [IO] }),
]
const ids = (s: Partial<StatoElenco>) => applicaStato(righe, { ...VUOTO, ...s }, ctx).map(x => x.id)
is('fase, poi ultimo contatto più recente', ids({ ordine: [{ campo: 'stage', verso: 'su' }, { campo: 'last_interaction_at', verso: 'giu' }] }), ['Gamma', 'Delta', 'Alfa', 'Beta'])
is('i mai sentiti in fondo anche in salita', ids({ ordine: [{ campo: 'last_interaction_at', verso: 'su' }] }), ['Beta', 'Delta', 'Alfa', 'Gamma'])
is('filtro data + vista rapida', ids({ rapida: 'miei', date: { last_interaction_at: { tipo: 'ultimi', giorni: 7 } } }), ['Delta'])
is('filtro a scelta + ricerca', ids({ q: 'a', scelte: { stage: ['call_fissata'] }, ordine: [{ campo: 'company_name', verso: 'su' }] }), ['Alfa', 'Beta'])

console.log('\n— Nell\'indirizzo, e ritorno —')
const pieno: StatoElenco = {
  q: 'rossi', gruppo: 'lavorazione', rapida: 'richiamare',
  scelte: { stage: ['in_contatto', 'call_fissata'], owners: ['__nessuno__'] },
  date: { last_interaction_at: { tipo: 'piu_vecchio', giorni: 14 }, created_at: { tipo: 'intervallo', dal: '2026-09-01', al: '2026-09-15' } },
  ordine: [{ campo: 'stage', verso: 'su' }, { campo: 'last_interaction_at', verso: 'giu' }],
}
const gruppi = ['tutti', 'apertura', 'lavorazione', 'uscita']
is('andata e ritorno identici', leggi(scrivi(pieno), gruppi), pieno)
is('il vuoto non scrive niente', scrivi(VUOTO), '')
is('campo inventato: ignorato', leggi('f.pippo=x&d.boh=oggi&ordine=segreto:su', gruppi), VUOTO)
is('vista inventata e gruppo inventato: ignorati', [leggi('vista=tutto&gruppo=vip', gruppi).rapida, leggi('vista=tutto&gruppo=vip', gruppi).gruppo], [null, 'tutti'])
is('intervallo rovesciato si raddrizza', leggi('d.arrivo=2026-09-15..2026-09-01', gruppi).date.created_at, { tipo: 'intervallo', dal: '2026-09-01', al: '2026-09-15' })
is('«scaduto» vale solo sul follow-up', [leggi('d.contatto=scaduto', gruppi).date.last_interaction_at, leggi('d.followup=scaduto', gruppi).date.next_followup_at], [undefined, { tipo: 'scaduto' }])
is('al massimo due criteri, senza doppioni', leggi('ordine=stage:su,stage:giu,company_name:su,priority:giu', gruppi).ordine, [{ campo: 'stage', verso: 'su' }, { campo: 'company_name', verso: 'su' }])
is('giorni fuori misura: ignorati', leggi('d.contatto=piu_vecchio:9999', gruppi).date, {})

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
