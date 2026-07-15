'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

export interface SelectOption { id: string; label: string; sublabel?: string }

// Select con campo di ricerca e sottotesto (es. progetto → cliente di appartenenza).
// Riutilizzabile ovunque nel "+ Crea": una sola UX di scelta, filtrabile.
export function SearchableSelect({ value, onChange, options, placeholder = 'Seleziona…', emptyText = 'Nessun risultato', disabled = false }: {
  value: string
  onChange: (id: string) => void
  options: SelectOption[]
  placeholder?: string
  emptyText?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.id === value)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = q.trim()
    ? options.filter(o => (o.label + ' ' + (o.sublabel ?? '')).toLowerCase().includes(q.trim().toLowerCase()))
    : options

  return (
    <div className="relative" ref={ref}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:border-gold disabled:opacity-50">
        <span className={`flex-1 min-w-0 truncate ${selected ? 'text-text-primary' : 'text-text-tertiary'}`}>
          {selected ? selected.label : placeholder}
          {selected?.sublabel && <span className="text-text-tertiary"> · {selected.sublabel}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca…"
              className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-tertiary" />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-2xs text-text-tertiary">{emptyText}</p>}
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); setQ('') }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover transition-colors">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-text-primary truncate">{o.label}</span>
                  {o.sublabel && <span className="block text-2xs text-text-tertiary truncate">{o.sublabel}</span>}
                </span>
                {o.id === value && <Check className="w-3.5 h-3.5 text-gold-text shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
