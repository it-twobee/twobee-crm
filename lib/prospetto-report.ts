/**
 * §268 — Il report del mese per il consiglio societario, in HTML.
 *
 * Sta in un modulo e non dentro la route per una ragione sola: così si può
 * generare da riga di comando e **guardarlo** senza autenticarsi, che è l'unico
 * modo di accorgersi che una colonna va a capo o che un numero è vuoto.
 *
 * La regola che lo governa: **risponde in ordine alle domande che vengono
 * fatte**, non elenca quello che il tool sa.
 *
 *   1. il mese ha prodotto margine? (competenza, come il conto economico)
 *   2. da dove vengono e dove vanno i soldi
 *   3. cosa deve ancora succedere, e cosa si può fare (cassa)
 *   4. §269 — riga per riga, da cosa sono fatti quei totali
 *   5. §270 — e a ciascuno quanto spetta, sul maturato e sull'incassato
 *
 * **Due pagine, e la divisione non è tipografica.** La prima è quella che si
 * proietta e si discute: sette numeri e tre frasi. La seconda è quella che si
 * allega al verbale e si rilegge quando qualcuno chiede «e questi 5.772 da dove
 * vengono»: ogni riga col suo nome, la sua data e il suo stato. Metterle insieme
 * voleva dire perdere la prima; toglierne una, non poter rispondere alla domanda
 * che arriva sempre.
 *
 * **I compensi hanno una sezione loro** (§270), e dentro due colonne che non si
 * sommano: il **maturato** — quello che spetta per il lavoro consegnato — e
 * quanto di quel maturato l'**incassato** copre davvero. Un socio che ha
 * consegnato e un cliente che non ha pagato sono due fatti diversi, e la
 * riunione in cui si decide quanto versare ha bisogno di vederli separati: il
 * primo non si tocca (chi ha lavorato ha lavorato, §224), il secondo dice quanto
 * c'è in cassa per farlo adesso.
 *
 * HTML autonomo, come `kpi-report`: nessun asset esterno, stile in linea, e il
 * PDF lo fa il browser. È l'unico modo di avere un documento identico su ogni
 * macchina senza portarsi dietro un motore di stampa.
 */
import { computeMonth, monthLabel, shiftMonth, pct as plPct, type PlTotals } from '@/lib/pl'
import { isPayrollCenter } from '@/lib/costs'
import { fromRevenue, fromCost, movedIn } from '@/lib/cash-calendar'
import { prospetto } from '@/lib/pl-aggregate'
import { simulate, outcomes, advice, GROUPS, type GroupKey, type PlanItem } from '@/lib/cash-plan'
import { mergePeople } from '@/lib/cash-certify'
import { TERMS_LABEL, type Terms } from '@/lib/cash-calendar'
import { eur2 } from '@/lib/money'
import type { ProspettoData } from '@/lib/prospetto-load'

const esc = (s: string) => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
const r2 = (n: number) => Math.round(n * 100) / 100
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const giorno = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESI[(m ?? 1) - 1]}`
}
const quota = (part: number, tot: number) => (tot > 0 ? `${Math.round((part / tot) * 100)}%` : '—')
/* «Luglio 2026» in mezzo a una frase si legge come un titolo. E davanti a una
   vocale ci vuole «ad»: un foglio che si legge male si legge una volta sola. */
const mese = (m: string) => monthLabel(m).toLowerCase()
const aMese = (m: string) => `${/^[aeiou]/.test(mese(m)) ? 'ad' : 'a'} ${mese(m)}`

/** Lo stato: colore **e** parola, perché un rosso da solo non dice cosa fare. */
function chip(i: PlanItem | undefined, paid: boolean, verbo: 'incassare' | 'pagare'): string {
  if (paid) return `<span class="chip ok">${verbo === 'incassare' ? 'incassata' : 'pagata'}</span>`
  if (i?.state === 'scaduto') return `<span class="chip late">in ritardo · ${i.lateDays} gg</span>`
  if (i && !i.movesIn) return '<span class="chip next">esce il mese dopo</span>'
  return `<span class="chip">da ${verbo}</span>`
}

export function reportHtml(d: ProspettoData, month: string, today: string, autore = ''): string {
  // ── competenza: gli stessi numeri del conto economico di quel mese ────────
  const revThis = d.revenue.filter(r => r.month === month)
  const costThis = d.costs.filter(c => c.month === month)
  const t = computeMonth(revThis, costThis, d.config, d.partners)

  /* §232 — la lettura di cassa è un **sottoinsieme**: si contano le sole righe
     spuntate, ma il margine digital continua a togliere i subappalti **di
     competenza**, o filtrando una gamba sola la quota salirebbe su un ricavo di
     cui una parte è già del fornitore. */
  const cash = computeMonth(
    revThis.filter(r => r.paid), costThis.filter(c => c.paid), d.config, d.partners,
    costThis.filter(c => c.project_id))

  const agg = prospetto({
    months: [month], revenue: d.revenue, costs: d.costs, txs: d.txs,
    payouts: d.payouts, opening: d.opening, today, basis: 'competenza',
    ctx: { collection: new Map(d.collection) },
  })

  // ── cassa: il piano del mese, ancorato al saldo vero ──────────────────────
  const idx = Math.max(0, d.plan.findIndex(p => p.month === month))
  const cur = d.plan[idx]
  const sim = simulate(d.plan, new Set())
  const c = sim[idx]
  const out = outcomes(cur, new Set(), c.opening)
  const tips = advice(cur, new Set(), {
    vatHeld: d.vatHeld, vatLabel: d.vatLabel, opening: c.opening,
  })
  const chiuso = d.status === 'chiuso'

  /* La riga del piano che corrisponde a una riga del conto economico: porta la
     scadenza e lo stato, che sono la stessa regola usata a schermo (§224). */
  const byLine = new Map(cur.items.filter(i => i.source === 'riga').map(i => [i.id.slice(2), i]))

  const gruppi = (side: 'entrata' | 'uscita') =>
    (Object.keys(GROUPS) as GroupKey[]).map(g => {
      const own = cur.items.filter(i => i.group === g && i.side === side && i.movesIn && !i.inBalance)
      /* §271 — di che mese è quello che esce adesso. Le retribuzioni e i compensi
         che si pagano in agosto sono di luglio, e senza dirlo il foglio sembra
         contarli due volte: una in competenza e una in cassa. */
      const mesi = Array.from(new Set(own.map(i => i.month)))
      const da = mesi.length === 1 && mesi[0] !== month ? monthLabel(mesi[0]) : null
      return {
        g, amount: r2(own.reduce((s, i) => s + i.gross, 0)), n: own.length,
        da, daA: da ? aMese(mesi[0]) : '',
      }
    }).filter(x => x.n > 0).sort((a, b) => b.amount - a.amount)

  const compensiTot = r2(t.perPartner.reduce((s, p) => s + p.total, 0)
    + t.salesByOwner.reduce((s, p) => s + p.amount, 0))
  const incassato = r2(revThis.filter(r => r.paid).reduce((s, r) => s + r.amount_net, 0))

  /* §271 — **i compensi che escono in questo mese sono maturati nel mese
     prima**, come il costo del lavoro (§224): quello che si eroga ad agosto è il
     lavoro consegnato a luglio. Il foglio calcolava il maturato di agosto e lo
     chiamava «compensi di agosto», mentre la sezione di cassa contava — giusta —
     quelli di luglio: due numeri con lo stesso nome nello stesso documento, che
     in riunione diventano una discussione su chi ha ragione. */
  const prevMonth = shiftMonth(month, -1)
  const revPrev = d.revenue.filter(r => r.month === prevMonth)
  const costPrev = d.costs.filter(c => c.month === prevMonth)
  const tPrev = computeMonth(revPrev, costPrev, d.config, d.partners)
  /* §275 — la base è **quello che si è mosso in quel mese**, non «le righe di
     quel mese che risultano pagate»: sono due insiemi diversi e danno due
     numeri diversi. La cassa di luglio comprende gli incassi di giugno arrivati
     a luglio ed esclude le fatture di luglio incassate ad agosto — ed è la
     lettura che la pagina Ripartizione mostra («sui movimenti di questo mese»,
     §224). Il report ne dava un'altra: 3.595,94 € a socio contro i 3.530,94 €
     che si leggono a schermo, e due numeri diversi sullo stesso compenso sono
     il modo più veloce per non fidarsi di nessuno dei due. */
  const cashCtx = { collection: new Map(d.collection) }
  const movedR = new Set(movedIn(d.revenue.map(l => fromRevenue(l, l.month)),
    prevMonth, today, cashCtx).map(l => l.id))
  const movedC = new Set(movedIn(d.costs.map(x => fromCost(x, x.month)),
    prevMonth, today, cashCtx).map(l => l.id))
  const revMoved = d.revenue.filter(l => movedR.has(l.id))
  /* §232 — il margine digital continua a togliere i subappalti **di
     competenza** delle righe che si stanno contando: filtrarne una gamba sola
     distribuirebbe una quota su un ricavo di cui una parte è già del fornitore. */
  const mesiIn = new Set(revMoved.map(l => l.month))
  const cashPrev = computeMonth(
    revMoved, d.costs.filter(x => movedC.has(x.id)), d.config, d.partners,
    d.costs.filter(x => x.project_id && mesiIn.has(x.month)))
  /* Quello che la sezione di cassa si aspetta davvero in uscita: se il mese è
     stato preparato (§243) sono righe copiate, e possono essere diverse dal
     ricalcolo. La differenza si dichiara invece di far tornare i conti a mano. */
  const previsti = r2(cur.items.filter(i => i.group === 'compensi' && i.movesIn && !i.inBalance)
    .reduce((s2, i) => s2 + i.gross, 0))

  // ── §270 · i compensi per persona: maturato e quanto ne copre l'incassato ──
  const socioOf = (x: PlTotals, id: string | null) =>
    r2(id ? (x.perPartner.find(p => p.partner.id === id)?.total ?? 0) : 0)
  const commOf = (x: PlTotals, names: string[]) =>
    r2(x.salesByOwner.filter(s => names.includes(s.label)).reduce((n2, s) => n2 + s.amount, 0))
  /* §226 — un socio che è anche commerciale è **una persona sola**: `pl_partners`
     scrive «Walter», l'anagrafica «Walter Giacobbe», e su questo foglio erano due
     righe con lo stesso destinatario. Vince il nome completo, che è quello che
     sta sul bonifico, e l'unione la fa `mergePeople`: la regola esiste già, e
     riscriverla qui vorrebbe dire avere due risposte alla stessa domanda. */
  const merged = mergePeople(
    tPrev.perPartner.map(p => ({ id: p.partner.id, label: p.partner.label })),
    Array.from(new Set(tPrev.salesByOwner.map(s => s.label))))
  const people = merged.map(m => {
    /* I nomi che questa persona ha nei due elenchi: il suo, e quello del socio
       da cui è nata l'unione. */
    const nomi = Array.from(new Set([m.label, ...m.names,
      ...tPrev.perPartner.filter(p => p.partner.id === m.partnerId).map(p => p.partner.label)]))
    return {
      who: m.label, partnerId: m.partnerId,
      socio: socioOf(tPrev, m.partnerId), socioCash: socioOf(cashPrev, m.partnerId),
      comm: commOf(tPrev, nomi), commCash: commOf(cashPrev, nomi),
    }
  }).map(p => ({ ...p, tot: r2(p.socio + p.comm), totCash: r2(p.socioCash + p.commCash) }))
    .filter(p => p.tot > 0.01 || p.totCash > 0.01)
    .sort((a, b) => b.totCash - a.totCash || b.tot - a.tot)
  /* Le tre parti che compongono la quota di un socio, le stesse che si leggono
     nella pagina: erogato sul growth, quota sul margine digital, e la
     provvigione dei clienti che non hanno un commerciale, divisa fra i soci. */
  const parti = (id: string | null) => {
    const p = id ? cashPrev.perPartner.find(x => x.partner.id === id) : null
    return p ? { erogato: r2(p.delivery), digital: r2(cashPrev.plan.digitalPerPartner),
      pool: r2(cashPrev.plan.poolShare) } : null
  }
  const pT = {
    socio: r2(people.reduce((s, p) => s + p.socio, 0)),
    socioCash: r2(people.reduce((s, p) => s + p.socioCash, 0)),
    comm: r2(people.reduce((s, p) => s + p.comm, 0)),
    commCash: r2(people.reduce((s, p) => s + p.commCash, 0)),
    tot: r2(people.reduce((s, p) => s + p.tot, 0)),
    totCash: r2(people.reduce((s, p) => s + p.totCash, 0)),
  }
  const n = (base: number) => String(sim.length > 1 ? base + 1 : base)

  /* §273 — **l'elenco delle uscite è quello che il mese paga.** Le retribuzioni
     di agosto sono competenza di agosto e cassa di settembre (§224): elencarle
     qui, con scadenza 20 settembre, faceva leggere come «uscite di agosto» dei
     soldi che ad agosto non escono. Al loro posto ci sono le buste di luglio,
     che sono l'uscita vera del mese — e ogni riga dice di che mese è.
     Il totale non cambia il conto economico: è lo stesso importo con l'una al
     posto dell'altra, e la nota lo scrive. */
  const val = (x: { actual: number; budget: number }) => (x.actual > 0 ? x.actual : x.budget)
  const buste = (xs: typeof costThis) => xs.filter(x => isPayrollCenter(x.category) && val(x) > 0)
  const bustePrevTot = r2(buste(costPrev).reduce((s2, x) => s2 + val(x), 0))
  const busteThisTot = r2(buste(costThis).reduce((s2, x) => s2 + val(x), 0))
  const uscite = [
    ...costThis.filter(x => !isPayrollCenter(x.category)).map(x => ({ x, v: val(x), prev: false })),
    ...buste(costPrev).map(x => ({ x, v: val(x), prev: true })),
  ].filter(o => o.v > 0).sort((a, b) => b.v - a.v)
  const usciteNette = r2(uscite.reduce((s2, o) => s2 + o.v, 0))
  const usciteLorde = r2(uscite.reduce((s2, o) =>
    s2 + o.v * (o.x.vat_applied ? 1 + o.x.vat_rate : 1), 0))

  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TWO BEE — Prospetto ${esc(monthLabel(month))}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  :root {
    --ink: #0E0F12; --ink-2: #3A4048; --mute: #767E8A; --line: #E4E6EA; --line-2: #F2F3F5;
    --gold: #F5C800; --gold-bg: #FFFAE6;
    --pos: #12764A; --neg: #B3261E; --warn: #A85B00; --pos-bg: #E9F6EF; --neg-bg: #FDECEA;
  }
  body {
    margin: 0; background: #E8E9EB; color: var(--ink);
    font: 400 10pt/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { max-width: 210mm; margin: 0 auto 10mm; background: #fff; padding-bottom: 12mm; }
  .pad { padding: 0 14mm; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* La fascia nera con l'oro è il segno TwoBee: serve a capire in un colpo che
     documento si ha in mano, prima ancora di leggerne un numero. */
  .band { background: var(--ink); color: #fff; padding: 12mm 14mm 8mm; margin-bottom: 7mm; }
  .band .wm { font-size: 8pt; letter-spacing: 4pt; color: var(--gold); font-weight: 700; }
  .band h1 { margin: 5px 0 0; font-size: 26pt; letter-spacing: -.8pt; line-height: 1.05; }
  .band .sub { margin-top: 8px; font-size: 9pt; color: #A9B0BA; display: flex; gap: 16px;
               flex-wrap: wrap; align-items: center; }
  .band .sub b { color: #fff; font-weight: 600; }
  .tag { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 7.5pt;
         font-weight: 700; letter-spacing: .4pt; text-transform: uppercase; }
  .t-open { background: var(--gold); color: var(--ink); }
  .t-closed { background: #2C3138; color: #C9CFD8; }

  .verdict { display: grid; grid-template-columns: 6px 1fr; margin-bottom: 7mm; }
  .verdict i { background: var(--gold); }
  .verdict div { background: var(--gold-bg); padding: 11px 14px; }
  .verdict b { display: block; font-size: 14pt; letter-spacing: -.3pt; }
  .verdict p { margin: 4px 0 0; font-size: 9.5pt; color: var(--ink-2); max-width: 66ch; }

  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
          border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
          padding: 11px 0 12px; }
  .kpi { border-left: 2px solid var(--line); padding-left: 10px; }
  .kpi:first-child { border-left-color: var(--gold); }
  .kpi span { display: block; font-size: 7pt; text-transform: uppercase; letter-spacing: .7pt; color: var(--mute); }
  .kpi b { display: block; font-size: 16pt; letter-spacing: -.6pt; margin-top: 4px;
           font-variant-numeric: tabular-nums; }
  .kpi em { display: block; font-style: normal; font-size: 7.5pt; color: var(--mute); margin-top: 3px; line-height: 1.3; }

  h2 { display: flex; align-items: baseline; gap: 9px; font-size: 12pt; letter-spacing: -.2pt; margin: 8mm 0 3mm; }
  h2 i { font-style: normal; background: var(--ink); color: var(--gold); width: 19px; height: 19px;
         border-radius: 5px; font-size: 9pt; font-weight: 700; display: inline-flex;
         align-items: center; justify-content: center; flex: none; }
  h2 small { font-weight: 400; color: var(--mute); font-size: 9pt; letter-spacing: 0; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: .7pt;
       color: var(--mute); font-weight: 600; padding: 0 6px 5px 0; border-bottom: 1px solid var(--line); }
  th.num { text-align: right; padding-right: 0; }
  td { padding: 6px 6px 6px 0; border-bottom: 1px solid var(--line-2); font-size: 9.5pt; vertical-align: baseline; }
  td:last-child, th:last-child { padding-right: 0; }
  td.lbl span { display: block; font-size: 8pt; color: var(--mute); }
  td.num { font-weight: 600; }
  tr.total td { border-top: 2px solid var(--ink); border-bottom: 0; font-weight: 700; padding-top: 8px; }
  .pos { color: var(--pos); } .neg { color: var(--neg); } .warn { color: var(--warn); } .mute { color: var(--mute); }

  .chip { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: 7.5pt;
          font-weight: 600; background: #EEF0F3; color: var(--ink-2); white-space: nowrap; }
  .chip.ok { background: var(--pos-bg); color: var(--pos); }
  .chip.late { background: var(--neg-bg); color: var(--neg); }
  .chip.next { background: #FFF4E5; color: var(--warn); }

  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 9mm; }
  .steps { list-style: none; padding: 0; margin: 4mm 0 0; }
  .steps li { display: flex; align-items: baseline; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line-2); }
  .steps li span { flex: 1.1; font-size: 9.5pt; }
  .steps li em { font-style: normal; font-size: 8pt; color: var(--mute); flex: 1; }
  .steps li b { font-size: 12pt; font-variant-numeric: tabular-nums; letter-spacing: -.3pt; }

  ul.lev { list-style: none; padding: 0; margin: 3mm 0 0; }
  ul.lev li { border: 1px solid var(--line); border-left: 4px solid #C3C8D0; padding: 9px 11px; margin-bottom: 6px; }
  ul.lev li.leva { border-left-color: var(--gold); background: #FFFDF5; }
  ul.lev li.vincolo { border-left-color: var(--warn); }
  ul.lev b { display: block; font-size: 10pt; }
  ul.lev p { margin: 3px 0 0; font-size: 8.5pt; color: var(--ink-2); }

  .note { font-size: 8pt; color: var(--mute); border-top: 1px solid var(--line);
          padding-top: 7px; margin-top: 4mm; line-height: 1.5; }
  .note b { color: var(--ink); }
  section { break-inside: avoid; }
  .brk { break-before: page; }
  .fab { position: fixed; right: 22px; bottom: 22px; background: var(--ink); color: var(--gold);
         border: 0; border-radius: 99px; padding: 13px 22px; font-size: 11pt; font-weight: 700;
         cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.28); }
  @media print { .no-print { display: none !important; } body { background: #fff; }
                 .page { margin: 0; max-width: none; padding-bottom: 0; } .pad { padding: 0; }
                 .band { margin: -12mm -12mm 7mm; padding: 12mm 12mm 8mm; } }
</style></head>
<body>

<!-- ══ PAGINA 1 · quella che si proietta e si discute ══════════════════════ -->
<div class="page">
  <div class="band">
    <div class="wm">TWO BEE S.R.L.</div>
    <h1>Prospetto di ${esc(monthLabel(month))}</h1>
    <div class="sub">
      <span class="tag ${chiuso ? 't-closed' : 't-open'}">${chiuso ? 'mese chiuso' : 'mese in corso'}</span>
      <span>Dati al <b>${esc(giorno(today))} ${esc(today.slice(0, 4))}</b></span>
      <span>${cur.anchor ? 'Sul conto oggi' : 'Saldo a inizio mese'} <b>${eur2(c.opening)}</b></span>
      ${autore ? `<span>Preparato da <b>${esc(autore)}</b></span>` : ''}
    </div>
  </div>

  <div class="pad">
    <div class="verdict"><i></i><div>
      <b>${esc(tips[0]?.title ?? '')}</b>
      <p>${esc(tips[0]?.detail ?? '')}</p>
    </div></div>

    <div class="kpis">
      <div class="kpi"><span>Margine del mese</span>
        <b class="${t.margin.net < 0 ? 'neg' : 'pos'}">${eur2(t.margin.net)}</b>
        <em>competenza, imponibile</em></div>
      <div class="kpi"><span>${cur.anchor ? 'Sul conto oggi' : 'Saldo a inizio mese'}</span>
        <b>${eur2(c.opening)}</b>
        <em>${cur.anchor ? 'solo movimenti dell\'estratto conto' : 'com\'era il 1º del mese'}</em></div>
      <div class="kpi"><span>Saldo a fine mese</span>
        <b class="${c.end < 0 ? 'neg' : c.end < 2000 ? 'warn' : 'pos'}">${eur2(c.end)}</b>
        <em>se tutto l'atteso si muove</em></div>
      <div class="kpi"><span>Se non incassiamo niente</span>
        <b class="${out.floor < 0 ? 'neg' : ''}">${eur2(out.floor)}</b>
        <em>l'unico numero che dipende da noi</em></div>
    </div>

    <section>
      <h2><i>1</i> Cosa ha prodotto il mese <small>competenza · imponibile</small></h2>
      <table>
        <tr><th>Voce</th><th class="num">Importo</th><th class="num">Sul fatturato</th></tr>
        <tr><td class="lbl">Entrate<span>${revThis.length} righe di ricavo</span></td>
          <td class="num pos">${eur2(t.revenue.accrued)}</td><td class="num mute">100%</td></tr>
        <tr><td class="lbl">Costi di struttura<span>quello che la società spende per esistere</span></td>
          <td class="num">−${eur2(t.costs.structural)}</td>
          <td class="num mute">${quota(t.costs.structural, t.revenue.accrued)}</td></tr>
        <tr><td class="lbl">Lavori affidati fuori<span>già tolti dal margine del loro progetto</span></td>
          <td class="num">−${eur2(t.costs.external)}</td>
          <td class="num mute">${quota(t.costs.external, t.revenue.accrued)}</td></tr>
        <tr class="total"><td class="lbl">Margine</td>
          <td class="num ${t.margin.net < 0 ? 'neg' : 'pos'}">${eur2(t.margin.net)}</td>
          <td class="num">${quota(Math.max(0, t.margin.net), t.revenue.accrued)}</td></tr>
        <tr><td class="lbl">Compensi maturati<span>soci e commerciali: non sono costi, si ricalcolano</span></td>
          <td class="num mute">−${eur2(compensiTot)}</td>
          <td class="num mute">${quota(compensiTot, t.revenue.accrued)}</td></tr>
        <tr class="total"><td class="lbl">Resta alla società</td>
          <td class="num ${t.margin.net - compensiTot < 0 ? 'neg' : ''}">${eur2(r2(t.margin.net - compensiTot))}</td>
          <td class="num"></td></tr>
      </table>
      <p class="note">
        <b>Competenza</b> è il mese in cui il lavoro è stato fatto, pagato o no: sono gli stessi numeri
        del conto economico di ${esc(monthLabel(month))}, riga per riga. Di questo fatturato
        <b>${eur2(incassato)}</b> è già stato incassato; il resto è credito, e il dettaglio è in pagina 2.
      </p>
    </section>

    <section>
      <h2><i>2</i> Da dove vengono e dove vanno</h2>
      <div class="two">
        <table>
          <tr><th>Entrate per tipo di lavoro</th><th class="num">Importo</th><th class="num">%</th></tr>
          ${agg.revenue.map(row => `<tr><td class="lbl">${esc(row.label)}</td>
            <td class="num pos">${eur2(row.total)}</td>
            <td class="num mute">${quota(row.total, agg.totals.revenue.total)}</td></tr>`).join('')}
          <tr class="total"><td class="lbl">Totale</td>
            <td class="num pos">${eur2(agg.totals.revenue.total)}</td><td class="num">100%</td></tr>
        </table>
        <table>
          <tr><th>Dove esce</th><th class="num">Importo</th><th class="num">%</th></tr>
          ${[...agg.costs.map(r => ({ l: r.label, v: r.total, k: '' })),
             ...agg.payouts.map(r => ({ l: r.label, v: r.total, k: 'compenso, non costo' }))]
            .sort((a, b) => b.v - a.v)
            .map(row => `<tr><td class="lbl">${esc(row.l)}${row.k ? `<span>${row.k}</span>` : ''}</td>
              <td class="num">${eur2(row.v)}</td>
              <td class="num mute">${quota(row.v, agg.totals.costs.total + agg.totals.payouts.total)}</td></tr>`).join('')}
          <tr class="total"><td class="lbl">Totale che esce</td>
            <td class="num">${eur2(agg.totals.costs.total + agg.totals.payouts.total)}</td>
            <td class="num">100%</td></tr>
        </table>
      </div>
    </section>

    <section>
      <h2><i>3</i> Cosa deve ancora succedere <small>cassa · lordo IVA</small></h2>
      <div class="two">
        <table>
          <tr><th>Ancora da incassare</th><th class="num">Importo</th></tr>
          ${gruppi('entrata').map(x => `<tr><td class="lbl">${esc(GROUPS[x.g])}<span>${x.n} voc${x.n === 1 ? 'e' : 'i'}${x.da ? ` · maturate ${esc(x.daA)}` : ''}</span></td>
            <td class="num pos">${eur2(x.amount)}</td></tr>`).join('')
            || '<tr><td class="lbl mute">Niente</td><td class="num">—</td></tr>'}
          <tr class="total"><td class="lbl">Totale</td><td class="num pos">${eur2(c.inflow)}</td></tr>
        </table>
        <table>
          <tr><th>Ancora da pagare</th><th class="num">Importo</th></tr>
          ${gruppi('uscita').map(x => `<tr><td class="lbl">${esc(GROUPS[x.g])}<span>${x.n} voc${x.n === 1 ? 'e' : 'i'}${x.da ? ` · maturat${x.g === 'personale' ? 'e' : 'i'} ${esc(x.daA)}` : ''}</span></td>
            <td class="num neg">${eur2(x.amount)}</td></tr>`).join('')
            || '<tr><td class="lbl mute">Niente</td><td class="num">—</td></tr>'}
          <tr class="total"><td class="lbl">Totale</td><td class="num neg">${eur2(c.outflow)}</td></tr>
        </table>
      </div>
      <ul class="steps">
        <li><span>Se <b>non incassiamo niente</b></span><em>il saldo di oggi meno tutto quello che esce</em>
          <b class="${out.floor < 0 ? 'neg' : 'pos'}">${eur2(out.floor)}</b></li>
        <li><span>Se <b>pagano i puntuali</b></span><em>le fatture ancora nei termini</em>
          <b class="${out.expected < 0 ? 'neg' : 'pos'}">${eur2(out.expected)}</b></li>
        <li><span>Se <b>rientrano gli scaduti</b></span><em>quelli non arrivano da soli: è una telefonata</em>
          <b class="${out.best < 0 ? 'neg' : 'pos'}">${eur2(out.best)}</b></li>
      </ul>
      <p class="note">
        <b>Cassa</b> è il mese in cui i soldi si muovono, e non è quello della competenza: le retribuzioni
        di ${esc(monthLabel(month))} escono il 20 del mese dopo, e un arretrato di due mesi fa si incassa
        adesso. Qui gli importi sono <b>lordi</b>: dal conto passa il totale della fattura, IVA compresa.
      </p>
    </section>

    <section>
      <h2><i>4</i> Le leve del mese</h2>
      <ul class="lev">
        ${tips.slice(1).map(a => `<li class="${esc(a.kind)}">
          <b>${esc(a.title)}</b><p>${esc(a.detail)}</p></li>`).join('')
          || '<li><b>Nessuna leva da tirare</b><p>Il mese non ha arretrati da recuperare né uscite spostabili.</p></li>'}
      </ul>
    </section>

    ${sim.length > 1 ? `<section>
      <h2><i>5</i> Come prosegue sul conto</h2>
      <table>
        <tr><th>Mese</th><th class="num">Entra</th><th class="num">Esce</th><th class="num">Saldo a fine mese</th></tr>
        ${sim.map(s => `<tr>
          <td class="lbl">${esc(monthLabel(s.month))}</td>
          <td class="num pos">${eur2(s.inflow)}</td>
          <td class="num neg">−${eur2(s.outflow)}</td>
          <td class="num ${s.end < 0 ? 'neg' : ''}">${eur2(s.end)}</td></tr>`).join('')}
      </table>
      <p class="note">Previsionale <b>sul conto</b>, non sul margine: parte dal saldo vero e mese per mese
        somma quello che si muove. I mesi non ancora aperti sono composti dai contratti firmati e dal piano
        dei costi; il costo del lavoro è stimato uguale all'ultimo mese registrato.</p>
    </section>` : ''}
  </div>
</div>

<!-- ══ PAGINA 2 · quella che si allega al verbale ══════════════════════════ -->
<div class="page brk">
  <div class="band" style="padding-top:9mm;padding-bottom:7mm">
    <div class="wm">TWO BEE S.R.L. · ${esc(monthLabel(month).toUpperCase())}</div>
    <h1 style="font-size:19pt">Il dettaglio, riga per riga</h1>
    <div class="sub"><span>Ogni voce del conto economico di questo mese, con la sua scadenza e il suo stato — pagata o no</span></div>
  </div>

  <div class="pad">
    <section>
      <h2><i>${n(5)}</i> Entrate <small>${revThis.length} righe · ${eur2(t.revenue.accrued)} imponibile</small></h2>
      <table>
        <tr><th>Cliente e lavoro</th><th class="num">Imponibile</th><th class="num">IVA</th>
          <th class="num">Totale</th><th>Scadenza</th><th>Stato</th></tr>
        ${revThis.slice().sort((a, b) => b.amount_net - a.amount_net).map(r => {
          const i = byLine.get(r.id)
          const iva = r2(r.amount_net * r.vat_rate)
          return `<tr>
            <td class="lbl">${esc(r.label)}${r.pass_through
              ? '<span>partita di giro: entra in fatturato e IVA, resta fuori dalle quote</span>' : ''}</td>
            <td class="num">${eur2(r.amount_net)}</td>
            <td class="num mute">${eur2(iva)}</td>
            <td class="num">${eur2(r2(r.amount_net + iva))}</td>
            <td class="mute">${i ? esc(giorno(i.due)) : '—'}</td>
            <td>${chip(i, r.paid, 'incassare')}</td></tr>`
        }).join('') || '<tr><td class="lbl mute" colspan="6">Nessuna riga di ricavo in questo mese.</td></tr>'}
        <tr class="total"><td class="lbl">Totale entrate</td>
          <td class="num pos">${eur2(t.revenue.accrued)}</td>
          <td class="num mute">${eur2(t.revenue.vat)}</td>
          <td class="num pos">${eur2(t.revenue.grossWithVat)}</td>
          <td colspan="2" class="mute" style="font-weight:400">di cui incassato ${eur2(incassato)}</td></tr>
      </table>
    </section>

    <section>
      <h2><i>${n(6)}</i> Uscite <small>${uscite.length} voci · quello che ${esc(mese(month).split(' ')[0])} paga davvero</small></h2>
      <table>
        <tr><th>Voce</th><th>Area</th><th class="num">Imponibile</th>
          <th class="num">Totale</th><th>Scadenza</th><th>Stato</th></tr>
        ${uscite.map(({ x, v, prev }) => {
          const i = byLine.get(x.id)
          return `<tr>
            <td class="lbl">${esc(x.label)}${
              prev
                /* §273 — la retribuzione di luglio è **quella che agosto paga**:
                   nella tabella del mese ci va lei, non quella di agosto che
                   uscirà il 20 settembre. Il mese di competenza sta scritto sulla
                   riga, o il totale sembrerebbe non tornare col conto economico. */
                ? `<span>retribuzione di ${esc(mese(prevMonth))} · esce il 20 di ${esc(mese(month).split(' ')[0])}</span>`
                : x.project_id
                  ? `<span>lavoro affidato fuori · ${esc(x.terms
                      ? TERMS_LABEL[x.terms as Terms] ?? 'quando paga il cliente'
                      : 'si paga quando incassiamo dal cliente')}</span>`
                  : ''}</td>
            <td class="mute" style="font-size:8.5pt">${esc(x.category || '—')}</td>
            <td class="num">${eur2(v)}</td>
            <td class="num">${eur2(r2(v * (x.vat_applied ? 1 + x.vat_rate : 1)))}</td>
            <td class="mute">${i ? esc(giorno(i.due)) : '—'}</td>
            <td>${chip(i, x.paid, 'pagare')}</td></tr>`
        }).join('') || '<tr><td class="lbl mute" colspan="6">Nessuna riga di uscita in questo mese.</td></tr>'}
        <tr class="total"><td class="lbl">Totale in uscita ${esc(aMese(month))}</td><td></td>
          <td class="num neg">${eur2(usciteNette)}</td>
          <td class="num neg">${eur2(usciteLorde)}</td>
          <td colspan="2"></td></tr>
      </table>
      <p class="note">
        <b>Le retribuzioni di un mese escono il 20 di quello dopo</b> (§224). Qui ci sono quelle di
        ${esc(mese(prevMonth))} — <b>${eur2(bustePrevTot)}</b> — perché sono l'uscita vera di
        ${esc(mese(month).split(' ')[0])}; quelle di ${esc(mese(month))}, ${eur2(busteThisTot)}, sono
        competenza di ${esc(mese(month).split(' ')[0])} e usciranno il 20 di
        ${esc(mese(shiftMonth(month, 1)).split(' ')[0])}.
        Da qui la differenza col conto economico, che conta le seconde:
        ${eur2(usciteNette)} − ${eur2(bustePrevTot)} + ${eur2(busteThisTot)} =
        <b>${eur2(r2(t.costs.structural + t.costs.external))}</b>.
        L'area <b>Personale</b> la scrive l'organico, non il piano dei costi; i <b>lavori affidati
        fuori</b> sono già stati tolti dal margine del progetto che li ha venduti.
      </p>
    </section>

    <!-- §270 — i compensi: due colonne che non si sommano -->
    <section>
      <h2><i>${n(7)}</i> I compensi da erogare ${esc(aMese(month))}
        <small>sull'<b>incassato</b> di ${esc(mese(prevMonth))}: ${eur2(r2(revMoved.reduce((s2, r) => s2 + r.amount_net, 0)))} rientrati dal conto</small></h2>
      <table>
        <tr>
          <th>Persona</th><th>Come si compone</th>
          <th class="num">Erogato socio</th><th class="num">Provvigione</th><th class="num">Da erogare</th>
        </tr>
        ${people.map(p => {
          const q = parti(p.partnerId)
          return `<tr>
          <td class="lbl">${esc(p.who)}${p.socioCash > 0 && p.commCash > 0
            ? '<span>socio e commerciale: una persona sola, un bonifico solo</span>' : ''}</td>
          <td class="mute" style="font-size:8pt">${q && p.socioCash > 0
            ? `erogato ${eur2(q.erogato)} · digital ${eur2(q.digital)}${q.pool > 0 ? ` · da lead generation ${eur2(q.pool)}` : ''}`
            : p.commCash > 0 ? 'provvigione sui clienti che ha portato'
            : 'le sue fatture non sono rientrate in ' + esc(mese(prevMonth).split(' ')[0])}</td>
          <td class="num">${p.socioCash > 0 ? eur2(p.socioCash) : '—'}</td>
          <td class="num">${p.commCash > 0 ? eur2(p.commCash) : '—'}</td>
          <td class="num pos">${p.totCash > 0 ? eur2(p.totCash) : '—'}</td></tr>`
        }).join('')
          || '<tr><td class="lbl mute" colspan="5">Nessun compenso da erogare in questo mese.</td></tr>'}
        <tr class="total">
          <td class="lbl">Totale</td><td></td>
          <td class="num">${eur2(pT.socioCash)}</td><td class="num">${eur2(pT.commCash)}</td>
          <td class="num pos">${eur2(pT.totCash)}</td></tr>
      </table>
      <p class="note">
        <b>L'erogato si emette sull'incassato</b> (§224). La base è quello che dal conto è passato
        ${esc(aMese(prevMonth))} — incassi di quel mese, di qualunque fattura — e su quella si applicano le
        percentuali: ${Math.round(d.config.growth_delivery_pct * 100)}% del growth diviso fra i soci,
        ${Math.round(d.config.digital_partner_pct * 100)}% del margine digital a ciascuno,
        ${Math.round(plPct.sales(d.config, 'growth') * 100)}% e
        ${Math.round(plPct.sales(d.config, 'digital') * 100)}% di provvigione al commerciale. Le fatture di
        ${esc(mese(prevMonth))} non ancora rientrate non sono qui: il loro compenso si eroga quando arrivano.
        Un socio che è anche commerciale compare <b>una volta sola</b> — gli si bonifica una volta, e due
        righe con lo stesso nome fanno cercare due movimenti che non esistono.
        ${Math.abs(previsti - pT.totCash) < 1 ? '' : `Le righe già preparate in
        ${esc(mese(month).split(' ')[0])} portano <b>${eur2(previsti)}</b>: è l'importo copiato quando il
        mese è stato preparato (§243) e non si aggiorna da sé — la sezione di cassa conta quello.`}
      </p>
    </section>

    <p class="note">
      Piano compensi in vigore — <b>growth</b>: ${Math.round(plPct.sales(d.config, 'growth') * 100)}% al
      commerciale, ${Math.round(d.config.growth_delivery_pct * 100)}% erogato ai soci in parti uguali,
      ${Math.round(d.config.cost_target_pct * 100)}% target costi,
      ${Math.round(d.config.risk_fund_pct * 100)}% fondo rischio.
      <b>Digital</b>: la base è il margine dopo i lavori affidati fuori —
      ${Math.round(plPct.sales(d.config, 'digital') * 100)}% al commerciale e
      ${Math.round(d.config.digital_partner_pct * 100)}% a ciascun socio.
      L'IVA incassata dai clienti sta sul conto ma non è capitale: è un debito con una data.
      Documento generato da TWO BEE OS il ${esc(giorno(today))} ${esc(today.slice(0, 4))}: i numeri vengono
      dal conto economico e dall'estratto conto, non sono stati digitati a mano.
    </p>
  </div>
</div>

<button class="fab no-print" onclick="window.print()">Salva come PDF</button>
</body></html>`

  return html
}
