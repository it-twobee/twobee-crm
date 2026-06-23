export default function ClientiLoading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-[#1A1A1A] rounded-lg" />
          <div className="h-4 w-56 bg-[#1A1A1A] rounded" />
        </div>
        <div className="h-9 w-36 bg-[#1A1A1A] rounded-lg" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-9 w-28 bg-[#1A1A1A] rounded-lg" />)}
      </div>
      <div className="bg-[#1A1A1A] rounded-xl overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3.5 border-b border-[#111]">
            <div className="h-4 w-40 bg-[#222] rounded" />
            <div className="h-4 w-16 bg-[#222] rounded" />
            <div className="h-4 w-20 bg-[#222] rounded" />
            <div className="h-4 w-24 bg-[#222] rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
