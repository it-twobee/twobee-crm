'use client'

import { useEffect } from 'react'
import { Search, Check, X, Loader2 } from 'lucide-react'

/** Primitive di form condivise: wizard progetto e modali QuickCreate. */
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'

export function StepHead({ title, hint, aside }: { title: string; hint?: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="text-lg font-bold text-text-primary font-heading">{title}</h3>
        {hint && <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>}
      </div>
      {aside}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-2 mb-1.5">
        <span className="text-2xs font-semibold text-text-secondary">{label}</span>
        {hint && <span className="text-2xs text-text-tertiary">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary'

export function SearchInput({
  value, onChange, placeholder, autoFocus,
}: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
      <input
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus} aria-label={placeholder}
        className={`${inputCls} pl-9`} />
    </div>
  )
}

export function Segmented<T extends string>({
  value, onChange, options, ariaLabel,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex bg-surface-active rounded-xl p-0.5 w-full">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2.5 py-1.5 rounded-lg text-2xs font-semibold transition-colors whitespace-nowrap ${
            value === o.value ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary hover:text-text-primary'
          }`}>{o.label}</button>
      ))}
    </div>
  )
}

export function Avatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="rounded-full bg-gold-dim text-gold-text flex items-center justify-center shrink-0 overflow-hidden text-2xs font-bold">
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" className="w-full h-full object-cover" />
        : initials(name)}
    </span>
  )
}

/** riga selezionabile con spunta — usata per clienti, servizi, template, persone */
export function PickRow({
  selected, onClick, icon, title, subtitle, meta, dim,
}: {
  selected: boolean; onClick: () => void; icon?: React.ReactNode
  title: React.ReactNode; subtitle?: React.ReactNode; meta?: React.ReactNode; dim?: boolean
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
        selected ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
      } ${dim ? 'opacity-70' : ''}`}>
      {icon}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-text-primary truncate">{title}</span>
        {subtitle && <span className="block text-2xs text-text-tertiary truncate">{subtitle}</span>}
      </span>
      {meta}
      <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
        selected ? 'bg-gold border-gold' : 'border-border-strong'
      }`}>
        {selected && <Check className="w-3 h-3 text-on-gold" strokeWidth={3} />}
      </span>
    </button>
  )
}

/**
 * Chrome dei modali rapidi: stessa grammatica del wizard progetto
 * (header con occhiello, corpo scrollabile, footer fisso, ⌘⏎ conferma, Esc chiude).
 */
export function ModalShell({
  title, hint, icon, onClose, onSubmit, submitLabel = 'Crea', canSubmit, pending, children,
}: {
  title: string
  hint?: string
  icon?: React.ReactNode
  onClose: () => void
  onSubmit: () => void
  submitLabel?: string
  canSubmit: boolean
  pending: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit && !pending) { e.preventDefault(); onSubmit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onSubmit, canSubmit, pending])

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={title}
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg h-[88vh] sm:h-auto sm:max-h-[86vh] flex flex-col shadow-pop animate-slide-up pb-safe overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          {icon && <span className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">{icon}</span>}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-text-primary font-heading truncate">{title}</h2>
            {hint && <p className="text-2xs text-text-tertiary truncate">{hint}</p>}
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">{children}</div>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-border shrink-0">
          <button onClick={onClose} className="text-sm text-text-secondary hover:text-text-primary press">Annulla</button>
          <span className="ml-auto hidden sm:block text-2xs text-text-tertiary">
            <kbd className="px-1.5 py-0.5 rounded bg-surface-active font-sans">⌘⏎</kbd> conferma
          </span>
          <button onClick={onSubmit} disabled={pending || !canSubmit}
            className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl disabled:opacity-40 press">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {pending ? 'Creo…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** blocco raggruppato dentro un modale: titolo piccolo + contenuto */
export function Group({ label, meta, children }: { label: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-2xs font-semibold text-text-secondary">{label}</span>
        {meta}
      </div>
      {children}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-10 border border-dashed border-border rounded-xl">
      <p className="text-2xs text-text-tertiary">{children}</p>
    </div>
  )
}
