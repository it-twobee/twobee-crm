'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="text-center">
        <h2 className="text-text-primary text-lg font-bold mb-2">Errore nel caricamento</h2>
        <p className="text-text-secondary text-sm mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-gold text-on-gold font-bold rounded-lg text-sm"
        >
          Riprova
        </button>
      </div>
    </div>
  )
}
