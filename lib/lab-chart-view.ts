export type ChartView = { version: 1; chart: string; heading: string; type: 'bar' | 'line'; keys: string[]; query: string; group: string; from: string; to: string; sort: 'source' | 'label' | 'value' }
const date = (v: unknown): v is string => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v)
/** Views contain presentation settings only; never economic rows or amounts. */
export function parseChartView(text: string, chart: string, series: string[], groups: string[], temporal: boolean, singleGroup: boolean): ChartView | null {
  if (text.length > 16000) return null
  try {
    const v = JSON.parse(text)
    if (!v || v.version !== 1 || v.chart !== chart || typeof v.heading !== 'string' || v.heading.length > 100 || typeof v.query !== 'string' || v.query.length > 200
      || !['bar', ...(temporal ? ['line'] : [])].includes(v.type) || !Array.isArray(v.keys) || v.keys.length > series.length || !v.keys.every((k: unknown) => typeof k === 'string' && series.includes(k)) || new Set(v.keys).size !== v.keys.length
      || typeof v.group !== 'string' || !(v.group === '' && !singleGroup || groups.includes(v.group)) || !date(v.from) || !date(v.to) || v.from && v.to && v.from > v.to || !['source', 'label', 'value'].includes(v.sort)) return null
    return { version: 1, chart, heading: v.heading, type: v.type, keys: v.keys, query: v.query, group: v.group, from: v.from, to: v.to, sort: v.sort }
  } catch { return null }
}
