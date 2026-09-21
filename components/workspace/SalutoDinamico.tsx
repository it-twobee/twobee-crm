'use client'

/**
 * §351 — la riga sotto il nome, che cambia con l'ora e col giorno.
 *
 * Il seme arriva dal server già calcolato: se lo calcolasse qui, il primo
 * render del browser potrebbe pescare una frase diversa da quella che il server
 * ha già scritto nell'HTML. Il **momento**, invece, si scopre dopo il montaggio
 * — il server sta su UTC e chi legge no — e finché non si sa valgono solo le
 * frasi buone a ogni ora.
 */

import { useState, useEffect } from 'react'
import { saluto, salutoPersonale, type Momento, type StatoPersona } from '@/lib/task-mood'

/**
 * §352 — con `stato` la riga parla **di chi la legge**: quante ne ha in ritardo,
 * quante ne scadono oggi, quante ne ha chiuse, e che ruolo ha. Senza, resta il
 * saluto generico di §351 — che è quello che vede chi non ha ancora numeri.
 *
 * §360 — `riga` è il testo scritto stanotte da un modello, già reso coi numeri
 * di adesso e **già passato dal validatore** sul server: qui arriva una stringa
 * o niente. Non dipende dall'ora, quindi non aspetta il montaggio come fa il
 * resto — e quando non c'è (cron non passato, scena cambiata, template non più
 * valido) si torna alle frasi deterministiche senza che si veda il salto.
 */
export function SalutoDinamico({ seme, stato, riga }: {
  seme: number
  stato?: StatoPersona
  riga?: string | null
}) {
  const [momento, setMomento] = useState<Momento>({ ora: null, giorno: null })
  useEffect(() => {
    const d = new Date()
    setMomento({ ora: d.getHours(), giorno: d.getDay() })
  }, [])
  return (
    <p className="text-text-secondary text-sm mt-1">
      {riga ?? (stato ? salutoPersonale(stato, momento, seme) : saluto(momento, seme))}
    </p>
  )
}
