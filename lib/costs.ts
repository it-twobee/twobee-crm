/**
 * Piano dei costi — calcoli puri, nessun I/O.
 *
 * Il conto economico dice quanto è uscito. Questo dice quanto **doveva**
 * uscire, e da quale area. Senza il secondo il primo è una lista della spesa:
 * si legge a cose fatte e non si può governare niente.
 *
 * Regola sulle frequenze: `amount` è quanto costa OGNI VOLTA che la spesa
 * torna, non la sua dodicesima parte. Un canone annuale da 1.200 pesa 1.200 nel
 * mese in cui si paga. Spalmarlo darebbe un conto economico più liscio e una
 * cassa sbagliata, e la cassa è quella che ti fa chiudere.
 */

import { shiftMonth } from '@/lib/pl'
import { eur } from '@/lib/money'

export type Frequency = 'mensile' | 'bimestrale' | 'trimestrale' | 'semestrale' | 'annuale' | 'una_tantum'
export type CostType = 'F' | 'V'

export type CostCenter = {
  id: string
  name: string
  description: string | null
  /** @deprecated §180: il tetto è la somma delle voci. Colonna viva, non più letta. */
  monthly_budget: number
  sort_order: number
  is_active: boolean
}

export type CostItem = {
  id: string
  center_id: string | null
  /** §173: se c'è, è un subappalto — il costo appartiene a quel lavoro */
  project_id?: string | null
  /**
   * §285: la rata del cliente che questa tranche finanzia. Le tranche nascono
   * dal piano di pagamento del contratto (`splitCostLikeClient`) e finora il
   * legame restava nel nome; qui è un dato, e il margine digital lo usa per
   * togliere il subappalto alla riga giusta invece che al progetto in blocco.
   */
  installment_id?: string | null
  category: string
  label: string
  cost_type: CostType
  amount: number
  frequency: Frequency
  vat_applied: boolean
  vat_rate: number
  supplier: string | null
  /** §174: accordo col fornitore. Di norma ricalca quello col cliente. */
  payment_terms?: string | null
  start_month: string | null
  end_month: string | null
  is_active: boolean
  note: string | null
}

/** @deprecated §180: `cost_budgets` non alimenta più nessun calcolo. */
export type CostBudget = { id: string; center_id: string; month: string; amount: number }

/** Riga di uscita già registrata in un mese di conto economico. */
export type CostActual = {
  id: string
  center_id: string | null
  cost_item_id: string | null
  project_id?: string | null
  category: string
  label: string
  cost_type: CostType
  budget: number
  actual: number
  paid: boolean
}

const STEP: Record<Frequency, number> = {
  mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12, una_tantum: 0,
}

const first = (iso: string) => iso.slice(0, 8) + '01'

/** Distanza in mesi fra due primi-del-mese. */
export function monthsApart(from: string, to: string): number {
  const [y1, m1] = from.slice(0, 7).split('-').map(Number)
  const [y2, m2] = to.slice(0, 7).split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

/**
 * La spesa cade in questo mese?
 *
 * Senza data d'inizio una spesa mensile vale sempre — è il caso più comune e
 * chiedere una data per un canone che c'è da sempre è burocrazia. Le altre
 * frequenze la richiedono: senza un punto di partenza «ogni tre mesi» non
 * vuol dire niente.
 */
export function dueInMonth(item: CostItem, month: string): boolean {
  if (!item.is_active || item.amount === 0) return false

  const start = item.start_month ? first(item.start_month) : null
  const end = item.end_month ? first(item.end_month) : null
  if (start && month < start) return false
  if (end && month > end) return false

  if (item.frequency === 'una_tantum') return !!start && month === start
  if (item.frequency === 'mensile') return true
  if (!start) return false

  const step = STEP[item.frequency]
  return step > 0 && monthsApart(start, month) % step === 0
}

/** Le voci di piano che pesano su un mese. */
export const plannedForMonth = (items: CostItem[], month: string) =>
  items.filter(i => dueInMonth(i, month))

/**
 * Le voci di piano che in questo mese **nessuna riga rappresenta ancora**. (§308)
 *
 * «Un mese aperto si legge dalle righe, uno mai aperto dal piano» (§262) è la
 * regola giusta contro il doppio conteggio, e per mesi è bastata. Non basta per
 * la domanda che si fa guardando il piano di cassa — *quanto esce in questo
 * mese* — perché una voce ricorrente che nessuno ha portato nel mese **non
 * compare da nessuna parte**: il piano dice che il 5 esce il canone di Google
 * Workspace, il mese non ha quella riga, e la cassa del mese risulta più leggera
 * del vero. `applyPlanToMonth` esiste appunto perché quel gesto va fatto a mano,
 * e finché non lo si fa il numero è sbagliato in silenzio.
 *
 * Il legame è `pl_cost_lines.cost_item_id`, che la riga porta da quando nasce dal
 * piano: quello che ha già una riga si esclude, il resto entra dichiarando di
 * essere **atteso dal piano** e non registrato. Non è una stima — è una data e un
 * importo che qualcuno ha scritto — ma non è nemmeno un fatto, e le due cose non
 * si possono leggere uguali.
 */
export const plannedNotYetInMonth = (
  items: CostItem[], month: string, lines: { cost_item_id?: string | null }[],
  /**
   * §184 — **l'area Personale la scrive l'organico, non il piano.** Le sue voci a
   * piano sono un residuo del seed che nessuno porta mai nel mese, e le righe del
   * costo del lavoro nascono da `pushPayrollToMonth` **senza** un
   * `cost_item_id`: il filtro sopra non le riconosce, quindi le voci di piano
   * comparirebbero accanto a quelle vere. Su agosto erano 8.640 € contati due
   * volte. È la stessa esclusione che `applyPlanToMonth` fa a monte.
   *
   * Serve l'id dell'area e non il nome: `cost_items.category` dice «HR», l'area
   * si chiama «Personale», e `isPayrollCenter` guarda il nome — quindi sul campo
   * sbagliato non riconosceva niente.
   */
  payrollCenters?: Set<string>,
) => {
  const già = new Set(lines.map(l => l.cost_item_id).filter(Boolean) as string[])
  return plannedForMonth(items, month)
    .filter(i => !già.has(i.id))
    .filter(i => !(payrollCenters?.size && i.center_id && payrollCenters.has(i.center_id)))
}

/**
 * L'area del costo del lavoro si chiama «Personale» e **non si tocca da qui**.
 *
 * Prima si chiamava «Persone» e si poteva scrivere a mano come un abbonamento,
 * mentre le stesse cifre venivano già calcolate dall'organico in
 * `/economics/personale` — cedolini, contributi, TFR, esoneri. Due posti che
 * scrivono la stessa riga producono sempre due numeri diversi, e quello
 * modificabile a mano vince per sbaglio.
 *
 * Qui l'area resta visibile, perché è un costo di struttura e nel budget del
 * mese ci deve stare: solo, si legge. Chi vuole cambiarla passa dalla sezione
 * Personale, che è l'unico posto dove quel numero ha un padre.
 */
export const PAYROLL_CENTER = 'Personale'

/** Riconosce l'area del personale anche col vecchio nome, per i mesi già scritti. */
export const isPayrollCenter = (name: string | null | undefined) =>
  ['personale', 'persone'].includes((name ?? '').trim().toLowerCase())

/**
 * Il tetto di un'area **non si digita: è la somma delle sue voci**.
 *
 * Prima era un numero a parte (`cost_centers.monthly_budget`, con override in
 * `cost_budgets`) e finiva sempre per divergere dal piano: 1.085 di tetto
 * contro 540 di voci reali non dice niente a nessuno, e nessuno si ricorda di
 * riallinearlo quando aggiunge un abbonamento. Le due colonne restano nel
 * database come storia, ma non le legge più nessuno.
 *
 * Conseguenza voluta: «usato» non è più spesa contro un tetto inventato, è
 * **spesa contro spesa prevista** — quanto del piano di questo mese è già uscito.
 */
export const budgetFor = (planned: number) => planned

/**
 * Il tetto del mese intero, che è un'altra cosa: non la somma delle aree ma un
 * **obiettivo**, il {cost_target_pct} del fatturato del mese (35% di default,
 * la stessa quota che il piano compensi mette da parte per i costi).
 *
 * Senza fatturato registrato non c'è obiettivo — e va detto, non mostrato come
 * uno zero: uno zero si legge come «non puoi spendere niente», che è falso.
 */
export function monthTarget(revenue: number, costTargetPct: number): {
  target: number
  /** false quando il mese non ha ancora ricavi: il target non è calcolabile */
  known: boolean
} {
  const known = revenue > 0
  return { target: known ? Math.round(revenue * costTargetPct * 100) / 100 : 0, known }
}

export type CenterRollup = {
  center: CostCenter
  /** = `planned`: il tetto dell'area è la somma delle sue voci (§180) */
  budget: number
  /** @deprecated resta per non rompere i chiamanti: nessun budget è più «custom» */
  budgetCustom: boolean
  /** quanto il piano dice che uscirà questo mese */
  planned: number
  plannedFixed: number
  plannedVariable: number
  /** quanto è davvero uscito, dalle righe del conto economico */
  actual: number
  actualFixed: number
  actualVariable: number
  /** positivo = del previsto deve ancora uscire, negativo = si è speso più del piano */
  left: number
  usedPct: number
  lines: number
}

const sum = (ns: number[]) => Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100

/**
 * Un'area per riga: quanto il piano dice che uscirà, e quanto è uscito davvero.
 * Il tetto non è più un terzo numero a parte — è il primo.
 */
export function rollup(
  centers: CostCenter[], items: CostItem[], actuals: CostActual[], month: string,
): CenterRollup[] {
  const due = plannedForMonth(items, month)

  return centers.map(center => {
    const own = due.filter(i => i.center_id === center.id)
    const spent = actuals.filter(a => a.center_id === center.id)
    const planned = sum(own.map(i => i.amount))
    const amount = budgetFor(planned)
    const actual = sum(spent.map(a => a.actual))

    return {
      center,
      budget: amount,
      budgetCustom: false,
      planned,
      plannedFixed: sum(own.filter(i => i.cost_type === 'F').map(i => i.amount)),
      plannedVariable: sum(own.filter(i => i.cost_type === 'V').map(i => i.amount)),
      actual,
      actualFixed: sum(spent.filter(a => a.cost_type === 'F').map(a => a.actual)),
      actualVariable: sum(spent.filter(a => a.cost_type === 'V').map(a => a.actual)),
      left: Math.round((amount - actual) * 100) / 100,
      usedPct: amount > 0 ? actual / amount : 0,
      lines: spent.length,
    }
  })
}

/** Quello che non ha un'area: va visto, non nascosto in un totale. */
export function orphans(items: CostItem[], actuals: CostActual[]) {
  return {
    items: items.filter(i => !i.center_id && i.is_active),
    actual: sum(actuals.filter(a => !a.center_id).map(a => a.actual)),
    lines: actuals.filter(a => !a.center_id).length,
  }
}

/** Costo annuo di una voce: serve a capire quanto pesa davvero un canone. */
export function yearlyCost(item: CostItem): number {
  if (item.frequency === 'una_tantum') return item.amount
  const step = STEP[item.frequency]
  return step > 0 ? Math.round((item.amount * (12 / step)) * 100) / 100 : 0
}

/** I prossimi mesi in cui la spesa tornerà: l'anteprima che evita sorprese. */
export function nextOccurrences(item: CostItem, from: string, count = 6): string[] {
  const out: string[] = []
  for (let i = 0; i < 24 && out.length < count; i++) {
    const m = shiftMonth(from, i)
    if (dueInMonth(item, m)) out.push(m)
  }
  return out
}

/** Quante volte la spesa cade fra due mesi, estremi inclusi. */
export function occurrencesBetween(item: CostItem, from: string, to: string): number {
  const span = monthsApart(first(from), first(to))
  if (span < 0) return 0
  let n = 0
  for (let i = 0; i <= Math.min(span, 120); i++) {
    if (dueInMonth(item, shiftMonth(first(from), i))) n++
  }
  return n
}

/**
 * I costi esterni raccolti **per subappaltatore**.
 *
 * Un subappalto quotato a rate produce otto righe che dicono tutte la stessa
 * cosa — «Subappalto — CRM — Rata 3 di 6» — e in fila diventano rumore: nessuno
 * legge otto righe per capire che c'è un fornitore con un lavoro da 18.000 €.
 * Raccolte sotto il nome di chi le emette si legge invece l'unica domanda utile:
 * **a chi stiamo dando quanto, e su quali lavori.**
 *
 * Chi non ha il fornitore compilato finisce in un gruppo suo, per ultimo: non è
 * un dettaglio estetico, è l'unica cosa che rende esigibile un accordo. Un costo
 * esterno senza un nome sopra non si può né contestare né rinegoziare.
 */
export type SupplierGroup = {
  /** nome del subappaltatore. null = non indicato, ed è una cosa da compilare */
  supplier: string | null
  items: CostItem[]
  /** la somma degli importi del gruppo: quanto vale l'accordo, non un canone */
  total: number
  /** peso annuo, per i canoni ricorrenti */
  yearly: number
  /** i lavori toccati: un fornitore può stare su più progetti */
  projectIds: string[]
  /** nessuna voce ha un progetto: è un costo esterno, non un subappalto */
  external: boolean
}

export function bySupplier(items: CostItem[]): SupplierGroup[] {
  const key = (i: CostItem) => i.supplier?.trim() || ''
  const names = Array.from(new Set(items.map(key)))

  return names
    .map(name => {
      const own = items.filter(i => key(i) === name)
      return {
        supplier: name || null,
        items: own,
        total: sum(own.map(i => i.amount)),
        yearly: sum(own.map(yearlyCost)),
        projectIds: Array.from(new Set(own.map(i => i.project_id).filter((p): p is string => !!p))),
        external: own.every(i => !i.project_id),
      }
    })
    // i nomi in ordine, e chi non ce l'ha per ultimo: è il gruppo da sistemare
    .sort((a, b) => {
      if (!a.supplier) return 1
      if (!b.supplier) return -1
      return a.supplier.localeCompare(b.supplier, 'it')
    })
}

export type MarginView = { revenue: number; cost: number; margin: number; pct: number }

export type ProjectMargin = {
  /** il mese in corso: rata o canone contro i costi esterni che cadono lì */
  month: MarginView & {
    planned: number
    actual: number
    /** true quando il costo usato è ancora una previsione */
    onPlan: boolean
  }
  /**
   * Il lavoro a corpo letto intero. Su un progetto venduto 30.000 in sei rate,
   * il margine del singolo mese non dice niente: conta quanto resta sul lavoro.
   */
  work: MarginView
  hasWork: boolean
  /** quanti mesi copre il progetto: serve a totalizzare i costi ricorrenti */
  workMonths: number
  /** ricorrenti senza fine nota: non totalizzabili, si dichiarano al mese */
  openCostPerMonth: number
}

/**
 * Quanto resta a TwoBee di questo progetto, letto in due modi.
 *
 * Solo i costi **esterni**: il tempo del team interno non si scarica qui, sta
 * nel costo del lavoro aziendale. Mescolare le due cose darebbe un margine più
 * onesto in teoria e inutilizzabile in pratica — nessuno rileva le ore.
 *
 * Il costo del mese: si preferisce quello effettivo quando le righe del conto
 * economico esistono, altrimenti resta il pianificato. Dirlo (`onPlan`) evita
 * che una previsione si legga come un consuntivo.
 *
 * Una lavorazione una tantum **conta nel mese in cui cade**: escluderla per
 * principio faceva sembrare al 100% di margine un mese in cui erano usciti
 * diecimila euro di fornitore.
 */
export function projectMargin(
  revenueOfMonth: number,
  oneOffRevenue: number,
  items: CostItem[],
  actuals: CostActual[],
  month: string,
  /** durata del progetto: senza, i costi ricorrenti non si possono totalizzare */
  window?: { start: string | null; end: string | null },
): ProjectMargin {
  const active = items.filter(i => i.is_active)

  // ── il mese ───────────────────────────────────────────────────────────────
  // Una riga già portata nel conto economico ha il preventivato in `budget` e
  // `actual` a zero finché non si registra la spesa vera. Leggere solo l'actual
  // faceva sparire il costo appena lo si pianificava: qui vale l'effettivo dove
  // c'è, il preventivato dove non c'è ancora.
  const planned = plannedForMonth(active, month)
  const inMonth = new Set(actuals.map(a => a.cost_item_id).filter(Boolean))
  const fromLines = sum(actuals.map(a => (a.actual > 0 ? a.actual : a.budget)))
  const notYetInMonth = sum(planned.filter(i => !inMonth.has(i.id)).map(i => i.amount))
  const monthCost = Math.round((fromLines + notYetInMonth) * 100) / 100
  const monthMargin = Math.round((revenueOfMonth - monthCost) * 100) / 100

  // ── il lavoro ─────────────────────────────────────────────────────────────
  // Un ricorrente su un progetto a termine ha un totale: 2.000 al mese per
  // cinque mesi sono 10.000, e vanno tolti dal quotato. Senza una fine nota non
  // si può totalizzare: si dichiara al mese invece di inventare un orizzonte.
  const start = window?.start ? first(window.start) : null
  const end = window?.end ? first(window.end) : null
  const workMonths = start && end ? Math.max(1, monthsApart(start, end) + 1) : 0

  let workCost = 0
  let openCostPerMonth = 0
  for (const i of active) {
    if (i.frequency === 'una_tantum') { workCost += i.amount; continue }
    const from = i.start_month ? first(i.start_month) : start
    const to = i.end_month ? first(i.end_month) : end
    if (from && to) workCost += i.amount * occurrencesBetween(i, from, to)
    else openCostPerMonth += i.amount
  }
  workCost = Math.round(workCost * 100) / 100
  const workMargin = Math.round((oneOffRevenue - workCost) * 100) / 100

  return {
    month: {
      revenue: revenueOfMonth, cost: monthCost, margin: monthMargin,
      pct: revenueOfMonth > 0 ? monthMargin / revenueOfMonth : 0,
      planned: sum(planned.map(i => i.amount)),
      actual: sum(actuals.map(a => a.actual)),
      onPlan: actuals.every(a => a.actual === 0),
    },
    work: {
      revenue: oneOffRevenue, cost: workCost, margin: workMargin,
      pct: oneOffRevenue > 0 ? workMargin / oneOffRevenue : 0,
    },
    hasWork: oneOffRevenue > 0 || workCost > 0,
    workMonths,
    openCostPerMonth: Math.round(openCostPerMonth * 100) / 100,
  }
}

/**
 * Aree che TwoBee non ha ancora e che il suo modo di lavorare rende probabili.
 *
 * Non è una lista di buone pratiche generiche: esce da cosa c'è nel piano
 * (37 voci, 9.750 €/mese) e soprattutto da cosa **non** c'è. Ogni voce porta
 * il motivo, perché un'area senza motivo è solo una cartella in più.
 */
export const SUGGESTED_CENTERS: { name: string; description: string; why: string; budget: number }[] = [
  {
    name: 'Imposte & Contributi',
    description: 'IVA da versare, contributi, imposte sul reddito',
    why: 'È il buco più grosso del piano attuale: non c\'è nessuna riga. Il margine lordo del conto economico si legge come utile, ma il 22% di IVA e i contributi escono comunque. Finché non stanno qui, la cassa dice sempre più di quello che è.',
    budget: 0,
  },
  {
    name: 'Prodotto & R&D',
    description: 'Il gestionale interno: AI, VPS, repository, tempo di sviluppo',
    why: 'Claude Max, GPT, GitHub e il VPS oggi stanno in Struttura & Software insieme a Canva. Ma non sono licenze d\'esercizio: sono l\'investimento in un prodotto. Separati si sa quanto costa costruirlo — e se un domani lo vendi, quanto è costato.',
    budget: 170,
  },
  {
    name: 'Acquisizione clienti',
    description: 'Provvigioni, segnalatori, advertising su TwoBee, eventi',
    why: 'Le provvigioni (15%) vivono nel piano compensi, l\'adv in Marketing, gli eventi pure: tre posti diversi per la stessa domanda, «quanto mi costa un cliente nuovo». Insieme danno il CAC e si confrontano col valore del contratto.',
    budget: 900,
  },
  {
    name: 'Formazione & Certificazioni',
    description: 'Certificazioni Google/Meta partner, corsi, community',
    why: 'Un\'agenzia growth vende competenza certificata. Oggi non c\'è una riga: o non si investe, o si investe e non si vede. Nessuna delle due è una buona notizia.',
    budget: 0,
  },
  {
    name: 'Budget media clienti',
    description: 'Advertising del cliente anticipato dal conto TwoBee',
    why: 'Se l\'adv di un cliente passa dalla vostra carta non è un costo: è cassa anticipata che torna in fattura. Mescolarla ai costi fa sembrare l\'azienda più costosa di quanto sia e nasconde il rischio vero, cioè quanto state anticipando.',
    budget: 0,
  },
  {
    name: 'Assicurazioni & Rischi',
    description: 'RC professionale, cyber, tutela legale',
    why: 'Costa poco e non serve mai, finché serve. Con clienti che vi affidano account pubblicitari e dati, è la spesa che protegge il resto del conto economico.',
    budget: 0,
  },
]

export type CostFinding = {
  id: string
  severity: 'critico' | 'attenzione' | 'ok'
  title: string
  detail: string
  action?: string
}

/**
 * Cosa non torna nel piano. Regole, non intelligenza artificiale: ognuna
 * risponde a una domanda che un titolare si fa guardando i costi.
 */
export function costInsights(
  rows: CenterRollup[], items: CostItem[], actuals: CostActual[], month: string,
): CostFinding[] {
  const out: CostFinding[] = []

  /* §180: il tetto di un'area è la somma delle sue voci, quindi «oltre il
     budget» vuol dire una cosa sola e precisa: è uscito più di quanto il piano
     prevedesse. Non è più un tetto discutibile, è una voce che manca. */
  const over = rows.filter(r => r.planned > 0 && r.actual > r.planned)
  if (over.length) {
    const amount = over.reduce((s, r) => s + (r.actual - r.planned), 0)
    out.push({
      id: 'over-budget', severity: 'critico',
      title: `${over.length} aree hanno speso ${eur(amount)} più del previsto`,
      detail: over.map(r => `${r.center.name} ${eur(r.actual - r.planned)}`).join(' · '),
      action: 'La spesa c\'è ma il piano non la conosce: aggiungi la voce mancante, o correggi l\'importo di quella che c\'è.',
    })
  }

  // spesa senza nessuna voce a piano: l'area esiste, il piano è vuoto
  const unplanned = rows.filter(r => r.planned === 0 && r.actual > 0)
  if (unplanned.length) {
    out.push({
      id: 'no-budget', severity: 'attenzione',
      title: `${unplanned.length} aree spendono senza una voce a piano`,
      detail: `${unplanned.map(r => r.center.name).join(', ')}: escono soldi che nessuna voce ricorrente aveva previsto.`,
      action: 'Metti a piano quello che torna ogni mese: da lì in poi il tetto dell\'area si calcola da solo.',
    })
  }

  /* §184: le righe del personale non contano né come «senza area» né come
     «fuori piano». Non hanno una voce di piano per disegno — le riscrive
     l'organico ogni mese — e segnalarle come dimenticanze mandava a promuoverle
     a spesa ricorrente, cioè a contare due volte lo stesso stipendio. */
  const payrollIds = new Set(rows.filter(r => isPayrollCenter(r.center.name)).map(r => r.center.id))
  const structural = actuals.filter(a =>
    !isPayrollCenter(a.category) && !(a.center_id && payrollIds.has(a.center_id)))

  const loose = structural.filter(a => !a.center_id)
  if (loose.length) {
    const amount = loose.reduce((s, a) => s + a.actual, 0)
    out.push({
      id: 'loose-lines', severity: 'attenzione',
      title: `${eur(amount)} di uscite senza area`,
      detail: `${loose.length} righe del mese non pesano su nessun budget: i totali per area sono più bassi del vero.`,
      action: 'Assegna l\'area dalla colonna «Area» nel conto economico.',
    })
  }

  /* Le spese fuori piano NON hanno una segnalazione qui: le elenca già la
     sezione «Uscite del mese fuori piano», con accanto il pulsante che le rende
     ricorrenti. Una diagnosi che ripete la stessa frase senza l'azione è solo
     una carta in più da leggere. */

  const totActual = rows.reduce((s, r) => s + r.actual, 0)
  const fixed = rows.reduce((s, r) => s + r.actualFixed, 0)
  if (totActual > 0 && fixed / totActual > 0.85) {
    out.push({
      id: 'rigid', severity: 'attenzione',
      title: `${Math.round((fixed / totActual) * 100)}% dei costi è fisso`,
      detail: `${eur(fixed)} escono comunque, anche a fatturato zero. È il numero che dice quanto devi vendere ogni mese solo per stare fermo.`,
      action: 'Guarda cosa può diventare variabile: outsourcing al posto di struttura, canoni a consumo.',
    })
  }

  const zombie = items.filter(i => i.is_active && i.amount === 0)
  if (zombie.length) {
    out.push({
      id: 'zero-items', severity: 'ok',
      title: `${zombie.length} voci attive a zero euro`,
      detail: 'Sono in piano ma non generano niente: o hanno un prezzo che nessuno ha ancora messo, o vanno sospese.',
    })
  }

  const orphanFreq = items.filter(i => i.is_active && i.frequency !== 'mensile' && !i.start_month)
  if (orphanFreq.length) {
    out.push({
      id: 'no-start', severity: 'attenzione',
      title: `${orphanFreq.length} voci non ricorrenti senza mese d'inizio`,
      detail: `${orphanFreq.map(i => i.label).join(', ')}: «ogni tre mesi» a partire da quando? Senza inizio non cadono in nessun mese e restano fuori da ogni conto.`,
      action: 'Metti il mese di partenza nel dettaglio della voce.',
    })
  }

  const due = plannedForMonth(items, month)
  const missing = due.filter(i => !actuals.some(a => a.cost_item_id === i.id))
  if (missing.length) {
    const amount = missing.reduce((s, i) => s + i.amount, 0)
    out.push({
      id: 'not-applied', severity: 'attenzione',
      title: `${eur(amount)} di piano non è ancora nel mese`,
      detail: `${missing.length} voci cadono in ${month.slice(0, 7)} ma non hanno una riga nel conto economico.`,
      action: 'Usa «Porta nel mese»: crea le uscite col preventivato, la spesa reale la registri tu.',
    })
  }

  const order = { critico: 0, attenzione: 1, ok: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity])
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  mensile: 'ogni mese', bimestrale: 'ogni 2 mesi', trimestrale: 'ogni 3 mesi',
  semestrale: 'ogni 6 mesi', annuale: 'una volta l\'anno', una_tantum: 'una tantum',
}
