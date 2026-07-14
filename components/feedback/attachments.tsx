'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react'
import type { FeedbackAttachment } from './types'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_IMAGES = 5
export const ACCEPTED_IMAGE = 'image/png,image/jpeg,image/webp,image/gif,image/avif'

/** URL di download/preview di un allegato (proxy backend verso MinIO). */
export function attachmentUrl(id: string) {
  return `/api/files/${id}/download`
}

/**
 * Carica le immagini scelte e le lega al feedback appena creato (folder 'feedback',
 * entity_type/id = feedback). Best-effort: ritorna quante hanno fallito, senza mai
 * far fallire la creazione del feedback.
 */
export async function uploadFeedbackImages(feedbackId: string, files: File[]): Promise<{ failed: number }> {
  let failed = 0
  for (const file of files) {
    const form = new FormData()
    form.append('file', file)
    form.append('folder', 'feedback')
    form.append('entityType', 'feedback')
    form.append('entityId', feedbackId)
    try {
      const res = await fetch('/api/files/upload', { method: 'POST', body: form })
      if (!res.ok) failed++
    } catch {
      failed++
    }
  }
  return { failed }
}

/** Selettore immagini con anteprima locale, usato nei form di creazione feedback. */
export function ImagePicker({ files, onChange, disabled }: {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])

  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [files])

  const add = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list).filter(f => f.type.startsWith('image/') && f.size <= MAX_IMAGE_BYTES)
    onChange([...files, ...incoming].slice(0, MAX_IMAGES))
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex flex-wrap gap-2">
      {previews.map((src, i) => (
        <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={() => onChange(files.filter((_, idx) => idx !== i))} aria-label="Rimuovi immagine"
            className="absolute top-0.5 right-0.5 bg-scrim/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      {files.length < MAX_IMAGES && (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}
          className="w-16 h-16 rounded-lg border border-dashed border-border-strong flex flex-col items-center justify-center gap-1 text-text-tertiary hover:text-text-primary hover:border-gold transition-colors disabled:opacity-50">
          <ImagePlus className="w-4 h-4" />
          <span className="text-[10px] font-medium">Immagine</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept={ACCEPTED_IMAGE} multiple className="hidden"
        onChange={e => add(e.target.files)} />
    </div>
  )
}

/** Griglia di thumbnail cliccabili con lightbox, usata nelle card. */
export function AttachmentThumbs({ attachments, size = 'md' }: {
  attachments?: FeedbackAttachment[]
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState<number | null>(null)
  const imgs = (attachments ?? []).filter(a => (a.mime ?? '').startsWith('image/'))
  if (!imgs.length) return null

  const box = size === 'sm' ? 'w-12 h-12' : 'w-16 h-16'

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {imgs.map((a, i) => (
          <button key={a.id} type="button" onClick={() => setOpen(i)}
            className={`relative ${box} rounded-lg overflow-hidden border border-border hover:border-gold transition-colors group`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachmentUrl(a.id)} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-scrim/0 group-hover:bg-scrim/40 transition-colors">
              <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={imgs} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}

function Lightbox({ images, index, onIndex, onClose }: {
  images: FeedbackAttachment[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const many = images.length > 1
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (many && e.key === 'ArrowRight') onIndex((index + 1) % images.length)
      else if (many && e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, many, onClose, onIndex])

  const a = images[index]
  return (
    <div className="fixed inset-0 z-[60] bg-scrim/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <button aria-label="Chiudi" onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
        <X className="w-6 h-6" />
      </button>
      {many && (
        <>
          <button aria-label="Immagine precedente" onClick={e => { e.stopPropagation(); onIndex((index - 1 + images.length) % images.length) }}
            className="absolute left-2 sm:left-4 text-white/80 hover:text-white"><ChevronLeft className="w-8 h-8" /></button>
          <button aria-label="Immagine successiva" onClick={e => { e.stopPropagation(); onIndex((index + 1) % images.length) }}
            className="absolute right-2 sm:right-4 text-white/80 hover:text-white"><ChevronRight className="w-8 h-8" /></button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={attachmentUrl(a.id)} alt={a.name} onClick={e => e.stopPropagation()}
        className="max-w-full max-h-[85vh] object-contain rounded-lg" />
      {many && <div className="absolute bottom-4 text-white/70 text-xs tabular">{index + 1} / {images.length}</div>}
    </div>
  )
}
