'use client'

/**
 * §393 — le ricorrenze commerciali da spuntare mentre si crea un progetto.
 *
 * Black Friday, Natale, saldi: si sanno da un anno, e si aprono a novembre
 * quando serviva già tutto pronto. Metterle qui — nel momento in cui si
 * pensa a come sarà fatto il progetto — è l'unico momento in cui qualcuno
 * le guarda con calma.
 *
 * Ognuna porta **due date**: il giorno dell'evento e da quando si comincia,
 * che è la data meno l'anticipo della libreria. La corsia vive fra le due,
 * non per tutto il progetto: il Black Friday in Gantt non deve coprire
 * l'anno.
 *
 * L'elenco si legge dal browser, ed è una scelta: `commercial_events` ha
 * una policy di lettura aperta perché è un calendario di feste, non un
 * dato di nessuno. Farlo passare da tre pagine diverse — le tre che
 * montano il wizard — avrebbe voluto dire tre posti in cui dimenticarsene.
 */

import { useEffect, useMemo, useState } from 'react'
import { CalendarHeart, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { daProporre, quandoDice, type Ricorrenza, type DataScritta, type Occorrenza } from '@/lib/ricorrenze-commerciali'
import { newWorkstream, type WWorkstream, type ProjectArea } from './types'

export function RicorrenzeCommerciali({ area, structure, setStructure, ownerId }: {
  area: ProjectArea
  structure: WWorkstream[]
  setStructure: React.Dispatch<React.SetStateAction<WWorkstream[]>>
  ownerId: string | null
}) {
  const [elenco, setElenco] = useState<Ricorrenza[] | null>(null)
  const [scritte, setScritte] = useState<DataScritta[]>([])

  useEffect(() => {
    let vivo = true
    const sb = createClient()
    void (async () => {
      const [{ data: ev }, { data: dt }] = await Promise.all([
        sb.from('commercial_events').select('id, slug, name, date_rule, lead_days, areas, description, active'),
        sb.from('commercial_event_dates').select('event_id, year, event_date'),
      ])
      if (!vivo) return
      /* Senza la 247 la tabella non c'è: il blocco non compare, e il wizard
         resta quello di prima invece di mostrare un errore su una cosa che
         è un di più. */
      setElenco((ev ?? []) as Ricorrenza[])
      setScritte((dt ?? []) as DataScritta[])
    })()
    return () => { vivo = false }
  }, [])

  const oggi = new Date().toISOString().slice(0, 10)
  const proposte = useMemo(
    () => elenco ? daProporre(elenco, area, oggi, scritte) : [],
    [elenco, area, oggi, scritte])

  if (elenco === null) {
    return (
      <p className="flex items-center gap-2 text-2xs text-text-tertiary">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cerco le ricorrenze del periodo…
      </p>
    )
  }
  if (!proposte.length) return null

  const chiave = (o: Occorrenza) => `ric:${o.ricorrenza.slug}:${o.anno}`
  const dentro = (o: Occorrenza) => structure.some(w => w.key === chiave(o))

  const spunta = (o: Occorrenza) => setStructure(ws => {
    if (dentro(o)) return ws.filter(w => w.key !== chiave(o))
    const nuova: WWorkstream = {
      ...newWorkstream(o.etichetta, ownerId),
      key: chiave(o),
      description: o.ricorrenza.description ?? null,
      visibility: 'client_visible',
      start_date: o.dal,
      end_date: o.data,
    }
    return [...ws, nuova]
  })

  return (
    <section className="border border-border rounded-xl overflow-hidden">
      <header className="flex items-start gap-2.5 px-3 py-2.5 border-b border-border bg-surface">
        <CalendarHeart className="w-4 h-4 text-gold-text shrink-0 mt-0.5" aria-hidden />
        <div>
          <h3 className="text-xs font-bold text-text-primary">Ricorrenze commerciali</h3>
          <p className="text-2xs text-text-secondary mt-0.5">
            Si sanno da un anno e si aprono a novembre, quando serviva già tutto pronto.
            Ognuna diventa una corsia che va dall&apos;inizio del lavoro al giorno dell&apos;evento.
          </p>
        </div>
      </header>
      <div className="divide-y divide-border">
        {proposte.map(o => {
          const on = dentro(o)
          return (
            <label key={chiave(o)}
              className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                on ? 'bg-gold-dim' : 'hover:bg-surface-hover'}`}>
              <input type="checkbox" checked={on} onChange={() => spunta(o)}
                className="accent-gold w-3.5 h-3.5 cursor-pointer shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-text-primary">{o.etichetta}</span>
                {/* Le due date, sempre: il giorno dell'evento senza «da quando
                    si comincia» fa aprire la corsia in ritardo, che è il
                    difetto che questo blocco esiste per togliere. */}
                <span className={`block text-2xs ${o.data ? 'text-text-tertiary' : 'text-warning'}`}>
                  {quandoDice(o)}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
