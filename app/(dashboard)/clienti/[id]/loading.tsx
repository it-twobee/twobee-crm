export default function ClienteLoading() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      <div className="px-6 pt-5 pb-3">
        <div className="h-4 w-32 bg-surface rounded" />
      </div>
      <div className="px-6 pb-5 border-b border-border">
        <div className="flex gap-4">
          <div className="w-12 h-12 bg-surface rounded-xl shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-7 w-56 bg-surface rounded-lg" />
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-surface rounded" />
              <div className="h-5 w-20 bg-surface rounded" />
              <div className="h-5 w-24 bg-surface rounded" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex border-b border-border px-6 gap-1">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 w-28 bg-surface m-1 rounded" />)}
      </div>
      <div className="p-6 space-y-4">
        <div className="h-32 bg-surface rounded-xl" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-surface rounded-xl" />)}
        </div>
        <div className="h-16 bg-surface rounded-xl" />
      </div>
    </div>
  )
}
