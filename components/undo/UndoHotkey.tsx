'use client'

import { useEffect } from 'react'
import { runLastUndo } from '@/lib/task-undo'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

// Ctrl+Z / Cmd+Z globale → annulla l'ultima eliminazione di task.
// Attivo solo se NON stai scrivendo in un campo (così non disturba l'editing).
export function UndoHotkey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        if (isTyping(e.target)) return
        if (runLastUndo()) e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}
