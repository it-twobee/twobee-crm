/* Cedolino e F24 del consulente, letti per posizione.
   Esegui: npx tsx lib/pdf-paghe.check.ts

   I PDF veri non entrano nel repository — hanno nomi, codici fiscali e
   stipendi. Qui si ricostruiscono con le coordinate del tracciato Ranocchi e
   del modello ministeriale e valori inventati: il lettore deve trovare ogni
   numero sotto la sua etichetta, e la quadratura deve dire di no quando un
   numero è finito nella colonna sbagliata. */

import { leggiCedolino, leggiF24, numero, stessaPersona, type Pezzo } from '@/lib/pdf-paghe'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${ok ? '' : `${JSON.stringify(got)?.slice(0, 120)}  atteso ${JSON.stringify(want)?.slice(0, 120)}`}`)
}

const P = (x: number, y: number, s: string, w = s.length * 4.3): Pezzo => ({ x, y, w, s })
/* un'etichetta stampata come la stampa Ranocchi: parole e punti separati */
const E = (x: number, y: number, t: string): Pezzo[] => {
  const out: Pezzo[] = []
  let cx = x
  for (const tok of t.split(/(\.)|\s+/).filter(Boolean)) { out.push(P(cx, y, tok)); cx += tok.length * 4.3 + 1.4 }
  return out
}

// ── cedolino ───────────────────────────────────────────────────────────────
type Opz = { netto?: string; arrAtt?: string; totale?: string }
function cedolino(o: Opz = {}): Pezzo[] {
  return [
    P(582.1, 793.3, 'Ranocchi Software, Autorizzazione Inail'),
    P(365, 57.1, 'MESE'), P(362.6, 73.4, 'Luglio'), P(422.7, 73.4, '2026'),
    P(356.6, 121.5, '7 ROSSI MARIA'), P(300, 140, 'RSSMRA85T41F205X'),
    P(302.6, 318.7, 'COMPETENZA', 35), P(355.4, 318.7, 'TRATTENUTA', 33.7),
    P(35, 329, '1 RETRIBUZIONE ORDINARIA'), P(316, 329, '1.500,00', 26),
    P(35, 341, '580 FERIE GODUTE'), P(322, 341, '300,00', 20),
    P(35, 353, '800 TRASFERTE ITALIA'), P(322, 353, '100,00', 20),
    P(35, 365, '430 INDENNITA\' ESENTE L.207/2024'), P(326, 365, '50,00', 16),
    P(307.4, 521.4, o.totale ?? '1.950,00', 30.6),
    ...E(23.8, 528.1, 'ENTE - VOCE'), ...E(81.6, 528.1, 'IMPONIBILE'), ...E(378.7, 528.1, 'TOTALE CONTRIBUTI'),
    P(104, 543, '1.800,00', 30), P(415, 567, '166,00', 20),
    ...E(140.1, 576.1, 'IMPONIBILE IRPEF'), ...E(378.7, 576.1, 'TOTALE IRPEF MESE'),
    P(160.5, 591.2, '1.684,00', 30), P(415.4, 591.2, '200,00', 20),
    ...E(378.7, 600.1, 'TOTALE IRPEF CONGUAGLIO'),
    ...E(378.7, 648.1, 'TOT. ADDIZIONALI'), P(420, 663, '20,00', 16),
    ...E(256.1, 672.1, 'TRATTENUTE DA VOCI'), ...E(317.9, 672.1, 'ARROTOND. PREC.'), ...E(378.7, 672.1, 'ALTRE TRATTENUTE'),
    P(354.9, 687.4, '0,40', 17.3), P(424, 687.4, '0,40', 17.3),
    ...E(317.9, 698.4, 'ARROTOND. ATT.'), ...E(378.7, 698.4, 'NETTO'),
    P(353.5, 706.7, o.arrAtt ?? '0,60', 17.3), P(398.7, 706.7, o.netto ?? '1.564,20', 48.1),
    ...E(81.6, 781.9, 'TFR MESE'), P(111.6, 787.3, '130,00', 20),
  ]
}

is('numero: migliaia e virgola', [numero('1.840,72'), numero('0,61'), numero('-2,32'), numero('12')], [1840.72, 0.61, -2.32, null])

{
  const r = leggiCedolino(cedolino())
  is('cedolino: si legge', r.ok, true)
  if (r.ok) {
    const c = r.cedolino
    is('mese e persona', [c.mese, c.nome, c.codiceFiscale], ['2026-07-01', 'ROSSI MARIA', 'RSSMRA85T41F205X'])
    is('voci nei campi del motore', [c.campi.base_pay, c.campi.holidays_taken, c.campi.travel, c.campi.allowances], [1500, 300, 100, 50])
    is('contributi, imponibili, IRPEF', [c.campi.contributory_base, c.campi.employee_contrib, c.campi.taxable_base, c.campi.irpef, c.campi.surcharges], [1800, 166, 1684, 200, 20])
    // 1950 − 166 − 200 − 20 − 0,40 + 0,60 = 1564,20
    is('arrotondamenti: il precedente non è una trattenuta', [c.campi.other_deductions, c.campi.rounding], [0, 0.2])
    is('netto e TFR', [c.campi.net_paid, c.campi.tfr_accrued], [1564.2, 130])
    is('quadra al centesimo', [c.quadra, c.differenza, c.avvisi], [true, 0, []])
  }
}
{
  const r = leggiCedolino(cedolino({ netto: '1.564,30' }))
  is('dieci centesimi di troppo: da confermare', r.ok && [r.cedolino.quadra, r.cedolino.differenza], [false, 0.1])
}
{
  const r = leggiCedolino(cedolino({ totale: '1.960,00', netto: '1.574,20' }))
  is('netto giusto ma voci che non sommano: da confermare', r.ok && r.cedolino.quadra, false)
}
is('un PDF qualunque non è un cedolino', leggiCedolino([P(10, 10, 'Estratto conto')]).ok, false)

// ── F24 ────────────────────────────────────────────────────────────────────
function f24(saldo = '581 00'): Pezzo[] {
  const TOT = [322.8, 407.1, 490.9, 574.7, 646.3, 695.2]
  return [
    P(547.4, 33.2, 'F24'), P(18, 813.4, 'MOD. F24 – 2013'),
    ...TOT.map(y => P(259.7, y, 'TOTALE', 29.7)),
    P(168.5, 249.6, '1001'), P(231.6, 249.6, '0007'), P(280.7, 249.6, '2026'), P(357.9, 249.6, '210 00'),
    P(20, 261.6, 'IMPOSTE DIRETTE – IVA'), P(168.5, 261.6, '1701'), P(231.6, 261.6, '0007'), P(280.7, 261.6, '2026'), P(442, 261.6, '100 00'),
    P(357.9, 321.7, '210 00'), P(442, 321.7, '100 00-'), P(540.2, 321.7, '110 00'),
    P(21.2, 357.8, '5100 DM10 1234567890 072026'), P(224.6, 357.8, '072026'), P(357.9, 357.8, '471 00'),
    P(357.9, 407.1, '471 00'), P(540.2, 407.1, '471 00'),
    P(330.2, 705.7, 'SALDO FINALE', 67.3), P(520, 718.6, saldo),
    P(581.6, 625.4, '(Scadenza versamento: 17/08/2026 Da versare tramite: Entratel'),
  ]
}
{
  const r = leggiF24(f24())
  is('F24: si legge', r.ok, true)
  if (r.ok) {
    const f = r.f24
    is('righe: codice e sezione', f.righe.map(x => `${x.sezione}:${x.codice}`), ['erario:1001', 'erario:1701', 'inps:5100'])
    is('la scritta della sezione non è il codice', f.righe[1].riferimento, '0007 2026')
    is('le righe dei totali non si contano', f.righe.length, 3)
    is('competenza e scadenza', [f.competenza, f.scadenza], ['2026-07-01', '2026-08-17'])
    is('erario, crediti, INPS', [f.erarioDebito, f.crediti, f.inps, f.inail], [210, 100, 471, 0])
    is('saldo finale quadra', [f.saldoFinale, f.quadra], [581, true])
  }
}
{
  const r = leggiF24(f24('591 00'))
  is('saldo che non torna con le righe', r.ok && [r.f24.quadra, r.f24.avvisi.length], [false, 1])
}
is('un cedolino non è un F24', leggiF24(cedolino()).ok, false)

is('stessa persona, nome e cognome invertiti', stessaPersona('ROSSI MARIA', 'Maria Rossi'), true)
is('persone diverse', stessaPersona('ROSSI MARIA', 'Mario Rossi'), false)
is('accenti e apostrofi', stessaPersona("D'ANGELO NICOLÒ", 'Nicolo D Angelo'), true)

console.log(fail ? `\n${fail} controlli falliti` : '\nTutti i controlli passano')
if (fail) process.exit(1)
