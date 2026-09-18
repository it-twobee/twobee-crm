'use client'

/**
 * §351 — la riga sotto il titolo di una sezione del workspace.
 *
 * Il seme di partenza dipende **solo dalla chiave**, così server e browser
 * scrivono la stessa frase al primo render; il giorno e l'ora arrivano dopo il
 * montaggio, perché il server sta su UTC e chi legge no.
 *
 * Sta solo nel portale operativo: le stesse pagine, dal portale admin, le usano
 * anche i clienti dei report e le call — il tono di qui, là, sarebbe fuori posto.
 */

import { useState, useEffect } from 'react'
import { sottotitoloSezione, seme, type Momento, type Sezione } from '@/lib/task-mood'

/** numero stabile ricavato dal nome della sezione: uguale ovunque, sempre */
const semeFisso = (s: string) => s.split('').reduce((a, c) => a + c.charCodeAt(0), 0)

export function VoceSezione({ sezione, className }: { sezione: Sezione; className?: string }) {
  const [stato, setStato] = useState<{ m: Momento; s: number }>({
    m: { ora: null, giorno: null }, s: semeFisso(sezione),
  })
  useEffect(() => {
    const d = new Date()
    setStato({
      m: { ora: d.getHours(), giorno: d.getDay() },
      s: seme(d.toISOString().slice(0, 10), semeFisso(sezione)),
    })
  }, [sezione])

  return (
    <p className={className ?? 'text-sm text-text-secondary mt-1'}>
      {sottotitoloSezione(sezione, stato.m, stato.s)}
    </p>
  )
}
