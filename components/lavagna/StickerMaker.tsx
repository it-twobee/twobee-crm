'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { toast } from 'sonner'
import {
  X, Sparkles, WandSparkles, Eraser, Brush, PenLine, Undo2, RotateCcw, Loader2,
  SquareDashed, Circle, Heart, Star, Sticker, ImageOff,
} from 'lucide-react'
import type { InteractiveSegmenter } from '@mediapipe/tasks-vision'
import { LIMITI, type MediaLavagna } from '@/lib/lavagna'
import {
  bacchetta, pennello, riquadroAlpha, mascheraDaCategoria, unisciMaschere,
  contorno, latoAdattato, puntiStella,
} from '@/lib/lavagna-sticker'
import { caricaMediaLavagna } from './carica'
import { meme } from './font'

type Strumento = 'magia' | 'bacchetta' | 'gomma' | 'ripristina' | 'pennarello'
type Forma = 'nessuna' | 'cerchio' | 'cuore' | 'stella'
type Punto = { x: number; y: number }

const LATO_LAVORO = 1024
const FOGLIO = 512
/* Spazio attorno al foglio per bordo (fino a 28 px) e ombra: senza, il
   contorno di un soggetto che tocca il bordo della foto verrebbe tagliato. */
const MARGINE = 48
const MAX_ANNULLA = 15

/* La versione del wasm deve essere quella del pacchetto: JS e wasm di due
   versioni diverse non si parlano. */
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODELLO = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite'

/* I colori dentro il PNG sono contenuto, non interfaccia: restano gli stessi in
   tutti e due i temi perché finiscono nell'immagine che vede tutto il team. */
const INCHIOSTRI = [
  { nome: 'Nero', colore: '#111111' },
  { nome: 'Bianco', colore: '#FFFFFF' },
  { nome: 'Giallo', colore: '#FFC501' },
  { nome: 'Rosso', colore: '#E53935' },
  { nome: 'Blu', colore: '#1E63D6' },
  { nome: 'Verde', colore: '#1F9D55' },
] as const
const CARTA = '#FFFFFF'
const CONTORNO_SCRITTA = '#111111'
const OMBRA = 'rgba(0,0,0,0.35)'

const NOMI = [
  'Il lunedì mattina',
  'Approvato ✅',
  'Mood del venerdì',
  'Quando parte la build',
  '«Piccola modifica»',
  'Caffè numero quattro',
  'Call che poteva essere una mail',
] as const

const STRUMENTI: { id: Strumento; etichetta: string; icona: typeof Sparkles; foto: boolean }[] = [
  { id: 'magia', etichetta: 'Magia', icona: Sparkles, foto: true },
  { id: 'bacchetta', etichetta: 'Bacchetta', icona: WandSparkles, foto: true },
  { id: 'gomma', etichetta: 'Gomma', icona: Eraser, foto: false },
  { id: 'ripristina', etichetta: 'Ripristina', icona: Brush, foto: true },
  { id: 'pennarello', etichetta: 'Pennarello', icona: PenLine, foto: false },
]

const FORME: { id: Forma; etichetta: string; icona: typeof Sparkles }[] = [
  { id: 'nessuna', etichetta: 'Libera', icona: SquareDashed },
  { id: 'cerchio', etichetta: 'Cerchio', icona: Circle },
  { id: 'cuore', etichetta: 'Cuore', icona: Heart },
  { id: 'stella', etichetta: 'Stella', icona: Star },
]

type Lavoro = {
  w: number
  h: number
  foto: HTMLCanvasElement | null
  rgba: Uint8ClampedArray | null
  maschera: Uint8Array
  mascheraTela: HTMLCanvasElement
  mascheraSporca: boolean
  disegno: HTMLCanvasElement
  base: HTMLCanvasElement
}

type Istantanea = { maschera?: Uint8Array; disegno?: HTMLCanvasElement }

let cervello: Promise<InteractiveSegmenter> | null = null

/** Il segmentatore si carica una volta per scheda: sono ~6 MB di modello più il wasm. */
function caricaCervello(): Promise<InteractiveSegmenter> {
  if (!cervello) {
    cervello = (async () => {
      const { FilesetResolver, InteractiveSegmenter: Segmentatore } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM)
      return Segmentatore.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELLO, delegate: 'CPU' },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })
    })()
    cervello.catch(() => { cervello = null })
  }
  return cervello
}

function nuovaTela(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function copiaTela(t: HTMLCanvasElement): HTMLCanvasElement {
  const c = nuovaTela(t.width, t.height)
  c.getContext('2d')!.drawImage(t, 0, 0)
  return c
}

function tracciaForma(ctx: CanvasRenderingContext2D, forma: Forma, w: number, h: number) {
  const r = Math.min(w, h) / 2
  const cx = w / 2, cy = h / 2
  ctx.beginPath()
  if (forma === 'cerchio') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
  } else if (forma === 'stella') {
    puntiStella(cx, cy + r * 0.08, r, r * 0.48).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
  } else if (forma === 'cuore') {
    // il cuore classico disegnato su 100×90, centrato nel quadrato
    const k = (2 * r) / 100
    const px = (x: number) => cx - r + x * k
    const py = (y: number) => cy - r + (y + 5) * k
    ctx.moveTo(px(50), py(90))
    ctx.bezierCurveTo(px(20), py(70), px(0), py(50), px(0), py(30))
    ctx.bezierCurveTo(px(0), py(12), px(14), py(0), px(28), py(0))
    ctx.bezierCurveTo(px(40), py(0), px(48), py(8), px(50), py(16))
    ctx.bezierCurveTo(px(52), py(8), px(60), py(0), px(72), py(0))
    ctx.bezierCurveTo(px(86), py(0), px(100), py(12), px(100), py(30))
    ctx.bezierCurveTo(px(100), py(50), px(80), py(70), px(50), py(90))
    ctx.closePath()
  }
}

function scritte(ctx: CanvasRenderingContext2D, sopra: string, sotto: string, w: number, h: number) {
  const famiglia = meme.style.fontFamily
  for (const [testo, inAlto] of [[sopra, true], [sotto, false]] as const) {
    const t = testo.trim().toLocaleUpperCase('it-IT')
    if (!t) continue
    let lato = Math.round(Math.min(h * 0.16, w * 0.2))
    ctx.font = `${lato}px ${famiglia}`
    while (lato > 12 && ctx.measureText(t).width > w * 0.92) {
      lato -= 2
      ctx.font = `${lato}px ${famiglia}`
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = inAlto ? 'top' : 'bottom'
    const y = inAlto ? h * 0.04 : h * 0.96
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(2, lato * 0.14)
    ctx.strokeStyle = CONTORNO_SCRITTA
    ctx.strokeText(t, w / 2, y)
    ctx.fillStyle = CARTA
    ctx.fillText(t, w / 2, y)
  }
}

export function StickerMaker({ sorgente, onChiudi, onCreato }: {
  sorgente: Blob | null
  onChiudi: () => void
  onCreato: (m: MediaLavagna) => void
}) {
  const conFoto = sorgente !== null
  const [pronto, setPronto] = useState<'carico' | 'ok' | 'errore'>('carico')
  const [strumento, setStrumento] = useState<Strumento>(conFoto ? 'magia' : 'pennarello')
  const [aggiungi, setAggiungi] = useState(false)
  const [tolleranza, setTolleranza] = useState(22)
  const [raggio, setRaggio] = useState(22)
  const [spessore, setSpessore] = useState(10)
  const [inchiostro, setInchiostro] = useState<string>(INCHIOSTRI[0].colore)
  const [forma, setForma] = useState<Forma>('nessuna')
  const [sopra, setSopra] = useState('')
  const [sotto, setSotto] = useState('')
  const [bordo, setBordo] = useState(14)
  const [ombra, setOmbra] = useState(false)
  const [nome, setNome] = useState('')
  const [segnaposto] = useState(() => NOMI[Math.floor(Math.random() * NOMI.length)])
  const [statoCervello, setStatoCervello] = useState<'spento' | 'carico' | 'pronto' | 'errore'>('spento')
  const [ritaglio, setRitaglio] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [annullabili, setAnnullabili] = useState(0)
  const [fontPronto, setFontPronto] = useState(false)

  const tela = useRef<HTMLCanvasElement>(null)
  const lav = useRef<Lavoro | null>(null)
  const contornoTela = useRef<HTMLCanvasElement | null>(null)
  const timerContorno = useRef<number | undefined>(undefined)
  const raf = useRef(0)
  const premuto = useRef(false)
  const ultimo = useRef<Punto | null>(null)
  const tratto = useRef<Punto[]>([])
  const pila = useRef<Istantanea[]>([])
  const imp = useRef({ strumento, forma, sopra, sotto, bordo, ombra, raggio, spessore, inchiostro, tolleranza, aggiungi })
  imp.current = { strumento, forma, sopra, sotto, bordo, ombra, raggio, spessore, inchiostro, tolleranza, aggiungi }

  const aggiornaMascheraTela = (l: Lavoro) => {
    if (!l.mascheraSporca) return
    const ctx = l.mascheraTela.getContext('2d')!
    const img = ctx.createImageData(l.w, l.h)
    const d = img.data
    for (let i = 0, n = l.w * l.h; i < n; i++) d[i * 4 + 3] = l.maschera[i]
    ctx.putImageData(img, 0, 0)
    l.mascheraSporca = false
  }

  /** Foto ritagliata + disegno, nella forma scelta, con le scritte: lo sticker senza bordo. */
  const componiBase = useCallback((): HTMLCanvasElement | null => {
    const l = lav.current
    if (!l) return null
    const { forma: f, sopra: s1, sotto: s2 } = imp.current
    const ctx = l.base.getContext('2d')!
    ctx.clearRect(0, 0, l.w, l.h)
    if (l.foto) {
      aggiornaMascheraTela(l)
      ctx.drawImage(l.foto, 0, 0)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(l.mascheraTela, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.drawImage(l.disegno, 0, 0)
    if (f !== 'nessuna') {
      ctx.globalCompositeOperation = 'destination-in'
      tracciaForma(ctx, f, l.w, l.h)
      ctx.fillStyle = CARTA
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
    scritte(ctx, s1, s2, l.w, l.h)
    return l.base
  }, [])

  /** Il bordo bianco: la sagoma allargata con la distanza esatta (lib/lavagna-sticker). */
  const calcolaContorno = useCallback(() => {
    const l = lav.current
    const base = componiBase()
    if (!l || !base) return
    const r = imp.current.bordo
    if (r <= 0) { contornoTela.current = null; return }
    const W = l.w + 2 * MARGINE, H = l.h + 2 * MARGINE
    const appoggio = nuovaTela(W, H)
    const actx = appoggio.getContext('2d', { willReadFrequently: true })!
    actx.drawImage(base, MARGINE, MARGINE)
    const alpha = contorno(actx.getImageData(0, 0, W, H).data, W, H, r)
    const img = actx.createImageData(W, H)
    for (let i = 0, n = W * H; i < n; i++) {
      img.data[i * 4] = 255
      img.data[i * 4 + 1] = 255
      img.data[i * 4 + 2] = 255
      img.data[i * 4 + 3] = alpha[i]
    }
    const out = contornoTela.current?.width === W && contornoTela.current.height === H ? contornoTela.current : nuovaTela(W, H)
    out.getContext('2d')!.putImageData(img, 0, 0)
    contornoTela.current = out
  }, [componiBase])

  /** Lo sticker com'è, su una tela col margine: la stessa per l'anteprima e per il salvataggio. */
  const componi = useCallback((ctx: CanvasRenderingContext2D, fantasma: boolean) => {
    const l = lav.current
    const base = componiBase()
    if (!l || !base) return
    const { bordo: b, ombra: o } = imp.current
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    if (fantasma && l.foto) {
      ctx.globalAlpha = 0.22
      ctx.drawImage(l.foto, MARGINE, MARGINE)
      ctx.globalAlpha = 1
    }
    const sotto = b > 0 ? contornoTela.current : null
    if (o) {
      ctx.save()
      ctx.shadowColor = OMBRA
      ctx.shadowBlur = 14
      ctx.shadowOffsetY = 5
      if (sotto) ctx.drawImage(sotto, 0, 0)
      else ctx.drawImage(base, MARGINE, MARGINE)
      ctx.restore()
    } else if (sotto) {
      ctx.drawImage(sotto, 0, 0)
    }
    ctx.drawImage(base, MARGINE, MARGINE)
  }, [componiBase])

  const disegna = useCallback(() => {
    const c = tela.current
    if (!c || !lav.current) return
    const ctx = c.getContext('2d')!
    const s = imp.current.strumento
    componi(ctx, s === 'magia' || s === 'bacchetta' || s === 'gomma' || s === 'ripristina')
    if (s === 'magia' && premuto.current && tratto.current.length > 1) {
      const oro = getComputedStyle(document.documentElement).getPropertyValue('--color-gold').trim()
      ctx.save()
      ctx.strokeStyle = oro
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.setLineDash([2, 12])
      ctx.beginPath()
      tratto.current.forEach((p, i) => (i ? ctx.lineTo(p.x + MARGINE, p.y + MARGINE) : ctx.moveTo(p.x + MARGINE, p.y + MARGINE)))
      ctx.stroke()
      ctx.restore()
    }
  }, [componi])

  const richiediDisegno = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      disegna()
    })
  }, [disegna])

  const programmaContorno = useCallback(() => {
    window.clearTimeout(timerContorno.current)
    if (premuto.current) return
    timerContorno.current = window.setTimeout(() => {
      calcolaContorno()
      richiediDisegno()
    }, 140)
  }, [calcolaContorno, richiediDisegno])

  const dopoModifica = useCallback(() => {
    richiediDisegno()
    programmaContorno()
  }, [richiediDisegno, programmaContorno])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        let w = FOGLIO, h = FOGLIO
        let foto: HTMLCanvasElement | null = null
        let rgba: Uint8ClampedArray | null = null
        if (sorgente) {
          const bmp = await createImageBitmap(sorgente)
          const dim = latoAdattato(bmp.width, bmp.height, LATO_LAVORO)
          w = dim.w
          h = dim.h
          foto = nuovaTela(w, h)
          const fctx = foto.getContext('2d', { willReadFrequently: true })!
          fctx.imageSmoothingQuality = 'high'
          fctx.drawImage(bmp, 0, 0, w, h)
          bmp.close()
          rgba = fctx.getImageData(0, 0, w, h).data
        }
        if (!vivo) return
        lav.current = {
          w, h, foto, rgba,
          maschera: new Uint8Array(w * h).fill(255),
          mascheraTela: nuovaTela(w, h),
          mascheraSporca: true,
          disegno: nuovaTela(w, h),
          base: nuovaTela(w, h),
        }
        if (tela.current) {
          tela.current.width = w + 2 * MARGINE
          tela.current.height = h + 2 * MARGINE
        }
        setPronto('ok')
      } catch {
        if (vivo) setPronto('errore')
      }
    })()
    return () => { vivo = false }
  }, [sorgente])

  useEffect(() => {
    let vivo = true
    document.fonts.load(`64px ${meme.style.fontFamily}`).catch(() => undefined).finally(() => { if (vivo) setFontPronto(true) })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (pronto !== 'ok') return
    dopoModifica()
  }, [pronto, forma, sopra, sotto, bordo, ombra, strumento, fontPronto, dopoModifica])

  useEffect(() => () => {
    window.clearTimeout(timerContorno.current)
    if (raf.current) cancelAnimationFrame(raf.current)
  }, [])

  useEffect(() => {
    if (strumento !== 'magia' || !conFoto || statoCervello !== 'spento') return
    setStatoCervello('carico')
    caricaCervello()
      .then(() => setStatoCervello('pronto'))
      .catch(() => {
        setStatoCervello('errore')
        toast.error('Lo scontorno magico non si è caricato: usa bacchetta e gomma, funzionano lo stesso.')
      })
  }, [strumento, conFoto, statoCervello])

  const salvaPerAnnullare = (cosa: { maschera?: boolean; disegno?: boolean }) => {
    const l = lav.current
    if (!l) return
    pila.current.push({
      maschera: cosa.maschera ? l.maschera.slice() : undefined,
      disegno: cosa.disegno ? copiaTela(l.disegno) : undefined,
    })
    if (pila.current.length > MAX_ANNULLA) pila.current.shift()
    setAnnullabili(pila.current.length)
  }

  const annulla = useCallback(() => {
    const l = lav.current
    const ultima = pila.current.pop()
    setAnnullabili(pila.current.length)
    if (!l || !ultima) return
    if (ultima.maschera) {
      l.maschera.set(ultima.maschera)
      l.mascheraSporca = true
    }
    if (ultima.disegno) {
      const ctx = l.disegno.getContext('2d')!
      ctx.clearRect(0, 0, l.w, l.h)
      ctx.drawImage(ultima.disegno, 0, 0)
    }
    dopoModifica()
  }, [dopoModifica])

  const ricomincia = () => {
    const l = lav.current
    if (!l) return
    salvaPerAnnullare({ maschera: true, disegno: true })
    l.maschera.fill(255)
    l.mascheraSporca = true
    l.disegno.getContext('2d')!.clearRect(0, 0, l.w, l.h)
    setForma('nessuna')
    setSopra('')
    setSotto('')
    dopoModifica()
  }

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !salvo) onChiudi()
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        annulla()
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [salvo, onChiudi, annulla])

  const puntoDa = (e: ReactPointerEvent<HTMLCanvasElement>): Punto => {
    const c = e.currentTarget
    const r = c.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) * c.width) / r.width - MARGINE,
      y: ((e.clientY - r.top) * c.height) / r.height - MARGINE,
    }
  }

  const tracciaSulDisegno = (l: Lavoro, a: Punto, b: Punto, cancella: boolean) => {
    const { raggio: rg, spessore: sp, inchiostro: ink } = imp.current
    const ctx = l.disegno.getContext('2d')!
    ctx.save()
    ctx.globalCompositeOperation = cancella ? 'destination-out' : 'source-over'
    ctx.strokeStyle = cancella ? CARTA : ink
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = cancella ? rg * 2 : sp
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    if (a.x === b.x && a.y === b.y) {
      ctx.arc(a.x, a.y, ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.restore()
  }

  const passata = (l: Lavoro, a: Punto, b: Punto) => {
    const s = imp.current.strumento
    if (s === 'gomma') {
      pennello(l.maschera, l.w, l.h, a.x, a.y, b.x, b.y, imp.current.raggio, 0)
      l.mascheraSporca = true
      tracciaSulDisegno(l, a, b, true)
    } else if (s === 'ripristina') {
      pennello(l.maschera, l.w, l.h, a.x, a.y, b.x, b.y, imp.current.raggio, 255)
      l.mascheraSporca = true
    } else if (s === 'pennarello') {
      tracciaSulDisegno(l, a, b, false)
    }
  }

  const eseguiMagia = async (punti: Punto[]) => {
    const l = lav.current
    if (!l?.foto || punti.length === 0) return
    setRitaglio(true)
    try {
      setStatoCervello(s => (s === 'pronto' ? s : 'carico'))
      const seg = await caricaCervello()
      setStatoCervello('pronto')
      const norm = (p: Punto) => ({ x: Math.min(1, Math.max(0, p.x / l.w)), y: Math.min(1, Math.max(0, p.y / l.h)) })
      let percorso = 0
      for (let i = 1; i < punti.length; i++) percorso += Math.hypot(punti[i].x - punti[i - 1].x, punti[i].y - punti[i - 1].y)
      const roi = percorso > 12 ? { scribble: punti.filter((_, i) => i % 2 === 0).map(norm) } : { keypoint: norm(punti[0]) }
      const esito: { maschera: Uint8Array | null } = { maschera: null }
      seg.segment(l.foto, roi, r => {
        const m = r.categoryMask
        if (m) esito.maschera = mascheraDaCategoria(m.getAsUint8Array(), m.width, m.height, l.w, l.h)
      })
      const nuova = esito.maschera
      if (!nuova || !nuova.some(v => v === 255)) {
        toast.error('Lì non ho trovato niente: prova a toccare più al centro del soggetto.')
        return
      }
      salvaPerAnnullare({ maschera: true })
      if (imp.current.aggiungi) unisciMaschere(l.maschera, nuova)
      else l.maschera.set(nuova)
      l.mascheraSporca = true
      dopoModifica()
    } catch {
      setStatoCervello('errore')
      toast.error('Lo scontorno magico non risponde: usa bacchetta e gomma, funzionano lo stesso.')
    } finally {
      setRitaglio(false)
    }
  }

  const giu = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const l = lav.current
    if (!l || pronto !== 'ok' || ritaglio || salvo) return
    if (e.button !== undefined && e.button > 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = puntoDa(e)
    premuto.current = true
    ultimo.current = p
    tratto.current = [p]
    const s = imp.current.strumento
    if (s === 'bacchetta') {
      if (!l.rgba) return
      salvaPerAnnullare({ maschera: true })
      const tolti = bacchetta(l.rgba, l.w, l.h, p.x, p.y, imp.current.tolleranza, l.maschera)
      if (tolti === 0) {
        pila.current.pop()
        setAnnullabili(pila.current.length)
      }
      l.mascheraSporca = true
    } else if (s === 'gomma') {
      salvaPerAnnullare({ maschera: true, disegno: true })
      passata(l, p, p)
    } else if (s === 'ripristina') {
      salvaPerAnnullare({ maschera: true })
      passata(l, p, p)
    } else if (s === 'pennarello') {
      salvaPerAnnullare({ disegno: true })
      passata(l, p, p)
    }
    richiediDisegno()
  }

  const muovi = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const l = lav.current
    if (!l || !premuto.current) return
    const p = puntoDa(e)
    const s = imp.current.strumento
    if (s === 'magia') tratto.current.push(p)
    else if (s !== 'bacchetta' && ultimo.current) passata(l, ultimo.current, p)
    ultimo.current = p
    richiediDisegno()
  }

  const su = () => {
    if (!premuto.current) return
    premuto.current = false
    ultimo.current = null
    const punti = tratto.current
    tratto.current = []
    if (imp.current.strumento === 'magia') void eseguiMagia(punti)
    dopoModifica()
  }

  const salva = async () => {
    const l = lav.current
    if (!l || salvo || pronto !== 'ok') return
    setSalvo(true)
    try {
      calcolaContorno()
      const W = l.w + 2 * MARGINE, H = l.h + 2 * MARGINE
      const finale = nuovaTela(W, H)
      const fctx = finale.getContext('2d', { willReadFrequently: true })!
      componi(fctx, false)
      const box = riquadroAlpha(fctx.getImageData(0, 0, W, H).data, W, H, 8)
      if (!box) {
        toast.error('Lo sticker è vuoto: hai tolto proprio tutto 🫥')
        return
      }
      const x = Math.max(0, box.x - 4), y = Math.max(0, box.y - 4)
      const cw = Math.min(W, box.x + box.w + 4) - x, ch = Math.min(H, box.y + box.h + 4) - y
      const dim = latoAdattato(cw, ch, LIMITI.latoSticker)
      const out = nuovaTela(dim.w, dim.h)
      const octx = out.getContext('2d')!
      octx.imageSmoothingQuality = 'high'
      octx.drawImage(finale, x, y, cw, ch, 0, 0, dim.w, dim.h)
      const blob = await new Promise<Blob | null>(r => out.toBlob(r, 'image/png'))
      if (!blob) {
        toast.error('Il browser non è riuscito a creare l’immagine. Riprova.')
        return
      }
      const esito = await caricaMediaLavagna(blob, 'sticker', nome.trim())
      if (!esito.ok) {
        toast.error(esito.error)
        return
      }
      toast.success('Sticker in galleria! 🎉')
      onCreato(esito.media)
    } finally {
      setSalvo(false)
    }
  }

  const strumenti = STRUMENTI.filter(s => conFoto || !s.foto)

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-scrim sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sticker-titolo"
      onMouseDown={e => { if (e.target === e.currentTarget && !salvo) onChiudi() }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface shadow-pop sm:h-[min(92vh,860px)] sm:max-w-5xl sm:rounded-card sm:border sm:border-border">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-dim">
              <Sticker className="h-4 w-4 text-gold-text" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="sticker-titolo" className="font-heading text-lg font-bold text-text-primary">Fabbrica di sticker</h2>
              <p className="truncate text-2xs text-text-tertiary">
                {conFoto ? 'Ritaglia, scarabocchia, incornicia. Poi è di tutti.' : 'Foglio bianco: disegna quello che ti pare.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onChiudi}
            disabled={salvo}
            aria-label="Chiudi la fabbrica di sticker"
            className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden bg-background p-3 sm:p-5">
            <canvas
              ref={tela}
              aria-label="Area di lavoro dello sticker"
              className="max-h-full max-w-full rounded-xl border border-border"
              style={{
                touchAction: 'none',
                cursor: pronto === 'ok' ? 'crosshair' : 'default',
                backgroundImage: 'conic-gradient(var(--color-surface-hover) 0 25%, var(--color-surface) 0 50%, var(--color-surface-hover) 0 75%, var(--color-surface) 0)',
                backgroundSize: '22px 22px',
              }}
              onPointerDown={giu}
              onPointerMove={muovi}
              onPointerUp={su}
              onPointerCancel={su}
            />
            {pronto === 'carico' && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-text-secondary">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Apro la foto…
              </div>
            )}
            {pronto === 'errore' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                <ImageOff className="h-8 w-8 text-text-tertiary" aria-hidden="true" />
                <p className="text-sm font-semibold text-text-primary">Questa immagine non la so aprire.</p>
                <p className="text-2xs text-text-tertiary">Prova con un JPG, un PNG o una WebP.</p>
              </div>
            )}
            {pronto === 'ok' && strumento === 'magia' && statoCervello === 'carico' && !ritaglio && (
              <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-2xs font-semibold text-text-secondary shadow-soft">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Sto caricando il cervello… (solo la prima volta)
              </div>
            )}
            {ritaglio && (
              <div className="absolute inset-0 flex items-center justify-center bg-scrim">
                <span className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-text-primary shadow-pop">
                  <Sparkles className="h-4 w-4 animate-pulse text-gold-text" aria-hidden="true" /> Ritaglio…
                </span>
              </div>
            )}
          </div>

          <aside className="max-h-[42vh] shrink-0 space-y-5 overflow-y-auto border-t border-border p-4 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
            <section>
              <h3 className="mb-2 text-2xs font-bold uppercase tracking-wider text-text-tertiary">Strumento</h3>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-3">
                {strumenti.map(s => {
                  const Icona = s.icona
                  const attivo = strumento === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={attivo}
                      onClick={() => setStrumento(s.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-2xs font-semibold transition-colors ${attivo ? 'border-gold bg-gold-dim text-gold-text' : 'border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                    >
                      <Icona className="h-4 w-4" aria-hidden="true" />
                      {s.etichetta}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 space-y-3 rounded-xl bg-surface-hover p-3">
                {strumento === 'magia' && (
                  <>
                    <p className="text-xs text-text-secondary">
                      Tocca il soggetto, o scarabocchiaci sopra: lo ritaglia l&apos;IA, qui nel tuo browser. La foto non va da nessuna parte.
                    </p>
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1" role="group" aria-label="Cosa fa il tocco">
                      {([[false, 'Sostituisci'], [true, 'Aggiungi']] as const).map(([v, etichetta]) => (
                        <button
                          key={etichetta}
                          type="button"
                          aria-pressed={aggiungi === v}
                          onClick={() => setAggiungi(v)}
                          className={`rounded-md px-2 py-1 text-2xs font-semibold ${aggiungi === v ? 'bg-gold text-on-gold' : 'text-text-secondary hover:bg-surface-hover'}`}
                        >
                          {etichetta}
                        </button>
                      ))}
                    </div>
                    {statoCervello === 'errore' && (
                      <p className="text-2xs text-error">La magia oggi è in sciopero: bacchetta e gomma funzionano.</p>
                    )}
                  </>
                )}
                {strumento === 'bacchetta' && (
                  <>
                    <p className="text-xs text-text-secondary">Tocca lo sfondo: sparisce tutto quello attaccato dello stesso colore.</p>
                    <Cursore etichetta="Tolleranza" valore={tolleranza} min={2} max={70} onChange={setTolleranza} />
                  </>
                )}
                {(strumento === 'gomma' || strumento === 'ripristina') && (
                  <>
                    <p className="text-xs text-text-secondary">
                      {strumento === 'gomma' ? 'Cancella foto e scarabocchi dove passi.' : 'Ridipingi la foto dove ne hai tolta troppa.'}
                    </p>
                    <Cursore etichetta="Pennello" valore={raggio} min={4} max={80} onChange={setRaggio} />
                  </>
                )}
                {strumento === 'pennarello' && (
                  <>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Colore del pennarello">
                      {INCHIOSTRI.map(i => (
                        <button
                          key={i.colore}
                          type="button"
                          aria-label={i.nome}
                          aria-pressed={inchiostro === i.colore}
                          onClick={() => setInchiostro(i.colore)}
                          className={`h-8 w-8 rounded-full border-2 border-border-strong ${inchiostro === i.colore ? 'ring-2 ring-gold ring-offset-2 ring-offset-surface' : ''}`}
                          style={{ background: i.colore }}
                        />
                      ))}
                    </div>
                    <Cursore etichetta="Spessore" valore={spessore} min={2} max={48} onChange={setSpessore} />
                  </>
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-2xs font-bold uppercase tracking-wider text-text-tertiary">Forma</h3>
              <div className="grid grid-cols-4 gap-1.5">
                {FORME.map(f => {
                  const Icona = f.icona
                  const attivo = forma === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={attivo}
                      onClick={() => setForma(f.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-2xs font-semibold transition-colors ${attivo ? 'border-gold bg-gold-dim text-gold-text' : 'border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                    >
                      <Icona className="h-4 w-4" aria-hidden="true" />
                      {f.etichetta}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-2xs font-bold uppercase tracking-wider text-text-tertiary">Scritta da meme</h3>
              {([['Sopra', sopra, setSopra, 'QUANDO IL CLIENTE…'], ['Sotto', sotto, setSotto, '…DICE «ULTIMA MODIFICA»']] as const).map(([etichetta, valore, set, esempio]) => (
                <label key={etichetta} className="block">
                  <span className="mb-1 block text-2xs text-text-tertiary">{etichetta}</span>
                  <input
                    value={valore}
                    maxLength={40}
                    onChange={e => set(e.target.value)}
                    placeholder={esempio}
                    className={`${meme.className} w-full rounded-lg border border-border-interactive bg-surface px-3 py-1.5 text-sm uppercase tracking-wide text-text-primary placeholder:text-text-tertiary`}
                  />
                </label>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="text-2xs font-bold uppercase tracking-wider text-text-tertiary">Bordo sticker</h3>
              <Cursore etichetta="Bordo bianco" valore={bordo} min={0} max={28} onChange={setBordo} unita="px" />
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input type="checkbox" checked={ombra} onChange={e => setOmbra(e.target.checked)} className="h-4 w-4 accent-[var(--color-gold)]" />
                Ombra sotto
              </label>
            </section>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={annulla}
              disabled={annullabili === 0 || salvo}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Annulla
            </button>
            <button
              type="button"
              onClick={ricomincia}
              disabled={pronto !== 'ok' || salvo}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Ricomincia
            </button>
          </div>
          <label className="min-w-[10rem] flex-1">
            <span className="sr-only">Nome dello sticker</span>
            <input
              value={nome}
              maxLength={LIMITI.nomeMedia}
              onChange={e => setNome(e.target.value)}
              placeholder={`Dagli un nome… «${segnaposto}»`}
              className="w-full rounded-lg border border-border-interactive bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary"
            />
          </label>
          <button
            type="button"
            onClick={salva}
            disabled={pronto !== 'ok' || salvo || ritaglio}
            className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-on-gold btn-gold press disabled:opacity-50"
          >
            {salvo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sticker className="h-4 w-4" aria-hidden="true" />}
            {salvo ? 'Attacco…' : 'Salva sticker'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Cursore({ etichetta, valore, min, max, onChange, unita }: {
  etichetta: string; valore: number; min: number; max: number; onChange: (v: number) => void; unita?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-2xs text-text-tertiary">
        {etichetta}
        <span className="font-semibold tabular-nums text-text-secondary">{valore}{unita ? ` ${unita}` : ''}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={valore}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-gold)]"
      />
    </label>
  )
}
