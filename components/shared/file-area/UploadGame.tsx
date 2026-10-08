'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Folder, Loader2, X } from 'lucide-react'
import { JobRow, buttonCls } from './items'
import { jobBadge } from './uploads'
import type { UploadJob } from './uploads'

/* §468 — Il canestro. Scelti i file dal computer si apre questa finestra:
   il file sta in basso a sinistra, lo si tira indietro come una fionda e lo
   si lascia andare. Se entra parte il caricamento, se esce torna in mano.
   La mira è di chi carica, e i puntini mostrano dove andrà.

   Il gioco non tiene in ostaggio nessuno: «Carica senza tirare» manda tutto,
   Invio sul file fa un tiro che entra, e chi chiede meno movimento al sistema
   (`prefers-reduced-motion`) la finestra non la vede proprio — carica e basta.
   Il trascinamento dentro l'area non passa da qui: è già un gesto. */

const CARD_W = 52
const CARD_H = 64
/** Il file contro il ferro conta più piccolo di quanto si vede: un tiro buono che sfiora deve entrare. */
const BODY = 15
const EDGE = 5
const DOTS = 26

type Ball = { group: string; keys: string[]; label: string; title: string; folder: boolean }
type Phase = 'rest' | 'aim' | 'flight' | 'in' | 'out' | 'enter'
type Point = { x: number; y: number }

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return reduced
}

/** I palloni: uno per file, uno per cartella o zip, uno solo quando la scelta è troppo lunga. */
function ballsOf(jobs: UploadJob[]): Ball[] {
  const groups = new Map<string, UploadJob[]>()
  jobs.forEach(job => { if (job.status === 'mira') groups.set(job.group, [...(groups.get(job.group) ?? []), job]) })
  return Array.from(groups, ([group, list]) => {
    const folder = group.startsWith('dir:') || group.startsWith('zip:')
    if (list.length === 1 && !folder) return { group, keys: [list[0].key], label: jobBadge(list[0]), title: list[0].name, folder }
    const name = folder ? group.slice(4) : null
    return { group, keys: list.map(job => job.key), label: `${list.length} file`, title: name ? `${name} · ${list.length} file` : `${list.length} file`, folder }
  })
}

function layout(width: number, height: number) {
  const rx = Math.round(Math.min(56, Math.max(40, width * 0.075)))
  const rim = { x: Math.round(width * 0.7), y: Math.round(height * 0.36), rx, ry: Math.round(rx * 0.24) }
  // Il punto di lancio lascia spazio sotto e a sinistra: la fionda si tira lì.
  const anchor = { x: Math.round(Math.max(96, width * 0.2)), y: height - 140 }
  const board = { w: rx * 2 + 44, h: Math.round(rx * 1.5) }
  const gravity = 2000 * (height / 440)
  // Il tiro che entra: parabola da `anchor` al centro del ferro in un tempo fisso.
  const time = 0.82 * Math.sqrt(height / 440)
  const sure = { x: (rim.x - anchor.x) / time, y: (rim.y - 2 - anchor.y) / time - (gravity * time) / 2 }
  const maxPull = Math.min(150, height * 0.34)
  return {
    width, height, rim, anchor, gravity, sure, maxPull,
    // A due terzi della corda si arriva col tiro giusto: c'è margine per sbagliare in tutti e due i versi.
    power: (Math.hypot(sure.x, sure.y) * 1.5) / maxPull,
    board: { x: rim.x - board.w / 2, y: rim.y - board.h + 4, ...board },
    net: { bottom: rim.y + Math.round(rx * 1.25), half: Math.round(rx * 0.55) },
  }
}
type Layout = ReturnType<typeof layout>

const easeOut = (t: number) => 1 - (1 - t) ** 3
const easeBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2

function FileCard({ ball }: { ball: Ball }) {
  return <div className="relative h-full w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-card">
    <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-bl-md bg-border-strong" />
    {ball.folder
      ? <Folder className="absolute left-2 top-2.5 h-5 w-5 text-gold-text" aria-hidden="true" />
      : <>
          <span className="absolute left-2 top-3 h-0.5 w-6 rounded-full bg-border-strong" />
          <span className="absolute left-2 top-5 h-0.5 w-8 rounded-full bg-border-strong" />
          <span className="absolute left-2 top-7 h-0.5 w-5 rounded-full bg-border-strong" />
        </>}
    <span className="absolute inset-x-1 bottom-1.5 truncate rounded bg-gold text-center text-2xs font-bold leading-5 tracking-tight text-on-gold">
      {ball.label}
    </span>
  </div>
}

function Hoop({ g, layer, net, rim }: { g: Layout; layer: 'back' | 'front'; net?: React.Ref<SVGGElement>; rim?: React.Ref<SVGPathElement> }) {
  const { rim: r } = g
  if (layer === 'back') return <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" width={g.width} height={g.height}>
    <rect x={g.board.x} y={g.board.y} width={g.board.w} height={g.board.h} rx={8}
      style={{ fill: 'var(--color-surface)', stroke: 'var(--color-border-strong)' }} strokeWidth={1.5} />
    <rect x={r.x - r.rx * 0.6} y={g.board.y + g.board.h * 0.32} width={r.rx * 1.2} height={g.board.h * 0.5} rx={3}
      style={{ fill: 'none', stroke: 'var(--color-gold-text)' }} strokeWidth={2.5} />
    <rect x={r.x - 7} y={r.y - 6} width={14} height={8} rx={2} style={{ fill: 'var(--color-gold-text)' }} />
    <path fill="none" strokeWidth={4} strokeLinecap="round" style={{ stroke: 'var(--color-gold-text)', opacity: 0.65 }}
      d={`M ${r.x - r.rx} ${r.y} A ${r.rx} ${r.ry} 0 0 1 ${r.x + r.rx} ${r.y}`} />
  </svg>
  const strands = 8
  const step = (2 * g.net.half) / (strands - 1)
  const mid = (r.y + g.net.bottom) / 2
  return <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-20" width={g.width} height={g.height}>
    <g ref={net} fill="none" strokeWidth={1.4} strokeLinecap="round"
      style={{ stroke: 'var(--color-text-tertiary)', transformBox: 'view-box', transformOrigin: `${r.x}px ${r.y}px` }}>
      {Array.from({ length: strands }, (_, i) => {
        const k = i / (strands - 1)
        const top = { x: r.x - r.rx + 2 * r.rx * k, y: r.y + r.ry * Math.sqrt(Math.max(0, 1 - (2 * k - 1) ** 2)) }
        const bottom = { x: r.x - g.net.half + step * i, y: g.net.bottom }
        return <g key={i}>
          <path d={`M ${top.x} ${top.y} L ${bottom.x} ${bottom.y}`} />
          {i < strands - 1 && <path d={`M ${top.x} ${top.y} L ${bottom.x + step} ${bottom.y}`} opacity={0.55} />}
          {i > 0 && <path d={`M ${top.x} ${top.y} L ${bottom.x - step} ${bottom.y}`} opacity={0.55} />}
        </g>
      })}
      <path d={`M ${r.x - (r.rx + g.net.half) / 2} ${mid} Q ${r.x} ${mid + 8} ${r.x + (r.rx + g.net.half) / 2} ${mid}`} />
    </g>
    <path ref={rim} fill="none" strokeWidth={5} strokeLinecap="round" style={{ stroke: 'var(--color-gold-text)' }}
      d={`M ${r.x - r.rx} ${r.y} A ${r.rx} ${r.ry} 0 0 0 ${r.x + r.rx} ${r.y}`} />
  </svg>
}

/** Dove andrà il file lasciato adesso: la stessa fisica del volo, senza il ferro. */
function trajectory(g: Layout, from: Point, v: Point): Point[] {
  const out: Point[] = []
  for (let i = 1; i <= DOTS; i++) {
    const t = i * 0.045
    const p = { x: from.x + v.x * t, y: from.y + v.y * t + (g.gravity * t * t) / 2 }
    if (p.x < 0 || p.x > g.width || p.y > g.height) break
    out.push(p)
    // Dentro il ferro i puntini si fermano: oltre, il file non ci va.
    const prev = out[out.length - 2] ?? from
    if (prev.y < g.rim.y && p.y >= g.rim.y && Math.abs(p.x - g.rim.x) < g.rim.rx - 6) break
  }
  return out
}

export function UploadGame({ jobs, opening, target, onLaunch, onClose }: {
  jobs: UploadJob[]
  opening: boolean
  /** Il nome della cartella in cui finiscono, per dirlo. */
  target: string
  onLaunch: (keys: string[]) => void
  onClose: () => void
}) {
  const balls = useMemo(() => ballsOf(jobs), [jobs])
  const current = balls[0] ?? null
  const shown = jobs.filter(job => job.status !== 'mira')
  const done = jobs.filter(job => job.status === 'fatto').length
  const waiting = balls.reduce((sum, ball) => sum + ball.keys.length, 0)

  const court = useRef<HTMLDivElement>(null)
  const ball = useRef<HTMLDivElement>(null)
  const net = useRef<SVGGElement>(null)
  const rim = useRef<SVGPathElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [aim, setAim] = useState<Point | null>(null)
  const [flash, setFlash] = useState<{ id: number; text: string; score: boolean } | null>(null)

  const g = useMemo(() => size.width ? layout(size.width, size.height) : null, [size])
  const geo = useRef(g)
  geo.current = g
  const launchRef = useRef(onLaunch)
  launchRef.current = onLaunch
  const currentRef = useRef(current)
  currentRef.current = current

  const sim = useRef({ phase: 'rest' as Phase, x: 0, y: 0, vx: 0, vy: 0, angle: 0, scale: 1, opacity: 1, t: 0, from: { x: 0, y: 0 }, keys: [] as string[] })
  const grab = useRef<Point>({ x: 0, y: 0 })
  const frame = useRef(0)

  useLayoutEffect(() => {
    const el = court.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), 1100)
    return () => window.clearTimeout(timer)
  }, [flash])

  const paint = useCallback(() => {
    const el = ball.current
    const layoutNow = geo.current
    if (!el || !layoutNow) return
    const s = sim.current
    const r = layoutNow.rim
    // Scende dentro il ferro: passa dietro il bordo davanti e la retina, così si vede entrare.
    const behind = s.phase === 'in' || (s.phase === 'flight' && s.vy > 0 && Math.abs(s.x - r.x) < r.rx + BODY && s.y > r.y - CARD_H * 0.6 && s.y < layoutNow.net.bottom + CARD_H)
    el.style.transform = `translate(${s.x - CARD_W / 2}px, ${s.y - CARD_H / 2}px) rotate(${s.angle}deg) scale(${s.scale})`
    el.style.opacity = String(s.opacity)
    el.style.zIndex = behind ? '10' : '30'
  }, [])

  const toRest = useCallback((enter: boolean) => {
    const layoutNow = geo.current
    if (!layoutNow) return
    Object.assign(sim.current, { phase: enter ? 'enter' : 'rest', x: layoutNow.anchor.x, y: layoutNow.anchor.y, vx: 0, vy: 0, angle: 0, t: 0, scale: enter ? 0.6 : 1, opacity: enter ? 0 : 1 })
  }, [])

  useLayoutEffect(() => {
    if (sim.current.phase === 'rest') { toRest(false); paint() }
  }, [g, current?.group, toRest, paint])

  const swish = useCallback(() => {
    net.current?.animate([
      { transform: 'scale(1, 1)' },
      { transform: 'scale(0.88, 1.25)' },
      { transform: 'scale(1.05, 0.92)' },
      { transform: 'scale(1, 1)' },
    ], { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
  }, [])

  const clang = useCallback(() => {
    rim.current?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], { duration: 320, easing: 'ease-out' })
  }, [])

  /** Un passo di fisica. Ritorna `false` quando non c'è più niente da muovere. */
  const step = useCallback((dt: number): boolean => {
    const layoutNow = geo.current
    if (!layoutNow) return false
    const s = sim.current
    const r = layoutNow.rim
    if (s.phase === 'flight') {
      const parts = 4
      for (let i = 0; i < parts; i++) {
        const h = dt / parts
        const prevY = s.y
        s.vy += layoutNow.gravity * h
        s.x += s.vx * h
        s.y += s.vy * h
        s.t += h
        for (const ex of [r.x - r.rx, r.x + r.rx]) {
          const dx = s.x - ex, dy = s.y - r.y, d = Math.hypot(dx, dy), min = BODY + EDGE
          if (d >= min || d < 0.001) continue
          const nx = dx / d, ny = dy / d
          const vn = s.vx * nx + s.vy * ny
          if (vn < 0) {
            s.vx = (s.vx - 1.55 * vn * nx) * 0.9
            s.vy = (s.vy - 1.55 * vn * ny) * 0.9
            clang()
          }
          s.x = ex + nx * min
          s.y = r.y + ny * min
        }
        if (prevY < r.y && s.y >= r.y && s.vy > 0 && Math.abs(s.x - r.x) < r.rx - 6) {
          Object.assign(s, { phase: 'in', t: 0, from: { x: s.x, y: s.y } })
          swish()
          setFlash({ id: Date.now(), text: 'Canestro!', score: true })
          return true
        }
      }
      s.angle += s.vx * dt * 0.35
      if (s.x < -CARD_W || s.x > layoutNow.width + CARD_W || s.y > layoutNow.height + CARD_H || s.t > 4) {
        Object.assign(s, { phase: 'out', t: 0 })
        setFlash({ id: Date.now(), text: 'Fuori! Riprova', score: false })
      }
      return true
    }
    if (s.phase === 'in') {
      s.t = Math.min(1, s.t + dt / 0.5)
      const e = easeOut(s.t)
      s.x = s.from.x + (r.x - s.from.x) * e
      s.y = s.from.y + (layoutNow.net.bottom + 8 - s.from.y) * s.t * s.t
      s.angle *= 0.85
      s.scale = 1 - 0.3 * s.t
      s.opacity = s.t < 0.55 ? 1 : 1 - (s.t - 0.55) / 0.45
      if (s.t >= 1) {
        launchRef.current(s.keys)
        toRest(true)
      }
      return true
    }
    if (s.phase === 'out') {
      s.t += dt / 0.35
      if (s.t >= 1) toRest(true)
      return true
    }
    if (s.phase === 'enter') {
      s.t = Math.min(1, s.t + dt / 0.32)
      s.scale = 0.6 + 0.4 * easeBack(s.t)
      s.opacity = Math.min(1, s.t * 2)
      if (s.t >= 1) { Object.assign(s, { phase: 'rest', scale: 1, opacity: 1 }); return false }
      return true
    }
    return false
  }, [clang, swish, toRest])

  const run = useCallback(() => {
    cancelAnimationFrame(frame.current)
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000)
      last = now
      const more = step(dt)
      paint()
      if (more) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [paint, step])

  const shoot = useCallback((v: Point, from: Point) => {
    const shot = currentRef.current
    if (!shot) return
    Object.assign(sim.current, { phase: 'flight', x: from.x, y: from.y, vx: v.x, vy: v.y, t: 0, keys: shot.keys })
    run()
  }, [run])

  const pullOf = (e: React.PointerEvent): Point => {
    const layoutNow = geo.current!
    const p = { x: e.clientX - grab.current.x, y: e.clientY - grab.current.y }
    const length = Math.hypot(p.x, p.y)
    const pull = length > layoutNow.maxPull ? { x: (p.x / length) * layoutNow.maxPull, y: (p.y / length) * layoutNow.maxPull } : p
    // Il file tirato resta dentro il campo: tagliato dal bordo non si vede più dove lo si tiene.
    const { anchor, width, height } = layoutNow
    return {
      x: Math.max(CARD_W / 2 + 4 - anchor.x, Math.min(width - CARD_W / 2 - 4 - anchor.x, pull.x)),
      y: Math.max(CARD_H / 2 + 4 - anchor.y, Math.min(height - CARD_H / 2 - 4 - anchor.y, pull.y)),
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sim.current.phase !== 'rest' || !geo.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    grab.current = { x: e.clientX, y: e.clientY }
    sim.current.phase = 'aim'
    setAim({ x: 0, y: 0 })
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const layoutNow = geo.current
    if (sim.current.phase !== 'aim' || !layoutNow) return
    const pull = pullOf(e)
    Object.assign(sim.current, { x: layoutNow.anchor.x + pull.x, y: layoutNow.anchor.y + pull.y, angle: Math.max(-25, Math.min(25, -pull.x * 0.15)) })
    paint()
    setAim(pull)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const layoutNow = geo.current
    if (sim.current.phase !== 'aim' || !layoutNow) return
    const pull = pullOf(e)
    setAim(null)
    if (Math.hypot(pull.x, pull.y) < 14) { toRest(false); paint(); return }
    shoot({ x: -pull.x * layoutNow.power, y: -pull.y * layoutNow.power }, { x: layoutNow.anchor.x + pull.x, y: layoutNow.anchor.y + pull.y })
  }
  const onPointerCancel = () => {
    if (sim.current.phase !== 'aim') return
    setAim(null)
    toRest(false)
    paint()
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const layoutNow = geo.current
    if ((e.key === 'Enter' || e.key === ' ') && sim.current.phase === 'rest' && layoutNow) {
      e.preventDefault()
      shoot(layoutNow.sure, layoutNow.anchor)
    }
  }

  const hasBalls = balls.length > 0
  const close = useCallback(() => onClose(), [onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])
  useEffect(() => {
    if (current) ball.current?.focus({ preventScroll: true })
    else closeButton.current?.focus({ preventScroll: true })
    // Solo all'apertura e quando la mano si svuota: non si ruba il fuoco a ogni tiro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBalls])

  const preview = g && aim && (Math.hypot(aim.x, aim.y) >= 14)
    ? trajectory(g, { x: g.anchor.x + aim.x, y: g.anchor.y + aim.y }, { x: -aim.x * g.power, y: -aim.y * g.power })
    : []

  // In alto e non al centro: le righe che arrivano allungano la finestra verso il basso, il campo resta fermo sotto la mano.
  return <div className="fixed inset-0 z-[60] flex items-start justify-center bg-scrim p-2 animate-fade-in sm:p-4 sm:pt-[5vh]"
    onClick={() => { if (!hasBalls) close() }}>
    <div role="dialog" aria-modal="true" aria-labelledby="canestro-titolo" onClick={e => e.stopPropagation()}
      className="flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl sm:max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop animate-scale-in">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 id="canestro-titolo" className="font-heading text-lg font-bold text-text-primary">Carica file</h2>
          <p className="mt-0.5 text-2xs text-text-secondary">
            Tira indietro il file e lascialo andare: se entra nel canestro, parte. Invio fa un tiro sicuro.
          </p>
        </div>
        <span key={done} className="mt-0.5 inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-gold-dim px-3 text-2xs font-semibold text-gold-text animate-scale-in">
          Caricati <span className="font-bold">{done}</span>
        </span>
        <button ref={closeButton} type="button" onClick={close} aria-label="Chiudi" className={`${buttonCls} min-w-10 px-2`}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div ref={court} style={{ touchAction: 'none' }}
          className="relative h-[clamp(300px,52vh,440px)] select-none overflow-hidden rounded-xl border border-dashed border-border-strong bg-background">
          {g && <>
            <Hoop g={g} layer="back" />
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]" width={g.width} height={g.height}>
              {hasBalls && !aim && <ellipse cx={g.anchor.x} cy={g.anchor.y + CARD_H / 2 + 6} rx={CARD_W * 0.6} ry={CARD_W * 0.15}
                strokeDasharray="4 5" strokeWidth={1.5} style={{ fill: 'none', stroke: 'var(--color-border-strong)' }} />}
              {aim && <line x1={g.anchor.x} y1={g.anchor.y} x2={g.anchor.x + aim.x} y2={g.anchor.y + aim.y}
                strokeDasharray="2 4" strokeWidth={2} strokeLinecap="round" style={{ stroke: 'var(--color-border-strong)' }} />}
              {preview.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5 - i * 0.07}
                style={{ fill: 'var(--color-gold-text)', opacity: Math.max(0.15, 0.9 - i * 0.03) }} />)}
            </svg>

            {balls.slice(1, 3).map((next, i) => <div key={next.group} aria-hidden="true"
              className="pointer-events-none absolute z-[4] opacity-60"
              style={{ width: CARD_W, height: CARD_H, left: g.anchor.x - CARD_W / 2 - 14 * (i + 1), top: g.anchor.y - CARD_H / 2 + 6 * (i + 1), transform: `rotate(${-6 * (i + 1)}deg)` }}>
              <FileCard ball={next} />
            </div>)}

            {current && <div ref={ball} role="button" tabIndex={0}
              aria-label={`${current.title}: trascina indietro e lascia per tirare, oppure premi Invio per un tiro sicuro`}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
              onKeyDown={onKeyDown}
              style={{ width: CARD_W, height: CARD_H, touchAction: 'none' }}
              className={`absolute left-0 top-0 z-30 rounded-lg outline-offset-4 will-change-transform ${aim ? 'cursor-grabbing' : 'cursor-grab'}`}>
              <FileCard ball={current} />
            </div>}

            <Hoop g={g} layer="front" net={net} rim={rim} />

            {flash && <p key={flash.id} role="status"
              className={`pointer-events-none absolute z-40 -translate-x-1/2 font-heading text-base font-bold animate-slide-up ${flash.score ? 'text-gold-text' : 'text-text-secondary'}`}
              style={flash.score ? { left: g.rim.x, top: Math.max(8, g.board.y - 30) } : { left: g.anchor.x + 40, top: g.anchor.y - CARD_H }}>
              {flash.text}
            </p>}
          </>}

          {current && !aim && <div className="pointer-events-none absolute bottom-3 left-4 z-40 max-w-[45%]">
            <p className="truncate text-2xs font-semibold text-text-primary" title={current.title}>{current.title}</p>
            {waiting > current.keys.length && <p className="text-2xs text-text-tertiary">
              Ancora {waiting - current.keys.length} file da tirare
            </p>}
          </div>}
          {aim && <p className="pointer-events-none absolute bottom-3 right-4 z-40 text-2xs font-semibold text-text-secondary">Lascia per tirare!</p>}

          {!current && <div className="absolute inset-y-0 left-0 z-40 flex w-1/2 flex-col items-center justify-center gap-2 p-6 text-center">
            {opening
              ? <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Apro lo zip: i file che contiene diventano una cartella.</p>
              : shown.some(job => job.status !== 'errore')
                ? <p className="font-heading text-lg font-bold text-text-primary">Tutti dentro.</p>
                : <p className="text-sm text-text-secondary">Nessun file da tirare: qui sotto c’è il perché.</p>}
          </div>}
        </div>

        {!!shown.length && <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
          {shown.map(job => <JobRow key={job.key} job={job} />)}
        </ul>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-5">
        <p className="min-w-0 flex-1 truncate text-2xs text-text-tertiary">Finiscono in «{target}»</p>
        {hasBalls
          ? <>
              <button type="button" className={buttonCls} onClick={close} title="I file non ancora tirati non si caricano">Annulla</button>
              <button type="button" className={buttonCls} onClick={() => onLaunch(balls.flatMap(item => item.keys))}>Carica senza tirare</button>
            </>
          : <button type="button" onClick={close}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-2xs font-semibold text-on-gold">
              Chiudi
            </button>}
      </div>
    </div>
  </div>
}
