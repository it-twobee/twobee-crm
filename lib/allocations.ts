/**
 * Quanto di questo movimento paga quale riga. (§297)
 *
 * Per tutta la vita del tool il legame fra il conto corrente e il conto
 * economico è stato **un campo**: `bank_transactions.cost_line_id`, e il suo
 * gemello per le entrate. Un movimento, una riga. Regge finché il mondo è fatto
 * così, e il mondo non è fatto così:
 *
 *   · un bonifico paga **due fatture** dello stesso fornitore — «Affinity
 *     (2 addebiti)», 5.100 €, che sono l'acconto Seven e l'acconto ISF;
 *   · una distinta paga **tre stipendi** — Michele, Sabrina e Agostino, 4.077 €
 *     in una riga sola sull'estratto conto;
 *   · una fattura si paga con **due bonifici**, o si paga a metà: Affinity il
 *     23 luglio ha incassato 2.100 su 2.562, cioè l'imponibile e non l'IVA;
 *   · un compenso è **due cose insieme**: a Marco a luglio sono usciti 3.412 €,
 *     che sono 3.191,12 di quota socio più 220,88 di provvigione — la sua,
 *     divisa a metà con Toto. E la stessa provvigione risulta quindi pagata da
 *     **due** bonifici, uno a testa.
 *
 * Con un campo solo, ognuno di questi casi ha una sola uscita: non agganciare
 * niente. Ed è quello che è successo — il ponte fra conto economico e saldo
 * (§199) non quadra per −6.029 €, e quasi tutto sta in tre bonifici cumulativi
 * che nessuno ha potuto spiegare.
 *
 * Qui l'unità non è il legame, è **l'euro allocato**: un movimento ne ha N, una
 * riga ne ha N, e ogni allocazione dice quanto e su cosa. Da qui in poi le
 * domande hanno una risposta sola — «quanto di questo bonifico è spiegato»,
 * «quanto di questa riga è coperto», «cosa resta da riconciliare».
 *
 * Due invarianti, e nessuna delle due è cosmetica:
 *
 *   1. **Non si alloca più di quello che il movimento contiene.** Sforare vuol
 *      dire che due righe si stanno dividendo denaro che non è passato, e da lì
 *      il saldo del tool smette di essere il saldo della banca.
 *   2. **Il verso lo decide la riga, non il segno.** L'importo allocato è
 *      sempre positivo e sempre **lordo**: dal conto passa il totale della
 *      fattura, la riga di conto economico è imponibile, e lo scorporo si fa
 *      dove serve (§296), non qui.
 */

const r2 = (n: number) => Math.round(n * 100) / 100

/** Su cosa può atterrare un euro. L'F24 arriverà con la sua sezione. */
export type AllocTarget = 'ricavo' | 'costo' | 'compenso'

export type Allocation = {
  id: string
  txId: string
  target: AllocTarget
  targetId: string
  /** lordo, sempre positivo: il verso lo dice il target */
  amount: number
  /** un movimento vero la certifica; una spunta la dichiara soltanto (§226) */
  evidence: 'certificata' | 'dichiarata'
}

export type AllocTx = {
  id: string
  amount: number
  source: string
}

export type Coverage = {
  /** quanto vale in totale la cosa da coprire, al lordo */
  gross: number
  allocated: number
  remaining: number
  state: 'scoperto' | 'parziale' | 'coperto' | 'eccedente'
  /** quanto è coperto da un movimento vero, non da una dichiarazione */
  certified: number
}

const TOL = 0.01

function stateOf(gross: number, allocated: number): Coverage['state'] {
  if (allocated <= TOL) return 'scoperto'
  if (allocated > gross + TOL) return 'eccedente'
  if (allocated >= gross - TOL) return 'coperto'
  return 'parziale'
}

const coverage = (gross: number, allocs: Allocation[]): Coverage => {
  const allocated = r2(allocs.reduce((s, a) => s + a.amount, 0))
  return {
    gross: r2(gross),
    allocated,
    remaining: r2(Math.max(0, gross - allocated)),
    state: stateOf(r2(gross), allocated),
    certified: r2(allocs.filter(a => a.evidence === 'certificata').reduce((s, a) => s + a.amount, 0)),
  }
}

/**
 * Quanto di un movimento è spiegato.
 *
 * `eccedente` non è un errore da nascondere: capita quando due persone allocano
 * lo stesso bonifico nello stesso momento, o quando si aggancia una riga
 * sbagliata. Va **visto**, perché è la sola forma in cui il ledger può mentire
 * al saldo.
 */
export const txCoverage = (tx: AllocTx, allocs: Allocation[]): Coverage =>
  coverage(Math.abs(tx.amount), allocs.filter(a => a.txId === tx.id))

/** Quanto di una riga (o di un compenso) è stato pagato davvero. */
export const targetCoverage = (
  gross: number, target: AllocTarget, targetId: string, allocs: Allocation[],
): Coverage =>
  coverage(gross, allocs.filter(a => a.target === target && a.targetId === targetId))

/**
 * Quanto si può ancora allocare da questo movimento.
 *
 * È il numero che l'interfaccia deve mostrare **mentre** si sceglie: senza, si
 * scopre di aver sforato solo premendo, e a quel punto si è già deciso.
 */
export const freeOn = (tx: AllocTx, allocs: Allocation[]): number =>
  txCoverage(tx, allocs).remaining

export type AllocDraft = { target: AllocTarget; targetId: string; amount: number }

export type Validation =
  | { ok: true; total: number; leftover: number }
  | { ok: false; why: string }

/**
 * Si può scrivere questa allocazione?
 *
 * L'ordine dei rifiuti è quello che serve a chi sta davanti allo schermo: prima
 * quello che rende l'operazione impossibile, poi quello che la rende sbagliata.
 */
export function validate(tx: AllocTx, esistenti: Allocation[], drafts: AllocDraft[]): Validation {
  if (!drafts.length) return { ok: false, why: 'Non hai scelto niente da pagare con questo movimento.' }

  const negativa = drafts.find(d => d.amount <= 0)
  if (negativa) {
    return {
      ok: false,
      why: 'Un importo allocato è zero o negativo. Il verso lo decide la riga: '
        + 'qui si scrive quanto di quel movimento le appartiene, sempre in positivo.',
    }
  }

  const doppia = drafts.find((d, i) =>
    drafts.findIndex(x => x.target === d.target && x.targetId === d.targetId) !== i)
  if (doppia) {
    return {
      ok: false,
      why: 'La stessa riga compare due volte: sommale in una allocazione sola, '
        + 'o il conteggio di quanto è coperto diventa illeggibile.',
    }
  }

  const total = r2(drafts.reduce((s, d) => s + d.amount, 0))
  const libero = freeOn(tx, esistenti)
  if (total > libero + TOL) {
    return {
      ok: false,
      why: `Stai allocando ${total.toFixed(2)} € su un movimento che ne ha ancora `
        + `${libero.toFixed(2)} da spiegare. Due righe non possono dividersi denaro `
        + 'che dal conto non è passato.',
    }
  }

  return { ok: true, total, leftover: r2(libero - total) }
}

/**
 * L'evidenza che un'allocazione porta, decisa dalla sorgente del movimento.
 *
 * `banca` e `manuale` sono **fatti** — l'estratto conto e il contante (§195);
 * `derivato` nasce da una spunta e non è passato da nessuna parte, quindi non
 * può certificare la spunta da cui nasce (§226).
 */
export const evidenceOf = (tx: AllocTx): Allocation['evidence'] =>
  tx.source === 'banca' || tx.source === 'manuale' ? 'certificata' : 'dichiarata'

export type Candidate = {
  target: AllocTarget
  targetId: string
  label: string
  /** il lordo ancora scoperto di quella riga */
  remaining: number
}

/**
 * La proposta: come si spartisce questo movimento fra le righe scelte.
 *
 * Dal più vecchio al più recente **non** è l'ordine giusto qui — lo è per i
 * compensi (§227, FIFO), non per un bonifico che paga due fatture, dove
 * l'ordine naturale è quello in cui le righe sono state scelte. Quindi si
 * riempie in sequenza: ognuna prende il suo scoperto finché il movimento tiene,
 * e l'ultima prende quello che resta.
 *
 * Se avanza, **avanza e si vede**: inventare una destinazione per far tornare
 * il conto è esattamente il modo in cui un ledger smette di servire.
 */
export function propose(tx: AllocTx, esistenti: Allocation[], scelte: Candidate[]): {
  drafts: AllocDraft[]
  leftover: number
  /** righe che restano scoperte perché il movimento non basta */
  short: { targetId: string; label: string; missing: number }[]
} {
  let libero = freeOn(tx, esistenti)
  const drafts: AllocDraft[] = []
  const short: { targetId: string; label: string; missing: number }[] = []

  for (const c of scelte) {
    if (libero <= TOL) {
      if (c.remaining > TOL) short.push({ targetId: c.targetId, label: c.label, missing: r2(c.remaining) })
      continue
    }
    const quota = r2(Math.min(c.remaining, libero))
    if (quota > TOL) {
      drafts.push({ target: c.target, targetId: c.targetId, amount: quota })
      libero = r2(libero - quota)
    }
    if (c.remaining - quota > TOL) {
      short.push({ targetId: c.targetId, label: c.label, missing: r2(c.remaining - quota) })
    }
  }

  return { drafts, leftover: r2(libero), short }
}

/**
 * Le allocazioni **dichiarate** che un fatto rende superflue. (§300)
 *
 * È la regola di §189 portata nel registro: quando un movimento vero conferma
 * una riga, la dichiarazione che la copriva si spegne — o la riga risulta pagata
 * due volte, una dalla spunta e una dalla banca. Il trigger `bank_on_match` lo
 * faceva già per il legame diretto; il ledger nasceva senza, e sulle righe del
 * personale il conto arrivava a 7.945 € su 4.077 dovuti.
 *
 * Si spengono **solo** quelle dello stesso target, e solo se quello che arriva è
 * certificato: una dichiarazione non ne scaccia un'altra, o si perderebbe
 * l'unica traccia di un pagamento che nessuno ha ancora dimostrato.
 */
export function superseded(esistenti: Allocation[], fresh: AllocDraft[]): Allocation[] {
  const colpiti = new Set(fresh.map(d => `${d.target}|${d.targetId}`))
  return esistenti.filter(a =>
    a.evidence === 'dichiarata' && colpiti.has(`${a.target}|${a.targetId}`))
}

export type LedgerFinding = {
  id: string
  severity: 'critico' | 'attenzione'
  title: string
  detail: string
}

/**
 * Cosa non torna nel registro.
 *
 * Un ledger che non si controlla da solo è un secondo posto dove sbagliare. Qui
 * ci sono le due cose che non devono mai succedere e la terza che va vista.
 */
export function findings(
  txs: AllocTx[],
  allocs: Allocation[],
  grossOf: (target: AllocTarget, id: string) => number | null,
): LedgerFinding[] {
  const out: LedgerFinding[] = []

  for (const tx of txs) {
    const c = txCoverage(tx, allocs)
    if (c.state === 'eccedente') {
      out.push({
        id: `over:${tx.id}`,
        severity: 'critico',
        title: `Allocati ${c.allocated.toFixed(2)} € su un movimento da ${c.gross.toFixed(2)}`,
        detail: 'Due righe si stanno dividendo denaro che dal conto non è passato. '
          + 'Finché resta, il saldo del tool non è il saldo della banca.',
      })
    }
  }

  const perTarget = new Map<string, Allocation[]>()
  for (const a of allocs) {
    const k = `${a.target}|${a.targetId}`
    perTarget.set(k, [...(perTarget.get(k) ?? []), a])
  }
  for (const [k, list] of Array.from(perTarget.entries())) {
    const [target, id] = k.split('|') as [AllocTarget, string]
    const gross = grossOf(target, id)
    if (gross == null) {
      out.push({
        id: `orfana:${k}`,
        severity: 'critico',
        title: 'Allocazione su una riga che non esiste più',
        detail: 'La riga è stata cancellata e i suoi euro sono rimasti attaccati a un movimento. '
          + 'Vanno tolti, o quel movimento risulta spiegato da qualcosa che non c\'è.',
      })
      continue
    }
    const c = coverage(gross, list)
    if (c.state === 'eccedente') {
      out.push({
        id: `pagata-troppo:${k}`,
        severity: 'attenzione',
        title: `Coperta per ${c.allocated.toFixed(2)} € su ${c.gross.toFixed(2)} dovuti`,
        detail: 'È uscito più di quanto la riga chiedeva: o l\'importo è sbagliato, '
          + 'o parte di quel bonifico paga qualcos\'altro.',
      })
    }
  }

  return out
}
