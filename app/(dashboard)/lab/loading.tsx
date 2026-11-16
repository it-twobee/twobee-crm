export default function LabLoading() {
  return <div role="status" aria-live="polite" aria-busy="true" className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
    <p className="text-sm font-medium text-text-primary">Apertura della sezione e lettura delle fonti…</p>
    <p className="text-2xs text-text-secondary">I valori compariranno con i rispettivi riscontri.</p>
    <div aria-hidden="true" className="grid gap-3 sm:grid-cols-3">{[1, 2, 3].map(n => <div key={n} className="h-24 rounded-2xl border border-border bg-surface motion-safe:animate-pulse" />)}</div>
  </div>
}
