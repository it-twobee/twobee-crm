export default function SectionLoading() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-[#1A1A1A] rounded-lg" />
          <div className="h-4 w-72 bg-[#1A1A1A] rounded" />
        </div>
        <div className="h-9 w-32 bg-[#1A1A1A] rounded-xl" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 bg-[#1A1A1A] rounded-lg" />
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] rounded-xl h-14" />
        ))}
      </div>
    </div>
  )
}
