/**
 * Piano di cassa del mese — calcoli puri, nessun I/O. (§262)
 *
 * La tenuta di cassa (§225) risponde con **tre esiti**: se non incassi niente,
 * se pagano i puntuali, se rientrano gli arretrati. È la risposta giusta alla
 * domanda «regge?», e non serve a decidere: dice che ad agosto mancano
 * ottomila euro e non dice *quali* ottomila, né cosa si può spostare.
 *
 * Qui la stessa cassa è **una lista di fatti attesi**, uno per riga, con la sua
 * data e la sua provenienza — e ogni riga si può **spegnere**. Spegnere non
 * cancella niente: dice «e se questo non succedesse», che è l'unico modo di
 * capire da cosa dipende un mese. Il saldo finale si muove mentre si sceglie,
 * e i tre esiti restano in testa come cornice.
 *
 * Quattro regole, ognuna nata da un numero che sarebbe stato sbagliato:
 *
 * **Un mese aperto si legge dalle righe, uno mai aperto dal contratto e dal
 * piano.** Sommarli conterebbe due volte lo stesso canone: la riga di agosto
 * *è* la rata di agosto, non un'altra cosa. È la stessa regola del rotolo dei
 * mesi (§225), qui applicata voce per voce.
 *
 * **Si parte dal saldo vero della banca** (§263). Non da quello di inizio mese
 * ricostruito dalle righe: quello sarebbe un numero calcolato, e la cassa è un
 * fatto — il saldo di oggi contiene anche i movimenti che nessuna riga di conto
 * economico giustifica, ed è esattamente il motivo per cui è quello giusto da
 * cui partire. Da lì in avanti si somma solo quello che deve ancora succedere:
 * un incasso arrivato il 3 agosto è già dentro (`inBalance`), resta in elenco
 * perché «cosa ha già fatto il mese» è una domanda vera, ma non muove il totale.
 * Risommarlo darebbe a ogni mese in corso incassi che ha già avuto.
 *
 * **Gli arretrati pesano sul primo mese, non sul loro.** Una fattura di maggio
 * ancora scoperta non è cassa di maggio: è una telefonata da fare adesso, e in
 * agosto è denaro che può entrare o non entrare in agosto.
 *
 * **Una sola voce è davvero spostabile: i compensi.** L'IVA ha una data e i
 * fornitori pure; gli stipendi sono un patto. «La decisione è quando, non se»
 * (§237) vale per soci e commerciali e per nessun altro, e il modello lo dice
 * invece di lasciar credere che tutto sia comprimibile.
 */

import { shiftMonth } from '@/lib/pl'
import { monthOf, endOfMonth, daysBetween, addDays } from '@/lib/cash-calendar'
import { eur } from '@/lib/money'

/** Le macro dell'elenco. Sono poche apposta: con quindici gruppi non si legge. */
export const GROUPS = {
  clienti: 'Incassi dai clienti',
  struttura: 'Struttura e fornitori',
  esterni: 'Lavori affidati fuori',
  personale: 'Persone',
  iva: 'IVA',
  compensi: 'Compensi a soci e commerciali',
} as const
export type GroupKey = keyof typeof GROUPS

/** Da dove viene la voce. Un numero senza provenienza non lo usa nessuno. */
export type PlanSource = 'riga' | 'contratto' | 'piano' | 'organico' | 'fisco' | 'compenso'

/**
 * `mosso` è già successo · `atteso` ha una data che deve ancora arrivare ·
 * `scaduto` doveva già essere successo · `stimato` non ha un documento dietro.
 * Sono quattro gradi di fiducia diversi e vanno letti come tali.
 */
export type PlanState = 'mosso' | 'atteso' | 'scaduto' | 'stimato'

export type PlanItem = {
  id: string
  side: 'entrata' | 'uscita'
  group: GroupKey
  label: string
  /** cliente, fornitore, persona: il nome che rende riconoscibile la riga */
  who: string | null
  /** **lordo**: dal conto passa il totale della fattura, IVA compresa */
  gross: number
  due: string
  /** mese di competenza: dice se è un arretrato e da dove viene */
  month: string
  source: PlanSource
  state: PlanState
  /** giorni di ritardo sulla scadenza, zero se non è in ritardo */
  lateDays: number
  /** si può spostare senza rompere un patto con una data (§237: i compensi) */
  movable: boolean
  /**
   * §263 — è **già dentro** il saldo di partenza, quindi non si somma.
   *
   * Il modello parte dal saldo vero della banca, che è il numero di oggi e
   * contiene tutto quello che è già passato — comprese le uscite che nessuna
   * riga giustifica. Un incasso arrivato il 3 agosto è lì dentro: risommarlo
   * lo conterebbe due volte. Resta in elenco perché la domanda «cosa ha già
   * fatto questo mese» ha una risposta, ma non muove il totale.
   */
  inBalance: boolean
  /**
   * §284 — spuntata «pagata» ma **nessun movimento di banca la dimostra**.
   *
   * È il caso di tutti i giorni: il bonifico si vede sull'home banking, si
   * spunta la riga, e l'estratto conto si scarica la settimana dopo. Quei soldi
   * ci sono, ma il saldo — che conta i soli movimenti `banca` (§189) — non li
   * contiene ancora. Perciò una riga dichiarata **si somma** al saldo invece di
   * sparire dentro: prima veniva marcata «già nel saldo» e spuntare un incasso
   * da 7.930 € faceva **scendere** di 7.930 il saldo di fine mese.
   *
   * Resta dichiarata, non certificata: la differenza la si legge, e sparisce da
   * sé quando l'estratto conto arriva (§226).
   */
  declared: boolean
  /**
   * §264 — la voce è una riga del **conto economico di questo mese**.
   *
   * È l'appartenenza che il conto economico usa, e non coincide con la cassa:
   * la retribuzione di agosto è di agosto e i soldi escono il 20 settembre.
   * Tenere le due cose separate è l'unico modo perché questo elenco combaci
   * riga per riga con il mese del conto economico, pagato o no.
   */
  accrual: boolean
  /** i suoi soldi si muovono **dentro** questo mese: è la parte che fa cassa */
  movesIn: boolean
  /** acceso nel modello di partenza */
  on: boolean
  /** il perché, in una riga: si legge accanto al numero, non in un manuale */
  why: string
}

export type PlanMonth = {
  month: string
  /**
   * §263 — il saldo da cui si parte, e **fino a quando** è vero lo dice
   * `anchor`. Per il mese in corso è il saldo della banca di oggi: è il numero
   * che si legge in Banca, ed è l'unico che contiene anche i movimenti che
   * nessuna riga di conto economico giustifica.
   */
  opening: number
  /**
   * La data fino a cui `opening` è un fatto. Quello che si è mosso prima è già
   * dentro e non si somma; `null` = l'apertura è quella di inizio mese e tutto
   * quello che il mese contiene va contato.
   */
  anchor?: string | null
  /** il mese è già aperto nel conto economico */
  open: boolean
  items: PlanItem[]
}

export type Totals = {
  /** saldo a inizio mese **nel modello**: quello che i mesi prima hanno prodotto */
  opening: number
  inflow: number
  outflow: number
  net: number
  /** saldo a fine mese col modello acceso com'è */
  end: number
  /** quello che si è già mosso, dentro `inflow`/`outflow` */
  movedIn: number
  movedOut: number
  /** quello che è ancora un'attesa: è la parte su cui si può agire */
  openIn: number
  openOut: number
  byGroup: { group: GroupKey; side: 'entrata' | 'uscita'; amount: number; count: number }[]
  /** quanto si è tolto dal modello spegnendo delle voci */
  offIn: number
  offOut: number
  /** §263 — quello che è già dentro il saldo di partenza: si mostra, non si somma */
  alreadyIn: number
  alreadyOut: number
  /** §284 — spuntato ma non ancora in estratto conto: **si somma** al saldo */
  declaredIn: number
  declaredOut: number
  /**
   * §264 — le righe del **conto economico di questo mese**, pagate o no: è il
   * numero che deve combaciare con quello della pagina del mese. Non è la cassa
   * e non ci somiglia: la retribuzione di agosto è qui e i soldi escono il 20
   * settembre.
   */
  accrualIn: number
  accrualOut: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0))
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
/* «esce a settembre» si legge; «esce nel 2026-09» si decifra. */
const monthName = (m: string) => MESI[Number(m.slice(5, 7)) - 1] ?? m.slice(0, 7)

/**
 * Le voci di un mese, tutte, ognuna con la sua data.
 *
 * L'ordine dei blocchi non è estetico: prima quello che entra, poi quello che
 * esce con una data, e per ultimo quello che si può spostare. Chi legge deve
 * arrivare in fondo sapendo già cosa è negoziabile.
 */
export function planMonth(i: {
  month: string
  today: string
  open: boolean
  /** righe registrate — di questo mese e degli altri: gli arretrati pesano qui */
  lines: {
    id: string; side: 'entrata' | 'uscita'; label: string; who?: string | null
    gross: number; due: string; month: string; paid: boolean; paidOn?: string | null
    /** true = subappalto: è già uscito dal margine del suo progetto (§188) */
    external?: boolean
    /** true = costo del lavoro: lo scrive l'organico, non il piano (§184) */
    payroll?: boolean
  }[]
  /** contratti e piano dei costi, voce per voce: solo per i mesi **mai aperti** */
  planned: {
    id: string; side: 'entrata' | 'uscita'; label: string; who?: string | null
    gross: number; due: string; external?: boolean
  }[]
  /** le scadenze fiscali che cadono in questo mese */
  dues: { date: string; amount: number; label: string }[]
  /** §227 — i compensi attesi in uscita in questo mese, per persona */
  payouts: { key: string; who: string; kind: 'socio' | 'commerciale'; amount: number; from?: string | null }[]
  /** §225 — il costo del lavoro stimato, per i mesi in cui non c'è una riga */
  payroll?: number
  /** §263 — fino a che data il saldo di partenza è un fatto già accaduto */
  anchor?: string | null
  /**
   * §284 — le righe che un movimento **di banca** dimostra. Solo queste sono
   * dentro il saldo di partenza: le altre sono spunte, e il conto non le ha
   * ancora viste.
   */
  inBank?: Set<string> | null
  /** il primo mese della catena: gli scoperti di prima pesano lì (§225) */
  since?: string | null
}): PlanItem[] {
  const start = monthOf(i.month)
  const end = endOfMonth(i.month)
  const items: PlanItem[] = []
  const late = (due: string) => (due < i.today ? daysBetween(due, i.today) : 0)

  /* Il primo mese della catena: quello che doveva muoversi prima e non si è
     mosso pesa **lì**, non nel mese in cui era atteso (§225). Senza questa
     regola lo stesso arretrato comparirebbe in agosto e in settembre, e la
     catena lo conterebbe due volte. */
  const from = i.since ?? start
  /* Fin dove il saldo di partenza è un fatto: quello che si è mosso prima è già
     dentro e non si somma (§263). Senza ancora, l'apertura è quella di inizio
     mese e conta tutto quello che nel mese si muove. */
  const limit = i.anchor ?? addDays(start, -1)

  /** In che mese la cassa sente questo fatto. */
  const bucket = (when: string) => (when < from ? from : monthOf(when))

  /* ── le righe ─────────────────────────────────────────────────────────────
     §264 — l'appartenenza è quella del **conto economico**: una riga di agosto
     è di agosto, pagata o no. Prima si guardava solo la data di cassa, e agosto
     mostrava le righe di luglio scadute e non le sue già incassate: due elenchi
     con lo stesso nome che non tornavano mai. Adesso una riga entra se è di
     questo mese **oppure** se i suoi soldi si muovono in questo mese — e ogni
     riga dichiara quale delle due cose è. */
  for (const l of i.lines) {
    const mia = l.month === i.month
    const quando = l.paid ? (l.paidOn ?? l.due) : l.due
    /* §267 — lo spostamento sul primo mese vale **solo per quello che non si è
       mosso**. Un incasso del 13 maggio è cassa di maggio e basta: trascinarlo
       in agosto perché è «prima dell'inizio della catena» riempiva il mese di
       venticinque fatti chiusi che nessuno doveva più guardare. Quello che è
       già passato ha una data, e quella data è la risposta. */
    const muove = l.paid ? monthOf(quando) === i.month : bucket(quando) === i.month
    if (!mia && !muove) continue

    /* §284 — «già nel saldo» vuol dire **dimostrata dalla banca**, non
       «spuntata». Senza `inBank` si torna al comportamento di prima, dove la
       spunta valeva da sola. */
    const provata = !i.inBank || i.inBank.has(l.id)
    const dentro = l.paid && quando <= limit && provata
    const dichiarata = l.paid && !provata
    const rit = l.paid ? 0 : late(l.due)
    items.push({
      id: `${l.paid ? 'f' : 'o'}:${l.id}`, side: l.side, group: groupOf(l),
      label: l.label, who: l.who ?? null, gross: r2(l.gross),
      due: l.paid ? quando : l.due, month: l.month, source: 'riga',
      state: l.paid ? 'mosso' : rit > 0 ? 'scaduto' : 'atteso',
      lateDays: rit, movable: false, inBalance: dentro, declared: dichiarata,
      accrual: mia, movesIn: muove || dichiarata, on: true,
      why: l.paid
        ? dentro
          ? (l.side === 'entrata' ? 'incassata, già nel saldo' : 'pagata, già nel saldo')
          : dichiarata
            ? (l.side === 'entrata'
                ? 'incassata, non ancora nell\'estratto conto'
                : 'pagata, non ancora nell\'estratto conto')
            : (l.side === 'entrata' ? 'incassata' : 'pagata')
        : rit > 0
          ? `in ritardo di ${rit} giorn${rit === 1 ? 'o' : 'i'}`
          : !mia
            ? `matura ${l.month.slice(0, 7)}, si muove adesso`
            : muove ? 'in scadenza'
              /* §224 — il costo del lavoro di agosto esce il 20 settembre: è una
                 voce di agosto che la cassa di agosto non sente. Dirlo è tutta
                 la differenza fra le due letture. */
              : `di questo mese, esce ${monthName(bucket(l.due))}`,
    })
  }

  /* ── il mese che nessuno ha ancora aperto ─────────────────────────────────
     Lì le righe non esistono e il fatto lo dicono il contratto e il piano.
     Sommare tutti e due conterebbe due volte lo stesso canone: è il motivo per
     cui questo blocco vale **solo** a mese chiuso. */
  if (!i.open) {
    for (const p of i.planned) {
      const muove = bucket(p.due) === i.month
      items.push({
        id: `p:${p.id}`, side: p.side, group: p.side === 'entrata' ? 'clienti'
          : p.external ? 'esterni' : 'struttura',
        label: p.label, who: p.who ?? null, gross: r2(p.gross), due: p.due, month: i.month,
        source: p.side === 'entrata' ? 'contratto' : 'piano', state: 'atteso',
        lateDays: 0, movable: false, inBalance: false, declared: false,
        accrual: true, movesIn: muove, on: true,
        why: muove
          ? (p.side === 'entrata' ? 'dal contratto' : 'dal piano dei costi')
          : `di questo mese, esce ${monthName(bucket(p.due))}`,
      })
    }
  }

  /* §225 — il piano dei costi **non** contiene il costo del lavoro: lo scrive
     l'organico. Senza questa stima un mese futuro sembrerebbe costare ottomila
     euro in meno, ed è la riga più grossa che c'è.
     La decisione di stimarla è di chi chiama, e la regola è una sola: vale se il
     mese **prima** non è aperto. Le retribuzioni di un mese escono il 20 di
     quello dopo (§224), quindi dove quelle righe esistono sono già in questa
     lista — e sommarci la stima le conterebbe due volte. */
  if (i.payroll && i.payroll > 0) {
    items.push({
      id: `pay:${i.month}`, side: 'uscita', group: 'personale',
      label: 'Costo del lavoro', who: null, gross: r2(i.payroll),
      due: `${i.month.slice(0, 7)}-20`, month: shiftMonth(i.month, -1),
      source: 'organico', state: 'stimato', lateDays: 0, movable: false, inBalance: false,
      declared: false, accrual: false, movesIn: true, on: true,
      why: 'stimato uguale all\'ultimo mese registrato: il piano non contiene il personale',
    })
  }

  /* ── l'IVA ────────────────────────────────────────────────────────────────
     Non è un costo e non è comprimibile: è denaro dei clienti che sta sul conto
     con una data sopra. Se cade in questo mese è un bonifico da fare. */
  for (const d of i.dues) {
    /* Chi chiama ha già deciso su quale mese cade — una scadenza già passata
       pesa sul **primo** mese della catena, come gli arretrati. Qui resta il
       controllo di buon senso: una scadenza del mese prossimo non è di questo. */
    if (d.date > end) continue
    items.push({
      id: `iva:${d.date}:${d.label}`, side: 'uscita', group: 'iva',
      label: `Liquidazione IVA · ${d.label}`, who: null, gross: r2(d.amount), due: d.date,
      month: i.month, source: 'fisco', state: 'atteso', lateDays: late(d.date),
      movable: false, inBalance: false, declared: false, accrual: false, movesIn: true, on: true,
      why: 'ha una data e non si sposta: è IVA incassata dai clienti',
    })
  }

  /* ── i compensi ───────────────────────────────────────────────────────────
     Maturano in un mese ed escono in quello dopo, come il costo del lavoro
     (§224). Sono l'unica voce **spostabile** della lista, ed è la ragione per
     cui il modello esiste: la domanda di ogni mese è quanto respiro dà
     rimandarli. */
  for (const p of i.payouts) {
    if (p.amount <= 0.01) continue
    items.push({
      id: `c:${p.key}:${p.kind}`, side: 'uscita', group: 'compensi',
      label: p.kind === 'socio' ? 'Erogato al socio' : 'Provvigione commerciale',
      who: p.who, gross: r2(p.amount), due: `${i.month.slice(0, 7)}-28`,
      month: shiftMonth(i.month, -1), source: 'compenso', state: 'atteso',
      lateDays: 0, movable: true, inBalance: false, declared: false, accrual: false, movesIn: true, on: true,
      why: p.from ? `maturato da ${p.from.slice(0, 7)}` : 'maturato nel mese scorso',
    })
  }

  return items.sort((a, b) =>
    (a.side === b.side ? 0 : a.side === 'entrata' ? -1 : 1)
    || a.due.localeCompare(b.due)
    || b.gross - a.gross)
}

const groupOf = (l: { side: 'entrata' | 'uscita'; external?: boolean; payroll?: boolean }): GroupKey =>
  l.side === 'entrata' ? 'clienti' : l.payroll ? 'personale' : l.external ? 'esterni' : 'struttura'

/**
 * Il modello: gli stessi mesi, con addosso le voci spente.
 *
 * Il saldo di un mese entra come apertura in quello dopo — è quello che rende
 * la lista un **previsionale** e non un elenco: spegnere un incasso di agosto
 * deve far scendere anche settembre, o il modello racconterebbe che un buco si
 * richiude da solo il mese successivo.
 */
export function simulate(months: PlanMonth[], off: Set<string>): (Totals & { month: string })[] {
  let saldo: number | null = null
  return months.map(m => {
    const opening = saldo == null ? m.opening : saldo
    /* §263 — quello che è già dentro il saldo non si somma: il saldo di partenza
       lo contiene già, e risommarlo darebbe a ogni mese in corso un incasso in
       più di quelli che ha avuto. */
    const on = m.items.filter(x => !off.has(x.id) && !x.inBalance && x.movesIn)
    const spenti = m.items.filter(x => off.has(x.id) && !x.inBalance && x.movesIn)
    const dentro = m.items.filter(x => x.inBalance)
    const inflow = sum(on.filter(x => x.side === 'entrata').map(x => x.gross))
    const outflow = sum(on.filter(x => x.side === 'uscita').map(x => x.gross))
    const net = r2(inflow - outflow)
    const end = r2(opening + net)
    saldo = end

    const byGroup: Totals['byGroup'] = []
    for (const g of Object.keys(GROUPS) as GroupKey[]) {
      for (const side of ['entrata', 'uscita'] as const) {
        const own = on.filter(x => x.group === g && x.side === side)
        if (own.length) byGroup.push({ group: g, side, amount: sum(own.map(x => x.gross)), count: own.length })
      }
    }

    return {
      month: m.month, opening, inflow, outflow, net, end,
      movedIn: sum(on.filter(x => x.side === 'entrata' && x.state === 'mosso').map(x => x.gross)),
      movedOut: sum(on.filter(x => x.side === 'uscita' && x.state === 'mosso').map(x => x.gross)),
      openIn: sum(on.filter(x => x.side === 'entrata' && x.state !== 'mosso').map(x => x.gross)),
      openOut: sum(on.filter(x => x.side === 'uscita' && x.state !== 'mosso').map(x => x.gross)),
      byGroup: byGroup.sort((a, b) => b.amount - a.amount),
      offIn: sum(spenti.filter(x => x.side === 'entrata').map(x => x.gross)),
      offOut: sum(spenti.filter(x => x.side === 'uscita').map(x => x.gross)),
      alreadyIn: sum(dentro.filter(x => x.side === 'entrata').map(x => x.gross)),
      alreadyOut: sum(dentro.filter(x => x.side === 'uscita').map(x => x.gross)),
      declaredIn: sum(on.filter(x => x.declared && x.side === 'entrata').map(x => x.gross)),
      declaredOut: sum(on.filter(x => x.declared && x.side === 'uscita').map(x => x.gross)),
      accrualIn: sum(m.items.filter(x => x.accrual && x.side === 'entrata').map(x => x.gross)),
      accrualOut: sum(m.items.filter(x => x.accrual && x.side === 'uscita').map(x => x.gross)),
    }
  })
}

/**
 * I tre esiti, sulle voci di **questo** mese. Stessa scala della §233: le uscite
 * sono certe, gli incassi no, e mescolarli in un numero solo fa sembrare un
 * fatto una speranza.
 */
export type Outcomes = {
  /** se non incassa più niente: aperture, fatti del mese e tutte le uscite */
  floor: number
  /** e se pagano quelli ancora nei termini */
  expected: number
  /** e se rientrano anche gli scaduti */
  best: number
}

/**
 * `opening` si passa quando il mese sta in fondo a una catena: lì l'apertura non
 * è quella che il server aveva calcolato, è il saldo che i mesi prima hanno
 * prodotto **nel modello** — e se non seguisse le scelte, spegnere un incasso di
 * agosto lascerebbe settembre esattamente dov'era.
 */
export function outcomes(m: PlanMonth, off: Set<string>, opening = m.opening): Outcomes {
  const on = m.items.filter(x => !off.has(x.id) && !x.inBalance && x.movesIn)
  const uscite = sum(on.filter(x => x.side === 'uscita').map(x => x.gross))
  /* §284 — una riga dichiarata è un incasso **già avvenuto**, solo non ancora
     nell'estratto conto: sta nel pavimento come i fatti, non fra le speranze. */
  const fatti = sum(on.filter(x => x.side === 'entrata' && x.state === 'mosso').map(x => x.gross))
  const puntuali = sum(on.filter(x => x.side === 'entrata' && x.state === 'atteso').map(x => x.gross))
  const scaduti = sum(on.filter(x => x.side === 'entrata' && x.state === 'scaduto').map(x => x.gross))
  const floor = r2(opening + fatti - uscite)
  return { floor, expected: r2(floor + puntuali), best: r2(floor + puntuali + scaduti) }
}

export type Advice = {
  key: string
  /** `leva` si può fare · `vincolo` no, va saputo · `esito` è una constatazione */
  kind: 'leva' | 'vincolo' | 'esito'
  title: string
  detail: string
  /** quanto vale, dove ha senso: un consiglio senza numero non si esegue */
  amount?: number
}

/**
 * I suggerimenti. Non sono consigli: sono **le leve che questo mese ha**, con
 * quanto valgono. Ognuno nasce da una voce della lista, e nessuno inventa
 * numeri che non ci sono — il posto dove un tool comincia a mentire è quello in
 * cui suggerisce qualcosa che non può quantificare.
 */
export function advice(
  m: PlanMonth, off: Set<string>,
  opts?: { vatHeld?: number; vatLabel?: string; opening?: number },
): Advice[] {
  const opening = opts?.opening ?? m.opening
  const t = simulate([{ ...m, opening }], off)[0]
  const o = outcomes(m, off, opening)
  const on = m.items.filter(x => !off.has(x.id) && !x.inBalance && x.movesIn)
  const out: Advice[] = []

  const scaduti = on.filter(x => x.side === 'entrata' && x.state === 'scaduto')
    .sort((a, b) => b.lateDays - a.lateDays)
  const spostabili = on.filter(x => x.side === 'uscita' && x.movable)
  const spostabile = sum(spostabili.map(x => x.gross))

  /* §233 — un saldo finale positivo non dice **su cosa** poggia, e sono quattro
     situazioni diverse che vogliono quattro azioni diverse. Un mese che chiude
     grazie agli arretrati è a un passo dal non chiudere: quelli non arrivano da
     soli. Perciò il primo consiglio è sempre il verdetto, coi tre numeri. */
  const verdetto = o.floor >= 0 ? 'regge'
    : o.expected >= 0 ? 'clienti'
    : o.best >= 0 ? 'arretrati'
    : 'negativo'
  const teso = verdetto !== 'regge'

  if (verdetto === 'regge') {
    out.push({
      key: 'regge', kind: 'esito',
      title: 'Il mese regge anche se non incassi niente',
      detail: `Con quello che è già in banca copri tutte le uscite e resti a ${eur(o.floor)}. `
        + 'Gli incassi che arriveranno sono margine, non ossigeno.',
      amount: o.floor,
    })
  } else if (verdetto === 'clienti') {
    out.push({
      key: 'dipendi-clienti', kind: 'esito',
      title: 'Regge, ma dipende dai clienti',
      detail: `Senza incassare niente chiuderesti a ${eur(o.floor)}. Con le fatture ancora `
        + `nei termini arrivi a ${eur(o.expected)}: la differenza la decidono loro, non tu.`,
      amount: r2(o.expected - o.floor),
    })
  } else if (verdetto === 'arretrati') {
    out.push({
      key: 'dipendi-arretrati', kind: 'esito',
      title: 'Chiude solo se rientrano gli arretrati',
      detail: `Anche incassando tutto quello che è nei termini resteresti a ${eur(o.expected)}: `
        + `il mese va in pari (${eur(o.best)}) solo con i crediti già scaduti, e quelli non `
        + 'arrivano da soli. È la situazione in cui dipendi da chi non ti ha pagato.',
      amount: r2(o.best - o.expected),
    })
  } else {
    out.push({
      key: 'non-basta', kind: 'esito',
      title: 'Non ci arrivi nemmeno incassando tutto',
      detail: `Con ogni euro atteso e ogni arretrato dentro chiuderesti a ${eur(o.best)}. `
        + 'Qui non manca un incasso: manca un\'uscita da spostare o un mese di respiro.',
      amount: o.best,
    })
  }

  if (t.end < 0 || teso) {
    const manca = r2(Math.max(0, -t.end))
    if (manca > 0) {
      out.push({
        key: 'manca', kind: 'esito',
        title: `Mancano ${eur(manca)}`,
        detail: 'Con le voci accese così il mese chiude sotto zero. Sotto ci sono le leve, '
          + 'in ordine di quanto pesano.',
        amount: manca,
      })
    }

    /* Gli scaduti sono la prima leva perché sono **soldi già tuoi**: non è una
       previsione, è una telefonata. E si dice quanti ne bastano, non «recupera i
       crediti», che è un consiglio che non si può eseguire. */
    if (scaduti.length) {
      const tutti = sum(scaduti.map(s => s.gross))
      let acc = 0, quante = 0
      for (const s of scaduti) { if (acc >= manca) break; acc = r2(acc + s.gross); quante++ }
      out.push({
        key: 'incassa-scaduti', kind: 'leva',
        title: manca <= 0
          ? `${scaduti.length} crediti scaduti per ${eur(tutti)}`
          : acc >= manca
            ? `Bastano ${quante} incass${quante === 1 ? 'o' : 'i'} scaduti`
            : `Gli scaduti coprono ${eur(acc)} dei ${eur(manca)}`,
        detail: `${scaduti[0].who ?? scaduti[0].label} è in ritardo di ${scaduti[0].lateDays} giorni`
          + (scaduti.length > 1 ? `, e sono ${scaduti.length} in tutto per ${eur(tutti)}.` : '.')
          + ' Sono soldi già tuoi: è una telefonata, non una previsione.',
        amount: manca > 0 ? acc : tutti,
      })
    }

    if (spostabile > 0) {
      out.push({
        key: 'rimanda-compensi', kind: 'leva',
        title: manca > 0 && spostabile >= manca
          ? 'Rimandare i compensi basta a chiudere il mese'
          : `Rimandare i compensi libera ${eur(spostabile)}`,
        detail: `${spostabili.length} vo${spostabili.length === 1 ? 'ce' : 'ci'} per ${eur(spostabile)}. `
          + 'È l\'unica uscita senza una data: la decisione è quando, non se — e resta da erogare.',
        amount: spostabile,
      })
    }

    const iva = on.find(x => x.group === 'iva')
    if (iva) {
      out.push({
        key: 'iva-vincolo', kind: 'vincolo',
        title: `L'IVA scade il ${iva.due.slice(8)} e non si sposta`,
        detail: `${eur(iva.gross)} che i clienti hanno già pagato a te. Non è capitale: `
          + 'è un debito con una data, e rimandarlo costa sanzioni e interessi.',
        amount: iva.gross,
      })
    }

    if (!scaduti.length && spostabile <= 0) {
      out.push({
        key: 'niente-leve', kind: 'vincolo',
        title: 'Questo mese non ha leve interne',
        detail: 'Nessun arretrato da recuperare e nessuna uscita spostabile: il buco si copre '
          + 'solo anticipando un incasso o rimandando un fornitore, e sono due telefonate diverse.',
      })
    }
  } else {
    out.push({
      key: 'chiude', kind: 'esito',
      title: `Il mese chiude a ${eur(t.end)}`,
      detail: `Entrano ${eur(t.inflow)}, escono ${eur(t.outflow)}.`
        + (t.offIn + t.offOut > 0 ? ` Fuori dal modello: ${eur(t.offIn)} in entrata e ${eur(t.offOut)} in uscita.` : ''),
      amount: t.end,
    })
  }

  /* Un avanzo non è tutto disponibile: l'IVA del trimestre in corso è già nel
     saldo e scade dopo. È l'errore classico — un'azienda in utile che resta
     senza soldi ha quasi sempre contato l'IVA due volte. Se la liquidazione cade
     **in** questo mese è già una riga di uscita e ripeterla la conterebbe due volte. */
  const held = opts?.vatHeld ?? 0
  if (t.end > 0 && held > 0 && !on.some(x => x.group === 'iva')) {
    out.push({
      key: 'iva-dopo', kind: 'vincolo',
      title: `Di quello che resta, ${eur(held)} sono IVA`,
      detail: `${opts?.vatLabel ?? 'Il trimestre in corso'} si versa dopo, ma quei soldi sono `
        + 'già sul conto e non sono tuoi. Quello che puoi davvero usare è '
        + `${eur(r2(t.end - held))}.`,
      amount: held,
    })
  }

  return out
}
