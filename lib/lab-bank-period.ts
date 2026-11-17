import { labMonth, monthEnd } from '@/lib/lab-bank'
export type BankPeriod = { mode: string; from: string; to: string; label: string; issue: string | null }
export const BANK_PERIODS = [['mese', 'Mese'], ['30', 'Ultimi 30 giorni'], ['90', 'Ultimi 90 giorni'], ['6mesi', 'Ultimi 6 mesi'], ['trimestre', 'Trimestre'], ['anno', 'Anno'], ['libero', 'Periodo libero'], ['tutto', 'Tutto lo storico']] as const
const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
const shiftDays = (s: string, days: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
export function bankPeriod(p: { periodo?: string; m?: string; dal?: string; al?: string }, today: string, earliest?: string): BankPeriod {
  const month = labMonth(p.m, today), mode = BANK_PERIODS.some(([key]) => key === p.periodo) ? p.periodo! : 'mese'
  let from = month, to = monthEnd(month), issue: string | null = null
  if (mode === '30' || mode === '90') { from = shiftDays(today, 1 - Number(mode)); to = today }
  if (mode === '6mesi') { const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 5); from = d.toISOString().slice(0, 10); to = today }
  if (mode === 'trimestre') { from = `${month.slice(0, 4)}-${String(Math.floor((Number(month.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`; const d = new Date(`${from}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 3); d.setUTCDate(0); to = d.toISOString().slice(0, 10) }
  if (mode === 'anno') { from = `${month.slice(0, 4)}-01-01`; to = `${month.slice(0, 4)}-12-31` }
  if (mode === 'tutto') { from = earliest && valid(earliest) ? earliest : today; to = today }
  if (mode === 'libero') { if (valid(p.dal ?? '') && valid(p.al ?? '') && p.dal! <= p.al!) { from = p.dal!; to = p.al! } else issue = 'Intervallo non valido: scegli date reali e una data iniziale non successiva alla finale. È mostrato il mese selezionato.' }
  const effective = issue ? 'mese' : mode
  return { mode: effective, from, to, label: `${from} → ${to}`, issue }
}
