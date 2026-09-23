'use client'

import { useState } from 'react'
import { hasThumbnail, materialThumbHref } from '@/lib/portal/materials'

/* §401 — La miniatura al posto dell'icona. Se il file non è un'immagine, o la
   miniatura non si è potuta generare, resta l'icona: un riquadro vuoto al posto
   di un'anteprima è peggio di un'icona onesta.
   §415 — anche la prima pagina di un PDF. */
export function MaterialThumb({ file, size = 44, fallback, fill = false }: {
  file: { id: string; name: string; mime: string | null }
  size?: number
  fallback: React.ReactNode
  /** Riempie il riquadro che la contiene: la scheda della griglia (§416). */
  fill?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const shows = hasThumbnail(file.mime, file.name) && !failed
  const box = fill ? { width: '100%', height: '100%' } : { width: size, height: size }
  if (!shows) return <span className="flex shrink-0 items-center justify-center" style={box}>{fallback}</span>
  return <img
    src={materialThumbHref(file.id)}
    alt=""
    aria-hidden="true"
    loading="lazy"
    decoding="async"
    onError={() => setFailed(true)}
    style={box}
    className={`shrink-0 bg-surface-hover object-cover ${fill ? '' : 'rounded-md border border-border'}`}
  />
}
