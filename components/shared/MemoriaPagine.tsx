'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { EVENTO_SCRITTURA } from '@/lib/router-cache'

/**
 * §491 — dopo una scrittura dal browser, la memoria delle pagine si svuota
 * (`router.refresh()` la butta tutta e ricarica la pagina corrente). Si aspetta
 * un attimo perché le scritture arrivano a gruppi — un modulo che ne fa tre —
 * e un aggiornamento solo basta. Non disegna niente; sta nel layout radice,
 * quindi vale per tutti i portali.
 */
export function MemoriaPagine() {
  const router = useRouter()
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const svuota = () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => router.refresh(), 400)
    }
    window.addEventListener(EVENTO_SCRITTURA, svuota)
    return () => {
      window.removeEventListener(EVENTO_SCRITTURA, svuota)
      if (t) clearTimeout(t)
    }
  }, [router])
  return null
}
