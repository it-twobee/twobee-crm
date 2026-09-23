'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { INTERVALLO_BEAT_MS, portaleDi } from '@/lib/presenza'

/**
 * §410 — il battito che misura l'uso vero del tool.
 *
 * Sta montato nei layout dei portali e non disegna niente. Ogni minuto manda un
 * segnale **solo se** nel minuto passato c'è stata almeno un'interazione e la
 * scheda è in primo piano. È tutta la differenza fra questa misura e un
 * contatore di sessioni: una scheda dimenticata aperta non manda niente, quindi
 * non fa avanzare nessun tempo e dopo un quarto d'ora la sessione si chiude da
 * sola (la regola sta nella migration 252).
 *
 * Cosa conta come interazione: click e tocchi, tasti, rotella, scorrimento e i
 * cambi di pagina. Non il movimento del mouse — un urto alla scrivania non è
 * lavoro — e non il semplice tornare sulla scheda.
 *
 * §412 — rotella e scorrimento passano dallo stesso freno, e un tasto tenuto
 * premuto conta una volta sola. Erano fuori: il primo giorno di misura una
 * sessione di cinque minuti ha registrato **599 interazioni** e un'altra 99 in
 * un minuto solo, perché una singola rotellata sul trackpad emette decine di
 * eventi `wheel`. Il numero restava plausibile — nessuno va a contare i click
 * di una giornata — e non misurava più niente.
 *
 * Quello che viaggia è un numero e un percorso: nessun contenuto, nessun testo
 * digitato, nessun parametro dell'indirizzo (la query può contenere l'id di un
 * cliente e non serve a niente qui). Il nome di chi sta interagendo non si
 * manda affatto: lo legge il database dalla sessione, altrimenti sarebbe un
 * numero che chiunque può scrivere sul conto di chiunque.
 */
export function PresenceBeat() {
  const pathname = usePathname()
  const interazioni = useRef(0)
  const rotta = useRef(pathname)

  // Navigare è interagire, ed è spesso l'unica cosa che si fa in un minuto
  // passato a leggere una lista.
  useEffect(() => {
    rotta.current = pathname
    interazioni.current += 1
  }, [pathname])

  useEffect(() => {
    const conta = () => { interazioni.current += 1 }

    // Un tasto tenuto premuto emette `keydown` a ripetizione: è un gesto solo.
    const contaTasto = (e: Event) => { if (!(e as KeyboardEvent).repeat) interazioni.current += 1 }

    // Rotella e scorrimento arrivano a raffica: una rotellata sola vale decine
    // di eventi, e contarli tutti gonfia la colonna senza dire niente di più.
    let ultimoScorrimento = 0
    const contaScorrimento = () => {
      const ora = Date.now()
      if (ora - ultimoScorrimento < 2000) return
      ultimoScorrimento = ora
      interazioni.current += 1
    }

    const invia = (inChiusura = false) => {
      const n = interazioni.current
      if (n === 0) return
      interazioni.current = 0
      const corpo = JSON.stringify({
        portale: portaleDi(rotta.current || '/'),
        route: (rotta.current || '/').split('?')[0],
        interazioni: n,
      })
      // `keepalive` perché in chiusura di scheda una fetch normale viene
      // interrotta: l'ultimo minuto di lavoro sparirebbe proprio quando è più
      // facile che sia stato il più denso.
      fetch('/api/presenza/beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corpo,
        keepalive: inChiusura,
      }).catch(() => {
        /* rete assente o sessione scaduta: il battito si perde. Non è una cosa
           da dire a chi sta lavorando — misurare l'uso non deve disturbarlo. */
      })
    }

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') invia()
    }, INTERVALLO_BEAT_MS)

    const suVisibilita = () => { if (document.visibilityState === 'hidden') invia(true) }
    const suUscita = () => invia(true)

    for (const evento of ['pointerdown', 'touchstart'] as const) {
      window.addEventListener(evento, conta, { passive: true })
    }
    window.addEventListener('keydown', contaTasto, { passive: true })
    for (const evento of ['scroll', 'wheel'] as const) {
      window.addEventListener(evento, contaScorrimento, { passive: true })
    }
    document.addEventListener('visibilitychange', suVisibilita)
    window.addEventListener('pagehide', suUscita)

    return () => {
      clearInterval(timer)
      for (const evento of ['pointerdown', 'touchstart'] as const) {
        window.removeEventListener(evento, conta)
      }
      window.removeEventListener('keydown', contaTasto)
      for (const evento of ['scroll', 'wheel'] as const) {
        window.removeEventListener(evento, contaScorrimento)
      }
      document.removeEventListener('visibilitychange', suVisibilita)
      window.removeEventListener('pagehide', suUscita)
    }
  }, [])

  return null
}
