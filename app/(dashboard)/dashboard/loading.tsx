export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-56 bg-[#1A1A1A] rounded-lg" />
        <div className="h-4 w-80 bg-[#1A1A1A] rounded" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] rounded-xl h-20" />
        ))}
      </div>

      {/* AI insights skeleton */}
      <div className="bg-[#1A1A1A] rounded-xl h-28" />

      {/* Riga 1: Focus + Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#1A1A1A] rounded-xl h-48" />
        <div className="bg-[#1A1A1A] rounded-xl h-48" />
      </div>

      {/* Riga 2: Pulse + Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#1A1A1A] rounded-xl h-52" />
        <div className="bg-[#1A1A1A] rounded-xl h-52" />
      </div>

      {/* Riga 3: HealthMap + Risk */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-[#1A1A1A] rounded-xl h-40" />
        <div className="bg-[#1A1A1A] rounded-xl h-40" />
      </div>
    </div>
  )
}
