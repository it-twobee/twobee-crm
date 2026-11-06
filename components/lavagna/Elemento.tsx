'use client'

import { memo } from 'react'
import { Link2 } from 'lucide-react'
import { corpoNota, dominio, EMOJI, ingombro, mediaUrl, type ElementoLavagna } from '@/lib/lavagna'
import { manoScritta } from './font'

type Props = {
  el: ElementoLavagna
  selezionato: boolean
  trascinabile: boolean
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, el: ElementoLavagna) => void
  onDoppio: (el: ElementoLavagna) => void
}

/* Tutto in punti della lavagna: la lavagna intera si scala, e un post-it
   scritto a 30 punti resta un post-it scritto a 30 punti a qualunque zoom. */
function ElementoBase({ el, selezionato, trascinabile, onPointerDown, onDoppio }: Props) {
  const { w, h } = ingombro(el)
  const reazioni = EMOJI.filter(e => (el.reazioni[e] ?? 0) > 0)
  return (
    <div
      data-elemento={el.id}
      onPointerDown={e => onPointerDown(e, el)}
      onDoubleClick={() => onDoppio(el)}
      className={`absolute touch-none select-none ${trascinabile ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{
        left: el.x, top: el.y, width: w, height: h,
        transform: `translate(-50%, -50%) rotate(${el.rotazione}deg) scale(${el.scala})`,
      }}
    >
      <div className="lavagna-pop relative h-full w-full">
        {el.tipo === 'nota' && <Nota el={el} />}
        {el.tipo === 'sticker' && el.media && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(el.media.id)} alt="Sticker" draggable={false} loading="lazy"
            className="pointer-events-none h-full w-full object-contain"
            style={{ filter: 'drop-shadow(0 3px 4px var(--shadow-color))' }} />
        )}
        {el.tipo === 'foto' && el.media && <Polaroid el={el} />}
        {el.tipo === 'link' && el.url && <Link el={el} />}
        {selezionato && (
          <div aria-hidden="true" className="pointer-events-none absolute -inset-3 rounded-2xl border-2 border-dashed border-gold" />
        )}
        {reazioni.length > 0 && (
          <div className="pointer-events-none absolute -bottom-5 left-1/2 flex -translate-x-1/2 gap-1">
            {reazioni.map(e => (
              <span key={e} className={`flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-sm shadow-soft ${
                el.mie.includes(e) ? 'border-gold bg-gold-dim text-text-primary' : 'border-border bg-surface text-text-secondary'
              }`}>
                <span aria-hidden="true">{e}</span>{el.reazioni[e]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export const Elemento = memo(ElementoBase)

function Nastro() {
  return (
    <span aria-hidden="true" className="absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 -rotate-3"
      style={{ background: 'var(--color-nastro)' }} />
  )
}

function Nota({ el }: { el: ElementoLavagna }) {
  return (
    <div className={`${manoScritta.className} relative flex h-full w-full items-center justify-center whitespace-pre-wrap break-words p-5 text-center font-bold leading-tight`}
      style={{
        background: `var(--color-postit-${el.colore})`,
        color: 'var(--color-on-postit)',
        boxShadow: 'var(--shadow-card)',
        fontSize: corpoNota(el.testo),
      }}>
      <Nastro />
      {el.testo}
    </div>
  )
}

function Polaroid({ el }: { el: ElementoLavagna }) {
  return (
    <div className="relative flex h-full w-full flex-col items-center p-3"
      style={{ background: 'var(--color-polaroid)', boxShadow: 'var(--shadow-card)' }}>
      <Nastro />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(el.media!.id, true)} alt={el.testo || 'Foto'} draggable={false} loading="lazy"
        className="pointer-events-none min-h-0 w-full flex-1 object-cover" />
      {el.testo && (
        <p className={`${manoScritta.className} mt-1 line-clamp-1 w-full text-center font-bold`}
          style={{ color: 'var(--color-on-postit)', fontSize: 26 }}>{el.testo}</p>
      )}
    </div>
  )
}

function Link({ el }: { el: ElementoLavagna }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 rounded-2xl border border-border-strong bg-surface p-4 shadow-card">
      <span className="flex items-center gap-2 text-sm font-semibold text-gold-text">
        <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{dominio(el.url!)}</span>
      </span>
      {el.testo
        ? <p className="line-clamp-2 text-base font-semibold leading-snug text-text-primary">{el.testo}</p>
        : <p className="truncate text-2xs text-text-tertiary">{el.url}</p>}
    </div>
  )
}
