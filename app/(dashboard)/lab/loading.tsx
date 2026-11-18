export default function LabLoading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6">
      <div className="flex min-h-24 items-center gap-3 rounded-2xl border border-border bg-surface p-4">
        <span aria-hidden className="h-10 w-10 shrink-0 rounded-xl bg-gold-dim motion-safe:animate-pulse" />
        <p className="text-sm font-medium text-text-primary">Caricamento della sezione…</p>
      </div>
      <div aria-hidden className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[1, 2, 3, 4].map(n => <div key={n} className="h-20 rounded-xl border border-border bg-surface motion-safe:animate-pulse" />)}
      </div>
    </div>
  )
}
