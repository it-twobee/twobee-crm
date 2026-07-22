/**
 * Motore delle routine Growth: seed aziendale e calcolo dei periodi.
 *
 * Puro e deterministico, come `lib/workload.ts`: nessuna dipendenza da React o
 * Supabase, così si testa da solo.
 *
 * Il seed è il DEFAULT aziendale. Una volta creata su un progetto, ogni routine
 * è una copia indipendente: cambiarla lì non tocca gli altri clienti, e cambiare
 * il seed non ritocca le routine già esistenti. È voluto — le persone e i
 * processi divergono per cliente, e propagare all'indietro sorprenderebbe.
 */

export type RoutineFrequency = 'settimanale' | 'quindicinale' | 'mensile' | 'trimestrale'

/** Focus del progetto Growth. Corrisponde a `projects.project_type`. */
export type GrowthFocus = 'ecommerce' | 'lead_gen' | 'generico'

export interface RoutineSeed {
  key: string
  title: string
  description: string
  frequency: RoutineFrequency
  hours: number
}

/**
 * Routine comuni a ogni progetto Growth, qualunque sia il focus.
 * Ore a 1,0: `lib/workload.ts` assegna 4h alle task senza stima, quindi
 * "nessuna stima" non significherebbe peso zero ma 4h — su ~127 task/mese
 * farebbe 508h e renderebbe il Workload inutilizzabile.
 */
const COMMON: RoutineSeed[] = [
  { key: 'ads_check', title: 'Controllo campagne ads', frequency: 'settimanale', hours: 1,
    description: 'Spesa e performance, stop agli annunci in perdita.' },
  { key: 'budget_opt', title: 'Ottimizzazione budget', frequency: 'settimanale', hours: 1,
    description: 'Riallocazione fra campagne in base ai risultati.' },
  { key: 'tracking', title: 'Verifica tracking', frequency: 'mensile', hours: 1,
    description: 'Pixel, conversioni, GA4: integrità dei dati su cui decidiamo.' },
  { key: 'creative', title: 'Refresh creatività', frequency: 'mensile', hours: 1,
    description: 'Nuovi asset per contrastare l’ad fatigue.' },
  { key: 'automation', title: 'Controllo automazioni', frequency: 'mensile', hours: 1,
    description: 'Flussi email e CRM, sequenze attive.' },
  { key: 'report', title: 'Report mensile cliente', frequency: 'mensile', hours: 1,
    description: 'Documento consegnato al cliente.' },
  { key: 'meeting', title: 'Meeting periodico cliente', frequency: 'mensile', hours: 1,
    description: 'Call di allineamento.' },
  { key: 'review', title: 'Review strategica e KPI', frequency: 'trimestrale', hours: 1,
    description: 'Analisi profonda e ricalibrazione degli obiettivi.' },
]

/** Un e-commerce ottimizza il carrello; una lead gen ottimizza la qualità dei contatti. */
const BY_FOCUS: Record<GrowthFocus, RoutineSeed[]> = {
  ecommerce: [
    { key: 'ecom_revenue', title: 'Analisi vendite e ROAS', frequency: 'settimanale', hours: 1,
      description: 'Ordini, valore medio, ritorno sulla spesa pubblicitaria.' },
    { key: 'ecom_cart', title: 'Controllo carrelli abbandonati', frequency: 'settimanale', hours: 1,
      description: 'Tasso di abbandono e recupero via flussi automatici.' },
    { key: 'ecom_catalog', title: 'Verifica catalogo e feed', frequency: 'mensile', hours: 1,
      description: 'Disponibilità, prezzi, feed prodotti verso i canali.' },
  ],
  lead_gen: [
    { key: 'lead_quality', title: 'Analisi lead e qualità', frequency: 'settimanale', hours: 1,
      description: 'Volume, costo per lead e qualità dei contatti consegnati.' },
    { key: 'lead_followup', title: 'Verifica follow-up commerciale', frequency: 'settimanale', hours: 1,
      description: 'I lead vengono ricontattati? Quanti diventano opportunità.' },
    { key: 'lead_funnel', title: 'Ottimizzazione funnel e form', frequency: 'mensile', hours: 1,
      description: 'Landing, form, frizioni nel percorso di conversione.' },
  ],
  generico: [
    { key: 'lead_quality', title: 'Analisi lead e qualità', frequency: 'settimanale', hours: 1,
      description: 'Volume e qualità dei contatti generati.' },
  ],
}

/** Il seed completo per un progetto, dato il suo focus. */
export function routineSeed(focus: GrowthFocus): RoutineSeed[] {
  return [...BY_FOCUS[focus], ...COMMON]
}

/** `projects.project_type` → focus Growth. */
export function focusOf(projectType: string | null | undefined): GrowthFocus {
  if (projectType === 'ecommerce') return 'ecommerce'
  if (projectType === 'lead_gen') return 'lead_gen'
  return 'generico'
}

/**
 * KPI rilevanti per focus: `client_kpis` li ha già tutti, ma mostrarli tutti
 * insieme non aiuta nessuno. Un e-commerce non guarda il costo per lead.
 */
export const KPI_BY_FOCUS: Record<GrowthFocus, { key: string; label: string }[]> = {
  ecommerce: [
    { key: 'revenue_attributed', label: 'Ricavo attribuito' },
    { key: 'roas', label: 'ROAS' },
    { key: 'orders_count', label: 'Ordini' },
    { key: 'avg_order_value', label: 'Valore medio ordine' },
    { key: 'cart_abandonment', label: 'Carrelli abbandonati' },
  ],
  lead_gen: [
    { key: 'leads_generated', label: 'Lead generati' },
    { key: 'cpl', label: 'Costo per lead' },
    { key: 'sql_count', label: 'Lead qualificati' },
    { key: 'conversion_rate', label: 'Tasso di conversione' },
    { key: 'cpa', label: 'CPA' },
  ],
  generico: [
    { key: 'mer', label: 'MER' },
    { key: 'ad_spend', label: 'Spesa ads' },
    { key: 'ctr', label: 'CTR' },
    { key: 'conversion_rate', label: 'Tasso di conversione' },
  ],
}

// ─── Periodi ────────────────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Lunedì della settimana ISO che contiene `d`. */
export function weekStart(d: Date): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
  return s
}

/** Numero di settimana ISO. */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: t.getUTCFullYear(), week }
}

/**
 * Chiave del periodo: è la metà del vincolo `UNIQUE(routine_id, period_key)`.
 * Due esecuzioni del generatore sullo stesso periodo producono la stessa chiave,
 * quindi la seconda non inserisce nulla.
 */
export function periodKey(freq: RoutineFrequency, d: Date): string {
  if (freq === 'settimanale' || freq === 'quindicinale') {
    const { year, week } = isoWeek(d)
    return `${year}-W${String(week).padStart(2, '0')}`
  }
  if (freq === 'mensile') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

/** Scadenza dell'occorrenza: fine del periodo a cui appartiene. */
export function periodDue(freq: RoutineFrequency, d: Date): string {
  if (freq === 'settimanale' || freq === 'quindicinale') {
    const end = weekStart(d)
    end.setDate(end.getDate() + 4)   // venerdì
    return iso(end)
  }
  if (freq === 'mensile') return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  const q = Math.floor(d.getMonth() / 3)
  return iso(new Date(d.getFullYear(), q * 3 + 3, 0))
}

/**
 * I periodi da generare fra due date. Le quindicinali cadono nelle settimane
 * ISO pari, così la cadenza è stabile e non dipende da quando parte il contratto.
 */
export function periodsBetween(freq: RoutineFrequency, from: Date, to: Date): Date[] {
  const out: Date[] = []
  const seen = new Set<string>()
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)

  while (cur <= to) {
    if (freq === 'quindicinale' && isoWeek(cur).week % 2 !== 0) {
      cur.setDate(cur.getDate() + 7)
      continue
    }
    const k = periodKey(freq, cur)
    if (!seen.has(k)) { seen.add(k); out.push(new Date(cur)) }

    if (freq === 'settimanale' || freq === 'quindicinale') cur.setDate(cur.getDate() + 7)
    else if (freq === 'mensile') cur.setMonth(cur.getMonth() + 1)
    else cur.setMonth(cur.getMonth() + 3)
  }
  return out
}

/** Le frequenze che si auto-chiudono a `non_svolta` (decisione Q21, variante C+). */
export const AUTO_CLOSE: RoutineFrequency[] = ['settimanale', 'quindicinale']
