'use client'

import { useMemo, useState } from 'react'
import { Camera, Scissors, Sticker, Trash2, Wand2, X } from 'lucide-react'
import { mediaUrl, type MediaLavagna, type TipoMedia } from '@/lib/lavagna'
import { SearchInput, Segmented } from '@/components/shared/formkit'

type Props = {
  tipo: TipoMedia
  sticker: MediaLavagna[]
  foto: MediaLavagna[]
  puoScrivere: boolean
  onTipo: (t: TipoMedia) => void
  onChiudi: () => void
  onAttacca: (m: MediaLavagna) => void
  onRitira: (m: MediaLavagna) => Promise<void>
  onCreaSticker: () => void
  onCaricaFoto: () => void
  onFaiSticker: (m: MediaLavagna) => void
}

/* La galleria comune: quello che uno carica, tutti lo attaccano. Chi l'ha
   caricato — e solo lui — lo vede segnato «tuo» e lo può ritirare. */
export function Galleria(p: Props) {
  const [cerca, setCerca] = useState('')
  const [ordine, setOrdine] = useState<'nuovi' | 'usati'>('nuovi')
  const [ritiro, setRitiro] = useState<string | null>(null)
  const elenco = p.tipo === 'sticker' ? p.sticker : p.foto
  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    const filtrati = q ? elenco.filter(m => m.nome.toLowerCase().includes(q)) : elenco
    return ordine === 'usati' ? [...filtrati].sort((a, b) => b.usi - a.usi) : filtrati
  }, [elenco, cerca, ordine])

  return (
    <aside data-comandi aria-label="Galleria" className="absolute inset-y-0 right-0 z-30 flex w-[22rem] max-w-full flex-col border-l border-border bg-surface shadow-drawer">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <Segmented ariaLabel="Galleria" value={p.tipo} onChange={p.onTipo}
            options={[{ value: 'sticker', label: `Sticker · ${p.sticker.length}` }, { value: 'foto', label: `Foto · ${p.foto.length}` }]} />
        </div>
        <button onClick={p.onChiudi} aria-label="Chiudi la galleria" className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-2 border-b border-border p-3">
        {p.puoScrivere && (
          p.tipo === 'sticker'
            ? <button onClick={p.onCreaSticker} className="press btn-gold flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-on-gold">
                <Wand2 className="h-4 w-4" aria-hidden="true" /> Crea uno sticker
              </button>
            : <button onClick={p.onCaricaFoto} className="press btn-gold flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-on-gold">
                <Camera className="h-4 w-4" aria-hidden="true" /> Carica una foto
              </button>
        )}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><SearchInput value={cerca} onChange={setCerca} placeholder="Cerca per nome" /></div>
          <div className="w-36 shrink-0">
            <Segmented ariaLabel="Ordine" value={ordine} onChange={setOrdine}
              options={[{ value: 'nuovi', label: 'Nuovi' }, { value: 'usati', label: 'Top' }]} />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {visibili.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Sticker className="h-8 w-8 text-text-tertiary" aria-hidden="true" />
            <p className="text-sm text-text-secondary">
              {cerca ? 'Nessuno con questo nome.' : p.tipo === 'sticker' ? 'Ancora nessuno sticker. Il primo è tuo?' : 'Ancora nessuna foto. Rompi il ghiaccio.'}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {visibili.map(m => (
              <li key={m.id} className="group relative">
                <button onClick={() => p.onAttacca(m)} disabled={!p.puoScrivere}
                  title={[m.nome || (p.tipo === 'sticker' ? 'Sticker' : 'Foto'), m.usi ? `attaccato ${m.usi} ${m.usi === 1 ? 'volta' : 'volte'}` : null, m.quando].filter(Boolean).join(' · ')}
                  aria-label={`Attacca ${m.nome || (p.tipo === 'sticker' ? 'questo sticker' : 'questa foto')} alla lavagna`}
                  className="press flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-hover p-1 hover:border-gold disabled:cursor-default disabled:hover:border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(m.id, p.tipo === 'foto')} alt="" loading="lazy" draggable={false}
                    className={`h-full w-full ${p.tipo === 'foto' ? 'rounded-lg object-cover' : 'object-contain'}`} />
                </button>
                {m.usi > 0 && (
                  <span className="pointer-events-none absolute bottom-1 left-1 rounded-md bg-surface px-1 text-2xs font-semibold text-text-secondary shadow-soft">×{m.usi}</span>
                )}
                {m.mio && (
                  <span className="pointer-events-none absolute left-1 top-1 rounded-md bg-gold-dim px-1 text-2xs font-semibold text-gold-text">tuo</span>
                )}
                <div className="absolute right-1 top-1 flex flex-col gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  {p.puoScrivere && p.tipo === 'foto' && (
                    <button onClick={() => p.onFaiSticker(m)} aria-label="Fanne uno sticker" title="Fanne uno sticker"
                      className="rounded-lg border border-border bg-surface p-1 text-text-secondary shadow-soft hover:text-gold-text">
                      <Scissors className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {m.mio && p.puoScrivere && (
                    <button
                      onClick={async () => {
                        if (ritiro !== m.id) { setRitiro(m.id); return }
                        await p.onRitira(m)
                        setRitiro(null)
                      }}
                      onBlur={() => setRitiro(r => (r === m.id ? null : r))}
                      aria-label={ritiro === m.id ? 'Conferma: ritira dalla galleria e dalla lavagna' : 'Ritira dalla galleria'}
                      title={ritiro === m.id ? 'Sicuro? Sparisce anche dalla lavagna' : 'Ritira'}
                      className={`rounded-lg border p-1 shadow-soft ${ritiro === m.id ? 'border-error bg-error text-on-error' : 'border-border bg-surface text-text-secondary hover:text-error'}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-border px-3 py-2 text-2xs text-text-tertiary">
        Tocca per attaccare. Ritirare uno sticker o una foto li stacca anche dalla lavagna.
      </p>
    </aside>
  )
}
