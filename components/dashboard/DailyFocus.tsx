'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sun, CheckCircle2, Circle } from 'lucide-react'

export interface FocusItem {
  id: string
  text: string
  href: string
  source: string
  priority: 'alta' | 'media' | 'bassa'
}

interface Props {
  items: FocusItem[]
  name: string
}

const PRIORITY_COLOR: Record<string, string> = {
  alta: '#EF4444', media: '#FFC501', bassa: '#53BDEB',
}

export function DailyFocus({ items, name }: Props) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setDone(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const doneCount = done.size
  const total = items.length

  return (
    <div className="p-5 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-gold" />
          <p className="text-xs font-semibold text-overlay/30 uppercase tracking-widest">Focus di oggi</p>
        </div>
        {total > 0 && (
          <span className="text-[10px] text-overlay/30">
            <span className="text-gold font-bold">{doneCount}</span>/{total}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-2 py-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <p className="text-xs text-overlay/40">Nessuna priorità urgente, {name}. Buon lavoro!</p>
        </div>
      ) : (
        <>
          <div className="space-y-1 mb-3">
            {items.map(item => {
              const isDone = done.has(item.id)
              return (
                <div key={item.id} className="flex items-start gap-2.5 py-1.5">
                  <button onClick={() => toggle(item.id)} className="mt-0.5 shrink-0 transition-transform hover:scale-110">
                    {isDone
                      ? <CheckCircle2 className="w-4 h-4 text-success" />
                      : <Circle className="w-4 h-4 text-overlay/15" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <Link href={item.href}>
                      <p className={`text-xs leading-snug transition-colors ${isDone ? 'line-through text-overlay/20' : 'text-overlay/80 hover:text-gold'}`}>
                        {item.text}
                      </p>
                    </Link>
                    <p className="text-[9px] text-overlay/20 mt-0.5">{item.source}</p>
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ background: PRIORITY_COLOR[item.priority] }} />
                </div>
              )
            })}
          </div>
          {total > 0 && (
            <div className="h-1 bg-overlay/[0.06] rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all duration-300"
                style={{ width: `${(doneCount / total) * 100}%` }} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
