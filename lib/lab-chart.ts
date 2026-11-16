/** Presentation only: values come from the canonical section, null never becomes zero. */
export type ChartRow = { id: string; label: string; group?: string; groupId?: string; date?: string; href?: string; values: Record<string, number | null> }
export type ChartSeries = { key: string; label: string }
export type ChartFilter = { query: string; group: string; from: string; to: string; sort: string }
export const chartValue = (value: unknown): number | null => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) ? Number(value) : null
export function filterChartRows(rows: ChartRow[], filter: ChartFilter, series: string[]) {
  const result = rows.filter(r => (!filter.group || (r.groupId ?? r.group) === filter.group)
    && (!filter.query || `${r.label} ${r.group ?? ''}`.toLocaleLowerCase('it').includes(filter.query.toLocaleLowerCase('it')))
    && (!filter.from || !!r.date && r.date >= filter.from) && (!filter.to || !!r.date && r.date <= filter.to))
  const value = (r: ChartRow) => series.reduce((sum, k) => sum + Math.abs(chartValue(r.values[k]) ?? 0), 0)
  return filter.sort === 'value' ? [...result].sort((a, b) => value(b) - value(a))
    : filter.sort === 'label' ? [...result].sort((a, b) => a.label.localeCompare(b.label, 'it')) : result
}
const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  // Spreadsheet formula injection applies to text, not finite numeric amounts.
  const safe = typeof v === 'number' ? s.replace('.', ',') : /^[\s]*[=+@-]/.test(s) ? `'${s}` : s
  return `"${safe.replaceAll('"', '""')}"`
}
export function chartCsv(title: string, note: string, rows: ChartRow[], series: ChartSeries[], context: string) {
  return '\uFEFF' + [[title], [note], [context], ['ID voce', 'Voce', 'Gruppo', 'Data', 'Fonte', ...series.map(s => s.label)],
    ...rows.map(r => [r.id, r.label, r.group ?? '', r.date ?? '', r.href ?? '', ...series.map(s => chartValue(r.values[s.key]) ?? 'n/d')])]
    .map(row => row.map(csvCell).join(';')).join('\r\n')
}
