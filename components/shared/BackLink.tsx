'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * «Indietro» che torna dove eri, non dove il link è stato scritto.
 *
 * Un link fisso a `/clienti` è giusto una volta su due: se sei arrivato sulla
 * scheda di un cliente dal conto economico — perché una rata era sbagliata — la
 * freccia ti porta all'elenco clienti, e per tornare al mese devi ricominciare.
 * Il percorso che hai fatto è un'informazione che il tool ha già: qui si usa.
 *
 * Tre sorgenti, in ordine di affidabilità:
 *
 *   1. `?from=` nell'indirizzo — lo scrivono i link che vogliono un ritorno
 *      preciso (il mese giusto, il filtro giusto). Sopravvive a un ricarico e a
 *      un indirizzo condiviso, quindi vince su tutto.
 *   2. la pagina precedente registrata da `NavMemory` — copre la navigazione
 *      normale, compreso l'arrivo da una pagina che non ha scritto `from`.
 *   3. il `fallback` del chiamante — la prima visita, o un ricarico a freddo.
 *
 * Non si usa `router.back()`: dopo un `router.refresh()` o un cambio di tab che
 * ha scritto nella cronologia, «indietro» torna alla stessa pagina e sembra
 * rotto. Qui si naviga a un indirizzo, che è sempre prevedibile.
 */

const KEY = 'twobee-nav-prev'

/** Come si chiama una pagina, per scriverlo nella freccia. */
const LABELS: [RegExp, string][] = [
  [/^\/dashboard$/, 'Dashboard'],
  [/^\/clienti$/, 'Tutti i clienti'],
  [/^\/clienti\/[^/]+\/progetto\//, 'Progetto del cliente'],
  [/^\/clienti\/[^/]+$/, 'Scheda cliente'],
  [/^\/progetti$/, 'Tutti i progetti'],
  [/^\/progetti\/[^/]+\/workstream/, 'Workstream'],
  [/^\/progetti\/[^/]+$/, 'Scheda progetto'],
  [/^\/economics$/, 'Conto economico'],
  [/^\/economics\/costi$/, 'Costi & budget'],
  [/^\/economics\/banca$/, 'Banca'],
  [/^\/economics\/fiscale$/, 'Fiscale & tasse'],
  [/^\/economics\/personale$/, 'Personale'],
  [/^\/workload$/, 'Workload'],
  [/^\/chat/, 'Chat'],
  [/^\/customer-care/, 'Customer care'],
  [/^\/impostazioni/, 'Impostazioni'],
  [/^\/workspace\/?$/, 'Workspace'],
]

export function labelOf(href: string): string {
  const path = href.split('?')[0]
  for (const [re, label] of LABELS) if (re.test(path)) return label
  return 'Indietro'
}

/**
 * Registra la pagina che si sta lasciando.
 *
 * Sta nel layout e non nelle pagine: una pagina che si dimentica di registrarsi
 * diventa un buco nel percorso, e i buchi si notano solo quando servono. Salta
 * l'auto-riferimento — tornare alla pagina in cui sei già non è tornare.
 */
export function NavMemory() {
  const pathname = usePathname()
  const params = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    const qs = params?.toString()
    const here = qs ? `${pathname}?${qs}` : pathname
    try {
      const prev = sessionStorage.getItem('twobee-nav-here')
      if (prev && prev.split('?')[0] !== pathname) sessionStorage.setItem(KEY, prev)
      sessionStorage.setItem('twobee-nav-here', here)
    } catch {
      /* sessionStorage negato (navigazione privata, iframe): si resta al fallback */
    }
  }, [pathname, params])

  return null
}

export function BackLink({ fallback, label, className }: {
  /** dove tornare quando non si sa da dove si è arrivati */
  fallback: string
  /** etichetta del fallback: «Tutti i clienti», non «Indietro» */
  label?: string
  className?: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [prev, setPrev] = useState<string | null>(null)

  // il `from` è sincrono, la memoria di sessione no: si legge dopo il montaggio
  useEffect(() => {
    try { setPrev(sessionStorage.getItem(KEY)) } catch { setPrev(null) }
  }, [])

  const target = useMemo(() => {
    const from = params?.get('from')
    if (from && from.startsWith('/')) return from
    if (prev) return prev
    return fallback
  }, [params, prev, fallback])

  const text = target === fallback ? (label ?? labelOf(fallback)) : labelOf(target)

  return (
    <button type="button" onClick={() => router.push(target)}
      title={`Torna a ${text}`}
      className={className
        ?? 'flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors w-fit'}>
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />{text}
    </button>
  )
}
