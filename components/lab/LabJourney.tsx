'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { journeyMonth, labOrigin } from '@/lib/lab-experience'

const Context = createContext<{ source: string; origin: string | null; root: string | null; month: string } | null>(null)
const Anchor = createContext<string | undefined>(undefined)
export function LabJourneyProvider({ today, children }: { today: string; children: React.ReactNode }) {
  const pathname = usePathname(), params = useSearchParams(), [hash, setHash] = useState('')
  const query = params.toString(), month = journeyMonth(pathname, params.get('m'), today)
  useEffect(() => {
    let frame = 0, observer: MutationObserver | undefined
    const reveal = (waited: boolean) => {
      try {
        if (!window.location.hash) return true
        const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
        if (!target) return false
        let parent = target.parentElement, revealed = false
        while (parent) { if (parent instanceof HTMLDetailsElement && !parent.open) { parent.open = true; revealed = true } parent = parent.parentElement }
        if (revealed || waited) target.scrollIntoView({ block: 'center' })
      } catch { /* A malformed fragment must not prevent navigation. */ }
      return true
    }
    const update = () => {
      setHash(window.location.hash); observer?.disconnect(); cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (reveal(false)) return
        // A return can arrive while the streamed page still shows its loading state.
        observer = new MutationObserver(() => { if (reveal(true)) observer?.disconnect() })
        observer.observe(document.body, { childList: true, subtree: true })
      })
    }
    update(); window.addEventListener('hashchange', update)
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('hashchange', update) }
  }, [pathname, query])

  return <Context.Provider value={{ source: `${pathname}${query ? `?${query}` : ''}${hash}`, origin: labOrigin(params.get('from')), root: labOrigin(params.get('origine')), month }}>{children}</Context.Provider>
}
export const useLabJourney = () => useContext(Context)
export const useLabOriginAnchor = () => useContext(Anchor)
export function LabRecordScope({ anchor, children }: { anchor: string; children: React.ReactNode }) { return <Anchor.Provider value={anchor}>{children}</Anchor.Provider> }
export function LabReturnFields() {
  const journey = useLabJourney()
  return <>{journey?.origin && <input type="hidden" name="from" value={journey.origin} />}{journey?.root && <input type="hidden" name="origine" value={journey.root} />}</>
}
