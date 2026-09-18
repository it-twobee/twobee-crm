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
import { saluto, type Momento } from '@/lib/task-mood'

export function SalutoDinamico({ seme }: { seme: number }) {
  const [momento, setMomento] = useState<Momento>({ ora: null, giorno: null })
  useEffect(() => {
    const d = new Date()
    setMomento({ ora: d.getHours(), giorno: d.getDay() })
  }, [])
  return <p className="text-text-tertiary text-2xs mt-1">{saluto(momento, seme)}</p>
}
