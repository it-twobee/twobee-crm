export default function PortaleLoading() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-black/10 rounded-lg" />
        <div className="h-4 w-72 bg-black/10 rounded" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-black/10 rounded-xl h-24" />
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-black/10 rounded-xl h-16" />
        ))}
      </div>
    </div>
  )
}
