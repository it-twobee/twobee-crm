'use client'
import { labChecksCsv, type LabCheck } from '@/lib/lab-checks'
export default function LabChecksExport({ items, context }: { items: LabCheck[]; context: string }) {
  return <button type="button" disabled={!items.length} className="min-h-11 rounded-xl border border-border-interactive px-3 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50" onClick={() => {
    const rows = items.map(i => ({ ...i, href: new URL(i.href, window.location.href).href }))
    const url = URL.createObjectURL(new Blob([labChecksCsv(rows, context)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'verifiche-laboratorio.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }}>Esporta verifiche filtrate CSV</button>
}
