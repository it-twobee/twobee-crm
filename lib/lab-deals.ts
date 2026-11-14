import { coveredProjects, type Coverage, type RevenueStream } from '@/lib/revenue'

export function dealState(stream: Pick<RevenueStream, 'status' | 'start_date' | 'end_date'>, today: string) {
  if (stream.status === 'bozza') return { label: 'Da avviare', detail: 'Bozza: patto ancora da confermare' }
  if (stream.status === 'sospeso') return { label: 'Sospeso', detail: 'Il trattamento dei canoni durante la sospensione va verificato nel patto' }
  if (stream.status === 'concluso') return { label: 'Concluso', detail: 'Rate e riscontri residui restano da verificare' }
  if (stream.status !== 'attivo') return { label: 'n/d', detail: 'Stato non riconosciuto: da verificare' }
  if (stream.start_date && stream.start_date > today) return { label: 'Da avviare', detail: `Attivo nel registro, avvio previsto ${stream.start_date}` }
  return {
    label: 'Attivo',
    detail: stream.end_date && stream.end_date < today ? 'Fine nel passato ma stato ancora attivo: da verificare' : 'Secondo lo stato registrato del patto',
  }
}

export function dealProjects(stream: RevenueStream, coverage: Coverage) {
  const ids = coveredProjects(stream, coverage)
  const declared = coverage.get(stream.id) ?? []
  return {
    ids, shared: ids.length > 1,
    needsReview: declared.length === 1 && declared[0] !== stream.project_id,
  }
}

export function knownAmount(value: unknown): number | null {
  return (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === ''
    || !Number.isFinite(Number(value)) ? null : Number(value)
}

export type DealLine = { id: string; month_id: string; stream_id?: string | null; installment_id?: string | null; cost_item_id?: string | null; invoice_id?: string | null }

export function installmentLines(installmentId: string, lines: DealLine[]): DealLine[] {
  return lines.filter(l => l.installment_id === installmentId)
}
