'use client'

import { useState, useRef, useEffect } from 'react'
import { Users, Check, X, ChevronDown, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PickProfile {
  id: string
  full_name: string
  avatar_url?: string | null
}

/**
 * Selettore multi-assegnatario. `value` è ordinato: il **primo** è il primario
 * (quello che finisce in tasks.assignee_id). Cliccando una persona la
 * aggiunge/rimuove; il primo selezionato mostra la corona.
 *
 * Controllato: il salvataggio lo fa il chiamante (di solito setTaskAssignees).
 */
export function AssigneePicker({ profiles, value, onChange, disabled = false, className }: {
  profiles: PickProfile[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])

  const selected = value.map(id => profiles.find(p => p.id === id)).filter(Boolean) as PickProfile[]
  const list = profiles.filter(p => p.full_name.toLowerCase().includes(query.trim().toLowerCase()))

  const label = selected.length === 0
    ? 'Nessun assegnatario'
    : selected.length === 1
      ? selected[0].full_name
      : `${selected[0].full_name} +${selected.length - 1}`

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-2 rounded-xl border border-border-interactive bg-background px-3 py-2 text-sm text-left transition-colors',
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-gold/40',
        )}
      >
        <Users className="w-4 h-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className={cn('flex-1 truncate', selected.length === 0 ? 'text-text-tertiary' : 'text-text-primary')}>
          {label}
        </span>
        {!disabled && <ChevronDown className="w-3.5 h-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />}
      </button>

      {/* Chip dei selezionati oltre il primo, per vederli tutti a colpo d'occhio */}
      {selected.length > 1 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((p, i) => (
            <span key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-surface-active px-2 py-0.5 text-2xs text-text-secondary">
              {i === 0 && <Crown className="w-2.5 h-2.5 text-gold-text" aria-label="Primario" />}
              {p.full_name.split(' ')[0]}
              {!disabled && (
                <button type="button" onClick={() => toggle(p.id)} aria-label={`Rimuovi ${p.full_name}`}
                  className="text-text-tertiary hover:text-error">
                  <X className="w-2.5 h-2.5" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {open && !disabled && (
        <div role="listbox" className="absolute z-30 left-0 right-0 top-full mt-1 rounded-xl border border-border bg-surface shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cerca…"
              aria-label="Cerca una risorsa"
              autoFocus
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/40"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {list.length === 0 && <p className="text-2xs text-text-tertiary text-center py-4">Nessuna risorsa</p>}
            {list.map(p => {
              const idx = value.indexOf(p.id)
              const checked = idx >= 0
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors text-left"
                >
                  <span className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                    checked ? 'bg-gold border-gold' : 'border-border-interactive',
                  )}>
                    {checked && <Check className="w-2.5 h-2.5 text-on-gold" aria-hidden="true" />}
                  </span>
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    : <span className="w-6 h-6 rounded-full bg-surface-active flex items-center justify-center text-2xs font-bold text-text-secondary shrink-0">
                        {p.full_name[0]?.toUpperCase()}
                      </span>}
                  <span className="flex-1 text-sm text-text-primary truncate">{p.full_name}</span>
                  {idx === 0 && <Crown className="w-3 h-3 text-gold-text shrink-0" aria-label="Primario" />}
                </button>
              )
            })}
          </div>
          {value.length > 0 && (
            <div className="p-1.5 border-t border-border">
              <button type="button" onClick={() => onChange([])}
                className="w-full text-2xs text-text-tertiary hover:text-text-primary py-1 transition-colors">
                Rimuovi tutti
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
