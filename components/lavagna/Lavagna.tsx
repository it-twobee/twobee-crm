'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  ArrowUpToLine, Camera, ExternalLink, HelpCircle, Image as ImageIcon, Link2, Loader2, LocateFixed, Maximize2, Minus,
  Pencil, Plus, RotateCcw, RotateCw, Scissors, Sticker, StickyNote, Trash2, Wand2, X, ZoomIn, ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import {
  aggiornaElemento, attaccaLink, attaccaMedia, leggiLavagna, reagisci, ritiraMedia, scriviNota, staccaElemento,
} from '@/app/actions/lavagna'
import {
  COLORI_NOTA, EMOJI, LAVAGNA, LIMITI, mediaUrl, normalizzaUrl, SEGNAPOSTO_NOTA,
  type ColoreNota, type ElementoLavagna, type Emoji, type MediaLavagna, type StatoLavagna, type TipoMedia,
} from '@/lib/lavagna'
import { Field, inputCls, ModalShell } from '@/components/shared/formkit'
import { Elemento } from './Elemento'
import { Galleria } from './Galleria'
import { caricaMediaLavagna } from './carica'
import { manoScritta } from './font'

const StickerMaker = dynamic(() => import('./StickerMaker').then(m => m.StickerMaker), { ssr: false })

type Vista = { x: number; y: number; z: number }
type Punto = { x: number; y: number }
type Dialogo =
  | { tipo: 'nota'; el?: ElementoLavagna; testo?: string }
  | { tipo: 'link'; url?: string }
  | { tipo: 'didascalia'; el: ElementoLavagna }
  | { tipo: 'crea' }

const ZOOM_MIN = 0.15
const ZOOM_MAX = 2
const OGNI_MS = 20_000
const vuoto: StatoLavagna = { elementi: [], sticker: [], foto: [] }

const limita = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

/** La lavagna non scappa: almeno un pezzo resta sempre nella finestra. */
function dentro(v: Vista, w: number, h: number): Vista {
  const z = limita(v.z, ZOOM_MIN, ZOOM_MAX)
  const asse = (pos: number, lato: number, finestra: number) => {
    const min = finestra * 0.6 - lato * z
    const max = finestra * 0.4
    return min > max ? (min + max) / 2 : limita(pos, min, max)
  }
  return { z, x: asse(v.x, LAVAGNA.larghezza, w), y: asse(v.y, LAVAGNA.altezza, h) }
}

export function Lavagna({ iniziale, errore, puoScrivere }: { iniziale: StatoLavagna | null; errore: string | null; puoScrivere: boolean }) {
  const [stato, setStato] = useState<StatoLavagna>(iniziale ?? vuoto)
  const [vista, setVistaStato] = useState<Vista>({ x: 0, y: 0, z: 0.5 })
  const [pronta, setPronta] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [galleria, setGalleria] = useState<TipoMedia | null>(null)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [scelta, setScelta] = useState<{ file: File; anteprima: string; dove: Punto | null } | null>(null)
  const [maker, setMaker] = useState<{ sorgente: Blob | null; dove: Punto | null } | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [conferma, setConferma] = useState<string | null>(null)
  const [info, setInfo] = useState(false)

  const vp = useRef<HTMLDivElement>(null)
  const vistaRef = useRef(vista)
  const statoRef = useRef(stato)
  statoRef.current = stato
  const fileInput = useRef<HTMLInputElement>(null)
  const modoFile = useRef<'scegli' | 'sticker' | 'foto'>('scegli')
  const trascina = useRef<{ id: string; px: number; py: number; x0: number; y0: number; mosso: boolean } | null>(null)
  const puntatori = useRef(new Map<number, Punto>())
  const pan = useRef<{ px: number; py: number; vx: number; vy: number; mosso: boolean } | null>(null)
  const pinch = useRef<{ d0: number; z0: number; c: Punto; v0: Vista } | null>(null)
  const pendenti = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; patch: Record<string, unknown> }>())
  const modale = useRef(false)
  modale.current = !!(dialogo || scelta || maker || lightbox)

  const setVista = useCallback((v: Vista | ((p: Vista) => Vista)) => {
    const r = vp.current?.getBoundingClientRect()
    const prossima = typeof v === 'function' ? v(vistaRef.current) : v
    const giusta = r ? dentro(prossima, r.width, r.height) : prossima
    vistaRef.current = giusta
    setVistaStato(giusta)
  }, [])

  /* All'apertura si guarda dove è successo qualcosa di recente, non l'angolo in
     alto a sinistra di una lavagna di quattro metri. */
  const centra = useCallback(() => {
    const r = vp.current?.getBoundingClientRect()
    if (!r) return
    const ultimi = [...statoRef.current.elementi].sort((a, b) => b.z - a.z).slice(0, 12)
    const c = ultimi.length
      ? { x: ultimi.reduce((s, e) => s + e.x, 0) / ultimi.length, y: ultimi.reduce((s, e) => s + e.y, 0) / ultimi.length }
      : { x: LAVAGNA.larghezza / 2, y: LAVAGNA.altezza / 2 }
    const z = limita(Math.min(r.width / 1500, r.height / 950), 0.3, 1)
    setVista({ z, x: r.width / 2 - c.x * z, y: r.height / 2 - c.y * z })
  }, [setVista])

  useEffect(() => { centra(); setPronta(true) }, [centra])

  const centroVista = useCallback((): Punto => {
    const r = vp.current?.getBoundingClientRect()
    const v = vistaRef.current
    if (!r) return { x: LAVAGNA.larghezza / 2, y: LAVAGNA.altezza / 2 }
    const sparpaglia = () => (Math.random() - 0.5) * 140
    return {
      x: limita((r.width / 2 - v.x) / v.z + sparpaglia(), 120, LAVAGNA.larghezza - 120),
      y: limita((r.height / 2 - v.y) / v.z + sparpaglia(), 120, LAVAGNA.altezza - 120),
    }
  }, [])

  const daSchermo = useCallback((clientX: number, clientY: number): Punto => {
    const r = vp.current!.getBoundingClientRect()
    const v = vistaRef.current
    return {
      x: limita((clientX - r.left - v.x) / v.z, 60, LAVAGNA.larghezza - 60),
      y: limita((clientY - r.top - v.y) / v.z, 60, LAVAGNA.altezza - 60),
    }
  }, [])

  const zoomAttorno = useCallback((fattore: number, sx: number, sy: number) => {
    setVista(v => {
      const z = limita(v.z * fattore, ZOOM_MIN, ZOOM_MAX)
      const k = z / v.z
      return { z, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k }
    })
  }, [setVista])

  const zoomCentro = (fattore: number) => {
    const r = vp.current?.getBoundingClientRect()
    if (r) zoomAttorno(fattore, r.width / 2, r.height / 2)
  }

  // ── Stato dal server ────────────────────────────────────────────────────
  const ricarica = useCallback(async () => {
    const r = await leggiLavagna()
    if (!r.ok) return
    setStato(prima => {
      const locali = new Map(prima.elementi.map(e => [e.id, e]))
      const fermi = new Set([...Array.from(pendenti.current.keys()), ...(trascina.current ? [trascina.current.id] : [])])
      return {
        ...r.data,
        elementi: r.data.elementi.map(e => (fermi.has(e.id) && locali.get(e.id) ? { ...e, ...posDi(locali.get(e.id)!) } : e)),
      }
    })
  }, [])

  useEffect(() => {
    const giro = setInterval(() => { if (document.visibilityState === 'visible') ricarica() }, OGNI_MS)
    const torna = () => ricarica()
    window.addEventListener('focus', torna)
    return () => { clearInterval(giro); window.removeEventListener('focus', torna) }
  }, [ricarica])

  const sostituisci = (el: ElementoLavagna) =>
    setStato(s => {
      const altri = s.elementi.filter(e => e.id !== el.id)
      return { ...s, elementi: [...altri, el].sort((a, b) => a.z - b.z) }
    })

  const ritocca = (id: string, f: (e: ElementoLavagna) => ElementoLavagna) =>
    setStato(s => ({ ...s, elementi: s.elementi.map(e => (e.id === id ? f(e) : e)) }))

  /* Ruotare tre volte di fila sono tre clic, non tre salvataggi: si aspetta
     che la mano si fermi e si manda l'ultima posizione. */
  const salva = useCallback((id: string, patch: Record<string, unknown>) => {
    const prima = pendenti.current.get(id)
    if (prima) clearTimeout(prima.timer)
    const unito = { ...(prima?.patch ?? {}), ...patch }
    const timer = setTimeout(async () => {
      pendenti.current.delete(id)
      const r = await aggiornaElemento(id, unito)
      if (!r.ok) { toast.error(r.error); ricarica(); return }
      if (!pendenti.current.has(id) && trascina.current?.id !== id) sostituisci(r.data)
    }, 350)
    pendenti.current.set(id, { timer, patch: unito })
  }, [ricarica])

  // ── Gesti sulla lavagna ─────────────────────────────────────────────────
  useEffect(() => {
    const nodo = vp.current
    if (!nodo) return
    const rotella = (e: WheelEvent) => {
      // la galleria e le barre stanno dentro la lavagna: lì la rotella scorre loro
      if (modale.current || (e.target as HTMLElement | null)?.closest?.('[data-comandi]')) return
      e.preventDefault()
      const r = nodo.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAttorno(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top)
      else setVista(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    nodo.addEventListener('wheel', rotella, { passive: false })
    return () => nodo.removeEventListener('wheel', rotella)
  }, [zoomAttorno, setVista])

  useEffect(() => {
    const ridimensiona = () => setVista(v => v)
    window.addEventListener('resize', ridimensiona)
    return () => window.removeEventListener('resize', ridimensiona)
  }, [setVista])

  const giuSuElemento = useCallback((e: React.PointerEvent<HTMLDivElement>, el: ElementoLavagna) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setSel(el.id)
    setConferma(null)
    if (!el.mio || !puoScrivere) return
    trascina.current = { id: el.id, px: e.clientX, py: e.clientY, x0: el.x, y0: el.y, mosso: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [puoScrivere])

  const doppio = useCallback((el: ElementoLavagna) => {
    if (el.tipo === 'foto' && el.media) setLightbox(el.media.id)
    if (el.tipo === 'link' && el.url) window.open(el.url, '_blank', 'noopener,noreferrer')
  }, [])

  const giu = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-elemento],[data-comandi]')) return
    puntatori.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)
    const v = vistaRef.current
    if (puntatori.current.size === 2) {
      const [a, b] = Array.from(puntatori.current.values())
      const r = e.currentTarget.getBoundingClientRect()
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: v.z, c: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }, v0: v }
      pan.current = null
    } else {
      pan.current = { px: e.clientX, py: e.clientY, vx: v.x, vy: v.y, mosso: false }
    }
  }

  const muovi = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = trascina.current
    if (t) {
      const dx = e.clientX - t.px
      const dy = e.clientY - t.py
      if (!t.mosso && Math.hypot(dx, dy) < 4) return
      t.mosso = true
      const z = vistaRef.current.z
      const x = limita(t.x0 + dx / z, 0, LAVAGNA.larghezza)
      const y = limita(t.y0 + dy / z, 0, LAVAGNA.altezza)
      ritocca(t.id, el => ({ ...el, x, y }))
      return
    }
    if (!puntatori.current.has(e.pointerId)) return
    puntatori.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = pinch.current
    if (p && puntatori.current.size === 2) {
      const [a, b] = Array.from(puntatori.current.values())
      const z = limita(p.z0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, p.d0), ZOOM_MIN, ZOOM_MAX)
      const k = z / p.v0.z
      setVista({ z, x: p.c.x - (p.c.x - p.v0.x) * k, y: p.c.y - (p.c.y - p.v0.y) * k })
      return
    }
    const q = pan.current
    if (q) {
      if (!q.mosso && Math.hypot(e.clientX - q.px, e.clientY - q.py) < 4) return
      q.mosso = true
      setVista(v => ({ ...v, x: q.vx + e.clientX - q.px, y: q.vy + e.clientY - q.py }))
    }
  }

  const su = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = trascina.current
    if (t) {
      trascina.current = null
      if (t.mosso) {
        const el = statoRef.current.elementi.find(x => x.id === t.id)
        if (el) salva(t.id, { x: el.x, y: el.y })
      }
      return
    }
    puntatori.current.delete(e.pointerId)
    if (puntatori.current.size < 2) pinch.current = null
    if (pan.current && !pan.current.mosso) { setSel(null); setConferma(null) }
    if (puntatori.current.size === 0) pan.current = null
  }

  // ── File: scelti, incollati, trascinati ─────────────────────────────────
  const apriFile = useCallback((file: File, dove: Punto | null) => {
    if (!file.type.startsWith('image/')) { toast.error('Solo immagini: JPG, PNG, WebP o GIF'); return }
    if (file.size > LIMITI.byteFoto) { toast.error('Troppo pesante: massimo 15 MB'); return }
    setScelta({ file, anteprima: URL.createObjectURL(file), dove })
  }, [])

  useEffect(() => {
    if (!puoScrivere) return
    const incolla = (e: ClipboardEvent) => {
      if (modale.current) return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return
      const img = Array.from(e.clipboardData?.files ?? []).find(f => f.type.startsWith('image/'))
      if (img) { e.preventDefault(); apriFile(img, null); return }
      const testo = (e.clipboardData?.getData('text') ?? '').trim()
      if (!testo) return
      e.preventDefault()
      if (!/\s/.test(testo) && normalizzaUrl(testo) && /\.|^https?:/i.test(testo)) setDialogo({ tipo: 'link', url: testo })
      else setDialogo({ tipo: 'nota', testo: testo.slice(0, LIMITI.testo) })
    }
    window.addEventListener('paste', incolla)
    return () => window.removeEventListener('paste', incolla)
  }, [puoScrivere, apriFile])

  const scegliFile = (modo: 'scegli' | 'sticker' | 'foto') => {
    modoFile.current = modo
    fileInput.current?.click()
  }

  const fileScelto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (modoFile.current === 'sticker') {
      if (!f.type.startsWith('image/')) { toast.error('Solo immagini'); return }
      setMaker({ sorgente: f, dove: null })
    } else apriFile(f, null)
  }

  // ── Azioni ──────────────────────────────────────────────────────────────
  const attacca = async (m: MediaLavagna, dove: Punto | null = null) => {
    const p = dove ?? centroVista()
    const r = await attaccaMedia({ mediaId: m.id, ...p })
    if (!r.ok) { toast.error(r.error); return }
    sostituisci(r.data)
    setSel(r.data.id)
    setStato(s => ({
      ...s,
      [m.tipo]: s[m.tipo].map(x => (x.id === m.id ? { ...x, usi: x.usi + 1 } : x)),
    }))
  }

  const caricaFoto = async (file: File, nome: string, dove: Punto | null) => {
    const r = await caricaMediaLavagna(file, 'foto', nome)
    if (!r.ok) { toast.error(r.error); return false }
    setStato(s => ({ ...s, foto: [r.media, ...s.foto] }))
    await attacca(r.media, dove)
    toast.success('Foto attaccata 📸')
    return true
  }

  const stickerCreato = async (m: MediaLavagna) => {
    const dove = maker?.dove ?? null
    setMaker(null)
    setStato(s => ({ ...s, sticker: [m, ...s.sticker.filter(x => x.id !== m.id)] }))
    await attacca(m, dove)
  }

  const faiSticker = async (m: MediaLavagna) => {
    try {
      const res = await fetch(mediaUrl(m.id))
      if (!res.ok) throw new Error()
      setMaker({ sorgente: await res.blob(), dove: null })
    } catch { toast.error('Non riesco a scaricare la foto') }
  }

  const ritira = async (m: MediaLavagna) => {
    const r = await ritiraMedia(m.id)
    if (!r.ok) { toast.error(r.error); return }
    setStato(s => ({
      ...s,
      [m.tipo]: s[m.tipo].filter(x => x.id !== m.id),
      elementi: s.elementi.filter(e => e.media?.id !== m.id),
    }))
    toast.success('Ritirato. Come se non fosse mai successo.')
  }

  const stacca = async (el: ElementoLavagna) => {
    if (conferma !== el.id) { setConferma(el.id); return }
    const r = await staccaElemento(el.id)
    setConferma(null)
    if (!r.ok) { toast.error(r.error); return }
    setSel(null)
    setStato(s => ({ ...s, elementi: s.elementi.filter(e => e.id !== el.id) }))
  }

  const reazione = async (el: ElementoLavagna, emoji: Emoji) => {
    const mia = el.mie.includes(emoji)
    ritocca(el.id, e => ({
      ...e,
      mie: mia ? e.mie.filter(x => x !== emoji) : [...e.mie, emoji],
      reazioni: { ...e.reazioni, [emoji]: Math.max(0, (e.reazioni[emoji] ?? 0) + (mia ? -1 : 1)) },
    }))
    const r = await reagisci(el.id, emoji)
    if (!r.ok) { toast.error(r.error); ricarica(); return }
    ritocca(el.id, e => ({ ...e, reazioni: r.data.reazioni, mie: r.data.mie }))
  }

  const ruota = (el: ElementoLavagna, gradi: number) => {
    const rotazione = limita(el.rotazione + gradi, -LIMITI.rotazione, LIMITI.rotazione)
    ritocca(el.id, e => ({ ...e, rotazione }))
    salva(el.id, { rotazione })
  }
  const scala = (el: ElementoLavagna, k: number) => {
    const s = Math.round(limita(el.scala * k, LIMITI.scalaMin, LIMITI.scalaMax) * 100) / 100
    ritocca(el.id, e => ({ ...e, scala: s }))
    salva(el.id, { scala: s })
  }
  const sopra = async (el: ElementoLavagna) => {
    const r = await aggiornaElemento(el.id, { sopra: true })
    if (!r.ok) { toast.error(r.error); return }
    sostituisci(r.data)
  }

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (modale.current || e.key !== 'Escape') return
      if (galleria) setGalleria(null)
      else { setSel(null); setConferma(null) }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [galleria])

  const scelto = sel ? stato.elementi.find(e => e.id === sel) ?? null : null

  if (errore) {
    return (
      <div className="rounded-card border border-border bg-surface p-6 text-center">
        <p className="text-sm font-semibold text-text-primary">La lavagna non è ancora appesa.</p>
        <p className="mt-1 text-2xs text-text-tertiary">{errore}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {puoScrivere ? (
          <>
            <Bottone icona={StickyNote} etichetta="Post-it" principale onClick={() => setDialogo({ tipo: 'nota' })} />
            <Bottone icona={Sticker} etichetta="Sticker" onClick={() => setGalleria(g => (g === 'sticker' ? null : 'sticker'))} attivo={galleria === 'sticker'} />
            <Bottone icona={ImageIcon} etichetta="Foto" onClick={() => setGalleria(g => (g === 'foto' ? null : 'foto'))} attivo={galleria === 'foto'} />
            <Bottone icona={Link2} etichetta="Link" onClick={() => setDialogo({ tipo: 'link' })} />
            <Bottone icona={Wand2} etichetta="Crea sticker" onClick={() => setDialogo({ tipo: 'crea' })} />
          </>
        ) : (
          <>
            <span className="rounded-lg bg-surface-active px-2.5 py-1 text-2xs font-semibold text-text-secondary">Sola lettura</span>
            <Bottone icona={Sticker} etichetta="Galleria" onClick={() => setGalleria(g => (g ? null : 'sticker'))} attivo={!!galleria} />
          </>
        )}
        <button onClick={() => setInfo(i => !i)} aria-expanded={info} aria-label="Come funziona l'anonimato"
          className="ml-auto flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-2xs font-semibold text-text-tertiary hover:bg-surface-hover hover:text-text-primary">
          <HelpCircle className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Anonimo davvero?</span>
        </button>
      </div>

      {info && (
        <div className="relative rounded-xl border border-border bg-surface p-4 pr-10 text-sm text-text-secondary">
          <button onClick={() => setInfo(false)} aria-label="Chiudi" className="absolute right-2 top-2 rounded-lg p-1 text-text-tertiary hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
          <p><strong className="text-text-primary">Sì.</strong> Nessuno vede chi ha attaccato cosa: tu vedi solo che una cosa è <em>tua</em>, e solo le tue le puoi spostare e staccare.</p>
          <p className="mt-1.5">Nel database al posto del tuo nome c&apos;è una firma che non porta a nessuno, le foto perdono i dati del telefono (modello, posizione) quando le carichi, e la lavagna non compare nel registro delle presenze né nella cronologia. Sotto ogni cosa c&apos;è solo il giorno, mai l&apos;ora.</p>
        </div>
      )}

      <div
        ref={vp}
        onPointerDown={giu}
        onPointerMove={muovi}
        onPointerUp={su}
        onPointerCancel={su}
        onDragOver={e => { if (puoScrivere && e.dataTransfer.types.includes('Files')) e.preventDefault() }}
        onDrop={e => {
          if (!puoScrivere) return
          const f = Array.from(e.dataTransfer.files).find(x => x.type.startsWith('image/'))
          if (!f) return
          e.preventDefault()
          apriFile(f, daSchermo(e.clientX, e.clientY))
        }}
        className="relative min-h-[26rem] flex-1 touch-none select-none overflow-hidden rounded-card border border-border bg-background cursor-grab active:cursor-grabbing"
      >
        <div
          className="absolute left-0 top-0 origin-top-left rounded-[2rem] border border-border bg-surface"
          style={{
            width: LAVAGNA.larghezza,
            height: LAVAGNA.altezza,
            transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})`,
            backgroundImage: 'radial-gradient(var(--color-border-strong) 1.5px, transparent 1.5px)',
            backgroundSize: '32px 32px',
            visibility: pronta ? 'visible' : 'hidden',
          }}
        >
          {stato.elementi.map(el => (
            <Elemento key={el.id} el={el} selezionato={el.id === sel} trascinabile={el.mio && puoScrivere}
              onPointerDown={giuSuElemento} onDoppio={doppio} />
          ))}
        </div>

        {stato.elementi.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="text-center">
              <p className={`${manoScritta.className} text-4xl font-bold text-text-secondary`}>La lavagna è pulita.</p>
              <p className={`${manoScritta.className} text-3xl text-text-tertiary`}>Ancora per poco.</p>
            </div>
          </div>
        )}

        <div data-comandi className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-card">
          <Icona icona={ZoomOut} etichetta="Rimpicciolisci" onClick={() => zoomCentro(1 / 1.25)} />
          <span className="w-11 text-center text-2xs font-semibold tabular-nums text-text-secondary">{Math.round(vista.z * 100)}%</span>
          <Icona icona={ZoomIn} etichetta="Ingrandisci" onClick={() => zoomCentro(1.25)} />
          <Icona icona={LocateFixed} etichetta="Torna alle ultime cose attaccate" onClick={centra} />
        </div>

        {scelto && (
          <BarraScelta
            el={scelto} puoScrivere={puoScrivere} conferma={conferma === scelto.id}
            onChiudi={() => { setSel(null); setConferma(null) }}
            onReazione={emoji => reazione(scelto, emoji)}
            onRuota={g => ruota(scelto, g)}
            onScala={k => scala(scelto, k)}
            onSopra={() => sopra(scelto)}
            onModifica={() => setDialogo(scelto.tipo === 'nota' ? { tipo: 'nota', el: scelto } : { tipo: 'didascalia', el: scelto })}
            onStacca={() => stacca(scelto)}
            onGuarda={() => scelto.media && setLightbox(scelto.media.id)}
          />
        )}

        {galleria && (
          <Galleria
            tipo={galleria} sticker={stato.sticker} foto={stato.foto} puoScrivere={puoScrivere}
            onTipo={setGalleria} onChiudi={() => setGalleria(null)}
            onAttacca={m => attacca(m)} onRitira={ritira}
            onCreaSticker={() => setDialogo({ tipo: 'crea' })}
            onCaricaFoto={() => scegliFile('foto')}
            onFaiSticker={faiSticker}
          />
        )}
      </div>

      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={fileScelto} />

      {dialogo?.tipo === 'nota' && (
        <DialogoNota
          el={dialogo.el} testoIniziale={dialogo.testo}
          onChiudi={() => setDialogo(null)}
          onSalva={async (testo, colore) => {
            const r = dialogo.el
              ? await aggiornaElemento(dialogo.el.id, { testo, colore })
              : await scriviNota({ testo, colore, ...centroVista() })
            if (!r.ok) { toast.error(r.error); return }
            sostituisci(r.data)
            setSel(r.data.id)
            setDialogo(null)
          }}
        />
      )}
      {dialogo?.tipo === 'link' && (
        <DialogoLink
          urlIniziale={dialogo.url}
          onChiudi={() => setDialogo(null)}
          onSalva={async (url, testo) => {
            const r = await attaccaLink({ url, testo, ...centroVista() })
            if (!r.ok) { toast.error(r.error); return }
            sostituisci(r.data)
            setSel(r.data.id)
            setDialogo(null)
          }}
        />
      )}
      {dialogo?.tipo === 'didascalia' && (
        <DialogoDidascalia
          el={dialogo.el}
          onChiudi={() => setDialogo(null)}
          onSalva={async testo => {
            const r = await aggiornaElemento(dialogo.el.id, { testo })
            if (!r.ok) { toast.error(r.error); return }
            sostituisci(r.data)
            setDialogo(null)
          }}
        />
      )}
      {dialogo?.tipo === 'crea' && (
        <Modale titolo="Crea uno sticker" onChiudi={() => setDialogo(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Scelta icona={Camera} titolo="Da una foto" testo="Scontorni il soggetto con un tocco e ci scrivi sopra"
              onClick={() => { setDialogo(null); scegliFile('sticker') }} />
            <Scelta icona={Pencil} titolo="Disegna da zero" testo="Pennarello, scritte, e un bel bordo bianco"
              onClick={() => { setDialogo(null); setMaker({ sorgente: null, dove: null }) }} />
          </div>
        </Modale>
      )}

      {scelta && (
        <DialogoFile
          scelta={scelta}
          onChiudi={() => { URL.revokeObjectURL(scelta.anteprima); setScelta(null) }}
          onFoto={async nome => {
            const ok = await caricaFoto(scelta.file, nome, scelta.dove)
            if (ok) { URL.revokeObjectURL(scelta.anteprima); setScelta(null) }
          }}
          onSticker={() => {
            URL.revokeObjectURL(scelta.anteprima)
            setMaker({ sorgente: scelta.file, dove: scelta.dove })
            setScelta(null)
          }}
        />
      )}

      {maker && <StickerMaker sorgente={maker.sorgente} onChiudi={() => setMaker(null)} onCreato={stickerCreato} />}

      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-scrim-media p-4" onClick={() => setLightbox(null)}
          role="dialog" aria-label="Foto" onKeyDown={e => { if (e.key === 'Escape') setLightbox(null) }}>
          <button onClick={() => setLightbox(null)} aria-label="Chiudi" autoFocus
            className="absolute right-4 top-4 rounded-full bg-surface p-2 text-text-primary shadow-pop">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(lightbox)} alt="Foto della lavagna" className="max-h-[88vh] max-w-full rounded-lg object-contain shadow-pop" />
        </div>
      )}
    </div>
  )
}

const posDi = (e: ElementoLavagna) => ({ x: e.x, y: e.y, rotazione: e.rotazione, scala: e.scala })

// ── Pezzi ────────────────────────────────────────────────────────────────────

type IconaLucide = LucideIcon

function Bottone({ icona: I, etichetta, onClick, principale, attivo }: { icona: IconaLucide; etichetta: string; onClick: () => void; principale?: boolean; attivo?: boolean }) {
  return (
    <button onClick={onClick} aria-label={etichetta} aria-pressed={attivo}
      className={`press flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${
        principale ? 'btn-gold bg-gold text-on-gold'
          : attivo ? 'border border-gold bg-gold-dim text-text-primary'
            : 'border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      }`}>
      <I className="h-4 w-4" aria-hidden={true} />
      <span className="hidden sm:inline">{etichetta}</span>
    </button>
  )
}

function Icona({ icona: I, etichetta, onClick, pericolo, disabled }: { icona: IconaLucide; etichetta: string; onClick: () => void; pericolo?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} aria-label={etichetta} title={etichetta} disabled={disabled}
      className={`rounded-lg p-2 disabled:opacity-40 ${pericolo ? 'text-error hover:bg-error-dim' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}>
      <I className="h-4 w-4" aria-hidden={true} />
    </button>
  )
}

function BarraScelta({ el, puoScrivere, conferma, onChiudi, onReazione, onRuota, onScala, onSopra, onModifica, onStacca, onGuarda }: {
  el: ElementoLavagna; puoScrivere: boolean; conferma: boolean
  onChiudi: () => void; onReazione: (e: Emoji) => void; onRuota: (g: number) => void; onScala: (k: number) => void
  onSopra: () => void; onModifica: () => void; onStacca: () => void; onGuarda: () => void
}) {
  return (
    <div data-comandi className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-border bg-surface p-1.5 shadow-pop">
      <span className="px-2 text-2xs font-semibold text-text-tertiary">{el.mio ? 'Tuo' : '🕵️ Anonimo'} · {el.quando}</span>
      <span className="mx-0.5 h-6 w-px bg-border" aria-hidden="true" />
      {EMOJI.map(e => (
        <button key={e} onClick={() => onReazione(e)} disabled={!puoScrivere} aria-pressed={el.mie.includes(e)}
          aria-label={`Reagisci con ${e}${el.reazioni[e] ? `, ${el.reazioni[e]} finora` : ''}`}
          className={`press flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-base disabled:opacity-50 ${el.mie.includes(e) ? 'bg-gold-dim' : 'hover:bg-surface-hover'}`}>
          <span aria-hidden="true">{e}</span>
          {!!el.reazioni[e] && <span className="text-2xs font-semibold text-text-secondary">{el.reazioni[e]}</span>}
        </button>
      ))}
      {el.tipo === 'foto' && (<><span className="mx-0.5 h-6 w-px bg-border" aria-hidden="true" /><Icona icona={Maximize2} etichetta="Guarda la foto" onClick={onGuarda} /></>)}
      {el.tipo === 'link' && el.url && (
        <>
          <span className="mx-0.5 h-6 w-px bg-border" aria-hidden="true" />
          <a href={el.url} target="_blank" rel="noopener noreferrer nofollow" aria-label="Apri il link" title="Apri il link"
            className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </>
      )}
      {el.mio && puoScrivere && (
        <>
          <span className="mx-0.5 h-6 w-px bg-border" aria-hidden="true" />
          <Icona icona={RotateCcw} etichetta="Ruota a sinistra" onClick={() => onRuota(-6)} disabled={el.rotazione <= -LIMITI.rotazione} />
          <Icona icona={RotateCw} etichetta="Ruota a destra" onClick={() => onRuota(6)} disabled={el.rotazione >= LIMITI.rotazione} />
          <Icona icona={Minus} etichetta="Più piccolo" onClick={() => onScala(1 / 1.15)} disabled={el.scala <= LIMITI.scalaMin} />
          <Icona icona={Plus} etichetta="Più grande" onClick={() => onScala(1.15)} disabled={el.scala >= LIMITI.scalaMax} />
          <Icona icona={ArrowUpToLine} etichetta="Porta in primo piano" onClick={onSopra} />
          {el.tipo !== 'sticker' && <Icona icona={Pencil} etichetta={el.tipo === 'nota' ? 'Modifica il post-it' : 'Modifica la didascalia'} onClick={onModifica} />}
          <button onClick={onStacca} aria-label={conferma ? 'Conferma: stacca' : 'Stacca dalla lavagna'}
            className={`press flex items-center gap-1 rounded-lg px-2 py-2 text-2xs font-semibold ${conferma ? 'bg-error text-on-error' : 'text-error hover:bg-error-dim'}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />{conferma && 'Sicuro?'}
          </button>
        </>
      )}
      <Icona icona={X} etichetta="Deseleziona" onClick={onChiudi} />
    </div>
  )
}

function Modale({ titolo, onChiudi, children }: { titolo: string; onChiudi: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onChiudi])
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim sm:items-center sm:p-4" onClick={onChiudi}>
      <div role="dialog" aria-label={titolo} onClick={e => e.stopPropagation()}
        className="pb-safe w-full max-w-lg rounded-t-2xl border border-border bg-surface shadow-pop sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <h2 className="flex-1 truncate font-heading text-base font-bold text-text-primary">{titolo}</h2>
          <button onClick={onChiudi} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function Scelta({ icona: I, titolo, testo, onClick, attesa }: { icona: IconaLucide; titolo: string; testo: string; onClick: () => void; attesa?: boolean }) {
  return (
    <button onClick={onClick} disabled={attesa}
      className="press flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left hover:border-gold hover:bg-gold-dim disabled:opacity-60">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-dim">
        {attesa ? <Loader2 className="h-5 w-5 animate-spin text-gold-text" /> : <I className="h-5 w-5 text-gold-text" aria-hidden={true} />}
      </span>
      <span className="text-sm font-bold text-text-primary">{titolo}</span>
      <span className="text-2xs text-text-tertiary">{testo}</span>
    </button>
  )
}

function DialogoFile({ scelta, onChiudi, onFoto, onSticker }: {
  scelta: { anteprima: string }; onChiudi: () => void; onFoto: (nome: string) => Promise<void>; onSticker: () => void
}) {
  const [nome, setNome] = useState('')
  const [attesa, setAttesa] = useState(false)
  return (
    <Modale titolo="Che ci facciamo?" onChiudi={attesa ? () => undefined : onChiudi}>
      <div className="space-y-4">
        <div className="flex justify-center rounded-xl bg-surface-hover p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scelta.anteprima} alt="Anteprima" className="max-h-56 rounded-lg object-contain" />
        </div>
        <Field label="Nome" hint="facoltativo, per ritrovarla in galleria">
          <input value={nome} onChange={e => setNome(e.target.value)} maxLength={LIMITI.nomeMedia} placeholder="es. la faccia del lunedì" className={inputCls} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Scelta icona={Camera} titolo="Attaccala come foto" testo="Polaroid sulla lavagna, e resta in galleria" attesa={attesa}
            onClick={async () => { setAttesa(true); await onFoto(nome); setAttesa(false) }} />
          <Scelta icona={Scissors} titolo="Fanne uno sticker" testo="Scontorna, scrivi, bordo bianco: poi è di tutti" attesa={attesa}
            onClick={onSticker} />
        </div>
      </div>
    </Modale>
  )
}

function DialogoNota({ el, testoIniziale, onChiudi, onSalva }: {
  el?: ElementoLavagna; testoIniziale?: string; onChiudi: () => void; onSalva: (testo: string, colore: ColoreNota) => Promise<void>
}) {
  const [testo, setTesto] = useState(el?.testo ?? testoIniziale ?? '')
  const [colore, setColore] = useState<ColoreNota>(el?.colore ?? COLORI_NOTA[Math.floor(Math.random() * COLORI_NOTA.length)])
  const [attesa, setAttesa] = useState(false)
  const [segnaposto] = useState(() => SEGNAPOSTO_NOTA[Math.floor(Math.random() * SEGNAPOSTO_NOTA.length)])
  const invia = async () => { setAttesa(true); await onSalva(testo, colore); setAttesa(false) }
  return (
    <ModalShell title={el ? 'Modifica il post-it' : 'Nuovo post-it'} hint="Anonimo: nessuno saprà che sei stato tu"
      icon={<StickyNote className="h-5 w-5 text-gold-text" />} onClose={onChiudi} onSubmit={invia}
      submitLabel={el ? 'Salva' : 'Attacca'} canSubmit={testo.trim().length > 0} pending={attesa}>
      <div className={`${manoScritta.className} rounded-lg p-4`} style={{ background: `var(--color-postit-${colore})`, boxShadow: 'var(--shadow-card)' }}>
        <textarea value={testo} onChange={e => setTesto(e.target.value)} maxLength={LIMITI.testo} rows={5} autoFocus
          placeholder={segnaposto} aria-label="Testo del post-it"
          className="w-full resize-none bg-transparent text-3xl font-bold leading-tight outline-none"
          style={{ color: 'var(--color-on-postit)' }} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Colore" className="flex gap-2">
          {COLORI_NOTA.map(c => (
            <button key={c} role="radio" aria-checked={colore === c} aria-label={c} onClick={() => setColore(c)}
              className={`h-8 w-8 rounded-full border-2 ${colore === c ? 'border-text-primary' : 'border-border'}`}
              style={{ background: `var(--color-postit-${c})` }} />
          ))}
        </div>
        <span className="text-2xs tabular-nums text-text-tertiary">{testo.length}/{LIMITI.testo}</span>
      </div>
    </ModalShell>
  )
}

function DialogoLink({ urlIniziale, onChiudi, onSalva }: { urlIniziale?: string; onChiudi: () => void; onSalva: (url: string, testo: string) => Promise<void> }) {
  const [url, setUrl] = useState(urlIniziale ?? '')
  const [testo, setTesto] = useState('')
  const [attesa, setAttesa] = useState(false)
  const valido = !!normalizzaUrl(url)
  return (
    <ModalShell title="Attacca un link" hint="Un video, un meme, un articolo: quello che merita"
      icon={<Link2 className="h-5 w-5 text-gold-text" />} onClose={onChiudi}
      onSubmit={async () => { setAttesa(true); await onSalva(url, testo); setAttesa(false) }}
      submitLabel="Attacca" canSubmit={valido} pending={attesa}>
      <Field label="Link">
        <input value={url} onChange={e => setUrl(e.target.value)} autoFocus inputMode="url" placeholder="https://…" className={inputCls} />
      </Field>
      <Field label="Due parole" hint="facoltative">
        <input value={testo} onChange={e => setTesto(e.target.value)} maxLength={LIMITI.testo} placeholder="Da vedere assolutamente" className={inputCls} />
      </Field>
    </ModalShell>
  )
}

function DialogoDidascalia({ el, onChiudi, onSalva }: { el: ElementoLavagna; onChiudi: () => void; onSalva: (testo: string) => Promise<void> }) {
  const [testo, setTesto] = useState(el.testo)
  const [attesa, setAttesa] = useState(false)
  return (
    <ModalShell title={el.tipo === 'foto' ? 'Didascalia' : 'Due parole sul link'}
      icon={<Pencil className="h-5 w-5 text-gold-text" />} onClose={onChiudi}
      onSubmit={async () => { setAttesa(true); await onSalva(testo); setAttesa(false) }}
      submitLabel="Salva" canSubmit pending={attesa}>
      <input value={testo} onChange={e => setTesto(e.target.value)} maxLength={el.tipo === 'foto' ? 40 : LIMITI.testo} autoFocus
        aria-label="Testo" placeholder={el.tipo === 'foto' ? 'es. venerdì, ore 18' : 'Da vedere assolutamente'} className={inputCls} />
    </ModalShell>
  )
}
