/* Verifica del dominio fatture. Esegui: npx tsx lib/invoices.check.ts */
import {
  parseFattura, parseXml, pick, str, num, invoiceKey, invoiceWarnings,
} from '@/lib/fattura-xml'
import {
  totals, byMonth, byParty, aging, paymentDays, reconciliation, vatByQuarter, coverage,
  lineCandidates, txCandidates, bankMatching, signed, daysBetween, billingSeries,
  type Invoice, type LineRef, type TxRef,
} from '@/lib/invoices'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const eq = (label: string, got: number, want: number) => {
  const ok = Math.abs(got - want) < 0.01
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${got.toFixed(2).padStart(11)}${ok ? '' : `  atteso ${want.toFixed(2)}`}`)
}

const OWN = '11030281213'

const fattura = (o: {
  emittente?: string; cliente?: string; tipo?: string; numero?: string; data?: string
  imponibile?: number; aliquota?: number; imposta?: number; totale?: number | null
  natura?: string; scadenza?: string; bollo?: number
} = {}) => {
  const {
    emittente = OWN, cliente = '10992561216', tipo = 'TD01', numero = 'FPR 1/26',
    data = '2026-07-04', imponibile = 1000, aliquota = 22, imposta = 220,
    totale = 1220, natura, scadenza = '2026-08-04', bollo,
  } = o
  return `<?xml version="1.0" encoding="utf-8"?>
<FatturaElettronica versione="FPR12" xmlns="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader xmlns="">
    <DatiTrasmissione><ProgressivoInvio>7</ProgressivoInvio><CodiceDestinatario>PXQYICS</CodiceDestinatario></DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${emittente}</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>TWO BEE SRL</Denominazione></Anagrafica></DatiAnagrafici>
      <Sede><Indirizzo>VIA MARCONI</Indirizzo><Comune>Napoli</Comune><Provincia>NA</Provincia></Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cliente}</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>TAILORS STYLE SRL</Denominazione></Anagrafica></DatiAnagrafici>
      <Sede><Comune>NAPOLI</Comune></Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody xmlns="">
    <DatiGenerali><DatiGeneraliDocumento>
      <TipoDocumento>${tipo}</TipoDocumento><Divisa>EUR</Divisa>
      <Data>${data}</Data><Numero>${numero}</Numero>
      ${totale === null ? '' : `<ImportoTotaleDocumento>${totale.toFixed(2)}</ImportoTotaleDocumento>`}
      ${bollo ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${bollo.toFixed(2)}</ImportoBollo></DatiBollo>` : ''}
    </DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Growth marketing &amp; ads</Descrizione>
        <Quantita>1.00</Quantita><PrezzoUnitario>${imponibile.toFixed(2)}</PrezzoUnitario>
        <PrezzoTotale>${imponibile.toFixed(2)}</PrezzoTotale><AliquotaIVA>${aliquota.toFixed(2)}</AliquotaIVA>
        ${natura ? `<Natura>${natura}</Natura>` : ''}</DettaglioLinee>
      <DatiRiepilogo><AliquotaIVA>${aliquota.toFixed(2)}</AliquotaIVA>
        ${natura ? `<Natura>${natura}</Natura>` : ''}
        <ImponibileImporto>${imponibile.toFixed(2)}</ImponibileImporto><Imposta>${imposta.toFixed(2)}</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>${scadenza}</DataScadenzaPagamento>
        <ImportoPagamento>${(totale ?? imponibile + imposta).toFixed(2)}</ImportoPagamento>
        <IBAN>IT34T0503440090000000036003</IBAN></DettaglioPagamento></DatiPagamento>
  </FatturaElettronicaBody>
</FatturaElettronica>`
}

console.log('— Il lettore XML —')
{
  const x = parseXml('<a><b>uno</b><b>due</b><c><d>3.5</d></c><e/></a>')
  is('percorso annidato', str(x, 'a/c/d'), '3.5')
  is('numero', num(x, 'a/c/d'), 3.5)
  is('tag vuoto non ha testo', str(x, 'a/e'), null)
  is('percorso inesistente non esplode', str(x, 'a/z/y'), null)
  is('due figli con lo stesso nome', pick(x, 'a')!.children.filter(c => c.name === 'b').length, 2)
}
is('le entità si decodificano',
  str(parseXml('<a><b>Rossi &amp; Figli &lt;srl&gt;</b></a>'), 'a/b'), 'Rossi & Figli <srl>')
is('il prefisso di namespace si ignora',
  str(parseXml('<p:a xmlns:p="x"><p:b>ok</p:b></p:a>'), 'a/b'), 'ok')
is('commenti e prologo saltati',
  str(parseXml('<?xml version="1.0"?><!-- nota --><a><b>ok</b></a>'), 'a/b'), 'ok')
is('CDATA', str(parseXml('<a><b><![CDATA[<grezzo>]]></b></a>'), 'a/b'), '<grezzo>')

console.log('\n— Il verso lo decide la partita IVA, non il nome del file —')
{
  const emessa = parseFattura(fattura(), OWN)[0]
  const ricevuta = parseFattura(fattura({ emittente: '06157670966' }), OWN)[0]
  is('emittente = noi → emessa', emessa.direction, 'emessa')
  is('emittente = altri → ricevuta', ricevuta.direction, 'ricevuta')
  is('la controparte è l\'altra parte', emessa.counterparty.name, 'TAILORS STYLE SRL')
  is('e sulle ricevute è chi emette', ricevuta.counterparty.name, 'TWO BEE SRL')
}

console.log('\n— Il documento —')
{
  const f = parseFattura(fattura(), OWN)[0]
  eq('imponibile', f.taxable, 1000)
  eq('imposta', f.tax, 220)
  eq('totale', f.total, 1220)
  is('totale letto, non ricostruito', f.totalDerived, false)
  is('una riga', f.lines.length, 1)
  is('scadenza', f.dueDate, '2026-08-04')
  is('metodo di pagamento', f.paymentMethod, 'MP05')
  is('nessun avviso su un documento coerente', invoiceWarnings(f), [])
}
{
  const senzaTotale = parseFattura(fattura({ totale: null }), OWN)[0]
  eq('totale ricostruito da imponibile + imposta', senzaTotale.total, 1220)
  is('e lo dichiara', senzaTotale.totalDerived, true)
}
{
  /* §211 — una nota di credito vale meno di zero. È la riga che, se sbagliata,
     gonfia il fatturato e falsa l'IVA a debito del trimestre. */
  const nc = parseFattura(fattura({ tipo: 'TD04' }), OWN)[0]
  is('TD04 ha segno negativo', nc.sign, -1)
  eq('e nei totali toglie', signed({ sign: nc.sign, taxable: nc.taxable }), -1000)
  is('TD01 resta positiva', parseFattura(fattura(), OWN)[0].sign, 1)
}
{
  const b = parseFattura(fattura({ bollo: 2, totale: 1220 }), OWN)[0]
  is('bollo a carico di chi emette: nessun avviso', invoiceWarnings(b), [])
  const b2 = parseFattura(fattura({ bollo: 2, totale: 1222 }), OWN)[0]
  is('bollo riaddebitato: nemmeno', invoiceWarnings(b2), [])
  const rotto = parseFattura(fattura({ totale: 1500 }), OWN)[0]
  is('un totale che non torna si dice', invoiceWarnings(rotto).length, 1)
}
is('aliquota zero senza natura è un avviso',
  invoiceWarnings(parseFattura(fattura({ aliquota: 0, imposta: 0, totale: 1000 }), OWN)[0])
    .some(w => w.includes('natura')), true)
is('con la natura no',
  invoiceWarnings(parseFattura(fattura({ aliquota: 0, imposta: 0, totale: 1000, natura: 'N2.2' }), OWN)[0]), [])
is('imposta sbagliata sull\'aliquota',
  invoiceWarnings(parseFattura(fattura({ imposta: 100, totale: 1100 }), OWN)[0])
    .some(w => w.includes('sarebbe')), true)

console.log('\n— L\'impronta: cosa rende «la stessa fattura» —')
{
  const a = parseFattura(fattura(), OWN)[0]
  const b = parseFattura(fattura({ imponibile: 2000, imposta: 440, totale: 2440 }), OWN)[0]
  is('stesso numero e data, importo diverso → stessa fattura', invoiceKey(a) === invoiceKey(b), true)
  const c = parseFattura(fattura({ numero: 'FPR 2/26' }), OWN)[0]
  is('numero diverso → fattura diversa', invoiceKey(a) === invoiceKey(c), false)
  const d = parseFattura(fattura({ emittente: '06157670966' }), OWN)[0]
  is('stesso numero da un altro emittente → diversa', invoiceKey(a) === invoiceKey(d), false)
}

// ═══════════════════════════════════════════════════════════════════════════

const I = (o: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', direction: 'emessa', docType: 'TD01', number: '1/26', issuedOn: '2026-07-04',
  counterpartyName: 'TAILORS STYLE SRL', counterpartyVat: '10992561216', clientId: 'c1',
  taxable: 1000, vatAmount: 220, total: 1220, sign: 1,
  dueDate: '2026-08-04', paidOn: null, ...o,
})

console.log('\n— I totali, col segno delle note di credito —')
{
  const t = totals([
    I({ id: 'a' }),
    I({ id: 'b', taxable: 500, vatAmount: 110, total: 610 }),
    I({ id: 'c', docType: 'TD04', sign: -1, taxable: 200, vatAmount: 44, total: 244 }),
  ], '2026-09-01')
  eq('imponibile al netto dello storno', t.taxable, 1300)
  eq('IVA al netto dello storno', t.vat, 286)
  is('le note di credito si contano a parte', t.credits, 1)
  eq('tutto aperto', t.outstanding, 1586)
  eq('e tutto scaduto al 1° settembre', t.overdue, 1586)
  eq('niente incassato', t.collected, 0)
}
eq('quello che è stato incassato non è più aperto',
  totals([I({ paidOn: '2026-08-01' })], '2026-09-01').outstanding, 0)

console.log('\n— Mese per mese, senza saltare i vuoti —')
{
  const rows = byMonth([
    I({ id: 'a', issuedOn: '2026-05-10' }),
    I({ id: 'b', issuedOn: '2026-07-04' }),
    I({ id: 'c', issuedOn: '2026-07-20', direction: 'ricevuta', taxable: 300, vatAmount: 66, total: 366 }),
  ])
  is('tre mesi, giugno compreso', rows.map(r => r.month), ['2026-05-01', '2026-06-01', '2026-07-01'])
  eq('giugno vale zero e c\'è', rows[1].issued, 0)
  eq('luglio emesso', rows[2].issued, 1000)
  eq('luglio ricevuto', rows[2].received, 300)
  eq('e il saldo dei documenti', rows[2].net, 700)
}

console.log('\n— Chi pesa: si raggruppa per partita IVA —')
{
  const rows = byParty([
    I({ id: 'a', counterpartyName: 'OVH SRL', counterpartyVat: '06157670966' }),
    I({ id: 'b', counterpartyName: 'Ovh S.r.l.', counterpartyVat: 'IT06157670966', taxable: 500, total: 610 }),
    I({ id: 'c', counterpartyName: 'Senza piva', counterpartyVat: null, taxable: 100, total: 122 }),
  ])
  is('lo stesso fornitore scritto in due modi è una riga sola', rows.length, 2)
  eq('e i suoi importi si sommano', rows[0].taxable, 1500)
  eq('la quota è sul totale', Math.round(rows[0].share * 100), 94)
}

console.log('\n— Lo scadenzario —')
{
  const a = aging([
    I({ id: 'a', dueDate: '2026-08-20', total: 1000 }),
    I({ id: 'b', dueDate: '2026-07-15', total: 2000 }),
    I({ id: 'c', dueDate: '2026-05-01', total: 3000 }),
    I({ id: 'd', dueDate: null, total: 500 }),
    I({ id: 'e', dueDate: '2026-01-01', total: 400, paidOn: '2026-02-01' }),
  ], '2026-08-06')
  is('a scadere: quella futura più quella senza data', a.buckets[0].count, 2)
  eq('1-30 giorni', a.buckets[1].amount, 2000)
  eq('oltre 90', a.buckets[4].amount, 3000)
  eq('lo scaduto non conta quelle a scadere', a.overdue, 5000)
  is('e dice quante non hanno una data', a.noDueDate, 1)
  eq('la saldata è fuori dal totale aperto', a.total, 6500)
}

console.log('\n— Quanto ci mettono a pagare: mediana, non media —')
{
  const p = paymentDays([
    I({ id: 'a', issuedOn: '2026-01-01', dueDate: '2026-02-01', paidOn: '2026-01-31' }),
    I({ id: 'b', issuedOn: '2026-02-01', dueDate: '2026-03-01', paidOn: '2026-03-03' }),
    I({ id: 'c', issuedOn: '2026-03-01', dueDate: '2026-04-01', paidOn: '2026-11-01' }),
  ])
  is('la mediana ignora il ritardo estremo', p.median, 30)
  is('puntuali', p.onTime, 1)
  is('in ritardo', p.late, 2)
}
is('senza incassi la mediana non si inventa', paymentDays([I()]).median, null)
is('giorni fra due date', daysBetween('2026-07-04', '2026-08-04'), 31)

console.log('\n— I candidati: propongono, non decidono —')
{
  const lines: LineRef[] = [
    { id: 'l1', kind: 'ricavo', month: '2026-07-01', label: 'Tailors Style — canone', clientId: 'c1', net: 1000, vatRate: 0.22, invoiceId: null },
    { id: 'l2', kind: 'ricavo', month: '2026-07-01', label: 'Altro cliente', clientId: 'c9', net: 1000, vatRate: 0.22, invoiceId: null },
    { id: 'l3', kind: 'costo', month: '2026-07-01', label: 'Un costo da 1000', clientId: null, net: 1000, vatRate: 0.22, invoiceId: null },
    { id: 'l4', kind: 'ricavo', month: '2026-07-01', label: 'Già agganciata', clientId: 'c1', net: 1000, vatRate: 0.22, invoiceId: 'altro' },
  ]
  const c = lineCandidates(I(), lines)
  is('il cliente giusto vince', c[0].item.id, 'l1')
  is('una riga di costo non è candidata per una fattura emessa', c.some(x => x.item.id === 'l3'), false)
  is('una riga già agganciata non si ripropone', c.some(x => x.item.id === 'l4'), false)
  is('il perché è scritto', c[0].why.includes('stesso cliente'), true)
}
{
  const txs: TxRef[] = [
    { id: 't1', bookedOn: '2026-08-06', amount: 1220, description: 'bonif. da tailors style fatt 1/26', counterparty: 'TAILORS STYLE SRL', invoiceId: null },
    { id: 't2', bookedOn: '2026-08-06', amount: -1220, description: 'pagamento fornitore', counterparty: null, invoiceId: null },
    { id: 't3', bookedOn: '2026-06-01', amount: 1220, description: 'incasso precedente alla fattura', counterparty: null, invoiceId: null },
  ]
  const c = txCandidates(I(), txs)
  is('il verso conta: un\'uscita non incassa una fattura attiva', c.some(x => x.item.id === 't2'), false)
  is('l\'incasso giusto è primo', c[0].item.id, 't1')
  is('cerca sul lordo, non sull\'imponibile', c[0].why.includes('importo lordo esatto'), true)
  is('e trova il numero nella causale', c[0].why.some(w => w.includes('1/26')), true)
}

console.log('\n— Cosa non combacia —')
{
  const invoices = [I({ id: 'a' }), I({ id: 'b', issuedOn: '2026-07-20' })]
  const lines: LineRef[] = [
    { id: 'l1', kind: 'ricavo', month: '2026-07-01', label: 'x', clientId: 'c1', net: 1000, vatRate: 0.22, invoiceId: 'a' },
    { id: 'l2', kind: 'ricavo', month: '2026-07-01', label: 'senza fattura', clientId: 'c1', net: 900, vatRate: 0.22, invoiceId: null },
    { id: 'l3', kind: 'ricavo', month: '2026-12-01', label: 'mese senza documenti', clientId: 'c1', net: 900, vatRate: 0.22, invoiceId: null },
  ]
  const f = reconciliation({ invoices, lines, txs: [], today: '2026-09-10' })
  const ids = f.map(x => x.id)
  is('la fattura senza riga si vede', ids.includes('fatture-senza-riga'), true)
  is('e la riga senza fattura pure', ids.includes('righe-senza-fattura'), true)
  eq('ma solo nei mesi che hanno documenti: dicembre non conta',
    f.find(x => x.id === 'righe-senza-fattura')!.value!, 900)
  is('i crediti scaduti sono critici',
    f.find(x => x.id === 'crediti-scaduti')?.severity, 'critico')
}
is('niente da dire quando tutto combacia',
  reconciliation({
    invoices: [I({ id: 'a', paidOn: '2026-08-01' })],
    lines: [{ id: 'l1', kind: 'ricavo', month: '2026-07-01', label: 'x', clientId: 'c1', net: 1000, vatRate: 0.22, invoiceId: 'a' }],
    txs: [], today: '2026-09-10',
  }), [])

console.log('\n— IVA per trimestre, dai documenti —')
{
  const q = vatByQuarter([
    I({ id: 'a', issuedOn: '2026-02-10', vatAmount: 100 }),
    I({ id: 'b', issuedOn: '2026-07-04', vatAmount: 220 }),
    I({ id: 'c', issuedOn: '2026-08-04', direction: 'ricevuta', vatAmount: 80 }),
    I({ id: 'd', issuedOn: '2026-09-04', sign: -1, docType: 'TD04', vatAmount: 20 }),
  ])
  is('due trimestri', q.map(x => x.quarter), ['2026-T1', '2026-T3'])
  eq('il terzo trimestre a debito, con lo storno tolto', q[1].debit, 200)
  eq('a credito', q[1].credit, 80)
  eq('saldo', q[1].balance, 120)
}

console.log('\n— §213: agganciare tutto, ma solo dove non c\'è da interpretare —')
/* Dichiarata come funzione e non come freccia: una `const X = (…) => ({…})`
   seguita subito da un blocco `{` non viene parsata da tsc — che la legge come
   l'inizio di una funzione generica — mentre tsx la accetta. Il controllo
   passava e il gate del repo no, che è il modo peggiore di sbagliare. */
function TX(o: Partial<TxRef> = {}): TxRef {
  return {
    id: 't', bookedOn: '2026-08-04', amount: 1220,
    description: 'bonifico', counterparty: null, invoiceId: null, ...o,
  }
}

{
  const r = bankMatching([I()], [
    TX({ id: 'ok', counterparty: 'TAILORS STYLE SRL' }),
    TX({ id: 'altro', amount: 999 }),
  ])
  is('un solo candidato con identità → certo', r.pairs.map(p => [p.txId, p.tier]), [['ok', 'certo']])
  is('e la data di pagamento viene dal movimento', r.pairs[0].paidOn, '2026-08-04')
}
is('importo giusto ma nessuna identità: non si aggancia',
  bankMatching([I()], [TX({ id: 'x' })]).pairs.length, 0)
is('e finisce fra gli ambigui, non fra i non trovati',
  bankMatching([I()], [TX({ id: 'x' })]).ambiguous.length, 1)
is('nessun movimento con quell\'importo → non trovata',
  bankMatching([I()], [TX({ amount: 500 })]).unmatched.length, 1)
is('un movimento precedente alla fattura non la paga',
  bankMatching([I()], [TX({ bookedOn: '2026-06-01', counterparty: 'TAILORS STYLE SRL' })]).pairs.length, 0)
is('un\'uscita non incassa una fattura emessa',
  bankMatching([I()], [TX({ amount: -1220, counterparty: 'TAILORS STYLE SRL' })]).pairs.length, 0)
{
  /* Una nota di credito emessa **esce** dal conto: senza il ribaltamento del
     verso, il rimborso al cliente verrebbe agganciato come se fosse un incasso. */
  const nc = I({ id: 'nc', docType: 'TD04', sign: -1 })
  is('la nota di credito emessa cerca un\'uscita',
    bankMatching([nc], [TX({ id: 'out', amount: -1220, counterparty: 'TAILORS STYLE SRL' })])
      .pairs.map(p => p.txId), ['out'])
  is('e non un\'entrata',
    bankMatching([nc], [TX({ id: 'in', amount: 1220, counterparty: 'TAILORS STYLE SRL' })]).pairs.length, 0)
}
{
  // due fatture gemelle che pretendono lo stesso movimento: nessuna delle due
  const a = I({ id: 'a', number: '1/26' })
  const b = I({ id: 'b', number: '2/26' })
  const r = bankMatching([a, b], [TX({ id: 'uno', counterparty: 'TAILORS STYLE SRL' })])
  is('contesa sullo stesso movimento: non si sceglie', r.pairs.length, 0)
  is('entrambe restano ambigue', r.ambiguous.length, 2)
}
{
  /* La serie: tre canoni identici dallo stesso fornitore e tre bonifici
     altrettanto identici. Uno per uno sarebbero tutti ambigui e resterebbero
     fermi; insieme sono lo stesso fatto ripetuto. */
  const inv = ['05', '06', '07'].map((m, k) => I({
    id: `s${k}`, number: `${k + 1}/26`, direction: 'ricevuta',
    counterpartyName: 'Gabriele Saraiello', counterpartyVat: '99999999999',
    issuedOn: `2026-${m}-01`, taxable: 1300, vatAmount: 0, total: 1300,
  }))
  const txs = ['05', '06', '07'].map((m, k) => TX({
    id: `m${k}`, amount: -1300, bookedOn: `2026-${m}-10`, counterparty: 'Gabriele Saraiello',
  }))
  const r = bankMatching(inv, txs)
  is('tre coppie', r.pairs.length, 3)
  is('ciascuna col suo movimento, in ordine di data',
    r.pairs.map(p => [p.invoiceId, p.txId]).sort(),
    [['s0', 'm0'], ['s1', 'm1'], ['s2', 'm2']])
  is('nessuna ambigua', r.ambiguous.length, 0)
  /* L'ultima è «certo» e non «serie»: i movimenti di maggio e giugno precedono
     la sua emissione, quindi per lei ne resta uno solo e non c'è niente da
     appaiare. Le altre due sono la serie vera. */
  is('un solo movimento possibile resta «certo»',
    r.pairs.filter(p => p.tier === 'certo').map(p => p.invoiceId), ['s2'])
}
{
  /* Ambiguità vera: due fatture emesse lo stesso giorno e due movimenti
     successivi a entrambe. Qualunque abbinamento è un'ipotesi, e non se ne fa
     nessuno — nemmeno «tanti quanti», perché qui l'ordine non è forzato da niente. */
  const inv = [0, 1].map(k => I({
    id: `g${k}`, number: `${k + 1}/26`, direction: 'ricevuta',
    counterpartyName: 'Tizio', counterpartyVat: '88888888888',
    issuedOn: '2026-05-01', taxable: 1300, vatAmount: 0, total: 1300,
  }))
  const txs = ['10', '20'].map((d, k) => TX({
    id: `m${k}`, amount: -1300, bookedOn: `2026-05-${d}`, counterparty: 'Tizio',
  }))
  const r = bankMatching(inv, txs)
  is('due gemelle e due movimenti: si appaiano comunque', r.pairs.length, 2)
  is('ma dichiarando che è una serie', Array.from(new Set(r.pairs.map(p => p.tier))), ['serie'])
}
{
  // tre fatture gemelle ma solo due movimenti: i conti non tornano uno a uno
  const inv = ['05', '06', '07'].map((m, k) => I({
    id: `s${k}`, direction: 'ricevuta', counterpartyName: 'Caio', counterpartyVat: '77777777777',
    issuedOn: `2026-${m}-01`, taxable: 1300, vatAmount: 0, total: 1300,
  }))
  const txs = ['05', '06'].map((m, k) => TX({
    id: `m${k}`, amount: -1300, bookedOn: `2026-${m}-10`, counterparty: 'Caio',
  }))
  const r = bankMatching(inv, txs)
  is('si aggancia solo quello che è forzato', r.pairs.map(p => [p.invoiceId, p.txId]), [['s1', 'm1']])
  is('la fattura senza nessun movimento successivo è «non trovata»', r.unmatched, ['s2'])
  is('e la terza resta ambigua', r.ambiguous.map(a => a.invoiceId), ['s0'])
}
is('un movimento già agganciato non si riusa',
  bankMatching([I()], [TX({ id: 'preso', counterparty: 'TAILORS STYLE SRL', invoiceId: 'altra' })]).pairs.length, 0)

console.log('\n— §214: la quadratura fra documenti, conto economico e banca —')
{
  const invoices = [
    I({ id: 'a', issuedOn: '2026-07-04', taxable: 1000, total: 1220 }),
    I({ id: 'b', issuedOn: '2026-07-20', taxable: 500, vatAmount: 110, total: 610 }),
    I({ id: 'c', issuedOn: '2026-07-25', direction: 'ricevuta', taxable: 300, vatAmount: 66, total: 366 }),
  ]
  const lines: LineRef[] = [
    { id: 'l1', kind: 'ricavo', month: '2026-07-01', label: 'x', clientId: 'c1', net: 1000, vatRate: 0.22, invoiceId: 'a' },
    { id: 'l2', kind: 'costo', month: '2026-07-01', label: 'y', clientId: null, net: 300, vatRate: 0.22, invoiceId: 'c' },
  ]
  const txs: TxRef[] = [
    { id: 't1', bookedOn: '2026-08-04', amount: 1220, description: '', counterparty: null, invoiceId: 'a' },
  ]
  const [m] = coverage({ invoices, lines, txs })
  eq('i documenti dicono 1.500 di fatturato', m.docsIssued, 1500)
  eq('il conto economico ne ha registrati 1.000', m.plRevenue, 1000)
  eq('e i 500 di differenza sono l\'errore da chiudere', m.revenueGap, 500)
  eq('sui costi invece torna', m.costGap, 0)
  is('due emesse, una sola agganciata', [m.issuedCount, m.issuedLinked], [2, 1])
  eq('incassato: solo la fattura col movimento', m.collected, 1220)
}
{
  /* Un mese che ha righe di conto economico e nessun documento esiste comunque
     nella tabella: è il caso più importante da vedere — il mese è stato
     preparato dai contratti e le fatture non sono mai state caricate. */
  const rows = coverage({
    invoices: [I({ id: 'a', issuedOn: '2026-07-04' })],
    lines: [{ id: 'l', kind: 'ricavo', month: '2026-05-01', label: 'x', clientId: null, net: 900, vatRate: 0.22, invoiceId: null }],
    txs: [],
  })
  is('due mesi, in ordine', rows.map(r => r.month), ['2026-05-01', '2026-07-01'])
  eq('maggio: registrato senza documenti', rows[0].revenueGap, -900)
  is('e non ha fatture da agganciare', rows[0].issuedCount, 0)
}

console.log('\n— §278: emesso, incassato, in attesa, previsto —')
{
  const inv = [
    I({ id: 'a', issuedOn: '2026-07-04', taxable: 1000, paidOn: '2026-07-20' }),
    I({ id: 'b', issuedOn: '2026-07-18', taxable: 500 }),
    I({ id: 'c', issuedOn: '2026-08-03', taxable: 2000 }),
    // una nota di credito toglie dall'emesso, come in dichiarazione
    I({ id: 'd', issuedOn: '2026-08-05', taxable: 300, sign: -1 }),
    // le ricevute non c'entrano: questa serie parla di quello che emettiamo noi
    I({ id: 'e', issuedOn: '2026-08-06', taxable: 900, direction: 'ricevuta' }),
  ]
  const s = billingSeries(inv, '2026-08-09',
    [{ month: '2026-09-01', amount: 4000 }, { month: '2026-10-01', amount: 4000 }])
  is('parte dal primo documento e arriva a dicembre',
    [s[0].month, s.at(-1)!.month], ['2026-07-01', '2026-12-01'])
  eq('luglio emesso', s[0].issued, 1500)
  eq('di cui incassato', s[0].collected, 1000)
  eq('e in attesa il resto', s[0].pending, 500)
  /* §279 — la nota di credito **non** è credito in attesa: è fatturato
     annullato, e chi legge non deve telefonare a nessuno per farselo dare. */
  eq('agosto: emesso lordo', s[1].gross, 2000)
  eq('di cui stornato', s[1].credited, 300)
  eq('emesso netto, come in dichiarazione', s[1].issued, 1700)
  eq('agosto non ha incassi', s[1].collected, 0)
  eq('e in attesa c\'è solo quello che si può ancora incassare', s[1].pending, 1700)
  is('e non è un mese futuro: ha già documenti', s[1].future, false)
  /* Lordo = incassato + in attesa + stornato, per costruzione: è la ragione per
     cui la barra si può leggere come una quantità sola divisa in parti. */
  is('la barra chiude sempre',
    s.every(p => Math.abs(p.gross - p.collected - p.pending - p.credited) < 0.01), true)
  is('settembre è futuro', s[2].future, true)
  eq('e porta quello che dicono i contratti', s[2].forecast, 4000)
  eq('un mese futuro senza contratti resta a zero', s[4].forecast, 0)
  is('ma esiste lo stesso, o il buco non si vede', s[4].month, '2026-11-01')
  /* Il previsionale non entra nell'emesso: sono due grandezze diverse e
     sommarle darebbe un fatturato che nessuno ha fatturato. */
  eq('e non finisce nell\'emesso', s[2].issued, 0)
}
{
  /* Una nota che annulla una fattura **già incassata**: in attesa non c'è
     niente, e il numero non diventa negativo. */
  const s = billingSeries([
    I({ id: 'a', issuedOn: '2026-07-04', taxable: 1000, paidOn: '2026-07-10' }),
    I({ id: 'b', issuedOn: '2026-07-20', taxable: 1000, sign: -1 }),
  ], '2026-08-09')
  eq('lordo mille', s[0].gross, 1000)
  eq('stornato mille', s[0].credited, 1000)
  eq('emesso netto zero', s[0].issued, 0)
  eq('in attesa: niente, non un numero negativo', s[0].pending, 0)
}
{
  is('senza documenti e senza contratti non c\'è niente da disegnare',
    billingSeries([], '2026-08-09').length, 0)
  const solo = billingSeries([], '2026-08-09', [{ month: '2026-09-01', amount: 1000 }])
  is('con i soli contratti la serie parte da lì', solo[0].month, '2026-09-01')
}

console.log('\n— §281: fuori dai conti non è «in attesa» —')
{
  const inv = [
    I({ id: 'a', issuedOn: '2026-05-08', taxable: 3600, total: 4392, paidOn: '2026-06-09' }),
    // la ISF duplicata: esiste, è passata dallo SDI, e non la incasserà nessuno
    I({ id: 'b', issuedOn: '2026-05-08', taxable: 3600, total: 4392,
      excludedReason: 'duplicata di FPR 4/26' }),
    I({ id: 'c', issuedOn: '2026-06-19', taxable: 1000, total: 1220 }),
  ]
  const s = billingSeries(inv, '2026-08-09')
  eq('lordo: ci sono tutte, anche la duplicata', s[0].gross, 7200)
  eq('fuori dai conti', s[0].unmanaged, 3600)
  eq('netto: la duplicata non è fatturato', s[0].issued, 3600)
  eq('incassato', s[0].collected, 3600)
  eq('e in attesa non c\'è niente di suo', s[0].pending, 0)
  eq('il mese dopo resta un credito vero', s[1].pending, 1000)
  /* Il totale che si insegue non la contiene: era il difetto — 42.456 € di
     scaduto su un archivio dove nove documenti non erano crediti. */
  const t = totals(inv, '2026-08-09')
  eq('lo scoperto non conta le fatture fuori dai conti', t.outstanding, 1220)
  eq('e nemmeno l\'incassato le somma', t.collected, 4392)
  is('ma nel conteggio dei documenti ci sono', t.count, 3)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
