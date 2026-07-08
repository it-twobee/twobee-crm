export default function WorkspaceLoading() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-[#1A1A1A] rounded-lg" />
        <div className="h-4 w-72 bg-[#1A1A1A] rounded" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] rounded-xl h-20" />
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] rounded-xl h-16" />
        ))}
      </div>
    </div>
  )
}
