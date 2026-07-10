'use client'

import { ExternalLink, FolderOpen } from 'lucide-react'
import { driveEmbedUrl, driveKind, DRIVE_KIND_LABEL } from '@/lib/drive'

export function DriveEmbed({ url, title, height = 480 }: {
  url: string
  title?: string
  height?: number
}) {
  const src = driveEmbedUrl(url)
  const kind = driveKind(url)

  if (!src) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-gold-text hover:underline">
        <ExternalLink className="w-3.5 h-3.5" /> Apri link
      </a>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-background">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="flex items-center gap-1.5 text-xs text-text-secondary truncate">
          <FolderOpen className="w-3.5 h-3.5 text-gold-text shrink-0" />
          {title ?? (kind ? DRIVE_KIND_LABEL[kind] : 'Google Drive')}
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-2xs font-bold text-gold-text hover:text-gold-text shrink-0">
          Apri in Drive <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <iframe
        src={src}
        style={{ width: '100%', height }}
        className="block bg-surface"
        loading="lazy"
        allow="autoplay" />
    </div>
  )
}
