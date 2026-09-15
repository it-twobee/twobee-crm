/**
 * §337 — La regola di ricorrenza, in un posto solo.
 *
 * «Ogni lunedì», «il 25 del mese», «ogni due settimane» è una regola, non un
 * livello della gerarchia (doc 08): produce **occorrenze reali** — task e
 * milestone vere, ognuna col suo stato e la sua storia — e non una riga che si
 * sposta in avanti perdendo il passato.
 *
 * Sta qui e non nel database per la ragione che governa tutto il repo: era
 * scritta in SQL dentro `generate_recurring_task_occurrences()`, e appena è
 * servita **anche** alla pagina — per dire «la prossima è il 22» prima di
 * salvare, e per mostrare sul calendario solo la tappa più vicina — la seconda
 * copia sarebbe stata inevitabile. Due implementazioni della stessa regola
 * danno la stessa risposta finché qualcuno non corregge una delle due.
 *
 * Tutte le date sono **giorni**, in ISO `YYYY-MM-DD`, e i conti si fanno in UTC:
 * una ricorrenza «ogni lunedì» calcolata con l'ora locale cade di domenica per
 * metà Europa una volta l'anno, ed è il genere di errore che si scopre dal
 * calendario di qualcun altro.
 */

export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'custom'

export type RecurrenceRule = {
  frequency: RecurrenceFrequency
  /** ogni quanti periodi: 2 su `weekly` = ogni due settimane */
  interval?: number | null
  /** 0 = domenica … 6 = sabato. Solo su `weekly`/`biweekly` */
  weekdays?: number[] | null
  /** il giorno del mese. Solo su `monthly`/`quarterly` */
  day_of_month?: number | null
  start_date: string
  end_date?: string | null
}

const DAY = 86_400_000
const d = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const dow = (t: number) => new Date(t).getUTCDay()
const dom = (t: number) => new Date(t).getUTCDate()
const ym = (t: number) => { const x = new Date(t); return x.getUTCFullYear() * 12 + x.getUTCMonth() }
const nonNeg = (n: number) => (n < 0 ? 0 : n)

/** L'intervallo vale almeno 1: `ogni 0 settimane` non è una ricorrenza. */
const step = (r: RecurrenceRule) => Math.max(1, Math.trunc(r.interval ?? 1))

/**
 * Il giorno cade sulla regola?
 *
 * `monthly` col giorno 31 **non ricade** a febbraio, e questa è una scelta: lo
 * spostamento al 28 farebbe comparire una chiusura mensile tre giorni prima
 * senza che nessuno l'abbia chiesto, e chi la riceve non ha modo di sapere
 * perché. Chi vuole «fine mese» sceglie un giorno che esiste sempre.
 */
export function matches(r: RecurrenceRule, day: string): boolean {
  const t = d(day), s = d(r.start_date)
  if (t < s) return false
  if (r.end_date && t > d(r.end_date)) return false

  switch (r.frequency) {
    case 'daily':
      return Math.round((t - s) / DAY) % step(r) === 0
    case 'weekly':
    case 'biweekly': {
      const days = r.weekdays?.length ? r.weekdays : [dow(s)]
      if (!days.includes(dow(t))) return false
      /* Le settimane si contano **dalla prima occorrenza**, non dalla data di
         partenza né dai giorni trascorsi. Con partenza mercoledì 2 e ricorrenza
         del lunedì, chi la scrive si aspetta il lunedì dopo — il 7 — e poi ogni
         due: contando dalla settimana del 2 la serie partiva dal 14, saltando
         la prima. E contando i giorni (`(t - s) / 7`) il primo lunedì finiva in
         settimana zero e il secondo in settimana uno, cioè una su due spariva. */
      const weeks = Math.floor((startOfWeek(t) - startOfWeek(firstWeekly(r, days))) / (7 * DAY))
      const every = r.frequency === 'biweekly' ? 2 * step(r) : step(r)
      return weeks >= 0 && weeks % every === 0
    }
    case 'monthly':
    case 'quarterly': {
      if (dom(t) !== (r.day_of_month ?? dom(s))) return false
      const months = ym(t) - ym(s)
      const every = r.frequency === 'quarterly' ? 3 * step(r) : step(r)
      return months >= 0 && months % every === 0
    }
    /* `custom` è una RRULE iCal e non si interpreta a mano: senza un lettore
       vero non produce niente, e dirlo è meglio che indovinare una data. */
    case 'custom':
    default:
      return false
  }
}

/** Il lunedì della settimana di una data: l'ancora con cui si contano le settimane. */
function startOfWeek(t: number): number {
  const shift = (dow(t) + 6) % 7
  return t - shift * DAY
}

/** Il primo giorno buono da `start_date` in poi: da lì comincia a contare la serie. */
function firstWeekly(r: RecurrenceRule, days: number[]): number {
  const s = d(r.start_date)
  for (let i = 0; i < 7; i++) if (days.includes(dow(s + i * DAY))) return s + i * DAY
  return s
}

/**
 * Le occorrenze fra due giorni, estremi compresi.
 *
 * `cap` esiste perché una regola giornaliera su una finestra lunga produce
 * centinaia di righe: il limite è dichiarato e non silenzioso, così chi lo
 * incontra sa che la finestra era troppo larga e non che la regola è rotta.
 */
export function occurrencesBetween(
  r: RecurrenceRule, from: string, to: string, cap = 400,
): string[] {
  const out: string[] = []
  const end = d(to)
  let t = Math.max(d(from), d(r.start_date))
  while (t <= end && out.length < cap) {
    if (matches(r, iso(t))) out.push(iso(t))
    t += DAY
  }
  return out
}

/**
 * La prima occorrenza da `from` in poi, se c'è.
 *
 * `horizon` limita la ricerca: una regola scaduta o `custom` non ne ha nessuna,
 * e scandire all'infinito per scoprirlo bloccherebbe la pagina.
 */
export function nextOccurrence(
  r: RecurrenceRule, from: string, horizon = 400,
): string | null {
  const end = iso(d(from) + horizon * DAY)
  const limit = r.end_date && d(r.end_date) < d(end) ? r.end_date : end
  if (d(limit) < d(from)) return null
  return occurrencesBetween(r, from, limit, 1)[0] ?? null
}

/**
 * §337 — la tappa da mostrare sul calendario: **una sola per serie**.
 *
 * Una milestone ricorrente ne genera una per periodo, e metterle tutte in fila
 * su una corsia rende il calendario illeggibile proprio dove serviva: dodici
 * bandierine identiche nascondono le consegne vere. Si mostra **la più vicina a
 * oggi guardando avanti** — è quella su cui si può ancora fare qualcosa — e
 * solo quando non ce n'è più nessuna davanti si mostra l'ultima passata, che
 * dice «questa serie è finita» invece di far sparire la riga.
 */
export function nearestToToday<T extends { due_date?: string | null }>(
  items: T[], today: string,
): T | null {
  const dated = items.filter(x => !!x.due_date)
  if (!dated.length) return null
  const future = dated.filter(x => (x.due_date as string) >= today)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))
  if (future.length) return future[0]
  return dated.slice().sort((a, b) =>
    (b.due_date as string).localeCompare(a.due_date as string))[0]
}

/**
 * Raggruppa per serie e tiene solo la tappa viva di ciascuna.
 *
 * Quello che **non** nasce da una ricorrenza passa intero: una consegna vera non
 * si accorpa con niente, e il giorno in cui questa funzione la nascondesse il
 * calendario smetterebbe di essere il posto dove si guardano le consegne.
 */
export function collapseSeries<T extends { due_date?: string | null; recurring_template_id?: string | null }>(
  items: T[], today: string,
): T[] {
  const bySeries = new Map<string, T[]>()
  const out: T[] = []
  for (const x of items) {
    const key = x.recurring_template_id
    if (!key) { out.push(x); continue }
    bySeries.set(key, [...(bySeries.get(key) ?? []), x])
  }
  for (const group of Array.from(bySeries.values())) {
    const one = nearestToToday(group, today)
    if (one) out.push(one)
  }
  return out
}

/** Quante occorrenze una regola produrrebbe in un mese: serve a dirlo prima di salvare. */
export function monthlyVolume(r: RecurrenceRule, from: string): number {
  return nonNeg(occurrencesBetween(r, from, iso(d(from) + 30 * DAY)).length)
}

/** Come si legge una regola, in italiano e senza gergo di colonna. */
export const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  daily: 'ogni giorno',
  weekly: 'ogni settimana',
  biweekly: 'ogni due settimane',
  monthly: 'ogni mese',
  quarterly: 'ogni trimestre',
  custom: 'regola personalizzata',
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

export function ruleLabel(r: RecurrenceRule): string {
  const n = step(r)
  switch (r.frequency) {
    case 'daily':
      return n === 1 ? 'ogni giorno' : `ogni ${n} giorni`
    case 'weekly':
    case 'biweekly': {
      const days = (r.weekdays?.length ? r.weekdays : [dow(d(r.start_date))])
        .slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(x => GIORNI[x])
      const ogni = r.frequency === 'biweekly' ? 'ogni due settimane' : n === 1 ? 'ogni settimana' : `ogni ${n} settimane`
      return `${ogni}, di ${days.join(' e ')}`
    }
    case 'monthly':
    case 'quarterly': {
      const giorno = r.day_of_month ?? dom(d(r.start_date))
      const ogni = r.frequency === 'quarterly' ? 'ogni trimestre' : n === 1 ? 'ogni mese' : `ogni ${n} mesi`
      return `${ogni}, il ${giorno}`
    }
    default:
      return 'regola personalizzata'
  }
}
