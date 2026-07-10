'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

// Ricerca limitata alle sezioni del portale workspace: digiti e salti alla voce.
export function WorkspaceSearch({ sections }: {
  sections: { key: string; label: string; route: string }[]
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return sections.filter(x => x.label.toLowerCase().includes(s)).slice(0, 8)
  }, [q, sections])

  const go = (route: string) => { setQ(''); setOpen(false); router.push(route) }

  return (
    <div className="px-2 pt-2 relative">
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className="relative z-30">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && matches[0]) go(matches[0].route)
            if (e.key === 'Escape') { setQ(''); setOpen(false) }
          }}
          placeholder="Cerca nel workspace…"
          aria-label="Cerca nel workspace"
          className="w-full bg-surface border border-border-interactive rounded-lg pl-8 pr-7 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40"
        />
        {q && (
          <button onClick={() => { setQ(''); setOpen(false) }} aria-label="Pulisci ricerca"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {open && q && (
        <div className="absolute left-2 right-2 mt-1 rounded-lg border border-border bg-surface shadow-xl z-30 py-1">
          {matches.length > 0 ? matches.map(m => (
            <button key={m.key} onClick={() => go(m.route)}
              className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors">
              {m.label}
            </button>
          )) : (
            <p className="px-3 py-2 text-2xs text-text-tertiary">Nessuna sezione trovata</p>
          )}
        </div>
      )}
    </div>
  )
}
