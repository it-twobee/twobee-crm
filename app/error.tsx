'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-white text-xl font-bold mb-2">Qualcosa è andato storto</h2>
        <p className="text-[#A0A0A0] text-sm mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-[#F5C800] text-black font-bold rounded-lg text-sm"
        >
          Riprova
        </button>
      </div>
    </div>
  )
}
