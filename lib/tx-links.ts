/**
 * Allocazioni fra movimenti e righe — calcoli puri, nessun I/O. (§258)
 *
 * Il legame fra un movimento e una riga era una colonna sola, e va bene nel caso
 * semplice: un bonifico, una fattura. Sui dati veri quel caso è la minoranza —
 * iCura paga due mensilità in un bonifico da 8.784 €, Fatima Leo growth e
 * marketing in uno da 3.812,50, e ventisei addebiti Meta stanno su una riga sola.
 *
 * Qui il legame porta **l'importo allocato**, e senza quello la tabella direbbe
 * solo «questi due si conoscono»: 8.784 € su due righe non sono 8.784 € su
 * ciascuna. Da questo modulo escono le due domande che contano — quanto di una
 * riga è coperto, e quanto di un movimento è già stato distribuito — più il
 * suggerimento di come spalmarlo, che è la parte che fa risparmiare i clic.
 */

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0))

/** La tolleranza: un centesimo. Gli arrotondamenti dell'IVA vivono lì dentro. */
export const CENT = 0.01

export type Alloc = {
  txId: string
  lineId: string
  amount: number
}

export type Coverage = {
  lineId: string
  /** il lordo che la riga deve vedere passare dal conto */
  gross: number
  /** quanto ci è arrivato, sommando le allocazioni */
  covered: number
  /** quello che manca. Negativo = è arrivato più del dovuto */
  missing: number
  state: 'scoperta' | 'parziale' | 'coperta' | 'eccedente'
  /** quanti movimenti diversi la pagano: 26 addebiti Meta su una riga sola */
  parts: number
}

/**
 * Quanto è coperta una riga.
 *
 * `coperta` solo quando la somma raggiunge il lordo: una riga da 900 € marcata
 * pagata dal primo addebito da 2 € sparisce dagli scoperti portandosi via 898 €
 * che devono ancora uscire — ed è il motivo per cui `parziale` è uno stato e non
 * un dettaglio.
 *
 * `eccedente` non è un errore da nascondere: è un movimento allocato per più di
 * quello che la riga vale, e quasi sempre vuol dire che la riga è sbagliata.
 */
export function coverage(lineId: string, gross: number, allocs: Alloc[]): Coverage {
  const mine = allocs.filter(a => a.lineId === lineId)
  const covered = sum(mine.map(a => Math.abs(a.amount)))
  const missing = r2(gross - covered)
  return {
    lineId, gross, covered, missing, parts: mine.length,
    state: covered <= CENT ? 'scoperta'
      : missing > CENT ? 'parziale'
      : missing < -CENT ? 'eccedente'
      : 'coperta',
  }
}

export type TxUse = {
  txId: string
  /** il valore assoluto del movimento */
  amount: number
  /** quanto è già stato assegnato a delle righe */
  used: number
  /** quanto resta da assegnare. Zero = il movimento è tutto spiegato */
  free: number
  /** su quante righe è stato spalmato */
  parts: number
}

/**
 * Quanto di un movimento è già stato distribuito.
 *
 * È la domanda gemella della copertura, e serve a impedire l'errore peggiore:
 * allocare lo stesso bonifico due volte. Un incasso da 8.784 € che paga tre
 * righe da 4.392 non esiste, e senza questo numero nessuno se ne accorge —
 * perché ogni singolo aggancio, guardato da solo, sembra giusto.
 */
export function txUse(txId: string, amount: number, allocs: Alloc[]): TxUse {
  const mine = allocs.filter(a => a.txId === txId)
  const abs = Math.abs(amount)
  const used = sum(mine.map(a => Math.abs(a.amount)))
  return { txId, amount: abs, used, free: r2(abs - used), parts: mine.length }
}

/**
 * §261 — Quanto di ciascun movimento è **davvero** speso.
 *
 * `txUse` somma le allocazioni e si fida di quello che c'è scritto. Va bene
 * finché le allocazioni le scrive questo dominio; non va bene per quelle nate
 * dal legame per colonna — il travaso della 209 ha dato a ogni riga l'importo
 * **intero** del suo movimento, perché la colonna non sapeva dire di meno. Così
 * il bonifico da 3.812,50 € di Fatima Leo risultava tutto speso sul canone
 * growth da 1.830, e i 1.982,50 del marketing non potevano più agganciarsi a
 * niente: il movimento giusto sembrava esaurito.
 *
 * Una riga non può assorbire più del suo lordo. Quello che eccede non è speso:
 * è un'allocazione più grande del fatto che descrive. Qui l'eccesso torna
 * libero, in proporzione — con due movimenti sulla stessa riga scesa di prezzo
 * ciascuno restituisce la sua quota, non il primo tutto.
 *
 * Non riscrive niente: è una lettura. Le righe di allocazione restano quelle,
 * e si correggono sganciando, che è un gesto di una persona.
 */
export function usedByTx(
  allocs: Alloc[],
  grossOf: (lineId: string) => number | undefined,
): Map<string, number> {
  const byLine = new Map<string, number>()
  for (const a of allocs) byLine.set(a.lineId, r2((byLine.get(a.lineId) ?? 0) + Math.abs(a.amount)))

  const out = new Map<string, number>()
  for (const a of allocs) {
    const totale = byLine.get(a.lineId) ?? 0
    const gross = grossOf(a.lineId)
    /* Riga sconosciuta — cancellata, o di un dominio che qui non si legge — vale
       per quello che dice l'allocazione: inventarle un lordo sarebbe peggio. */
    const quota = gross == null || totale <= 0
      ? Math.abs(a.amount)
      : r2(Math.abs(a.amount) * (Math.min(totale, Math.max(0, gross)) / totale))
    out.set(a.txId, r2((out.get(a.txId) ?? 0) + quota))
  }
  return out
}

/**
 * Come spalmare un movimento su un insieme di righe, senza chiedere gli importi.
 *
 * Ogni riga prende quello che le manca, in ordine, finché il movimento non
 * finisce. **Dalla più vecchia**: un pagamento chiude l'arretrato più antico, che
 * è l'unico ordine che una persona userebbe e l'unico che fa emergere un debito
 * che si trascina (§227). L'ultima allocazione assorbe il resto solo se ci sta:
 * quello che avanza resta libero e si vede, invece di essere spinto dentro una
 * riga che non lo vale.
 */
export function spread(
  amount: number,
  lines: { lineId: string; gross: number; covered?: number; month?: string }[],
): { allocs: { lineId: string; amount: number }[]; left: number } {
  let left = r2(Math.abs(amount))
  const ordered = lines.slice().sort((a, b) => (a.month ?? '').localeCompare(b.month ?? ''))
  const allocs: { lineId: string; amount: number }[] = []
  for (const l of ordered) {
    if (left <= CENT) break
    const manca = r2(l.gross - (l.covered ?? 0))
    if (manca <= CENT) continue
    const quota = Math.min(manca, left)
    allocs.push({ lineId: l.lineId, amount: r2(quota) })
    left = r2(left - quota)
  }
  return { allocs, left }
}

/**
 * Le righe che, sommate, fanno esattamente questo importo.
 *
 * È il caso di Fatima Leo: 3.812,50 € = 1.830 + 1.982,50, e nessuna delle due da
 * sola ci arriva. Si cercano combinazioni fino a `max` righe — oltre le tre il
 * numero di accostamenti esplode e le proposte diventano rumore, che è il modo
 * più veloce per far smettere di leggerle.
 */
export function combinations(
  amount: number,
  lines: { lineId: string; gross: number }[],
  max = 3,
): string[][] {
  const target = r2(Math.abs(amount))
  const out: string[][] = []
  const walk = (start: number, acc: string[], tot: number) => {
    if (out.length >= 8) return
    if (Math.abs(tot - target) < CENT && acc.length > 1) { out.push(acc.slice()); return }
    if (acc.length >= max || tot > target + CENT) return
    for (let i = start; i < lines.length; i++) {
      acc.push(lines[i].lineId)
      walk(i + 1, acc, r2(tot + lines[i].gross))
      acc.pop()
    }
  }
  walk(0, [], 0)
  return out
}
