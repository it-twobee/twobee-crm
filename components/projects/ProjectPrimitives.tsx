'use client'

import { useState, useRef } from 'react'
import { Calendar } from 'lucide-react'

// Primitivi presentazionali estratti da ProjectPageClient (REF-01): props-only,
// nessuna dipendenza dalla closure del genitore. Riusabili e testabili a parte.

export function Avatar({ name, size = 24, color = 'var(--color-gold-text)' }: { name: string; size?: number; color?: string }) {
  const ini = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `color-mix(in srgb, ${color} 9%, transparent)`, color, border: `1.5px solid color-mix(in srgb, ${color} 19%, transparent)` }}>
      {ini}
    </div>
  )
}

export function ProgressBar({ pct, accent }: { pct: number; accent: string }) {
  const color = pct >= 80 ? 'var(--color-success)' : pct >= 40 ? accent : pct > 0 ? 'var(--color-warning)' : 'var(--color-surface)'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-background rounded-full overflow-hidden" style={{ minWidth: 40 }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-2xs font-bold shrink-0" style={{ color: pct === 0 ? 'var(--color-text-tertiary)' : color }}>{pct}%</span>
    </div>
  )
}

export function ProgressRing({ pct, size = 48, accent = 'var(--color-gold-text)' }: { pct: number; size?: number; accent?: string }) {
  const cx = size / 2, r = cx - 4, circ = 2 * Math.PI * r
  const color = pct >= 80 ? 'var(--color-success)' : pct >= 40 ? accent : pct > 0 ? 'var(--color-warning)' : 'var(--color-border)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-surface-active)" strokeWidth="3.5" />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x={cx} y={cx + 3.5} textAnchor="middle" fill={color} fontSize="9" fontWeight="900">{pct}%</text>
    </svg>
  )
}

// ─── Inline editable text ─────────────────────────────────────────────────────
export function InlineEdit({ value, onSave, disabled, className, multiline }: {
  value: string; onSave: (v: string) => void; disabled?: boolean
  className?: string; multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== value) onSave(v)
    else setDraft(value)
  }

  if (!editing) {
    return (
      <span
        className={`${className} ${!disabled ? 'cursor-text hover:text-text-primary' : ''} transition-colors`}
        onDoubleClick={() => { if (!disabled) { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 10) } }}
        title={!disabled ? 'Doppio clic per modificare' : undefined}
      >{value}</span>
    )
  }

  const base = 'bg-transparent border-b focus:outline-none text-text-primary w-full'
  const style = { borderColor: 'var(--color-gold-text)' }

  if (multiline) {
    return (
      <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setDraft(value) } }}
        className={`${base} ${className} resize-none`} style={style} rows={3} autoFocus />
    )
  }
  return (
    <input ref={ref as React.RefObject<HTMLInputElement>} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value) } }}
      className={`${base} ${className}`} style={style} autoFocus />
  )
}

// ─── DatePicker (clickable date → native picker) ──────────────────────────────
export function DatePicker({ value, onChange, disabled, placeholder = 'Nessuna data', accent = 'var(--color-gold-text)', showIcon = true }: {
  value: string | null; onChange: (v: string | null) => void
  disabled?: boolean; placeholder?: string; accent?: string; showIcon?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const formatted = value
    ? new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })
    : null

  const open = () => { if (!disabled) ref.current?.showPicker?.() ?? ref.current?.click() }

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${disabled ? '' : 'cursor-pointer group/dp'}`}
      onClick={open}>
      {showIcon && (
        <Calendar className="w-3 h-3 shrink-0 transition-colors"
          style={{ color: value ? accent : 'var(--color-border)' }} />
      )}
      <span className={`text-xs transition-colors ${value ? 'text-text-secondary group-hover/dp:text-text-primary' : 'text-text-tertiary group-hover/dp:text-text-tertiary'}`}>
        {formatted ?? placeholder}
      </span>
      <input
        ref={ref}
        type="date"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ pointerEvents: disabled ? 'none' : 'auto' }}
        tabIndex={-1}
      />
    </div>
  )
}
