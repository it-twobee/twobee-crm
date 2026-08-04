/* Verifica dell'import bancario. Esegui: npx tsx lib/bank-import.check.ts */
import { parseStatement, detectDialect, merchant, byFamily, spendSplit, treatment } from '@/lib/bank-import'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(52)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const eq = (label: string, got: number, want: number, tol = 0.01) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(52)} ${got.toFixed(2).padStart(10)}${ok ? '' : `  atteso ${want.toFixed(2)}`}`)
}

console.log('\n— Il dialetto si riconosce dall\'intestazione —')
is('home banking italiano',
  detectDialect(['Data contabile', 'Data valuta', 'Importo', 'Divisa', 'Causale', 'Descrizione']), 'valsabbina')
is('Vivid',
  detectDialect(['Completed date', 'Counterparty name', 'Reference', 'Payment amount', 'Payment currency']), 'vivid')
is('un formato sconosciuto non si indovina', detectDialect(['Date', 'Value', 'Blah']), null)

console.log('\n— Valsabbina: virgola decimale, date con le barre —')
{
  const csv = [
    '"Data contabile";"Data valuta";"Importo";"Divisa";"Causale";"Descrizione";"Canale"',
    '"03/08/2026";"03/08/2026";"3812,50";"EUR";"480";"bonif. vs. favore - bon.da leo fatima fattura n. 36";""',
    '"30/07/2026";"30/07/2026";"-1,50";"EUR";"662";"comm.su bonifici";""',
    '"19/06/2026";"17/06/2026";"-685,97";"EUR";"198";"i24 agenzia entrate";""',
  ].join('\n')
  const r = parseStatement(csv)
  is('dialetto', r.dialect, 'valsabbina')
  is('tre righe', r.rows.length, 3)
  is('data normalizzata', r.rows[0].booked_on, '2026-08-03')
  eq('importo con la virgola', r.rows[0].amount, 3812.5)
  eq('e uno negativo', r.rows[1].amount, -1.5)
  eq('migliaia col punto e decimali con la virgola',
    parseStatement('"Data contabile";"Importo";"Descrizione"\n"01/01/2026";"12.345,67";"x"').rows[0].amount, 12345.67)
  is('data valuta diversa dalla contabile', r.rows[2].value_on, '2026-06-17')
  is('la causale numerica si conserva', r.rows[2].causal_code, '198')
  is('niente scartato', r.skipped.length, 0)
}

console.log('\n— Vivid: punto decimale, date coi punti, controparte in chiaro —')
{
  const csv = [
    'Completed date;Counterparty name;Reference;Payment amount;Payment currency',
    "14.07.2026;TWO BEE SOCIETA' A RESPONSABILITA';Spese Tools/Ads;1000;EUR",
    '16.07.2026;ASANA.COM, DUBLIN, IE;ASANA.COM, DUBLIN, IE;-304.9;EUR',
    '03.08.2026;Vivid Money GmbH;;14.56;EUR',
  ].join('\n')
  const r = parseStatement(csv)
  is('dialetto', r.dialect, 'vivid')
  is('tre righe', r.rows.length, 3)
  is('data coi punti', r.rows[0].booked_on, '2026-07-14')
  eq('importo col punto decimale', r.rows[1].amount, -304.9)
  eq('intero senza decimali', r.rows[0].amount, 1000)
  is('la controparte c\'è', r.rows[1].counterparty_raw, 'ASANA.COM, DUBLIN, IE')
  /* Su Vivid il campo «Reference» spesso ripete la controparte o è vuoto: la
     descrizione le unisce, perché perdere il nome sarebbe peggio che ripeterlo. */
  is('descrizione con la controparte davanti', r.rows[2].description, 'Vivid Money GmbH')
  is('e quando la reference aggiunge qualcosa, la tiene',
    r.rows[0].description, "TWO BEE SOCIETA' A RESPONSABILITA' — Spese Tools/Ads")
}

console.log('\n— Le righe illeggibili si dichiarano, non si ingoiano —')
{
  const csv = [
    '"Data contabile";"Importo";"Descrizione"',
    '"01/01/2026";"100,00";"buona"',
    '"non una data";"50,00";"data rotta"',
    '"02/01/2026";"non un numero";"importo rotto"',
    '"03/01/2026";"10,00";""',
  ].join('\n')
  const r = parseStatement(csv)
  is('una sola riga valida', r.rows.length, 1)
  is('e tre scartate con la ragione', r.skipped.length, 3)
  is('la prima dice cosa non andava', r.skipped[0].includes('data'), true)
}
{
  let msg = ''
  try { parseStatement('Colonna A;Colonna B\n1;2') } catch (e) { msg = (e as Error).message }
  is('un formato sconosciuto fallisce con un messaggio utile', msg.includes('Formato non riconosciuto'), true)
  is('e dice cosa ha trovato', msg.includes('Colonna A'), true)
}

console.log('\n— I fornitori delle carte, ricondotti al loro nome —')
{
  // ventisei codici diversi per lo stesso fornitore
  is('FACEBK con codice', merchant('FACEBK *69RNPVDF92, Dublin, IE'), { name: 'Meta Ads', family: 'advertising' })
  is('un altro codice, stesso nome', merchant('FACEBK *JZ4ERUDF92, Dublin, IE'), { name: 'Meta Ads', family: 'advertising' })
  is('Asana', merchant('ASANA.COM, DUBLIN, IE'), { name: 'Asana', family: 'software' })
  is('Slack', merchant('SLACK T0AHW3X61B6, DUBLIN 1, IE'), { name: 'Slack', family: 'software' })
  is('OVH è hosting', merchant('OVHcloud, Milano, IT'), { name: 'OVHcloud', family: 'hosting' })
  is('Aruba anche', merchant('WWWARUBAIT, BIBBIENA, IT'), { name: 'Aruba', family: 'hosting' })
  is('il cashback della banca', merchant('Vivid Money GmbH'), { name: 'Vivid Money', family: 'banca' })
  is('un supermercato', merchant('CONAD SUPERMERCATO CONA, NAPOLI, IT'), { name: 'Supermercato', family: 'spesa' })
  is('elettronica', merchant('EURONICS GRUPPO TUFANO, NAPOLI, IT'), { name: 'Elettronica', family: 'hardware' })
  is('carburante', merchant('STAZIONE DI SERVIZIO DI, QUARTO, IT'), { name: 'Carburante e viaggi', family: 'carburante' })
  is('un ristorante', merchant('LA SCOGLIERA, TORRE DEL GRE, IT'), { name: 'Ristoranti', family: 'rappresentanza' })
  is('la cartoleria è materiale d\'ufficio',
    merchant('BUFFETTI NAPOLI, NAPOLI, IT'), { name: "Materiale d'ufficio", family: 'ufficio' })
  /* Un supermercato resta un supermercato: che quella volta fossero fogli e
     detersivo per l'ufficio lo sa una persona, e lo si corregge sulla riga di
     costo. Indovinarlo qui vorrebbe dire dedurre la spesa di casa. */
  is('un supermercato no', merchant('CONAD SUPERMERCATO CONA, NAPOLI, IT').family, 'spesa')
  eq('e il materiale d\'ufficio è deducibile per intero', treatment("Materiale d'ufficio").cost, 1)
  is('un altro ristorante', merchant('IL CAVATAPPI, SAN GIORGIO A, IT'), { name: 'Ristoranti', family: 'rappresentanza' })
  // senza regola: si ripulisce città, paese e codice
  is('fornitore sconosciuto, ripulito',
    merchant('QUALCOSA SRL *AB12, MILANO, IT').name.startsWith('Qualcosa'), true)
  is('e finisce in «altro»', merchant('QUALCOSA SRL, MILANO, IT').family, 'altro')
}

console.log('\n— Le famiglie di spesa: il conto fa il suo lavoro? —')
{
  const txs = [
    { amount: 1000, counterparty: 'TWO BEE', description: 'giroconto' },
    { amount: -304.9, counterparty: 'ASANA.COM, DUBLIN, IE', description: '' },
    { amount: -57.75, counterparty: 'SLACK T0AHW3X61B6, DUBLIN 1, IE', description: '' },
    { amount: -43.25, counterparty: 'FACEBK *69RNPVDF92, Dublin, IE', description: '' },
    { amount: -32.94, counterparty: 'FACEBK *HNX27VHF92, Dublin, IE', description: '' },
    { amount: -380, counterparty: 'LA SCOGLIERA, TORRE DEL GRE, IT', description: '' },
    { amount: -91, counterparty: 'STAZIONE DI SERVIZIO DI, QUARTO, IT', description: '' },
  ]
  const fam = byFamily(txs)
  is('le entrate non contano fra le spese', fam.some(f => f.family === 'banca'), false)
  is('la famiglia più grossa è la rappresentanza', fam[0].family, 'rappresentanza')
  eq('e vale 380', fam[0].total, 380)
  const software = fam.find(f => f.family === 'software')!
  eq('software somma Asana e Slack', software.total, 362.65)
  is('e ne elenca i nomi', software.names.sort(), ['Asana', 'Slack'])
  const adv = fam.find(f => f.family === 'advertising')!
  is('due movimenti Meta diventano una voce', adv.names, ['Meta Ads'])
  eq('col loro totale', adv.total, 76.19)
}

console.log('\n— merchant() è idempotente: si applica due volte —')
{
  /* All'import si normalizza; rileggendo dal database il nome è già normalizzato.
     Se il secondo giro non lo riconoscesse, trentadue movimenti di advertising
     finirebbero in «Altro» — ed è esattamente quello che accadeva. */
  for (const raw of ['FACEBK *69RNPVDF92, Dublin, IE', 'ASANA.COM, DUBLIN, IE',
                     'STAZIONE DI SERVIZIO DI, QUARTO, IT', 'LA SCOGLIERA, TORRE DEL GRE, IT',
                     'CONAD SUPERMERCATO CONA, NAPOLI, IT', 'EURONICS GRUPPO TUFANO, NAPOLI, IT',
                     'Vivid Money GmbH', 'OVHcloud, Milano, IT']) {
    const primo = merchant(raw)
    const secondo = merchant(primo.name)
    is(`${primo.name}: due passaggi, stesso esito`, secondo, primo)
  }
}
{
  // e la conseguenza: le famiglie tornano anche sui nomi già puliti
  const puliti = [
    { amount: -43.25, counterparty: 'Meta Ads', description: '' },
    { amount: -32.94, counterparty: 'Meta Ads', description: '' },
    { amount: -91, counterparty: 'Carburante e viaggi', description: '' },
    { amount: -304.9, counterparty: 'Asana', description: '' },
  ]
  const fam = byFamily(puliti)
  is('nessuna famiglia «altro»', fam.some(f => f.family === 'altro'), false)
  eq('advertising sommato', fam.find(f => f.family === 'advertising')!.total, 76.19)
  eq('carburante', fam.find(f => f.family === 'carburante')!.total, 91)
}

console.log('\n— Operativo contro «da giustificare» —')
{
  const txs = [
    { amount: 1000, counterparty: 'TWO BEE', description: '' },        // entrata: fuori
    { amount: -14.56, counterparty: 'Vivid Money GmbH', description: '' }, // banca: fuori da entrambe
    { amount: -300, counterparty: 'Asana', description: '' },
    { amount: -100, counterparty: 'Meta Ads', description: '' },
    { amount: -380, counterparty: 'Ristoranti', description: '' },
    { amount: -20, counterparty: 'Supermercato', description: '' },
  ]
  const s = spendSplit(txs)
  eq('il totale esclude la banca', s.total, 800)
  eq('operativo', s.operativo, 400)
  eq('da giustificare', s.daGiustificare, 400)
  eq('e la quota è sulle uscite, non sul saldo', s.share, 0.5)
  is('nessuna riga «banca» fra le famiglie', s.families.some(f => f.family === 'banca'), false)
}
{
  // un conto senza uscite non divide per zero
  const s = spendSplit([{ amount: 500, counterparty: 'x', description: '' }])
  eq('nessuna uscita: quota zero', s.share, 0)
  eq('e totale zero', s.total, 0)
}

console.log('\n— Deducibilità: il trattamento parte dalla famiglia —')
{
  const pranzo = treatment('LA SCOGLIERA, TORRE DEL GRE, IT')
  eq('un pranzo è deducibile al 75%', pranzo.cost, 0.75)
  eq('e la sua IVA non è detraibile con lo scontrino', pranzo.vat, 0)
  const gasolio = treatment('STAZIONE DI SERVIZIO DI, QUARTO, IT')
  eq('carburante a uso promiscuo: costo 20%', gasolio.cost, 0.2)
  eq('e IVA 40%', gasolio.vat, 0.4)
  eq('la spesa al supermercato non è inerente', treatment('CONAD SUPERMERCATO CONA, NAPOLI, IT').cost, 0)
  eq('l\'advertising sì, per intero', treatment('FACEBK *69RNPVDF92, Dublin, IE').cost, 1)
  is('e ogni trattamento dice perché', treatment('IL CAVATAPPI, SAN GIORGIO A, IT').why.length > 20, true)
  // stesso esito su un nome già normalizzato: `merchant` è idempotente
  is('vale anche sul nome pulito', treatment('Ristoranti').cost === 0.75, true)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
