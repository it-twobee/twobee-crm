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

/**
 * §234 — un «indietro» non attraversa il confine fra i due portali.
 *
 * Le sorgenti del ritorno sono due indirizzi che arrivano da fuori: `?from=`,
 * che chiunque può scrivere nella barra, e la pagina precedente registrata in
 * sessione. Un admin che apre il workspace ci arriva con la memoria del tool
 * admin addosso, e la freccia della scheda cliente lo riportava a `/clienti` —
 * fuori dal portale in cui stava lavorando, senza averlo chiesto. Per chi è
 * confinato al workspace è peggio: il link non riporta da nessuna parte, perché
 * il middleware lo rimbalza a `/workspace` e l'app sembra rotta.
 *
 * La regola è simmetrica e vale per tutti: **si torna dentro il proprio
 * dominio**. Quello che sta fuori non è un errore da segnalare, è
 * semplicemente un ritorno che non vale, e allora vale il `fallback` — che il
 * chiamante costruisce già sulla `base` giusta (§211).
 *
 * `/impostazioni/profilo` è l'unica eccezione, ed è una porta che esiste: è la
 * sola pagina del gruppo admin che la sidebar del workspace linka e che il
 * middleware lascia passare.
 */
const NEUTRAL = ['/impostazioni/profilo', '/onboarding']

export const inWorkspace = (href: string) => {
  const p = href.split('?')[0]
  return p === '/workspace' || p.startsWith('/workspace/')
}

export function samePortal(here: string, target: string): boolean {
  const p = target.split('?')[0]
  if (NEUTRAL.some(n => p === n || p.startsWith(`${n}/`))) return true
  return inWorkspace(here) === inWorkspace(target)
}

/** Come si chiama una pagina, per scriverlo nella freccia. */
const LABELS: [RegExp, string][] = [
  [/^\/workspace\/clienti$/, 'Clienti'],
  [/^\/workspace\/clienti\/[^/]+$/, 'Scheda cliente'],
  [/^\/workspace\/progetti$/, 'Progetti'],
  [/^\/workspace\/progetti\/[^/]+\/workstream/, 'Workstream'],
  [/^\/workspace\/progetti\/[^/]+$/, 'Scheda progetto'],
  [/^\/workspace\/attivita$/, 'Le mie attività'],
  [/^\/workspace\/ad-hoc$/, 'Task ad hoc'],
  [/^\/workspace\/customer-care/, 'Customer care'],
  [/^\/workspace\/calendario$/, 'Calendario'],
  [/^\/workspace\/?$/, 'Workspace'],
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
  const pathname = usePathname()
  const [prev, setPrev] = useState<string | null>(null)

  // il `from` è sincrono, la memoria di sessione no: si legge dopo il montaggio
  useEffect(() => {
    try { setPrev(sessionStorage.getItem(KEY)) } catch { setPrev(null) }
  }, [])

  const target = useMemo(() => {
    const here = pathname ?? fallback
    /* Un ritorno vale solo se resta nel portale in cui si sta lavorando, e
       `//host` non è un percorso interno: `startsWith('/')` da solo lascerebbe
       passare un indirizzo protocol-relative verso un altro sito. */
    const ok = (href: string | null | undefined) =>
      !!href && href.startsWith('/') && !href.startsWith('//') && samePortal(here, href)
    const from = params?.get('from')
    if (ok(from)) return from as string
    if (ok(prev)) return prev as string
    return fallback
  }, [params, prev, fallback, pathname])

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
