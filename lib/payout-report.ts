/**
 * §334 — Il foglio dell'erogazione: a ciascuno quanto, e da cosa viene.
 *
 * Il conto economico risponde già alla domanda «quanto spetta a ciascuno», ma la
 * risposta vive dentro una pagina che si apre un pannello alla volta. Il giorno
 * del bonifico la domanda è un'altra e si fa in due minuti: **quanto verso, a
 * chi, e se qualcuno chiede perché, da dove viene**. Per quella domanda serve un
 * foglio: si stampa, si allega, si manda a chi lo riceve — e chi lo riceve deve
 * poterlo controllare senza avere accesso al tool.
 *
 * Tre regole che lo governano:
 *
 *   1. **Nessun numero senza la sua riga.** Ogni compenso si apre nelle voci di
 *      ricavo che lo alimentano, con la base, la percentuale applicata e il
 *      motivo. «Marco: 4.801,95 €» non si può contestare; «1.845 dall'erogato
 *      growth di Affinity al 10% di 1.800, 2.696,95 dalla quota digital di
 *      Seven» sì — ed è la sola forma in cui un compenso si può accettare.
 *   2. **Maturato e da versare non sono lo stesso numero**, e il foglio li tiene
 *      in due colonne. Quello che spetta è il lavoro consegnato; quello che esce
 *      è al netto di ciò che il socio ha già speso dal sottoconto o fatturato
 *      (§191). Sommarli a mente è l'errore che questo foglio esiste per evitare.
 *   3. **Quello che non è entrato si dice.** Un compenso più basso del previsto
 *      ha sempre una ragione, e nove volte su dieci è una fattura che non è
 *      rientrata nella finestra (§286). Scritta accanto, la domanda non si fa.
 *
 * HTML autonomo come `prospetto-report` (§268): nessun asset esterno, stile in
 * linea, e il PDF lo fa il browser. È l'unico modo di avere lo stesso documento
 * su ogni macchina senza portarsi dietro un motore di stampa — e il file resta
 * leggibile anche fra due anni, quando il tool avrà un'altra faccia.
 */
import { monthLabel, pct as plPct, type PlConfig, type PlTotals, type QuotaRow } from '@/lib/pl'
import { mergePeople } from '@/lib/cash-certify'
import type { PayoutWindow } from '@/lib/payout-window'
import { eur2 } from '@/lib/money'

const esc = (s: string) => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
const r2 = (n: number) => Math.round(n * 100) / 100
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const giorno = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESI[(m ?? 1) - 1]}`
}
/* Arrotondare **prima** di decidere quanti decimali: `0.28 * 100` fa
   28.000000000000004, quindi la prova sul resto diceva «non è intero» e il
   foglio stampava «28.0%» accanto a «25%» e «15%». Un decimale che compare su
   una riga sola si legge come una precisione voluta. */
const pc = (n: number) => {
  const v = Math.round(n * 1000) / 10
  return `${v.toFixed(Number.isInteger(v) ? 0 : 1)}%`
}

/** Le righe già preparate (`pl_payouts`): dicono chi è stato pagato e quando. */
export type PayoutLineRef = {
  personKey: string
  personLabel: string
  kind: 'socio' | 'commerciale'
  amount: number
  paid: boolean
  paidOn: string | null
}

/** Una riga che il compenso aspetta: maturata e non ancora rientrata. */
export type OpenLine = {
  label: string
  clientId: string | null
  month: string | null
  amount: number
  /**
   * §188 — partita di giro: un anticipo che torna al cliente. È un credito da
   * incassare come gli altri, ma **non genera nessuna quota**, quindi la frase
   * «il compenso di queste righe si eroga quando il cliente paga» su di lei è
   * falsa. Dirlo costa una parola; non dirlo promette un compenso che non c'è.
   */
  passThrough?: boolean
}

export type PayoutReportInput = {
  month: string
  today: string
  autore?: string
  w: PayoutWindow
  t: PlTotals
  config: PlConfig
  clientNames: Record<string, string>
  /**
   * §226 — i nomi che i clienti hanno in anagrafica, da cui un socio prende il
   * suo cognome: `pl_partners` scrive «Walter», l'anagrafica «Walter Giacobbe».
   * Deve arrivare da fuori e non da `salesByOwner`, che contiene solo chi ha
   * incassato qualcosa in questa finestra: nel mese in cui uno non incassa
   * niente il suo nome si accorcerebbe, e lo stesso bonifico comparirebbe con
   * due intestazioni diverse su due fogli.
   */
  owners?: string[]
  lines?: PayoutLineRef[]
  /**
   * §286/§335 — cosa la finestra ha lasciato fuori. Non basta il conteggio: chi
   * riceve un compenso più basso del previsto vuole sapere **quale** cliente non
   * ha pagato, e un totale senza nomi manda a cercarlo in un'altra pagina.
   */
  open?: { n: number; amount: number; rows?: OpenLine[] }
  next?: { n: number; amount: number; rows?: OpenLine[] }
}

/**
 * Perché un euro spetta a qualcuno, in italiano.
 *
 * `provvigione-divisa` e `provvigione-condivisa` sono lo stesso movimento di
 * denaro e due fatti diversi (§330): il primo è un cliente che nessuno ha
 * portato, il secondo una provvigione che si è deciso di dividere. Su un foglio
 * che qualcuno userà per contestare un numero, la differenza è tutto.
 */
const REASON: Record<QuotaRow['reason'], string> = {
  erogato: 'Erogato growth',
  digital: 'Quota digital',
  residuo: 'Residuo growth',
  provvigione: 'Provvigione',
  'provvigione-divisa': 'Provvigione divisa — cliente senza commerciale',
  'provvigione-condivisa': 'Provvigione divisa per scelta',
}
/** L'ordine in cui si legge un compenso: prima il lavoro, poi il procurato. */
const ORDER: QuotaRow['reason'][] = [
  'erogato', 'digital', 'residuo', 'provvigione', 'provvigione-condivisa', 'provvigione-divisa',
]

export type PersonPayout = {
  who: string
  partnerId: string | null
  /** quota da socio: erogato, digital, residuo, e la sua parte del pool */
  socio: number
  /** provvigione sui clienti che ha portato lui */
  comm: number
  total: number
  /** §191 — già uscito come spesa dal sottoconto o come fattura del socio */
  spent: number
  /** quello che resta davvero da bonificare */
  cash: number
  /** speso oltre la quota: è un anticipo, non un buco */
  overspent: number
  rows: QuotaRow[]
  paid: boolean
  paidOn: string | null
}

/**
 * Chi prende cosa, con le righe che lo giustificano.
 *
 * Pura: è quello che rende il foglio verificabile da uno script senza
 * autenticarsi, e il gate la prova sui numeri invece che sull'HTML.
 */
export function payoutPeople(i: Pick<PayoutReportInput, 't' | 'lines' | 'owners'>): PersonPayout[] {
  const { t } = i
  /* §226 — un socio che è anche commerciale è **una persona sola**: `pl_partners`
     scrive «Walter», l'anagrafica «Walter Giacobbe», e su un foglio di bonifici
     due righe con lo stesso destinatario sono due bonifici. L'unione la fa
     `mergePeople`, che è la regola che esiste già. */
  const merged = mergePeople(
    t.perPartner.map(p => ({ id: p.partner.id, label: p.partner.label })),
    Array.from(new Set([...(i.owners ?? []), ...t.salesByOwner.map(s => s.label)])))

  return merged.map(m => {
    const p = m.partnerId ? t.perPartner.find(x => x.partner.id === m.partnerId) : undefined
    const nomi = Array.from(new Set([m.label, ...m.names, ...(p ? [p.partner.label] : [])]))
    const own = t.salesByOwner.filter(s => nomi.includes(s.label))
    const comm = r2(own.reduce((n, s) => n + s.amount, 0))
    const line = (i.lines ?? []).find(l => l.personLabel === m.label || l.personKey === m.key)
    return {
      who: m.label,
      partnerId: m.partnerId,
      socio: r2(p?.total ?? 0),
      comm,
      total: r2((p?.total ?? 0) + comm),
      spent: r2(p?.spent ?? 0),
      /* Il netto esce dal motore (`cash`), non da una sottrazione fatta qui: una
         seconda formula per lo stesso numero è una seconda risposta. */
      cash: r2((p?.cash ?? 0) + comm),
      overspent: r2(p?.overspent ?? 0),
      rows: [...(p?.rows ?? []), ...own.flatMap(s => s.rows)],
      paid: !!line?.paid,
      paidOn: line?.paidOn ?? null,
    }
  })
    .filter(x => x.total > 0.005 || x.rows.length > 0)
    .sort((a, b) => b.total - a.total || a.who.localeCompare(b.who))
}

/** Le righe di una persona, raggruppate per motivo e già ordinate. */
export function groupRows(rows: QuotaRow[]): { reason: QuotaRow['reason']; total: number; rows: QuotaRow[] }[] {
  const by = new Map<QuotaRow['reason'], QuotaRow[]>()
  for (const r of rows) by.set(r.reason, [...(by.get(r.reason) ?? []), r])
  return ORDER.filter(k => by.has(k)).map(reason => {
    const own = (by.get(reason) ?? []).slice().sort((a, b) => b.amount - a.amount)
    return { reason, total: r2(own.reduce((n, r) => n + r.amount, 0)), rows: own }
  })
}

export function payoutReportHtml(i: PayoutReportInput): string {
  const { month, today, w, t, config, clientNames } = i
  const people = payoutPeople(i)
  const tot = {
    socio: r2(people.reduce((n, p) => n + p.socio, 0)),
    comm: r2(people.reduce((n, p) => n + p.comm, 0)),
    total: r2(people.reduce((n, p) => n + p.total, 0)),
    spent: r2(people.reduce((n, p) => n + p.spent, 0)),
    cash: r2(people.reduce((n, p) => n + p.cash, 0)),
  }
  const daPagare = people.filter(p => !p.paid && p.cash > 0.005)
  const nome = (r: QuotaRow) =>
    (r.clientId ? clientNames[r.clientId] : null) ?? r.label

  /* §334 — il mese si scrive solo quando **non** è quello del foglio: la
     finestra ne attraversa due, e due canoni uguali dello stesso cliente
     finiscono uno sotto l'altro con lo stesso importo. Scriverlo su tutte le
     righe sarebbe rumore; scriverlo su nessuna fa sembrare un doppione la riga
     che viene da prima. */
  /* §335 — quello che slitta, **con i nomi**. Un compenso più basso del previsto
     ha sempre una ragione, e la domanda che arriva è «quale cliente non ha
     pagato»: un totale senza l'elenco la manda a cercare in un'altra pagina. */
  const slitta = (
    b: { n: number; amount: number; rows?: OpenLine[] } | undefined,
    titolo: string, perche: string,
  ) => {
    if (!b || b.n === 0) return ''
    const rows = (b.rows ?? []).slice().sort((a, c) => c.amount - a.amount)
    /* Il totale che porta un compenso è al netto delle partite di giro: metterle
       dentro promette una quota su un anticipo che torna al cliente. */
    const quotabili = r2(rows.filter(r => !r.passThrough).reduce((n, r) => n + r.amount, 0))
    const giri = rows.filter(r => r.passThrough).length
    return `<div class="slip">
      <p><b>${titolo} — ${b.n} ${b.n === 1 ? 'riga' : 'righe'} per ${eur2(b.amount)}</b><br>${perche}${
        giri > 0 ? ` ${giri === 1 ? 'Una riga è' : `${giri} righe sono`} una partita di giro`
          + ` (§188): entra in cassa ma non genera nessuna quota, quindi il compenso in gioco`
          + ` è ${eur2(quotabili)}.` : ''}</p>
      ${rows.length ? `<table class="slim"><tbody>${rows.map(r => `<tr>
        <td class="lbl">${esc((r.clientId ? clientNames[r.clientId] : null) ?? r.label)}${
          r.month && r.month !== month
            ? ` <span class="chip">${esc(monthLabel(r.month).toLowerCase())}</span>` : ''
        }${r.passThrough ? ' <span class="chip">partita di giro · nessuna quota</span>' : ''
        }<span>${esc(r.label)}</span></td>
        <td class="num${r.passThrough ? ' mute' : ''}">${eur2(r.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
    </div>`
  }

  const riga = (r: QuotaRow) => `<tr>
    <td class="lbl">${esc(nome(r))}${r.month && r.month !== month
      ? ` <span class="chip">${esc(monthLabel(r.month).toLowerCase())}</span>` : ''}<span>${esc(r.label)}</span></td>
    <td><span class="chip">${r.kind}</span></td>
    <td class="num">${eur2(r.base)}${r.external > 0
      ? `<span class="sub">al netto di ${eur2(r.external)} di subappalto</span>` : ''}</td>
    <td class="num">${pc(r.pct)}</td>
    <td class="num">${eur2(r.amount)}</td>
  </tr>`

  const scheda = (p: PersonPayout) => `
  <section class="person">
    <div class="ph">
      <b>${esc(p.who)}</b>
      <span class="ph-n">
        ${p.socio > 0.005 ? `<em>erogato soci</em> ${eur2(p.socio)}` : ''}
        ${p.comm > 0.005 ? `<em>provvigione</em> ${eur2(p.comm)}` : ''}
        <strong>${eur2(p.total)}</strong>
      </span>
    </div>
    ${p.rows.length === 0
      ? '<p class="empty">Nessuna voce di ricavo alimenta questo compenso in questa finestra.</p>'
      : `<table>
      <thead><tr>
        <th>Voce di ricavo</th><th>Tipo</th><th class="num">Base</th>
        <th class="num">Quota</th><th class="num">Importo</th>
      </tr></thead>
      <tbody>
        ${groupRows(p.rows).map(g => `
          <tr class="grp"><td colspan="4">${esc(REASON[g.reason])}</td>
            <td class="num">${eur2(g.total)}</td></tr>
          ${g.rows.map(riga).join('')}`).join('')}
        <tr class="total"><td colspan="4">Compenso di ${esc(p.who)}</td>
          <td class="num">${eur2(p.total)}</td></tr>
        ${p.spent > 0.005 ? `<tr><td colspan="4" class="mute">
          Già uscito: spese dal sottoconto o fattura del socio (§191)</td>
          <td class="num neg">−${eur2(p.spent)}</td></tr>
        <tr class="total"><td colspan="4">Da versare</td>
          <td class="num">${eur2(p.cash)}</td></tr>` : ''}
        ${p.overspent > 0.005 ? `<tr><td colspan="5" class="mute">
          Ha speso ${eur2(p.overspent)} oltre la quota: è un anticipo sul mese prossimo,
          non un debito della società.</td></tr>` : ''}
      </tbody>
    </table>`}
  </section>`

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TWO BEE — Compensi ${esc(monthLabel(month))}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  :root {
    --ink: #0E0F12; --ink-2: #3A4048; --mute: #767E8A; --line: #E4E6EA; --line-2: #F2F3F5;
    --gold: #F5C800; --gold-bg: #FFFAE6;
    --pos: #12764A; --neg: #B3261E; --warn: #A85B00; --pos-bg: #E9F6EF;
  }
  body {
    margin: 0; background: #E8E9EB; color: var(--ink);
    font: 400 10pt/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { max-width: 210mm; margin: 0 auto 10mm; background: #fff; padding-bottom: 12mm; }
  .pad { padding: 0 14mm; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .band { background: var(--ink); color: #fff; padding: 12mm 14mm 8mm; margin-bottom: 7mm; }
  .band .wm { font-size: 8pt; letter-spacing: 4pt; color: var(--gold); font-weight: 700; }
  .band h1 { margin: 5px 0 0; font-size: 26pt; letter-spacing: -.8pt; line-height: 1.05; }
  .band .sub { margin-top: 9px; font-size: 9pt; color: #A9B0BA; display: flex; gap: 16px;
               flex-wrap: wrap; align-items: center; }
  .band .sub b { color: #fff; font-weight: 600; }

  .verdict { display: grid; grid-template-columns: 6px 1fr; margin-bottom: 7mm; }
  .verdict i { background: var(--gold); }
  .verdict div { background: var(--gold-bg); padding: 11px 14px; }
  .verdict b { display: block; font-size: 14pt; letter-spacing: -.3pt; }
  .verdict p { margin: 4px 0 0; font-size: 9.5pt; color: var(--ink-2); max-width: 70ch; }

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
  td .sub { display: block; font-size: 7.5pt; font-weight: 400; color: var(--mute); }
  tr.total td { border-top: 2px solid var(--ink); border-bottom: 0; font-weight: 700; padding-top: 8px; }
  tr.grp td { background: #F7F8F9; font-size: 8pt; font-weight: 700; text-transform: uppercase;
              letter-spacing: .5pt; color: var(--ink-2); padding: 5px 6px 5px 0; border-bottom: 0; }
  tr.grp td:first-child { padding-left: 7px; }
  .pos { color: var(--pos); } .neg { color: var(--neg); } .warn { color: var(--warn); } .mute { color: var(--mute); }
  .chip { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: 7.5pt;
          font-weight: 600; background: #EEF0F3; color: var(--ink-2); white-space: nowrap; }
  .chip.ok { background: var(--pos-bg); color: var(--pos); }

  /* Una persona non si spezza fra due fogli: chi riceve la seconda metà del
     proprio compenso su una pagina staccata non ha modo di sapere che c'era
     una prima metà. */
  .person { break-inside: avoid; page-break-inside: avoid; margin-bottom: 6mm; }
  .person .ph { display: flex; align-items: baseline; gap: 12px; border-bottom: 2px solid var(--ink);
                padding-bottom: 5px; margin-bottom: 4px; }
  .person .ph b { font-size: 12.5pt; letter-spacing: -.2pt; }
  .person .ph-n { margin-left: auto; font-size: 9pt; color: var(--mute);
                  display: flex; gap: 12px; align-items: baseline; font-variant-numeric: tabular-nums; }
  .person .ph-n em { font-style: normal; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .6pt; }
  .person .ph-n strong { font-size: 13pt; color: var(--ink); }
  .empty { font-size: 9pt; color: var(--mute); margin: 6px 0 0; }

  .note { margin-top: 4mm; font-size: 8.5pt; color: var(--ink-2); background: #F7F8F9;
          border-left: 3px solid var(--line); padding: 9px 12px; }
  .slip { margin-top: 4mm; font-size: 8.5pt; color: var(--ink-2); background: #F7F8F9;
          border-left: 3px solid var(--warn); padding: 9px 12px; break-inside: avoid; }
  .slip p { margin: 0; } .slip b { color: var(--ink); }
  .slip .slim { margin-top: 6px; }
  .slip .slim td { border-bottom: 1px solid var(--line); padding: 4px 6px 4px 0; font-size: 8.5pt; }
  .slip .slim tr:last-child td { border-bottom: 0; }
  .note b { color: var(--ink); }
  .foot { margin-top: 8mm; padding-top: 4mm; border-top: 1px solid var(--line);
          font-size: 7.5pt; color: var(--mute); }
  @media print { body { background: #fff; } .page { margin: 0; max-width: none; } }
</style></head>
<body><div class="page">

  <div class="band">
    <div class="wm">TWO BEE</div>
    <h1>Compensi di ${esc(monthLabel(month))}</h1>
    <div class="sub">
      <span>Erogazione del <b>${giorno(w.date)}</b></span>
      <span>Incassi ${w.since ? `dal <b>${giorno(w.since)}</b>` : '<b>da sempre</b>'}
        al <b>${giorno(w.date)}</b></span>
      <span>Generato il ${giorno(today)}${i.autore ? ` da ${esc(i.autore)}` : ''}</span>
    </div>
  </div>

  <div class="pad">
    <div class="verdict">
      <i></i>
      <div>
        <b>${eur2(tot.cash)} da versare${daPagare.length
          ? ` a ${daPagare.length} ${daPagare.length === 1 ? 'persona' : 'persone'}` : ''}</b>
        <p>
          Calcolati sulle <b>fatture incassate</b>${w.since
            ? ` fra il ${giorno(w.since)} e il ${giorno(w.date)}`
            : ` entro il ${giorno(w.date)}`}: ${eur2(tot.total)} di compensi${tot.spent > 0.005
            ? `, meno ${eur2(tot.spent)} già usciti come spesa dai sottoconti o come fattura del socio (§191)`
            : ''}.
          Quello che il cliente non ha ancora pagato <b>non entra in questo foglio e non si
          perde</b>: slitta alla finestra del mese in cui il denaro arriva. Chi ha lavorato ha
          lavorato, ma si eroga quello che è in cassa.
        </p>
      </div>
    </div>

    <h2><i>1</i> Quanto va a ciascuno
      <small>sulle sole fatture incassate: erogato soci e provvigione sono due lavori
      diversi, su due formule diverse</small></h2>
    <table>
      <thead><tr>
        <th>Persona</th>
        <th class="num">Erogato soci</th><th class="num">Provvigione</th>
        <th class="num">Compenso</th><th class="num">Già uscito</th><th class="num">Da versare</th>
        <th>Stato</th>
      </tr></thead>
      <tbody>
        ${people.map(p => `<tr>
          <td><b>${esc(p.who)}</b></td>
          <td class="num">${p.socio > 0.005 ? eur2(p.socio) : '<span class="mute">—</span>'}</td>
          <td class="num">${p.comm > 0.005 ? eur2(p.comm) : '<span class="mute">—</span>'}</td>
          <td class="num">${eur2(p.total)}</td>
          <td class="num">${p.spent > 0.005 ? `<span class="neg">−${eur2(p.spent)}</span>` : '<span class="mute">—</span>'}</td>
          <td class="num">${eur2(p.cash)}</td>
          <td>${p.paid
            ? `<span class="chip ok">pagato${p.paidOn ? ` ${giorno(p.paidOn)}` : ''}</span>`
            : '<span class="chip">da versare</span>'}</td>
        </tr>`).join('')}
        <tr class="total">
          <td>Totale</td>
          <td class="num">${eur2(tot.socio)}</td><td class="num">${eur2(tot.comm)}</td>
          <td class="num">${eur2(tot.total)}</td>
          <td class="num">${tot.spent > 0.005 ? `−${eur2(tot.spent)}` : '—'}</td>
          <td class="num">${eur2(tot.cash)}</td><td></td>
        </tr>
      </tbody>
    </table>
    ${slitta(i.open, 'Non incassate: slittano al mese prossimo',
      'Il compenso di queste righe si eroga quando il cliente paga, nella finestra di quel mese.'
      + ' Non è una quota persa, è una quota rimandata.')}
    ${slitta(i.next, 'Incassate dopo l\'erogazione: entrano nella prossima',
      'Sono già in cassa, ma il denaro è arrivato dopo il ' + giorno(w.date)
      + ': distribuirle adesso vorrebbe dire erogare due volte lo stesso incasso.')}

    <h2><i>2</i> Da cosa viene, riga per riga
      <small>base, quota applicata e motivo: ogni numero qui sopra si apre e torna</small></h2>
    ${people.map(scheda).join('')}

    <h2><i>3</i> Le quote del piano
      <small>quello che il conto economico applica, per controllare le percentuali qui sopra</small></h2>
    <table>
      <thead><tr><th>Voce</th><th class="num">Growth</th><th class="num">Digital</th><th>Base di calcolo</th></tr></thead>
      <tbody>
        <tr><td>Provvigione commerciale</td>
          <td class="num">${pc(plPct.sales(config, 'growth'))}</td>
          <td class="num">${pc(plPct.sales(config, 'digital'))}</td>
          <td class="mute">imponibile sul growth, margine sul digital</td></tr>
        <tr><td>Erogato ai soci</td>
          <td class="num">${pc(config.growth_delivery_pct)}</td>
          <td class="num">${pc(config.digital_partner_pct)} <span class="sub">a ciascun socio</span></td>
          <td class="mute">sul growth si divide fra i soci, sul digital è a testa</td></tr>
        <tr><td>Target costi</td>
          <td class="num">${pc(config.cost_target_pct)}</td>
          <td class="num">${pc(config.digital_cost_target_pct)}</td>
          <td class="mute">la struttura la copre il growth (§206)</td></tr>
        <tr><td>Fondo rischio</td>
          <td class="num">${pc(config.risk_fund_pct)}</td>
          <td class="num">${pc(config.digital_risk_fund_pct)} <span class="sub">solo se attivo sulla riga</span></td>
          <td class="mute">sopra ${eur2(config.digital_risk_threshold)} di progetto, e lo sceglie l'admin (§186)</td></tr>
        <tr><td>Casse TwoBee</td>
          <td class="num">${pc(config.growth_residual_to_company ? plPct.residual(config, 'growth') : 0)}</td>
          <td class="num">${pc(config.digital_company_pct)}</td>
          <td class="mute">quello che resta alla società</td></tr>
      </tbody>
    </table>
    <p class="note">
      <b>Il margine digital si distribuisce per intero</b> (§186): la base non è il ricavo ma il
      ricavo meno i subappalti di quel progetto, perché su un lavoro affidato fuori una parte è già
      di qualcun altro. Una provvigione marcata <b>divisa</b> non cambia la percentuale: cambia a
      chi va (§330).
    </p>

    <div class="foot">
      TWO BEE · compensi di ${esc(monthLabel(month))}, erogazione del ${giorno(w.date)} ·
      documento generato dal conto economico il ${giorno(today)}. I numeri vengono dalle righe di
      ricavo e di costo registrate: non sono digitati, e si ricalcolano da sole se una riga cambia.
    </div>
  </div>
</div></body></html>`
}
