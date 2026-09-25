'use client'

/**
 * §440 — un riquadro che si apre sotto un bottone e si chiude quando hai
 * finito: clic fuori, Esc, o il bottone di nuovo.
 *
 * Sta in un portale per la stessa ragione di `MenuFase`: l'elenco ha
 * `overflow-hidden`, e un riquadro assoluto verrebbe tagliato. Se sotto non
 * c'è posto si apre sopra, e non esce mai dai bordi dello schermo — sul
 * telefono prende la larghezza che c'è.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function Popover({ ancora, aperto, onChiudi, larghezza = 320, etichetta, children }: {
  ancora: React.RefObject<HTMLElement>
  aperto: boolean
  onChiudi: () => void
  larghezza?: number
  etichetta: string
  children: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; w: number; maxH: number } | null>(null)

  useLayoutEffect(() => {
    if (!aperto || !ancora.current) { setPos(null); return }
    const calcola = () => {
      const r = ancora.current!.getBoundingClientRect()
      const w = Math.min(larghezza, window.innerWidth - 16)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
      const sotto = window.innerHeight - r.bottom - 12
      const sopra = r.top - 12
      const suSopra = sotto < 260 && sopra > sotto
      const maxH = Math.max(200, Math.min(480, suSopra ? sopra : sotto))
      setPos({ top: suSopra ? Math.max(8, r.top - 6 - maxH) : r.bottom + 6, left, w, maxH })
    }
    calcola()
    window.addEventListener('resize', calcola)
    window.addEventListener('scroll', calcola, true)
    return () => { window.removeEventListener('resize', calcola); window.removeEventListener('scroll', calcola, true) }
  }, [aperto, ancora, larghezza])

  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => {
      const t = e.target as Node
      if (box.current?.contains(t) || ancora.current?.contains(t)) return
      onChiudi()
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { onChiudi(); ancora.current?.focus() } }
    document.addEventListener('mousedown', fuori)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc) }
  }, [aperto, onChiudi, ancora])

  if (!aperto || !pos) return null
  return createPortal(
    <div ref={box} role="dialog" aria-label={etichetta}
      className="fixed z-[70] bg-surface border border-border rounded-xl shadow-pop overflow-y-auto"
      style={{ top: pos.top, left: pos.left, width: pos.w, maxHeight: pos.maxH }}>
      {children}
    </div>,
    document.body,
  )
}
