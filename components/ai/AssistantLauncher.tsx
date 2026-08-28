'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { AssistantPanel, type Surface } from './AssistantPanel'

interface Props {
  surface: Surface
  userName?: string | null
}

export function AssistantLauncher({ surface, userName }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Apri l'assistente AI (Ctrl+J)"
          title="Assistente AI · Ctrl+J"
          className="fixed bottom-5 right-5 z-30 w-11 h-11 rounded-full bg-gold text-on-gold shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      <AssistantPanel open={open} onClose={() => setOpen(false)} surface={surface} userName={userName} />
    </>
  )
}
