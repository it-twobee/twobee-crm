'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { GripVertical } from 'lucide-react'
import { riordinaTask } from '@/app/actions/tasks'
import { nuovePosizioni, sposta, type Ordinabile } from '@/lib/task-order'

/**
 * §486 — le task di una milestone, in un ordine che si sceglie: si prende la
 * maniglia e si trascina, oppure la si mette a fuoco e si usano le frecce su e
 * giù. La lista si sposta subito e il salvataggio arriva dopo; se fallisce
 * torna com'era.
 *
 * Si sposta solo la lista intera: con un filtro attivo una parte delle task
 * non si vede, e «mettila prima di questa» non direbbe dove finisce rispetto a
 * quelle nascoste. Lì la maniglia non c'è.
 */
export function TaskRiordinabili<T extends Ordinabile & { title: string }>({ milestoneId, tasks, attivo, render }: {
  milestoneId: string
  /** già in ordine, con `ordinaTask` */
  tasks: T[]
  attivo: boolean
  render: (t: T) => React.ReactNode
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [ordine, setOrdine] = useState(tasks)
  const [presa, setPresa] = useState<string | null>(null)
  const [trascinata, setTrascinata] = useState<number | null>(null)
  const [sopra, setSopra] = useState<number | null>(null)

  const firma = tasks.map(t => `${t.id}:${t.position ?? ''}:${t.title}`).join('|')
  useEffect(() => { setOrdine(tasks) }, [firma]) // eslint-disable-line react-hooks/exhaustive-deps

  const muovi = (da: number, a: number, rifuoca = false) => {
    const scritte = nuovePosizioni(ordine, da, a)
    if (!scritte.length) return
    const prima = ordine
    const id = ordine[da].id
    setOrdine(sposta(ordine, da, a).map(t => {
      const s = scritte.find(x => x.id === t.id)
      return s ? { ...t, position: s.position } : t
    }))
    if (rifuoca) requestAnimationFrame(() => document.getElementById(`sposta-${id}`)?.focus())
    start(async () => {
      try { await riordinaTask(milestoneId, scritte); router.refresh() }
      catch (e) {
        setOrdine(prima)
        toast.error(e instanceof Error ? e.message : 'Ordine non salvato')
      }
    })
  }

  const fine = () => { setPresa(null); setTrascinata(null); setSopra(null) }

  return (
    <>
      {ordine.map((t, i) => {
        const bersaglio = sopra === i && trascinata !== null && trascinata !== i
        return (
          <div key={t.id}
            draggable={attivo && presa === t.id}
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setTrascinata(i) }}
            onDragOver={e => { if (trascinata === null) return; e.preventDefault(); setSopra(i) }}
            onDrop={e => { e.preventDefault(); if (trascinata !== null) muovi(trascinata, i); fine() }}
            onDragEnd={fine}
            className={`group/riga flex items-start rounded-lg border-y-2 border-transparent ${
              trascinata === i ? 'opacity-50' : ''
            } ${bersaglio ? (trascinata! < i ? 'border-b-gold' : 'border-t-gold') : ''}`}>
            {attivo && (
              <button type="button" id={`sposta-${t.id}`}
                aria-label={`Sposta «${t.title}»: trascina, o usa le frecce su e giù`}
                title="Trascina per spostare, o usa le frecce su e giù"
                onPointerDown={() => setPresa(t.id)}
                onPointerUp={() => { if (trascinata === null) setPresa(null) }}
                onKeyDown={e => {
                  if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); muovi(i, i - 1, true) }
                  if (e.key === 'ArrowDown' && i < ordine.length - 1) { e.preventDefault(); muovi(i, i + 1, true) }
                }}
                className="hidden sm:flex items-center justify-center w-4 h-8 shrink-0 cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-primary opacity-0 group-hover/riga:opacity-100 focus-visible:opacity-100">
                <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            <div className="flex-1 min-w-0">{render(t)}</div>
          </div>
        )
      })}
    </>
  )
}
