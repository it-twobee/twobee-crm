'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { humanBytes, materialDownloadHref, previewKind } from '@/lib/portal/materials'
import { PdfViewer } from '@/components/shared/PdfViewer'
import { TextPreview } from '@/components/shared/TextPreview'

/* §399 — L'anteprima di un file dell'area cliente. I byte arrivano dalla stessa
   porta autenticata del download — `inline` per immagini, video e audio, con il
   Range che fa scorrere un video senza scaricarlo tutto — quindi non c'è nessun
   URL pubblico da inventare: si chiude la scheda e il file resta dov'era.

   §415 — Il PDF si vede, ma **non** in un iframe: la risposta porta
   `Content-Security-Policy: sandbox`, e togliere quell'header per un'anteprima
   sarebbe scambiare una comodità con la ragione per cui i file sono privati.
   Lo disegna pdf.js dai byte (`PdfViewer`). Il testo si legge per il primo
   mega. Si scorre fra i file della cartella con le frecce. */
export type PreviewFile = { id: string; name: string; mime: string | null; size: number }

export function MaterialPreview<T extends PreviewFile>({ file, files, onNavigate, onClose, aside }: {
  file: T
  /** I file fra cui scorrere, nell'ordine in cui si vedono. */
  files?: T[]
  onNavigate?: (file: T) => void
  onClose: () => void
  /** Quello che accompagna il file, accanto: le note del team. */
  aside?: React.ReactNode
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const [actual, setActual] = useState(false)
  const kind = previewKind(file.mime, file.name, Number(file.size))
  const href = materialDownloadHref(file.id)
  const list = files?.length ? files : [file]
  const index = list.findIndex(f => f.id === file.id)
  const prev = index > 0 ? list[index - 1] : null
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null

  useEffect(() => { setActual(false) }, [file.id])
  useEffect(() => { close.current?.focus() }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      const typing = (event.target as HTMLElement | null)?.closest('input, textarea, select, video, audio')
      if (!typing && event.key === 'ArrowLeft' && prev && onNavigate) { event.preventDefault(); onNavigate(prev) }
      if (!typing && event.key === 'ArrowRight' && next && onNavigate) { event.preventDefault(); onNavigate(next) }
      // Il focus resta dentro la finestra: dietro c'è una pagina che non si vede.
      if (event.key === 'Tab' && dialog.current) {
        const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, select, video, audio, [tabindex]:not([tabindex="-1"])'))
        if (!focusable.length) return
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, onNavigate, prev, next])

  const nav = 'inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border-interactive bg-surface text-text-primary hover:bg-surface-hover disabled:opacity-40'
  return <div ref={dialog} role="dialog" aria-modal="true" aria-label={`Anteprima di ${file.name}`}
    className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
    onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="flex max-h-full w-full max-w-6xl flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {file.name} <span className="font-normal text-text-secondary">· {humanBytes(Number(file.size))}{list.length > 1 && index >= 0 ? ` · ${index + 1} di ${list.length}` : ''}</span>
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {onNavigate && list.length > 1 && <>
            <button type="button" className={nav} disabled={!prev} onClick={() => prev && onNavigate(prev)} aria-label="File precedente">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className={nav} disabled={!next} onClick={() => next && onNavigate(next)} aria-label="File successivo">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </>}
          <a href={href} download={file.name} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border-interactive bg-surface px-3 py-1.5 text-2xs text-text-primary hover:bg-surface-hover">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />Scarica
          </a>
          <button ref={close} type="button" onClick={onClose} aria-label="Chiudi anteprima"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-text-secondary hover:text-text-primary">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto rounded-xl border border-border bg-surface p-3">
          {kind === 'image' && <button type="button" onClick={() => setActual(a => !a)} className={actual ? 'cursor-zoom-out' : 'cursor-zoom-in'}
            aria-label={actual ? 'Adatta alla finestra' : 'Dimensione reale'}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={file.id} src={href} alt={file.name}
              className={actual ? 'max-w-none' : 'max-h-[75vh] w-auto max-w-full object-contain'} />
          </button>}
          {kind === 'video' && <video key={file.id} src={href} controls preload="metadata" className="max-h-[75vh] w-full max-w-full">
            Il tuo browser non riproduce questo video: scaricalo per vederlo.
          </video>}
          {kind === 'audio' && <audio key={file.id} src={href} controls preload="metadata" className="w-full">
            Il tuo browser non riproduce questo audio: scaricalo per ascoltarlo.
          </audio>}
          {kind === 'pdf' && <PdfViewer key={file.id} href={href} name={file.name} />}
          {(kind === 'text' || kind === 'csv') && <TextPreview key={file.id} href={href} csv={kind === 'csv'} />}
          {kind === null && <p className="px-4 py-10 text-center text-sm text-text-secondary">
            Questo tipo di file non si apre nel browser. Scaricalo per vederlo.
          </p>}
        </div>
        {aside && <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-border bg-surface p-3 lg:w-80">{aside}</aside>}
      </div>
    </div>
  </div>
}

/** Si apre l'anteprima solo di ciò che si vede davvero: altrimenti è un vicolo cieco. */
export function hasPreview(mime: string | null, name: string, size?: number): boolean {
  return previewKind(mime, name, size) !== null
}
