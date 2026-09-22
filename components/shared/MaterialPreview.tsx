'use client'

import { useEffect, useRef } from 'react'
import { Download, X } from 'lucide-react'
import { humanBytes, materialDownloadHref, renderableKind } from '@/lib/portal/materials'

/* §399 — L'anteprima di un file dell'area cliente. I byte arrivano dalla stessa
   porta autenticata del download — `inline` per immagini, video e audio, con il
   Range che fa scorrere un video senza scaricarlo tutto — quindi non c'è nessun
   URL pubblico da inventare: si chiude la scheda e il file resta dov'era.

   Il PDF resta senza anteprima **apposta**: la risposta porta
   `Content-Security-Policy: sandbox`, e un PDF in un iframe sandboxato il
   browser non lo apre. Togliere quell'header per far vedere un'anteprima
   sarebbe scambiare una comodità con la ragione per cui i file sono privati. */
export type PreviewFile = { id: string; name: string; mime: string | null; size: number }

export function MaterialPreview({ file, onClose }: { file: PreviewFile; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  const kind = renderableKind(file.mime, file.name)
  const href = materialDownloadHref(file.id)

  useEffect(() => {
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return <div role="dialog" aria-modal="true" aria-label={`Anteprima di ${file.name}`}
    className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
    onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="flex max-h-full w-full max-w-5xl flex-col">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-text-primary">
          {file.name} <span className="font-normal text-text-secondary">· {humanBytes(Number(file.size))}</span>
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <a href={href} download className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border-interactive bg-surface px-3 py-1.5 text-2xs text-text-primary hover:bg-surface-hover">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />Scarica
          </a>
          <button ref={close} type="button" onClick={onClose} aria-label="Chiudi anteprima"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-text-secondary hover:text-text-primary">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl border border-border bg-surface p-3">
        {kind === 'image' && <img src={href} alt={file.name} className="max-h-[75vh] w-auto max-w-full object-contain" />}
        {kind === 'video' && <video src={href} controls preload="metadata" className="max-h-[75vh] w-full max-w-full">
          Il tuo browser non riproduce questo video: scaricalo per vederlo.
        </video>}
        {kind === 'audio' && <audio src={href} controls preload="metadata" className="w-full">
          Il tuo browser non riproduce questo audio: scaricalo per ascoltarlo.
        </audio>}
        {kind === null && <p className="px-4 py-10 text-center text-sm text-text-secondary">
          Questo tipo di file non si apre nel browser. Scaricalo per vederlo.
        </p>}
      </div>
    </div>
  </div>
}

/** Si apre l'anteprima solo di ciò che si vede davvero: altrimenti è un vicolo cieco. */
export function hasPreview(mime: string | null, name: string): boolean {
  return renderableKind(mime, name) !== null
}
