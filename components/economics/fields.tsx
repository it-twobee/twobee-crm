'use client'

import { useEffect, useState } from 'react'

/**
 * Campi che salvano quando hai finito di scrivere, non a ogni tasto.
 *
 * Salvare su `onChange` significa che «1500» parte come 1, poi 15, poi 150:
 * quattro scritture e quattro `router.refresh()`, con il valore del server che
 * ti torna sotto le dita a metà digitazione. Qui si tiene una copia locale, si
 * scrive all'uscita dal campo (o con Invio) e solo se è cambiata davvero.
 * Esc annulla. Il valore da fuori riallinea la copia solo quando non hai il
 * cursore dentro, così un refresh altrui non cancella quello che stai
 * scrivendo.
 */
function useDraft(value: string) {
  const [v, setV] = useState(value)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!busy) setV(value) }, [value, busy])
  return { v, setV, setBusy }
}

export function Draft({ value, onSave, disabled, label, className, type = 'text', placeholder }: {
  value: string
  onSave: (v: string) => void
  disabled?: boolean
  label: string
  className: string
  type?: 'text' | 'date' | 'month'
  placeholder?: string
}) {
  const { v, setV, setBusy } = useDraft(value)
  return (
    <input type={type} value={v} disabled={disabled} aria-label={label} className={className} placeholder={placeholder}
      onFocus={() => setBusy(true)}
      onChange={e => setV(e.target.value)}
      onBlur={() => { setBusy(false); if (v !== value) onSave(v) }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur() }
      }} />
  )
}

/** Come sopra, per gli importi: accetta la virgola e rifiuta quello che non è un numero. */
export function Money({ value, onSave, disabled, small, className }: {
  value: number
  onSave: (v: number) => void
  disabled?: boolean
  small?: boolean
  className?: string
}) {
  const { v, setV, setBusy } = useDraft(String(value))
  const commit = () => {
    setBusy(false)
    const n = Number(v.replace(',', '.').trim())
    if (Number.isNaN(n) || n === value) { setV(String(value)); return }
    onSave(n)
  }
  return (
    <input value={v} disabled={disabled} inputMode="decimal" aria-label="Importo"
      onFocus={() => setBusy(true)}
      onChange={e => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setV(String(value)); (e.target as HTMLInputElement).blur() }
      }}
      className={className ?? `bg-background border border-border rounded-lg px-2 py-1 text-right tabular text-text-primary w-24 ${
        small ? 'text-2xs' : 'text-sm'
      }`} />
  )
}
