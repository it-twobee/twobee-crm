'use client'

import { useState } from 'react'
import { materialThumbHref, renderableKind } from '@/lib/portal/materials'

/* §401 — La miniatura al posto dell'icona. Se il file non è un'immagine, o la
   miniatura non si è potuta generare, resta l'icona: un riquadro vuoto al posto
   di un'anteprima è peggio di un'icona onesta. */
export function MaterialThumb({ file, size = 44, fallback }: {
  file: { id: string; name: string; mime: string | null }
  size?: number
  fallback: React.ReactNode
}) {
  const [failed, setFailed] = useState(false)
  const shows = renderableKind(file.mime, file.name) === 'image' && !failed
  if (!shows) return <span className="flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>{fallback}</span>
  return <img
    src={materialThumbHref(file.id)}
    alt=""
    aria-hidden="true"
    loading="lazy"
    decoding="async"
    onError={() => setFailed(true)}
    style={{ width: size, height: size }}
    className="shrink-0 rounded-md border border-border bg-surface-hover object-cover"
  />
}
