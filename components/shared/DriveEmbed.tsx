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
        className="flex items-center gap-2 text-xs text-[#F5C800] hover:underline">
        <ExternalLink className="w-3.5 h-3.5" /> Apri link
      </a>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[#2A2A2A] bg-[#0D0D0D]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1A1A1A]">
        <span className="flex items-center gap-1.5 text-xs text-[#888] truncate">
          <FolderOpen className="w-3.5 h-3.5 text-[#F5C800] shrink-0" />
          {title ?? (kind ? DRIVE_KIND_LABEL[kind] : 'Google Drive')}
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-bold text-[#F5C800] hover:text-yellow-400 shrink-0">
          Apri in Drive <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <iframe
        src={src}
        style={{ width: '100%', height }}
        className="block bg-white"
        loading="lazy"
        allow="autoplay" />
    </div>
  )
}
