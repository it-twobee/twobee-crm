'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Minus, Plus } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

/* §415 — Il PDF nella pagina, disegnato da pdf.js su canvas.
   I byte arrivano con `fetch` dalla stessa porta autenticata del download, e
   la risposta resta `Content-Security-Policy: sandbox`: il file non diventa
   mai un documento della nostra origine, quindi niente di quello che contiene
   può girare con la sessione di chi guarda. È la ragione per cui un iframe non
   andava bene (§399), e resta vera.

   `isEvalSupported: false`: pdf.js non compila niente dal file. Lo scripting
   dei PDF non c'è nel motore, solo nel visore completo che qui non si usa.

   Si importa la build minificata: con quella normale il webpack di Next 14
   si ferma su «Object.defineProperty called on non-object». */
const MAX_PAGES = 60

export function PdfViewer({ href, name }: { href: string; name: string }) {
  const pages = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [state, setState] = useState<'carico' | 'pronto' | 'errore'>('carico')
  const [total, setTotal] = useState(0)
  const [zoom, setZoom] = useState(1)

  // Si scarica una volta; lo zoom ridisegna senza rileggere il file.
  useEffect(() => {
    let cancelled = false
    let loaded: PDFDocumentProxy | null = null
    setState('carico'); setDoc(null)
    ;(async () => {
      const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs')
      // Da `public/`, copiato prima di dev e build (scripts/copia-pdfjs.mjs): nel bundle non passa.
      pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`
      const response = await fetch(href, { credentials: 'same-origin' })
      if (!response.ok) throw new Error(String(response.status))
      const data = new Uint8Array(await response.arrayBuffer())
      if (cancelled) return
      const opened = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
      loaded = opened
      if (cancelled) { void opened.destroy(); return }
      setTotal(opened.numPages)
      setDoc(opened)
    })().catch(error => { console.error('anteprima PDF', error); if (!cancelled) setState('errore') })
    return () => { cancelled = true; void loaded?.destroy() }
  }, [href])

  useEffect(() => {
    const host = pages.current
    if (!doc || !host) return
    let cancelled = false
    host.replaceChildren()
    const width = Math.max(280, host.clientWidth - 8)
    const ratio = window.devicePixelRatio || 1
    ;(async () => {
      for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
        if (cancelled) return
        const page = await doc.getPage(n)
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: (width / base.width) * zoom })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        canvas.className = 'mx-auto block max-w-none rounded-md border border-border bg-surface shadow-soft'
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', `${name}, pagina ${n} di ${doc.numPages}`)
        host.appendChild(canvas)
        await page.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise
        if (n === 1 && !cancelled) setState('pronto')
      }
    })().catch(error => { console.error('anteprima PDF', error); if (!cancelled) setState('errore') })
    return () => { cancelled = true }
  }, [doc, zoom, name])

  return <div className="flex h-[75vh] w-full flex-col">
    <div className="mb-2 flex items-center justify-end gap-2 text-2xs text-text-secondary">
      {total > MAX_PAGES && <span>Qui le prime {MAX_PAGES} pagine di {total}: il resto nel file scaricato.</span>}
      {total > 0 && total <= MAX_PAGES && <span>{total === 1 ? '1 pagina' : `${total} pagine`}</span>}
      <button type="button" onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))} aria-label="Rimpicciolisci"
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border-interactive bg-surface text-text-primary hover:bg-surface-hover">
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={() => setZoom(z => Math.min(3, Math.round((z + 0.25) * 100) / 100))} aria-label="Ingrandisci"
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border-interactive bg-surface text-text-primary hover:bg-surface-hover">
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    <div className="relative min-h-0 flex-1 overflow-auto">
      {state === 'carico' && <p className="absolute inset-x-0 top-6 flex items-center justify-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Apro il PDF…
      </p>}
      {state === 'errore' && <p className="px-4 py-10 text-center text-sm text-text-secondary">
        Questo PDF non si apre nell’anteprima: scaricalo per vederlo.
      </p>}
      <div ref={pages} className="space-y-3 pb-2" />
    </div>
  </div>
}
