/* Verifica del rischio cliente. Esegui: npx tsx lib/risk.check.ts */
import {
  clientRisk, withTrend, riskSummary, bandOf, scorable, factorMap, risksFor,
  type RiskInput, type RiskResult,
} from '@/lib/risk'
import type { ClientMonth } from '@/lib/client-economics'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const TODAY = '2026-08-05'

const m = (month: string, amount: number, paid: number): ClientMonth => ({ month, amount, paid })
type Stream = RiskInput['streams'][number]
const stream = (o: Partial<Stream>): Stream => ({ status: 'attivo', end_date: null, ...o })
const rata = (due_month: string, amount: number, paid: boolean) => ({ due_month, amount, paid })

const client = (o: Partial<RiskInput>): RiskInput => ({
  id: 'c1', name: 'Cliente', client_label: 'stabile', history: [],
  streams: [stream({})], installments: [], ...o,
})

/** Sei mesi pieni e incassati: la linea di partenza da cui muovere un segnale per volta. */
const SANO = () => [
  m('2026-02-01', 1500, 1500), m('2026-03-01', 1500, 1500), m('2026-04-01', 1500, 1500),
  m('2026-05-01', 1500, 1500), m('2026-06-01', 1500, 1500), m('2026-07-01', 1500, 1500),
]
const f = (r: RiskResult, key: string) => r.factors.find(x => x.key === key)?.score ?? null
const u = (r: RiskResult, key: string) => r.unknown.some(x => x.key === key)

console.log('\n— Chi non ha un rischio da gestire —')
{
  is('perso: fuori', scorable({ client_label: 'perso', is_internal: false }), false)
  is('partner: fuori', scorable({ client_label: 'partner', is_internal: false }), false)
  is('interno: fuori', scorable({ client_label: 'stabile', is_internal: true }), false)
  is('stabile: dentro', scorable({ client_label: 'stabile', is_internal: false }), true)

  const perso = clientRisk(client({ client_label: 'perso', history: SANO() }), TODAY)
  is('e il punteggio non esce', perso.score, null)
  is('con scritto il perché', perso.basis.includes('nessun rischio da gestire'), true)
}

console.log('\n— Insoluto: pesa da quanto, non quanto —')
{
  const sano = clientRisk(client({ history: SANO() }), TODAY)
  is('tutto incassato: zero, non assente', f(sano, 'insoluto'), 0)

  const h = SANO()
  h[5] = m('2026-07-01', 1500, 0)
  is('scoperto dal mese scorso', f(clientRisk(client({ history: h }), TODAY), 'insoluto'), 15)

  const h2 = SANO()
  h2[4] = m('2026-06-01', 1500, 0)
  is('da due mesi', f(clientRisk(client({ history: h2 }), TODAY), 'insoluto'), 25)

  const h3 = SANO()
  h3[2] = m('2026-04-01', 1500, 0)
  is('da quattro mesi: il massimo', f(clientRisk(client({ history: h3 }), TODAY), 'insoluto'), 35)

  /* §177: la fattura del mese vale fino al 15. Il mese in corso scoperto è la
     normalità e non deve accendere niente. */
  const corrente = SANO().concat([m('2026-08-01', 1500, 0)])
  is('il mese in corso non è un ritardo', f(clientRisk(client({ history: corrente }), TODAY), 'insoluto'), 0)

  const vuoto = clientRisk(client({ history: [] }), TODAY)
  is('senza storico non è zero: è ignoto', u(vuoto, 'insoluto'), true)
  is('e infatti non produce un punteggio', vuoto.score, null)
}

console.log('\n— …e le rate dei mesi mai aperti (§177) —')
{
  /* Marzo non è mai stato preparato: la riga non esiste, la rata sì. Senza
     guardarla il cliente risulterebbe in regola perché manca il documento, non
     perché ha pagato. */
  const mai = clientRisk(client({
    history: SANO().filter(h => h.month !== '2026-03-01'),
    installments: [rata('2026-03-01', 1500, false)],
  }), TODAY)
  is('rata scoperta da cinque mesi', f(mai, 'insoluto'), 35)
  is('e l\'importo la conta', mai.factors.find(x => x.key === 'insoluto')?.msg.includes('1.500'), true)

  /* §193: quando il mese è aperto la rata È la riga. Contarle tutte e due
     raddoppierebbe lo stesso credito. */
  const doppio = clientRisk(client({
    history: SANO().map(h => h.month === '2026-07-01' ? m('2026-07-01', 1500, 0) : h),
    installments: [rata('2026-07-01', 1500, false)],
  }), TODAY)
  is('mese aperto: si conta la riga, non due volte', doppio.factors.find(x => x.key === 'insoluto')?.msg, '€1.500 scoperti dal mese scorso')

  const pagata = clientRisk(client({
    history: SANO().filter(h => h.month !== '2026-03-01'),
    installments: [rata('2026-03-01', 1500, true)],
  }), TODAY)
  is('rata pagata: nessun insoluto', f(pagata, 'insoluto'), 0)

  const futura = clientRisk(client({
    history: SANO(),
    installments: [rata('2026-12-01', 1500, false)],
  }), TODAY)
  is('rata futura non è un ritardo', f(futura, 'insoluto'), 0)
}

console.log('\n— Fatturato: tre mesi contro tre —')
{
  const stabile = clientRisk(client({ history: SANO() }), TODAY)
  is('costante: zero', f(stabile, 'fatturato'), 0)

  const giu = [m('2026-02-01', 3000, 3000), m('2026-03-01', 3000, 3000), m('2026-04-01', 3000, 3000),
    m('2026-05-01', 1000, 1000), m('2026-06-01', 1000, 1000), m('2026-07-01', 1000, 1000)]
  is('dimezzato: 25', f(clientRisk(client({ history: giu }), TODAY), 'fatturato'), 25)

  const cala = [m('2026-02-01', 1000, 1000), m('2026-03-01', 1000, 1000), m('2026-04-01', 1000, 1000),
    m('2026-05-01', 700, 700), m('2026-06-01', 700, 700), m('2026-07-01', 700, 700)]
  is('−30%: 15', f(clientRisk(client({ history: cala }), TODAY), 'fatturato'), 15)

  const cresce = [m('2026-02-01', 1000, 1000), m('2026-03-01', 1000, 1000), m('2026-04-01', 1000, 1000),
    m('2026-05-01', 2000, 2000), m('2026-06-01', 2000, 2000), m('2026-07-01', 2000, 2000)]
  is('in crescita: abbassa il rischio', f(clientRisk(client({ history: cresce }), TODAY), 'fatturato'), -5)

  const corto = clientRisk(client({ history: [m('2026-07-01', 1500, 1500)] }), TODAY)
  is('meno di sei mesi: ignoto, non stabile', u(corto, 'fatturato'), true)

  /* Il caso vero di Industrial Service: lo storico parte da aprile, quindi la
     finestra precedente (feb–apr) contiene **un mese solo** e il confronto
     leggeva «+461%». Non è crescita: è l'inizio dello storico. */
  const inizio = clientRisk(client({
    history: [m('2026-04-01', 1800, 1800), m('2026-05-01', 3400, 3400),
      m('2026-06-01', 3400, 3400), m('2026-07-01', 3300, 3300)],
  }), TODAY)
  is('un mese nella finestra: non è un confronto', u(inizio, 'fatturato'), true)
  is('e lo dice così', inizio.unknown.find(x => x.key === 'fatturato')?.msg, 'storico troppo corto per un confronto a tre mesi')

  const due = clientRisk(client({
    history: [m('2026-03-01', 1000, 1000), m('2026-04-01', 1000, 1000),
      m('2026-05-01', 1000, 1000), m('2026-06-01', 1000, 1000), m('2026-07-01', 1000, 1000)],
  }), TODAY)
  is('due mesi su tre bastano', u(due, 'fatturato'), false)
}

console.log('\n— La crescita non compensa un insoluto —')
{
  /* L'altro caso vero: 3.500 € scoperti dal mese scorso (+15) e tutti i
     contratti in scadenza fra 26 giorni (+20) fanno 35, cioè «medio». Il bonus
     crescita portava il totale a 30, cioè «basso»: esattamente la bugia che
     questo motore esiste per non dire. */
  const cresceMaNonPaga = clientRisk(client({
    history: [m('2026-02-01', 1000, 1000), m('2026-03-01', 1000, 1000), m('2026-04-01', 1000, 1000),
      m('2026-05-01', 3000, 3000), m('2026-06-01', 3000, 3000), m('2026-07-01', 3000, 0)],
    streams: [stream({ end_date: '2026-08-31' })],
  }), TODAY)
  is('il bonus non si applica', f(cresceMaNonPaga, 'fatturato'), 0)
  is('e il totale resta medio', cresceMaNonPaga.score, 35)
  is('banda media', cresceMaNonPaga.band, 'medio')
  is('ma la crescita si vede ancora', cresceMaNonPaga.factors.find(x => x.key === 'fatturato')?.msg.includes('non compensa il resto'), true)

  /* Se invece non c'è nient'altro che non va, il bonus fa il suo lavoro:
     distinguere due clienti per il resto identici. */
  const cresceEPaga = clientRisk(client({
    history: [m('2026-02-01', 1000, 1000), m('2026-03-01', 1000, 1000), m('2026-04-01', 1000, 1000),
      m('2026-05-01', 3000, 3000), m('2026-06-01', 3000, 3000), m('2026-07-01', 3000, 3000)],
  }), TODAY)
  is('niente da segnalare: il bonus vale', f(cresceEPaga, 'fatturato'), -5)
  is('e il totale non va sotto zero', cresceEPaga.score, 0)
}

console.log('\n— Copertura contrattuale —')
{
  const aperto = clientRisk(client({ history: SANO(), streams: [stream({ end_date: null })] }), TODAY)
  is('canone indeterminato: coperto', f(aperto, 'contratti'), 0)

  const scade = clientRisk(client({ history: SANO(), streams: [stream({ end_date: '2026-09-15' })] }), TODAY)
  is('scade fra 41 giorni: 20', f(scade, 'contratti'), 20)

  const lontano = clientRisk(client({ history: SANO(), streams: [stream({ end_date: '2026-11-30' })] }), TODAY)
  is('fra 117 giorni: 10', f(lontano, 'contratti'), 10)

  const largo = clientRisk(client({ history: SANO(), streams: [stream({ end_date: '2027-06-30' })] }), TODAY)
  is('oltre i quattro mesi: zero', f(largo, 'contratti'), 0)

  const scaduto = clientRisk(client({ history: SANO(), streams: [stream({ end_date: '2026-06-30' })] }), TODAY)
  is('già scaduto: 20', f(scaduto, 'contratti'), 20)

  /* Il più coperto vince: uno che scade domani non è un rischio se ce n'è un
     altro a tempo indeterminato sotto. */
  const misto = clientRisk(client({
    history: SANO(),
    streams: [stream({ end_date: '2026-08-10' }), stream({ end_date: null })],
  }), TODAY)
  is('uno scade, un altro è aperto: coperto', f(misto, 'contratti'), 0)

  const bozza = clientRisk(client({ history: SANO(), streams: [stream({ status: 'bozza' })] }), TODAY)
  is('solo bozze e fattura: accordo non registrato', f(bozza, 'contratti'), 12)

  const nuovo = clientRisk(client({ history: [], streams: [] }), TODAY)
  is('mai quotato e mai fatturato: ignoto', u(nuovo, 'contratti'), true)
}

console.log('\n— Sospeso (§176) —')
{
  const fermo = clientRisk(client({
    client_label: 'pending', paused_at: '2026-05-01', history: SANO(),
    streams: [stream({ end_date: null })],
  }), TODAY)
  is('fermo da 96 giorni: 20', f(fermo, 'sospensione'), 20)

  /* Un sospeso non fattura: leggergli un calo di fatturato vuol dire trovare
     pericolosa la premessa. */
  is('e il fatturato non si giudica', f(fermo, 'fatturato'), null)
  is('né l\'insoluto', f(fermo, 'insoluto'), null)

  const poco = clientRisk(client({
    client_label: 'pending', paused_at: '2026-07-20', history: SANO(),
    streams: [stream({ end_date: null })],
  }), TODAY)
  is('fermo da 16 giorni: 3', f(poco, 'sospensione'), 3)

  const attivo = clientRisk(client({ history: SANO() }), TODAY)
  is('chi lavora non ha la riga «non è sospeso»', f(attivo, 'sospensione'), null)
}

console.log('\n— Il numero esce solo se regge —')
{
  const uno = clientRisk(client({ history: [], streams: [stream({ end_date: '2026-09-15' })] }), TODAY)
  is('un solo segnale: niente punteggio', uno.score, null)
  is('e la ragione è scritta', uno.basis.includes('un solo segnale'), true)

  const due = clientRisk(client({ history: SANO() }), TODAY)
  is('due segnali: il punteggio esce', due.ready, true)
  is('somma dei fattori', due.score, 0)

  const somma = clientRisk(client({
    client_label: 'in_bilico',
    history: [m('2026-02-01', 3000, 3000), m('2026-03-01', 3000, 3000), m('2026-04-01', 3000, 0),
      m('2026-05-01', 1000, 1000), m('2026-06-01', 1000, 1000), m('2026-07-01', 1000, 1000)],
    streams: [stream({ end_date: '2026-09-15' })],
  }), TODAY)
  is('insoluto 35 + calo 25 + scadenza 20 + bilico 10', somma.score, 90)
  is('banda alta', somma.band, 'alto')

  is('il totale non supera 100', bandOf(100), 'alto')
  is('34 è basso', bandOf(34), 'basso')
  is('35 è medio', bandOf(35), 'medio')
  is('60 è alto', bandOf(60), 'alto')
}

console.log('\n— Il trend è due letture, non un ricordo —')
{
  /* Contratto che scade il 20 settembre: al 5 agosto mancano 46 giorni (20
     punti), trenta giorni prima ne mancavano 76 (10 punti). Peggiora davvero,
     e nessuno ha dovuto salvare il punteggio di luglio da nessuna parte. */
  const c = client({ history: SANO(), streams: [stream({ end_date: '2026-09-20' })] })
  is('avvicinarsi alla scadenza peggiora', withTrend(c, TODAY).trend, 'peggiora')

  const fermo = client({ history: SANO(), streams: [stream({ end_date: null })] })
  is('niente si muove: stabile', withTrend(fermo, TODAY).trend, 'stabile')

  /* Un incasso arrivato nel frattempo non si vede: lo storico è quello di oggi,
     e trenta giorni fa la stessa riga risultava già pagata. Quello che il
     confronto coglie è il tempo che passa sui segnali aperti. */
  const h = SANO(); h[3] = m('2026-05-01', 1500, 0)
  is('un insoluto che invecchia peggiora', withTrend(client({ history: h }), TODAY).trend, 'peggiora')

  const nonValutabile = withTrend(client({ history: [], streams: [] }), TODAY)
  is('senza punteggio non c\'è trend', nonValutabile.trend, null)
}

console.log('\n— Il riepilogo dice anche quanti non sa —')
{
  const alto = withTrend(client({
    client_label: 'in_bilico', history: [m('2026-02-01', 3000, 3000), m('2026-03-01', 3000, 3000),
      m('2026-04-01', 3000, 0), m('2026-05-01', 1000, 1000), m('2026-06-01', 1000, 1000), m('2026-07-01', 1000, 1000)],
    streams: [stream({ end_date: '2026-09-15' })],
  }), TODAY)
  const sano = withTrend(client({ history: SANO() }), TODAY)
  const ignoto = withTrend(client({ history: [], streams: [] }), TODAY)
  const perso = withTrend(client({ client_label: 'perso' }), TODAY)

  const s = riskSummary([alto, sano, ignoto, perso])
  is('due valutati', s.scored, 2)
  is('uno alto', s.high, 1)
  is('uno non valutabile', s.notReady, 1)
  is('il perso non conta come «non valutabile»', s.notReady, 1)
}

console.log('\n— Dalle righe del database —')
{
  const out = risksFor({
    clients: [
      { id: 'c1', company_name: 'Alfa SRL', display_name: 'Alfa', client_label: 'stabile' },
      { id: 'c2', company_name: 'Beta', client_label: 'stabile' },
      { id: 'c3', company_name: 'Two Bee', client_label: 'stabile', is_internal: true },
    ],
    streams: [
      { id: 's1', client_id: 'c1', status: 'attivo', end_date: null },
      { id: 's2', client_id: 'c1', status: 'bozza', end_date: '2026-08-20' },
      { id: 's3', client_id: 'c2', status: 'attivo', end_date: '2026-09-10' },
    ],
    installments: [
      { stream_id: 's1', amount: '1500', paid: true, due_month: '2026-07-01' },
      { stream_id: 's3', amount: '4000', paid: false, due_month: '2026-04-01' },
    ],
    lines: [
      { client_id: 'c1', amount_net: '1500', paid: true, pl_months: { month: '2026-02-01' } },
      { client_id: 'c1', amount_net: '1500', paid: true, pl_months: { month: '2026-03-01' } },
      { client_id: 'c1', amount_net: '1500', paid: true, pl_months: { month: '2026-04-01' } },
      { client_id: 'c1', amount_net: '1500', paid: true, pl_months: { month: '2026-05-01' } },
      { client_id: 'c1', amount_net: '1500', paid: true, pl_months: { month: '2026-06-01' } },
      { client_id: 'c1', amount_net: '1500', paid: true, pl_months: { month: '2026-07-01' } },
      // due righe nello stesso mese si sommano, e la spunta vale per riga
      { client_id: 'c2', amount_net: '1000', paid: true, pl_months: { month: '2026-07-01' } },
      { client_id: 'c2', amount_net: '500', paid: false, pl_months: { month: '2026-07-01' } },
      { client_id: null, amount_net: '900', paid: false, pl_months: { month: '2026-07-01' } },
    ],
  }, TODAY)

  is('Alfa: sano e coperto', out.c1.score, 0)
  is('la bozza non gli dà una scadenza', out.c1.factors.find(x => x.key === 'contratti')?.msg, 'coperto da un canone a tempo indeterminato')
  is('l\'interno non si valuta', out.c3.score, null)

  /* Beta: rata di aprile scoperta in un mese mai aperto (35) + contratto che
     scade fra 36 giorni (20). Luglio ha 1.500 di cui 500 scoperti, ma è il mese
     scorso, quindi il più vecchio resta aprile. */
  is('Beta: insoluto vecchio + scadenza', out.c2.score, 55)
  is('e la banda è media', out.c2.band, 'medio')
  is('l\'importo somma rata e riga', out.c2.factors.find(x => x.key === 'insoluto')?.msg, '€4.500 scoperti da 4 mesi')
  is('una riga senza cliente non finisce a nessuno', Object.keys(out).sort(), ['c1', 'c2', 'c3'])
}

console.log('\n— La mappa per il badge —')
{
  const r = clientRisk(client({ history: SANO() }), TODAY)
  const map = factorMap(r)
  is('chiavi dei fattori', Object.keys(map).sort(), ['contratti', 'fatturato', 'insoluto'])
  is('con messaggio', typeof map.insoluto.msg, 'string')
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
