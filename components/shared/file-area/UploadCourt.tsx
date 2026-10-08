'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { extensionBadge } from '@/lib/portal/explorer'
import type { UploadJob } from './uploads'

/* §468 — Il canestro. Scelti i file, ognuno parte dal basso a sinistra e
   finisce nella retina con un arco vero: parametro lineare su una Bézier
   quadratica = velocità orizzontale costante e accelerazione verticale
   costante, cioè una parabola balistica. Chi è già scartato in partenza
   (troppo grande, tipo vietato, spazio finito) prende il ferro e cade fuori.
   L'animazione è un contorno: il caricamento parte subito, non la aspetta,
   e con `prefers-reduced-motion` non c'è proprio. */

export type Shot = { id: string; keys: string[]; label: string; miss: boolean }

/** Oltre questi tiri il resto parte in un colpo solo, «+N»: una cartella da trecento file non è una partita. */
const MAX_SHOTS = 12
const STAGGER = 260
/** Il primo tiro aspetta che il campo si sia aperto. */
const LEAD = 280
const MADE_MS = 1300
const MISS_MS = 1500
const CARD_W = 42
const CARD_H = 50

/** Il cartellino del file: l'estensione, anche per chi arriva da uno zip («foto.jpg (da archivio.zip)»). */
export const jobBadge = (job: Pick<UploadJob, 'name'>) => extensionBadge(job.name.replace(/ \(da [^)]*\)$/, '')) ?? 'FILE'

/** Letto subito, non dopo il primo effetto: una coda che parte al montaggio non deve trovarlo ancora indeciso. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return reduced
}

/** I tiri di una coda: chi aspetta il turno, chi è in volo, e quali file sono ancora per aria. */
export function useShots(jobs: UploadJob[], enabled: boolean) {
  const seen = useRef(new Set<string>())
  const timers = useRef<number[]>([])
  const [queued, setQueued] = useState<Shot[]>([])
  const [flying, setFlying] = useState<Shot[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (!jobs.length) {
      seen.current.clear()
      timers.current.forEach(clearTimeout)
      timers.current = []
      setQueued([])
      setFlying([])
      return
    }
    const fresh = jobs.filter(job => !seen.current.has(job.key))
    if (!fresh.length) return
    fresh.forEach(job => seen.current.add(job.key))
    if (!enabled) return
    const solo = fresh.length > MAX_SHOTS ? fresh.slice(0, MAX_SHOTS - 1) : fresh
    const rest = fresh.slice(solo.length)
    const batch: Shot[] = solo.map(job => ({ id: job.key, keys: [job.key], label: jobBadge(job), miss: job.status === 'errore' }))
    if (rest.length) batch.push({ id: `resto-${rest[0].key}`, keys: rest.map(job => job.key), label: `+${rest.length}`, miss: false })
    setQueued(list => [...list, ...batch])
    batch.forEach((shot, i) => {
      timers.current.push(window.setTimeout(() => {
        setQueued(list => list.filter(item => item.id !== shot.id))
        setFlying(list => [...list, shot])
      }, LEAD + i * STAGGER))
    })
  }, [jobs, enabled])

  const land = useCallback((id: string) => setFlying(list => list.filter(shot => shot.id !== id)), [])

  const airborne = new Set<string>()
  queued.forEach(shot => shot.keys.forEach(key => airborne.add(key)))
  flying.forEach(shot => shot.keys.forEach(key => airborne.add(key)))

  return { flying, busy: queued.length + flying.length > 0, airborne, land }
}

type Point = { x: number; y: number }

function layout(width: number, height: number) {
  // La scena sta al centro e non si allarga oltre i 260px: più lungo, il tiro diventa radente e il file entra di lato.
  const span = Math.max(150, Math.min(260, width - 150))
  const launchX = Math.max(44, Math.round(width / 2 - span / 2 - 10))
  const rim = { x: launchX + span, y: 72, rx: 30, ry: 7 }
  return {
    launch: { x: launchX, y: height - 34 },
    rim,
    apex: CARD_H / 2 + 6,
    net: { top: rim.y, bottom: rim.y + 46, half: 17 },
    board: { x: rim.x - 42, y: 16, w: 84, h: 56 },
  }
}
type Layout = ReturnType<typeof layout>

/** Il punto di controllo che porta la parabola da `a` a `b` toccando `apexY` in cima. */
function controlFor(a: Point, b: Point, apexY: number): Point {
  const top = Math.min(apexY, a.y - 1, b.y - 1)
  return { x: (a.x + b.x) / 2, y: top - Math.sqrt((top - a.y) * (top - b.y)) }
}

const bezier = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * t * (1 - t) * c.x + t * t * b.x,
  y: (1 - t) ** 2 * a.y + 2 * t * (1 - t) * c.y + t * t * b.y,
})

const frame = (p: Point, rotate: number, scale: number, opacity: number, offset: number): Keyframe => ({
  transform: `translate(${p.x - CARD_W / 2}px, ${p.y - CARD_H / 2}px) rotate(${rotate}deg) scale(${scale})`,
  opacity,
  offset,
})

const STEPS = 28

/** Il tiro che entra: la parabola fino al ferro, poi la retina lo frena e lo lascia cadere, senza spigoli fra i due tratti. */
function madeFrames(g: Layout): Keyframe[] {
  const start = g.launch
  const end = { x: g.rim.x, y: g.rim.y - 4 }
  const control = controlFor(start, end, g.apex)
  // Il secondo tratto parte lungo la tangente d'arrivo: stessa direzione, velocità più bassa.
  const catchPoint = { x: end.x + (end.x - control.x) * 0.14, y: end.y + (end.y - control.y) * 0.14 }
  const out = { x: g.rim.x, y: g.net.bottom - 2 }
  const frames = [
    frame({ x: start.x + 6, y: start.y + 12 }, 0, 0.6, 0, 0),
    frame(start, -16, 1, 1, 0.12),
  ]
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS
    frames.push(frame(bezier(start, control, end, t), -16 + 16 * t, 1 - 0.22 * t, 1, 0.12 + 0.64 * t))
  }
  for (let j = 1; j <= 10; j++) {
    const u = j / 10
    frames.push(frame(bezier(end, catchPoint, out, u), 0, 0.78 - 0.16 * u, u < 0.5 ? 1 : 1 - (u - 0.5) * 2, 0.76 + 0.24 * u))
  }
  return frames
}

function missFrames(g: Layout, height: number): Keyframe[] {
  const start = g.launch
  const hit = { x: g.rim.x - g.rim.rx - 6, y: g.rim.y - 12 }
  const control = controlFor(start, hit, g.apex)
  const away = { x: hit.x - 80, y: height + CARD_H }
  const bounce = controlFor(hit, away, hit.y - 46)
  const frames = [
    frame({ x: start.x + 6, y: start.y + 12 }, 0, 0.6, 0, 0),
    frame(start, -16, 1, 1, 0.1),
  ]
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS
    frames.push(frame(bezier(start, control, hit, t), -16 + 10 * t, 1 - 0.2 * t, 1, 0.1 + 0.52 * t))
  }
  for (let j = 1; j <= 14; j++) {
    const u = j / 14
    frames.push(frame(bezier(hit, bounce, away, u), -6 - 220 * u, 0.8, u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4, 0.62 + 0.38 * u))
  }
  return frames
}

function ShotSprite({ shot, geometry, height, onRim, onLand }: {
  shot: Shot
  geometry: Layout
  height: number
  onRim: (shot: Shot) => void
  onLand: (id: string) => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onRim, onLand })
  callbacks.current = { onRim, onLand }

  useEffect(() => {
    const el = node.current
    if (!el) return
    const duration = shot.miss ? MISS_MS : MADE_MS
    const animation = el.animate(shot.miss ? missFrames(geometry, height) : madeFrames(geometry), { duration, fill: 'forwards' })
    const rim = window.setTimeout(() => callbacks.current.onRim(shot), duration * (shot.miss ? 0.62 : 0.78))
    // Se il browser non chiude l'animazione (scheda in background, elemento staccato) il file non resta per aria.
    const fallback = window.setTimeout(() => callbacks.current.onLand(shot.id), duration + 1500)
    animation.onfinish = () => { window.clearTimeout(fallback); callbacks.current.onLand(shot.id) }
    return () => { animation.cancel(); window.clearTimeout(rim); window.clearTimeout(fallback) }
    // La traiettoria si fissa al lancio: un ridimensionamento a metà volo non la deve spezzare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id])

  return <div ref={node} aria-hidden="true" style={{ width: CARD_W, height: CARD_H, opacity: 0 }}
    className="pointer-events-none absolute left-0 top-0 z-10 will-change-transform">
    <div className="relative h-full w-full overflow-hidden rounded-md border border-border-strong bg-surface shadow-pop">
      <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-bl-sm bg-border-strong" />
      <span className="absolute left-1.5 top-2 h-0.5 w-4 rounded-full bg-border-strong" />
      <span className="absolute left-1.5 top-3.5 h-0.5 w-5 rounded-full bg-border-strong" />
      <span className="absolute left-1.5 top-5 h-0.5 w-3 rounded-full bg-border-strong" />
      <span className={`absolute inset-x-0.5 bottom-1 truncate rounded-sm text-center text-2xs font-bold leading-4 tracking-tight ${shot.miss ? 'bg-error text-on-error' : 'bg-gold text-on-gold'}`}>
        {shot.label}
      </span>
    </div>
  </div>
}

/** Il campo: tabellone e ferro dietro, retina e ferro davanti, i file in mezzo — così entrano. */
export function UploadCourt({ flying, busy, land }: Pick<ReturnType<typeof useShots>, 'flying' | 'busy' | 'land'>) {
  const court = useRef<HTMLDivElement>(null)
  const net = useRef<SVGGElement>(null)
  const rimBack = useRef<SVGPathElement>(null)
  const rimFront = useRef<SVGPathElement>(null)
  const trail = useRef<SVGPathElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = court.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const animation = trail.current?.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -18 }], { duration: 900, iterations: Infinity })
    return () => animation?.cancel()
  }, [size.width])

  const onRim = useCallback((shot: Shot) => {
    if (shot.miss) {
      const wobble = [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }]
      rimBack.current?.animate(wobble, { duration: 360, easing: 'ease-out' })
      rimFront.current?.animate(wobble, { duration: 360, easing: 'ease-out' })
      return
    }
    net.current?.animate([
      { transform: 'scale(1, 1)' },
      { transform: 'scale(0.9, 1.22)' },
      { transform: 'scale(1.04, 0.92)' },
      { transform: 'scale(1, 1)' },
    ], { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
  }, [])

  const g = size.width ? layout(size.width, size.height) : null
  const strands = 7

  return <div ref={court} className="relative mx-auto h-44 w-full max-w-xl overflow-hidden rounded-lg bg-background">
    {g && <>
      <svg aria-hidden="true" className="absolute inset-0 z-0" width={size.width} height={size.height}>
        <path ref={trail} fill="none" strokeLinecap="round" strokeWidth={3} strokeDasharray="0 9"
          style={{ stroke: 'var(--color-text-tertiary)', opacity: busy ? 0.6 : 0, transition: 'opacity 300ms ease' }}
          d={(() => {
            const end = { x: g.rim.x, y: g.rim.y - 4 }
            const c = controlFor(g.launch, end, g.apex)
            return `M ${g.launch.x} ${g.launch.y} Q ${c.x} ${c.y} ${end.x} ${end.y}`
          })()} />
        <rect x={g.board.x} y={g.board.y} width={g.board.w} height={g.board.h} rx={6}
          style={{ fill: 'var(--color-surface)', stroke: 'var(--color-border-strong)' }} strokeWidth={1.5} />
        <rect x={g.rim.x - 17} y={g.board.y + 20} width={34} height={26} rx={2}
          style={{ fill: 'none', stroke: 'var(--color-gold-text)' }} strokeWidth={2} />
        <rect x={g.rim.x - 5} y={g.board.y + g.board.h - 4} width={10} height={6} rx={1} style={{ fill: 'var(--color-gold-text)' }} />
        <path ref={rimBack} fill="none" strokeWidth={3} strokeLinecap="round"
          style={{ stroke: 'var(--color-gold-text)', opacity: 0.7, transformBox: 'view-box' }}
          d={`M ${g.rim.x - g.rim.rx} ${g.rim.y} A ${g.rim.rx} ${g.rim.ry} 0 0 1 ${g.rim.x + g.rim.rx} ${g.rim.y}`} />
      </svg>

      {flying.map(shot => <ShotSprite key={shot.id} shot={shot} geometry={g} height={size.height} onRim={onRim} onLand={land} />)}

      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-20" width={size.width} height={size.height}>
        <g ref={net} fill="none" strokeWidth={1.2} strokeLinecap="round"
          style={{ stroke: 'var(--color-text-tertiary)', transformBox: 'view-box', transformOrigin: `${g.rim.x}px ${g.rim.y}px` }}>
          {Array.from({ length: strands }, (_, i) => {
            const k = i / (strands - 1)
            const top = { x: g.rim.x - g.rim.rx + 2 * g.rim.rx * k, y: g.rim.y + g.rim.ry * Math.sqrt(Math.max(0, 1 - (2 * k - 1) ** 2)) }
            const bottom = { x: g.rim.x - g.net.half + 2 * g.net.half * k, y: g.net.bottom }
            const step = (2 * g.net.half) / (strands - 1)
            return <g key={i}>
              <path d={`M ${top.x} ${top.y} L ${bottom.x} ${bottom.y}`} />
              {i < strands - 1 && <path d={`M ${top.x} ${top.y} L ${bottom.x + step} ${bottom.y}`} opacity={0.55} />}
              {i > 0 && <path d={`M ${top.x} ${top.y} L ${bottom.x - step} ${bottom.y}`} opacity={0.55} />}
            </g>
          })}
          <path d={`M ${g.rim.x - (g.rim.rx + g.net.half) / 2} ${(g.rim.y + g.net.bottom) / 2} Q ${g.rim.x} ${(g.rim.y + g.net.bottom) / 2 + 6} ${g.rim.x + (g.rim.rx + g.net.half) / 2} ${(g.rim.y + g.net.bottom) / 2}`} />
        </g>
        <path ref={rimFront} fill="none" strokeWidth={4} strokeLinecap="round"
          style={{ stroke: 'var(--color-gold-text)', transformBox: 'view-box' }}
          d={`M ${g.rim.x - g.rim.rx} ${g.rim.y} A ${g.rim.rx} ${g.rim.ry} 0 0 0 ${g.rim.x + g.rim.rx} ${g.rim.y}`} />
      </svg>
    </>}
  </div>
}
