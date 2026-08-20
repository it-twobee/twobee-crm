/**
 * Dal conto economico al saldo in banca — calcoli puri, nessun I/O.
 *
 * Sono due letture della stessa azienda e non possono coincidere per definizione:
 * il conto economico è **competenza** (quando il lavoro è stato fatto), la banca è
 * **cassa** (quando i soldi si sono mossi). Ma la differenza fra i due non è un
 * mistero: è una lista di poste, e se la lista è completa il residuo è zero.
 *
 * Le poste, in ordine di quanto pesano:
 *
 *   · **IVA** — la banca vede il lordo, il conto economico l'imponibile. L'IVA
 *     incassata entra in banca e non è ricavo di nessuno: è un debito.
 *   · **crediti** — fatturato non incassato: competenza sì, cassa non ancora.
 *   · **debiti** — costi registrati e non pagati: lo stesso al contrario.
 *   · **soci** — conferimenti in entrata ed erogato in uscita. Non sono né ricavo
 *     né costo: sono capitale e distribuzione, e la banca li vede entrambi.
 *   · **imposte e F24** — escono dal conto e la loro competenza sta già dentro il
 *     costo del lavoro: contarli due volte è l'errore classico.
 *   · **oneri bancari** — piccoli e sempre dimenticati.
 *
 * Quello che resta dopo aver tolto tutto è il **residuo non spiegato**: se non è
 * zero, c'è un movimento che nessuno ha classificato o una spunta «incassato» su
 * una fattura che nessuno ha pagato. È il numero che rende questa vista utile.
 */

export type BridgeMonth = {
  month: string
  /** competenza: quello che il conto economico dice */
  accrued: number
  collected: number
  vat: number
  costs: number
  costsPaid: number
  /** IVA sulle righe di costo **pagate**: è quella uscita dal conto */
  costsVatPaid: number
  /**
   * Quello che il piano compensi destina ai soci e ai commerciali: il
   * **maturato**, e non è una scelta di stile — è vincolato dall'identità.
   * `companyPlan` è `maturato − distribuito − costi`, quindi la posta del ponte
   * deve rimettere esattamente `distribuito − uscito`. Metterci un numero
   * diverso — per esempio quello **erogabile** adesso (§286) — sposta il residuo
   * della differenza e lo fa smettere di significare qualcosa.
   */
  distributed: number
  /** cassa TwoBee del piano: quello che resta secondo la ripartizione */
  companyPlan: number
}

export type BridgeTx = {
  booked_on: string
  amount: number
  kind: string
  source: string
}

export type BridgeRow = {
  month: string
  /** competenza */
  accrued: number
  costs: number
  companyPlan: number
  /** cassa vera del mese, dalla banca */
  cashIn: number
  cashOut: number
  cashNet: number
  /** cumulati: è la domanda vera, «quanto ne è rimasto» */
  cumPlan: number
  cumCash: number
}

export type CashBridge = {
  rows: BridgeRow[]
  /** saldo di partenza dei conti */
  opening: number
  /** saldo vero: apertura più tutti i movimenti della banca */
  balance: number
  /** cassa cumulata secondo il piano compensi */
  planCum: number
  /** le poste che spiegano la differenza fra i due */
  items: { label: string; amount: number; why: string }[]
  /** quello che nessuna posta spiega: deve essere zero */
  residual: number
  /**
   * §286 — il debito verso soci e commerciali, diviso in due: quello che si può
   * erogare adesso e quello che diventa erogabile quando i clienti pagano.
   * Le due parti sommano al debito totale, che è la posta del ponte.
   */
  payouts: { owed: number; paid: number; payableNow: number; later: number }
}

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0))

/**
 * Il ponte, mese per mese e in totale.
 *
 * `kinds` classifica i movimenti della banca: `finanziamento` sono i soci,
 * `imposta` il fisco, `commissione` gli oneri. Tutto il resto è incasso o
 * pagamento, e si confronta col conto economico.
 */
export function cashBridge(
  months: BridgeMonth[],
  txs: BridgeTx[],
  opening: number,
  opts: {
    /**
     * §286 — quanto del dovuto è **erogabile adesso**: le finestre già aperte,
     * al netto dei bonifici già usciti. Il ponte non lo calcola — quella regola
     * ha il consolidato (§230) e il caso di chi non ha mai preso un euro (§228)
     * dentro, e vive in `payoutLedger`. Qui si **mostra**, perché senza,
     * «compensi maturati e non pagati» e «da erogare» sono due numeri con lo
     * stesso nome in due schermate. Assente = non si mostra la ripartizione.
     */
    payableNow?: number
  } = {},
): CashBridge {
  /* Solo i movimenti veri della banca: un movimento «dichiarato» nasce da una
     spunta e non è passato da nessun conto — contarlo qui farebbe tornare il
     ponte proprio grazie a quello che il ponte dovrebbe verificare. */
  const real = txs.filter(t => t.source === 'banca' && t.kind !== 'giroconto')
  const inMonth = (m: string) => real.filter(t => t.booked_on.slice(0, 7) === m.slice(0, 7))

  const ordered = months.slice().sort((a, b) => a.month.localeCompare(b.month))
  let cumPlan = 0
  let cumCash = 0
  const rows: BridgeRow[] = ordered.map(m => {
    const own = inMonth(m.month)
    const cashIn = sum(own.filter(t => t.amount > 0).map(t => t.amount))
    const cashOut = Math.abs(sum(own.filter(t => t.amount < 0).map(t => t.amount)))
    const cashNet = r2(cashIn - cashOut)
    cumPlan = r2(cumPlan + m.companyPlan)
    cumCash = r2(cumCash + cashNet)
    return {
      month: m.month, accrued: m.accrued, costs: m.costs, companyPlan: m.companyPlan,
      cashIn, cashOut, cashNet, cumPlan, cumCash,
    }
  })

  /* ── le poste del ponte ──────────────────────────────────────────────────
     L'identità è esatta, non approssimata:

       cassa = piano + IVA incassata − IVA pagata − crediti + debiti
             + (compensi maturati − erogato pagato) + conferimenti
             − imposte − oneri + apertura

     Si dimostra sostituendo `piano = maturato − distribuito − costi` e
     `cassa = incassato lordo − pagato lordo − erogato − imposte − oneri +
     conferimenti`: tutto si cancella. Perciò un **residuo diverso da zero non è
     un arrotondamento**: è un movimento in banca che nessuna riga di costo
     pagata giustifica, o una spunta «pagato» su qualcosa che non è uscito. */
  const vatCollected = sum(months.map(m => (m.accrued > 0 ? m.vat * (m.collected / m.accrued) : 0)))
  const vatPaid = sum(months.map(m => m.costsVatPaid))
  const credits = sum(months.map(m => m.accrued - m.collected))
  const debts = sum(months.map(m => m.costs - m.costsPaid))
  const distributed = sum(months.map(m => m.distributed))
  const partnersIn = sum(real.filter(t => t.kind === 'finanziamento' && t.amount > 0).map(t => t.amount))
  const partnersOut = Math.abs(sum(real.filter(t => t.kind === 'finanziamento' && t.amount < 0).map(t => t.amount)))
  const taxes = Math.abs(sum(real.filter(t => t.kind === 'imposta' && t.amount < 0).map(t => t.amount)))
  const fees = Math.abs(sum(real.filter(t => t.kind === 'commissione' && t.amount < 0).map(t => t.amount)))

  const balance = r2(opening + sum(real.map(t => t.amount)))
  const planCum = cumPlan

  const items = [
    { label: 'IVA incassata', amount: vatCollected,
      why: 'La banca vede il lordo, il conto economico l\'imponibile: l\'IVA è entrata e non è ricavo, è un debito.' },
    { label: 'IVA pagata sui costi', amount: -vatPaid,
      why: 'Uscita dal conto insieme al costo, e recuperabile in liquidazione: qui è cassa, non margine.' },
    { label: 'Crediti non incassati', amount: -credits,
      why: 'Fatturato che vale per competenza e in banca non è ancora arrivato.' },
    { label: 'Debiti non pagati', amount: debts,
      why: 'Costi registrati e non ancora usciti dal conto: la cassa è più alta del margine.' },
    { label: 'Compensi maturati e non pagati', amount: r2(distributed - partnersOut),
      why: 'Il piano li destina, la banca vede solo quelli usciti. La differenza è quello che i soci e i '
        + 'commerciali devono ancora ricevere — **tutto** il dovuto, non la parte erogabile adesso: '
        + 'quella la dice la finestra (§286), e qui l\'identità vuole il maturato perché è quello che '
        + '`companyPlan` ha già tolto.' },
    { label: 'Conferimenti dei soci', amount: partnersIn,
      why: 'Capitale versato: entra in banca e non è ricavo di nessuno.' },
    { label: 'Imposte e F24', amount: -taxes,
      why: 'Uscite di cassa la cui competenza sta già dentro il costo del lavoro.' },
    { label: 'Oneri bancari', amount: -fees,
      why: 'Commissioni, bolli, carte: piccoli e sempre dimenticati.' },
    { label: 'Saldo di apertura', amount: opening,
      why: 'Quello che c\'era sui conti prima del primo movimento registrato.' },
  ].filter(i => Math.abs(i.amount) >= 0.01)

  const spiegato = r2(planCum + sum(items.map(i => i.amount)))

  /* §286 — la stessa cifra letta in due tempi. Il **debito** è il maturato meno
     quello che è uscito, ed è la posta del ponte. Quanto se ne può erogare
     adesso lo decide la finestra: il resto non sparisce, diventa erogabile
     quando il cliente paga — ed è la differenza fra «devo 21.000» e «ne bonifico
     11.700 il venti». Se nessun mese porta `payable`, la ripartizione non si
     inventa: dice zero e la lettura resta quella di prima. */
  const owed = r2(distributed - partnersOut)
  const payableNow = r2(Math.max(0, Math.min(owed, opts.payableNow ?? 0)))

  return {
    rows, opening, balance, planCum, items,
    residual: r2(balance - spiegato),
    payouts: {
      owed, paid: partnersOut, payableNow,
      later: r2(Math.max(0, owed - payableNow)),
    },
  }
}
