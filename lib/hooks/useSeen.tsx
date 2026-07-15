'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

// Un elemento è "nuovo" per un utente se NON l'ha ancora aperto e se è stato
// creato di recente (evita che al primo accesso lampeggi tutto lo storico).
const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

export type SeenType = 'project' | 'sprint' | 'task'

interface SeenCtx {
  isNew: (id: string, createdAt?: string | null) => boolean
  markSeen: (id: string, type: SeenType) => void
}

const Ctx = createContext<SeenCtx | null>(null)

export function SeenProvider({ profileId, initialSeen, children }: {
  profileId: string
  initialSeen: string[]
  children: ReactNode
}) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set(initialSeen))

  const markSeen = useCallback((id: string, type: SeenType) => {
    if (seen.has(id)) return
    setSeen(prev => new Set(prev).add(id))
    // best-effort: RLS own-only, nessun service role. Se la tabella non esiste
    // ancora (migration pendente) l'errore è silente e l'app non si rompe.
    createClient()
      .from('item_views')
      .upsert({ profile_id: profileId, item_id: id, item_type: type }, { onConflict: 'profile_id,item_id' })
      .then(() => {})
  }, [seen, profileId])

  const isNew = useCallback((id: string, createdAt?: string | null) => {
    if (seen.has(id) || !createdAt) return false
    return Date.now() - new Date(createdAt).getTime() < NEW_WINDOW_MS
  }, [seen])

  const value = useMemo(() => ({ isNew, markSeen }), [isNew, markSeen])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSeen(): SeenCtx {
  return useContext(Ctx) ?? { isNew: () => false, markSeen: () => {} }
}
