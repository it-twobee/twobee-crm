/**
 * Certificazione di cassa — calcoli puri, nessun I/O. (§226)
 *
 * Una spunta «pagato» è un'opinione finché un movimento non la conferma. Il
 * conto economico ne era pieno: righe spuntate a mano, con la data messa dal
 * backfill della 203 — che è la **scadenza**, non il giorno in cui i soldi si
 * sono mossi. Sul database vero le due cose divergono di settimane: iCura di
 * maggio risultava incassata il 15 maggio e la banca dice 9 giugno, Affinity di
 * giugno risultava incassata il 15 giugno e la banca dice 6 agosto. Ogni
 * divergenza sposta cassa da un mese all'altro, e sposta anche quanto dei
 * compensi quel mese copre.
 *
 * Qui ogni riga prende uno di quattro stati, e la differenza fra il secondo e
 * il terzo è tutto il punto:
 *
 *   · **certificata** — c'è un movimento agganciato e la data combacia. Fatto.
 *   · **da datare**   — il movimento c'è, la data no. Si corregge da sé: il
 *                       giorno lo dice l'estratto conto, non chi ha spuntato.
 *   · **dichiarata**  — spuntata e nessun movimento la conferma. Non vuol dire
 *                       falsa: può essere un conto non caricato o del contante.
 *                       Vuol dire **che nessuno l'ha verificata**, e va scritto
 *                       invece di lasciarla identica a una certificata.
 *   · **smentita**    — non spuntata, ma un movimento la paga. La banca vince.
 *
 * Non si cancella mai una spunta perché manca il movimento: l'assenza di prova
 * non è prova dell'assenza, e sbianchettare l'incasso di un cliente che ha
 * pagato in contanti è un danno peggiore del dubbio. Si dichiara e si conta.
 */

import { shiftMonth } from '@/lib/pl'

export type CertTx = {
  id: string
  booked_on: string
  amount: number
  source: string
  kind: string
  counterparty: string | null
  description: string
  revenue_line_id: string | null
  cost_line_id: string | null
}

export type CertLine = {
  id: string
  side: 'entrata' | 'uscita'
  /** mese di competenza */
  month: string
  label: string
  /** imponibile (entrate) o effettivo (uscite) */
  net: number
  vatRate: number
  paid: boolean
  paid_on: string | null
}

export type CertState = 'certificata' | 'da-datare' | 'dichiarata' | 'smentita' | 'sospetta' | 'consolidata'

export type Cert = {
  lineId: string
  state: CertState
  txId: string | null
  /** la data vera del movimento, quando c'è */
  bookedOn: string | null
  /** quanti giorni separano la data spuntata da quella della banca */
  drift: number
  /** il lordo che la banca ha mosso, contro quello della riga */
  bankAmount: number | null
  gross: number
  /**
   * Datarla dalla banca la sposta in un **altro mese di cassa**. È il caso che
   * conta: uno scarto di tre giorni dentro lo stesso mese non muove nessun
   * totale, uno di tre giorni a cavallo del mese ne muove due.
   */
  movesMonth: boolean
}

export const CERT_LABEL: Record<CertState, string> = {
  certificata: 'certificata dalla banca',
  'da-datare': 'la banca dice un\'altra data',
  dichiarata: 'spuntata, nessun movimento la conferma',
  smentita: 'la banca l\'ha pagata',
  sospetta: 'agganciata a un movimento precedente al suo mese',
  consolidata: 'mese consolidato: non si rincorre',
}

const r2 = (n: number) => Math.round(n * 100) / 100
const days = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/**
 * Lo stato di ogni riga contro l'estratto conto.
 *
 * Contano **solo i movimenti veri** (`source === 'banca'`): un `derivato` nasce
 * dalla spunta che stiamo verificando, e usarlo per certificarla vorrebbe dire
 * far confermare a un'affermazione se stessa.
 */
export function certify(
  lines: CertLine[], txs: CertTx[],
  /**
   * §230 — il consolidato. Prima di questo mese i conti sono chiusi: le spunte
   * che nessun movimento certifica non sono lavoro arretrato, sono un periodo
   * finito — e continuare a segnalarle insegna solo a ignorare le
   * segnalazioni. Vale anche per il personale: i mesi vecchi sono stati
   * preparati con l'organico di **oggi**, quindi contengono persone che allora
   * non erano in forza, e correggerlo a ritroso non serve a nessuno.
   */
  settledFrom?: string | null,
): Map<string, Cert> {
  const real = txs.filter(t => t.source === 'banca')
  const byRev = new Map<string, CertTx>()
  const byCost = new Map<string, CertTx>()
  for (const t of real) {
    if (t.revenue_line_id && !byRev.has(t.revenue_line_id)) byRev.set(t.revenue_line_id, t)
    if (t.cost_line_id && !byCost.has(t.cost_line_id)) byCost.set(t.cost_line_id, t)
  }

  const out = new Map<string, Cert>()
  for (const l of lines) {
    const tx = (l.side === 'entrata' ? byRev : byCost).get(l.id) ?? null
    const booked = tx ? tx.booked_on.slice(0, 10) : null
    const gross = r2(l.net * (1 + l.vatRate))
    /* Un movimento **precedente al mese di competenza** non paga questa riga:
       paga quella del mese in cui è caduto. Sul database vero ce ne sono due —
       la rata di luglio di Josè agganciata a un bonifico del 15 maggio — e sono
       agganci sbagliati fatti a mano su un cliente che paga sempre lo stesso
       importo. Prendere quella data sposterebbe l'incasso di luglio a maggio,
       cioè peggiorerebbe il dato invece di certificarlo: si segnala e non si
       tocca. Un anticipo dentro il mese resta valido, è un pagamento in anticipo. */
    const suspect = !!booked && booked < l.month
    const consolidata = !!settledFrom && l.month < settledFrom
    const state: CertState = consolidata ? 'consolidata' : tx && !suspect
      ? (l.paid ? (l.paid_on === booked ? 'certificata' : 'da-datare') : 'smentita')
      : (l.paid ? (suspect ? 'sospetta' : 'dichiarata') : suspect ? 'sospetta' : 'certificata')

    out.set(l.id, {
      lineId: l.id, state, txId: tx?.id ?? null, bookedOn: booked,
      drift: booked && l.paid_on ? days(l.paid_on, booked) : 0,
      bankAmount: tx ? r2(Math.abs(tx.amount)) : null,
      gross,
      movesMonth: !!booked && (!l.paid_on || l.paid_on.slice(0, 7) !== booked.slice(0, 7)),
    })
  }
  /* Una riga non pagata e senza movimento non è «certificata»: non è ancora
     successo niente. Fuori da qui non la si guarda — ma chiamarla certificata
     sarebbe una bugia comoda, quindi la si toglie. */
  for (const l of lines) {
    if (!l.paid && !out.get(l.id)!.txId) out.delete(l.id)
  }
  return out
}

export type CertSummary = {
  certificate: number
  daDatare: number
  dichiarate: number
  smentite: number
  /** agganci che non possono essere giusti: il movimento precede la competenza */
  sospette: number
  /** §230 — righe di mesi consolidati: non si contano fra quelle da verificare */
  consolidate: number
  /** quanto vale, lordo, quello che nessun movimento conferma */
  dichiarateAmount: number
  /** quanti giorni, in media, sbaglia una data spuntata a mano */
  meanDrift: number
  /** le righe che cambiano **mese di cassa** una volta datate dalla banca */
  moveMonth: number
}

export function certSummary(certs: Cert[]): CertSummary {
  let certificate = 0, daDatare = 0, dichiarate = 0, smentite = 0, sospette = 0, consolidate = 0
  let dichiarateAmount = 0, driftSum = 0, driftN = 0, moveMonth = 0
  for (const c of certs) {
    if (c.state === 'certificata') certificate++
    else if (c.state === 'da-datare') {
      daDatare++
      driftSum += Math.abs(c.drift); driftN++
      if (c.movesMonth) moveMonth++
    } else if (c.state === 'dichiarata') { dichiarate++; dichiarateAmount += c.gross }
    else if (c.state === 'consolidata') consolidate++
    else if (c.state === 'sospetta') sospette++
    else { smentite++; if (c.movesMonth) moveMonth++ }
  }
  return {
    certificate, daDatare, dichiarate, smentite, sospette, consolidate,
    dichiarateAmount: r2(dichiarateAmount),
    meanDrift: driftN ? Math.round(driftSum / driftN) : 0,
    moveMonth,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Compensi: quello che è uscito davvero
// ═══════════════════════════════════════════════════════════════════════════

export type PayoutFact = {
  who: string
  /** uscito dal conto, in totale */
  paid: number
  rows: { id: string; date: string; amount: number; description: string }[]
}

/**
 * Quanto è uscito davvero verso una persona, dall'estratto conto.
 *
 * Il piano compensi dice quanto **spetta**; nessuna riga del conto economico
 * dice quanto è **uscito** — l'erogato non si scrive da nessuna parte, si
 * ricalcola. Finché il confronto non c'è, un socio che non ha mai preso un
 * euro e uno pagato per intero si leggono uguali. Sul database vero: Toto
 * 6.030, Marco 6.165, Walter 11.990, **Antonio Giarletta zero** — e la sua è
 * una provvigione maturata da mesi.
 *
 * L'abbinamento è per **nome**, e non può essere altro: un bonifico a un socio
 * non ha un id di riga da agganciare. Perciò si confronta ogni parola del nome
 * con la controparte e con la descrizione, e si accetta solo un nome intero —
 * «Marco» dentro «marcopolo srl» non è Marco. Un movimento va a **una persona
 * sola**: se due nomi corrispondono, non si sa quale, e indovinare vorrebbe
 * dire dire a qualcuno che è stato pagato quando non lo è stato.
 *
 * **Il nome non basta.** Alla stessa persona si bonifica per ragioni diverse: a
 * Walter sono usciti 3.000 € il 7 agosto che sono il pagamento di una fattura
 * di GAV Sistemi — un giro fra società collegate, fuori dalle statistiche — e
 * contarli come compenso gli avrebbe chiuso uno scoperto che invece esiste.
 * Perciò decide la **classificazione del movimento**: un compenso è un
 * `finanziamento`, e il pagamento di una fattura è un `pagamento`. Se una è
 * classificata male si corregge la categoria in Banca, che è dove le categorie
 * si correggono (§189) — non si aggiunge un'eccezione qui.
 *
 * E un movimento **già agganciato a una riga** di conto economico è il
 * pagamento di quella riga: è già contato una volta, e contarlo di nuovo come
 * compenso lo farebbe uscire due volte dalla stessa cassa.
 */
export const PAYOUT_KINDS = ['finanziamento']

/**
 * §227 — Il compenso di un mese esce nel mese **dopo**, come il costo del
 * lavoro (§224). Non è una convenzione: si eroga quando il mese è finito e si
 * sa quanto ha prodotto, e il conto economico non può dire che il compenso di
 * luglio è in ritardo il 2 luglio.
 */
export const payoutDue = (accrualMonth: string) => shiftMonth(monthOfIso(accrualMonth), 1)

const monthOfIso = (iso: string) => `${iso.slice(0, 7)}-01`

/**
 * §227 — Quello che resta da erogare, mese per mese, dopo aver imputato i
 * bonifici già usciti.
 *
 * L'imputazione è **dal più vecchio** (FIFO): un bonifico paga l'arretrato più
 * antico, non l'ultimo maturato. È l'unico ordine che una persona userebbe, e
 * l'unico che fa emergere un debito che si trascina invece di nasconderlo
 * dietro l'ultimo pagamento.
 *
 * Il residuo di ogni mese si colloca sul mese **dopo**, che è quando è atteso.
 */
export function payoutSchedule(
  accruals: { month: string; amount: number }[],
  paid: number,
): { month: string; amount: number }[] {
  let left = Math.max(0, paid)
  const out: { month: string; amount: number }[] = []
  for (const a of accruals.slice().sort((x, y) => x.month.localeCompare(y.month))) {
    const covered = Math.min(left, a.amount)
    left = r2(left - covered)
    const open = r2(a.amount - covered)
    if (open > 0.005) out.push({ month: payoutDue(a.month), amount: open })
  }
  return out
}

export function payoutsFromBank(
  txs: CertTx[],
  people: { key: string; label: string; names: string[]; aliases?: string[] }[],
  kinds: string[] = PAYOUT_KINDS,
  /** §227 — si guardano solo i bonifici da qui in avanti: prima è liquidato */
  since?: string,
  /**
   * §305 — i movimenti che il **registro** (§297) dice essere compensi, con
   * quanto di ognuno lo è. Vincono sulla categoria, e non è un raffinamento:
   * `classify` etichetta `finanziamento` i bonifici ai soci di giugno e
   * `pagamento` quelli del 13 agosto, perché legge la descrizione e quelle due
   * frasi sono scritte diversamente. Filtrare per categoria perdeva metà dei
   * casi — a Marco 3.412 € usciti e «erogato 0» — e un erogato a zero su chi è
   * stato pagato è la stessa bugia di uno zero su chi non lo è stato.
   *
   * Porta anche **a chi**, e questo chiude il caso gemello: il bonifico a Toto
   * dice «salvatore piacente» e il piano compensi lo chiama «Toto», quindi il
   * nome non lo trovava. Il registro non ha bisogno di indovinarlo — l'ha già
   * scritto qualcuno guardando (§244: si ritrova per nome, non per chiave).
   */
  allocated?: Map<string, { who: string; amount: number }[]>,
): Map<string, PayoutFact> {
  const out = new Map<string, PayoutFact>(
    people.map(p => [p.key, { who: p.label, paid: 0, rows: [] }]))

  const words = (s: string) => s.toLowerCase().split(/[^a-zà-ù]+/).filter(Boolean)

  const norm = (x: string) => x.trim().toLowerCase()
  /* §244 — una persona ha **più nomi**: `mergePeople` fonde «Marco» socio e
     «Marco Lucci» commerciale in una sola, e `pl_payouts` scrive la quota col
     primo e la provvigione col secondo. Confrontare la sola etichetta faceva
     cadere metà del bonifico — a Marco 442 € invece di 3.412. */
  const byLabel = new Map<string, string>()
  for (const p of people) {
    for (const nm of [p.label, ...(p.aliases ?? p.names)]) byLabel.set(norm(nm), p.key)
  }

  for (const t of txs) {
    if (t.source !== 'banca' || t.amount >= 0) continue
    if (since && t.booked_on.slice(0, 10) < since) continue

    /* Dove il registro parla, non si indovina niente: dice quale movimento paga
       quale compenso e per quanto, e lo ha scritto una persona guardandolo. */
    const daRegistro = allocated?.get(t.id)
    if (daRegistro?.length) {
      for (const q of daRegistro) {
        const key = byLabel.get(norm(q.who))
        if (!key) continue
        const f = out.get(key)!
        f.paid = r2(f.paid + q.amount)
        f.rows.push({
          id: t.id, date: t.booked_on.slice(0, 10),
          amount: r2(q.amount), description: t.description.slice(0, 90),
        })
      }
      continue
    }

    if (!kinds.includes(t.kind)) continue
    if (t.revenue_line_id || t.cost_line_id) continue
    const hay = new Set([...words(t.counterparty ?? ''), ...words(t.description)])
    const hits = people.filter(p => p.names.some(nm => words(nm).every(w => hay.has(w))))
    // due nomi che corrispondono = non si sa quale: meglio nessuno di quello sbagliato
    if (hits.length !== 1) continue
    /* Il ripiego di quando il registro non dice niente: l'importo intero al
       nome che corrisponde. È come funzionava prima della 214. */
    const f = out.get(hits[0].key)!
    f.paid = r2(f.paid + Math.abs(t.amount))
    f.rows.push({
      id: t.id, date: t.booked_on.slice(0, 10),
      amount: r2(Math.abs(t.amount)), description: t.description.slice(0, 90),
    })
  }
  Array.from(out.values()).forEach((f: PayoutFact) => f.rows.sort((a, b) => a.date.localeCompare(b.date)))
  return out
}

/**
 * Chi sono le persone da pagare, senza contarne una due volte.
 *
 * Un socio che è anche commerciale è **una persona sola**: Walter Giacobbe
 * prende l'erogato come socio e la provvigione come commerciale, e li riceve
 * sullo stesso conto. Tenerli separati faceva due danni insieme — il dovuto si
 * spezzava in due voci, e nessuna delle due trovava il bonifico, perché due
 * nomi corrispondevano allo stesso movimento e l'abbinamento si rifiutava
 * (giustamente) di indovinare quale.
 *
 * L'unione è sul **nome di battesimo**, che è l'unica cosa che i due elenchi
 * hanno in comune: `pl_partners` scrive «Walter», l'anagrafica «Walter
 * Giacobbe». Vince il nome completo, perché è quello che sta sul bonifico.
 */
export function mergePeople(
  partners: { id: string; label: string }[],
  owners: string[],
): {
  key: string; label: string; names: string[]; partnerId: string | null
  /**
   * §305 — **tutti i nomi con cui questa persona compare nel tool**: «Marco» in
   * `pl_partners` e «Marco Lucci» in anagrafica sono la stessa, e `pl_payouts`
   * scrive la quota col primo e la provvigione col secondo. Serve a ritrovarla
   * nel registro delle allocazioni.
   *
   * Sono tenuti **separati da `names`** di proposito: quelli si cercano nella
   * descrizione di un bonifico, e allargarli a un nome di battesimo solo
   * («marco») farebbe corrispondere qualunque bonifico che lo contenga. Due
   * lavori diversi, due liste.
   */
  aliases: string[]
}[] {
  const norm = (s: string) => s.toLowerCase().split(/[^a-zà-ù]+/).filter(Boolean)
  const out = partners.map(p => {
    const first = norm(p.label)[0]
    const full = owners.find(o => norm(o).includes(first))
    const label = full ?? p.label
    return {
      key: `p:${p.id}`, label, names: [label], partnerId: p.id as string | null,
      aliases: Array.from(new Set([label, p.label])),
    }
  })
  for (const o of owners) {
    if (out.some(p => p.label === o)) continue
    out.push({ key: `o:${o}`, label: o, names: [o], partnerId: null, aliases: [o] })
  }
  return out
}

export type PayoutView = {
  who: string
  /** la chiave della persona: serve a riagganciarla alle quote del mese */
  key: string
  /** se è un socio, il suo id in `pl_partners`. I commerciali puri non ne hanno */
  partnerId: string | null
  /**
   * §228 — da quale mese si conta **per lui**. La linea generale
   * (`pl_config.settled_from`) dice fino a quando è tutto liquidato, ma una
   * liquidazione è un fatto **per persona**: chi non ha mai ricevuto un
   * bonifico non ha niente di liquidato, e per lui si conta da sempre.
   */
  from: string | null
  /** perché parte da lì: c'è una liquidazione alle spalle, o non c'è mai stata */
  whyFrom: 'liquidato' | 'mai-pagato'
  /** quello che resta, collocato sul mese in cui è atteso */
  schedule: { month: string; amount: number }[]
  /** maturato secondo il piano compensi */
  due: number
  /** uscito dal conto */
  paid: number
  /** quello che non gli è ancora arrivato. Negativo = ha preso più del maturato */
  open: number
  rows: PayoutFact['rows']
  /** §311 — il maturato: tutto quello che ha prodotto, incassato o no */
  accrued: number
  /** §311 — il credito vero: maturato meno quello che gli è uscito */
  owed: number
  /** non ha mai ricevuto niente e qualcosa gli spetta */
  never: boolean
}

/**
 * Il registro dei compensi: maturato contro erogato, persona per persona.
 *
 * §228 — **la liquidazione è un fatto per persona, non una data per tutti.**
 * `from` dice fino a quando i conti sono chiusi, ed è vero per chi è stato
 * pagato: i tre soci hanno bonifici in banca fino a giugno, quindi da luglio
 * si riparte da zero. Antonio Giarletta non ha **mai** ricevuto un bonifico —
 * e a chi non ha mai preso niente non si può dire che fino a giugno è a posto:
 * per lui si conta da sempre, e la riga scrive perché.
 *
 * La regola sbaglia solo in una direzione, ed è quella giusta: se qualcuno è
 * stato pagato in contanti senza passare dal conto, gli si mostra uno scoperto
 * che non ha. È un allarme falso, non una rassicurazione falsa — e si spegne
 * registrando il movimento, che è la cosa che andava fatta comunque.
 */
export function payoutLedger(input: {
  people: { key: string; label: string }[]
  /**
   * **Quello che si può erogare**, per persona e per mese: sono gli importi già
   * passati per la finestra dell'erogazione (§286), non il maturato secco. Il
   * commento diceva «maturato» e non lo era, ed è da lì che veniva il numero
   * sbagliato: ad Antonio Giarletta spettano 1.821 € e il tool ne dichiarava
   * 284 — l'erogabile — sotto la parola «maturato» (§311).
   */
  accruals: { key: string; month: string; amount: number }[]
  /**
   * §311 — il **maturato vero**: tutto quello che quella persona ha prodotto,
   * incassato o no. È il numero che risponde a «quanto gli spetta», e senza di
   * esso l'unica cifra visibile era l'erogabile: a chi ha lavorato e aspetta che
   * il cliente paghi, il tool diceva un ottavo del suo credito.
   *
   * Assente, `accrued` vale `due` e niente cambia: è come funzionava prima.
   */
  matured?: { key: string; month: string; amount: number }[]
  /** i bonifici veri, **senza** filtro di data: la data la decide qui */
  facts: Map<string, PayoutFact>
  /** la linea generale: prima è liquidato. `null` = si conta da sempre */
  from: string | null
}): PayoutView[] {
  return input.people.map(p => {
    const f = input.facts.get(p.key)
    const everPaid = (f?.rows.length ?? 0) > 0
    /* Chi non ha mai preso niente non ha una liquidazione alle spalle: la linea
       generale non lo riguarda, e applicargliela cancellerebbe un arretrato
       vero — che è il modo in cui un compenso resta fermo per mesi. */
    const from = everPaid ? input.from : null
    const since = from ? shiftMonth(from, 1) : null

    const mine = input.accruals
      .filter(a => a.key === p.key && (!from || monthOfIso(a.month) >= from))
      .map(a => ({ month: monthOfIso(a.month), amount: a.amount }))
    const rows = (f?.rows ?? []).filter(r => !since || r.date >= since)
    const due = r2(mine.reduce((n, a) => n + a.amount, 0))
    const paid = r2(rows.reduce((n, r) => n + r.amount, 0))
    /* Lo stesso taglio della liquidazione: quello che è stato pagato prima della
       linea non torna a essere dovuto perché qui si guarda il maturato. */
    const accrued = input.matured
      ? r2(input.matured
          .filter(a => a.key === p.key && (!from || monthOfIso(a.month) >= from))
          .reduce((n, a) => n + a.amount, 0))
      : due

    return {
      who: p.label, key: p.key, partnerId: p.key.startsWith('p:') ? p.key.slice(2) : null,
      from, whyFrom: (everPaid ? 'liquidato' : 'mai-pagato') as PayoutView['whyFrom'],
      schedule: payoutSchedule(mine, paid),
      due, paid, open: r2(due - paid), rows,
      /* §311 — quanto gli spetta in tutto, e quanto di quello resta da erogare.
         `open` resta la differenza sull'**erogabile**, perché è quella che dice
         cosa si può bonificare adesso; `owed` è il credito vero della persona. */
      accrued, owed: r2(accrued - paid),
      /* §233 — «mai un bonifico» guarda **tutti** i movimenti, non quelli dentro
         la finestra. Con il consolidato a luglio i bonifici di giugno restano
         fuori dal conteggio, e `paid === 0` diceva che Marco non aveva mai
         ricevuto niente: ne ha ricevuti 6.165 €, e quelli hanno chiuso i mesi
         prima della linea. È la differenza fra «pagato fin qui» e «mai pagato»,
         ed è esattamente la distinzione per cui la finestra esiste (§228). */
      never: !everPaid && due > 0,
    }
  }).sort((a, b) => b.open - a.open)
}

/** Il confronto, per socio e per commerciale, con lo scoperto in evidenza. */
export function payoutViews(
  due: { key: string; label: string; amount: number }[],
  facts: Map<string, PayoutFact>,
): PayoutView[] {
  return due.map(d => {
    const f = facts.get(d.key)
    const paid = f?.paid ?? 0
    return {
      who: d.label, key: d.key, partnerId: d.key.startsWith('p:') ? d.key.slice(2) : null,
      from: null, whyFrom: 'liquidato' as const, schedule: [],
      due: r2(d.amount), paid,
      open: r2(d.amount - paid), rows: f?.rows ?? [],
      accrued: r2(d.amount), owed: r2(d.amount - paid),
      never: paid === 0 && d.amount > 0,
    }
  }).sort((a, b) => b.open - a.open)
}
