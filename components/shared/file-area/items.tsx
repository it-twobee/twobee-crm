'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight, Download, Eye, FileArchive, FileText, Film, Folder, Image as ImageIcon, Loader2, MoreHorizontal,
  Music, X,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { humanBytes, materialDownloadHref } from '@/lib/portal/materials'
import { SPACE_LABEL, crumbsOf, extensionBadge, folderLine } from '@/lib/portal/explorer'
import type { ClientMaterial, Crumb, FolderSummary, Space } from '@/lib/portal/explorer'
import { MaterialThumb } from '@/components/shared/MaterialThumb'
import type { UploadJob } from './uploads'

/* §416 — I pezzi dell'esploratore. Nessuna decisione qui dentro: chi può fare
   cosa lo decide `ClientFileArea`, che passa a ogni riga le voci del suo menu. */

export const buttonCls = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border-interactive bg-surface px-2.5 py-1.5 text-2xs text-text-primary hover:bg-surface-hover disabled:opacity-50'

export type MenuItem = { label: string; icon: React.ReactNode; onSelect: () => void; danger?: boolean }

/** Le prop di un bersaglio del trascinamento: chi le costruisce decide cosa succede al rilascio. */
export type DropProps = {
  over: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

function kindIcon(m: Pick<ClientMaterial, 'kind' | 'name'>, className: string) {
  if (/\.(zip|rar|7z)$/i.test(m.name)) return <FileArchive className={className} aria-hidden="true" />
  if (m.kind === 'immagine') return <ImageIcon className={className} aria-hidden="true" />
  if (m.kind === 'video') return <Film className={className} aria-hidden="true" />
  if (m.kind === 'audio') return <Music className={className} aria-hidden="true" />
  return <FileText className={className} aria-hidden="true" />
}

/** Al posto della miniatura che non c'è: l'estensione scritta, che dice più di un'icona generica. */
function Placeholder({ m, large }: { m: ClientMaterial; large?: boolean }) {
  const badge = extensionBadge(m.name)
  return <span className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-md bg-surface-hover text-text-tertiary ${large ? '' : 'border border-border'}`}>
    {kindIcon(m, large ? 'h-8 w-8' : 'h-4 w-4')}
    {badge && large && <span className="rounded bg-surface px-1.5 text-2xs font-semibold text-text-secondary">{badge}</span>}
  </span>
}

function Thumb({ m, onPreview, large }: { m: ClientMaterial; onPreview?: () => void; large?: boolean }) {
  const content = <MaterialThumb file={m} size={40} fill={large} fallback={<Placeholder m={m} large={large} />} />
  if (!onPreview) return <span className={large ? 'block h-full w-full' : 'block h-10 w-10 shrink-0'}>{content}</span>
  return <button type="button" onClick={onPreview} aria-label={`Apri l’anteprima di ${m.name}`}
    className={`${large ? 'block h-full w-full' : 'block h-10 w-10 shrink-0'} overflow-hidden rounded-md`}>
    {content}
  </button>
}

export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!items.length) return null
  return <span className="relative inline-block">
    <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
      aria-label={`Altre azioni per ${label}`} className={`${buttonCls} min-w-10 px-2`}>
      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
    </button>
    {open && <>
      {/* Sopra la barra delle tab, che è sticky con backdrop (§214). */}
      <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      <div role="menu" aria-label={`Azioni per ${label}`}
        className="absolute right-0 top-full z-50 mt-1 min-w-[190px] overflow-hidden rounded-xl border border-border-strong bg-surface p-1 shadow-pop animate-scale-in">
        {items.map((item, i) => (
          <button key={item.label} ref={i === 0 ? first : undefined} type="button" role="menuitem"
            onClick={() => { setOpen(false); item.onSelect() }}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-surface-hover ${item.danger ? 'text-error' : 'text-text-primary'}`}>
            <span className="shrink-0" aria-hidden="true">{item.icon}</span>{item.label}
          </button>
        ))}
      </div>
    </>}
  </span>
}

/** Dove sta un file, scritto come lo si legge: «Nostri › Brand › Loghi». */
export function locationOf(m: Pick<ClientMaterial, 'source' | 'path'>): string {
  return [SPACE_LABEL[m.source], ...crumbsOf(m.path).map(c => c.name)].join(' › ')
}

function meta(m: ClientMaterial) {
  return `${humanBytes(Number(m.size))} · ${m.uploaded_by_name} · ${formatDate(m.created_at)}`
}

export function FileRow({ m, menu, onPreview, where, drag }: {
  m: ClientMaterial
  menu: MenuItem[]
  onPreview?: () => void
  /** Nella ricerca e nei recenti il file è fuori dalla sua cartella: si dice dove sta. */
  where?: string
  drag?: React.HTMLAttributes<HTMLLIElement> & { draggable?: boolean }
}) {
  return <li {...drag} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
    <Thumb m={m} onPreview={onPreview} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm text-text-primary" title={m.name}>
        {m.name}{m.archived_at && <span className="text-text-tertiary"> · archiviato</span>}
      </span>
      <span className="block truncate text-2xs text-text-tertiary">{where ? `${where} · ` : ''}{meta(m)}</span>
    </span>
    <span className="flex shrink-0 items-center gap-1.5">
      {onPreview && <button type="button" className={`${buttonCls} hidden sm:inline-flex`} onClick={onPreview}>
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />Anteprima<span className="sr-only"> {m.name}</span>
      </button>}
      <a href={materialDownloadHref(m.id)} download={m.name} className={`${buttonCls} min-w-10`} aria-label={`Scarica ${m.name}`}>
        <Download className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Scarica</span>
      </a>
      <RowMenu label={m.name} items={menu} />
    </span>
  </li>
}

export function FileCard({ m, menu, onPreview, where, drag }: {
  m: ClientMaterial
  menu: MenuItem[]
  onPreview?: () => void
  where?: string
  drag?: React.HTMLAttributes<HTMLLIElement> & { draggable?: boolean }
}) {
  return <li {...drag} className="flex min-w-0 flex-col rounded-xl border border-border bg-surface">
    <span className="block aspect-square overflow-hidden rounded-t-xl">
      <Thumb m={m} onPreview={onPreview} large />
    </span>
    <span className="flex items-start gap-1 p-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-2xs font-semibold text-text-primary" title={m.name}>{m.name}</span>
        <span className="block truncate text-2xs text-text-tertiary">
          {where ?? `${humanBytes(Number(m.size))} · ${formatDate(m.created_at)}`}{m.archived_at ? ' · archiviato' : ''}
        </span>
      </span>
      <RowMenu label={m.name} items={[
        ...(onPreview ? [{ label: 'Anteprima', icon: <Eye className="h-3.5 w-3.5" />, onSelect: onPreview }] : []),
        { label: 'Scarica', icon: <Download className="h-3.5 w-3.5" />, onSelect: () => { window.location.href = materialDownloadHref(m.id) } },
        ...menu,
      ]} />
    </span>
  </li>
}

export function FolderRow({ folder, onOpen, drop, where, menu = [] }: {
  folder: Pick<FolderSummary, 'name' | 'path' | 'count'> & Partial<Pick<FolderSummary, 'size' | 'latest'>>
  onOpen: () => void
  drop?: DropProps
  where?: string
  menu?: MenuItem[]
}) {
  const { over, ...handlers } = drop ?? { over: false }
  return <li {...handlers} className={`flex items-center gap-1 rounded-lg px-2 py-0.5 ${over ? 'bg-gold-dim ring-2 ring-gold' : 'hover:bg-surface-hover'}`}>
    <button type="button" onClick={onOpen} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold-dim">
        <Folder className="h-5 w-5 text-gold-text" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text-primary">{folder.name}</span>
        <span className="block truncate text-2xs text-text-tertiary">
          {where ? `${where} · ` : ''}{folderLine(folder)}{folder.size ? ` · ${humanBytes(folder.size)}` : ''}
          {folder.latest ? ` · ultimo ${formatDate(folder.latest)}` : ''}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
    </button>
    <RowMenu label={folder.name} items={menu} />
  </li>
}

export function FolderCard({ folder, onOpen, drop, menu = [] }: {
  folder: FolderSummary
  onOpen: () => void
  drop?: DropProps
  menu?: MenuItem[]
}) {
  const { over, ...handlers } = drop ?? { over: false }
  return <li {...handlers} className={`flex min-w-0 flex-col rounded-xl border ${over ? 'border-gold bg-gold-dim ring-2 ring-gold' : 'border-border bg-surface hover:bg-surface-hover'}`}>
    <button type="button" onClick={onOpen} className="flex aspect-square items-center justify-center rounded-t-xl">
      <Folder className="h-12 w-12 text-gold-text" aria-hidden="true" />
    </button>
    <span className="flex items-start gap-1 p-2">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-2xs font-semibold text-text-primary" title={folder.name}>{folder.name}</span>
        <span className="block truncate text-2xs text-text-tertiary">{folderLine(folder)}</span>
      </button>
      <RowMenu label={folder.name} items={menu} />
    </span>
  </li>
}

export function Breadcrumb({ space, path, onGo, dropFor }: {
  space: Space
  path: string
  onGo: (path: string) => void
  /** Ogni tappa accoglie un file trascinato: è il modo di farlo salire. */
  dropFor?: (path: string) => DropProps | undefined
}) {
  const steps: Crumb[] = [{ name: SPACE_LABEL[space], path: '' }, ...crumbsOf(path)]
  return <nav aria-label="Cartella corrente" className="min-w-0">
    <ol className="flex flex-wrap items-center gap-0.5 text-sm">
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        const drop = last ? undefined : dropFor?.(step.path)
        const { over, ...handlers } = drop ?? { over: false }
        return <li key={step.path || 'radice'} className="flex min-w-0 items-center gap-0.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />}
          {last
            ? <span aria-current="page" className="truncate px-1.5 py-1 font-semibold text-text-primary">{step.name}</span>
            : <button type="button" onClick={() => onGo(step.path)} {...handlers}
                className={`truncate rounded-md px-1.5 py-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary ${over ? 'bg-gold-dim ring-2 ring-gold' : ''}`}>
                {step.name}
              </button>}
        </li>
      })}
    </ol>
  </nav>
}

export function UploadPanel({ jobs, active, totals, onCancel, onDismiss }: {
  jobs: UploadJob[]
  active: boolean
  totals: { bytes: number; loaded: number; done: number; failed: number; cancelled: number }
  onCancel: () => void
  onDismiss: () => void
}) {
  if (!jobs.length) return null
  const failed = jobs.filter(job => job.status === 'errore')
  const counted = jobs.length - failed.filter(job => !job.loaded).length
  const percent = totals.bytes ? Math.min(100, Math.round((totals.loaded / totals.bytes) * 100)) : 100
  return <div role="status" aria-live="polite" className="rounded-xl border border-border bg-surface p-3">
    <div className="flex flex-wrap items-center gap-2">
      {active && <Loader2 className="h-4 w-4 animate-spin text-text-secondary" aria-hidden="true" />}
      <p className="min-w-0 flex-1 text-2xs text-text-secondary">
        {active
          ? <>Carico {totals.done + 1 > counted ? counted : totals.done + 1} di {counted} · {humanBytes(totals.loaded)} di {humanBytes(totals.bytes)}</>
          : <>Caricati {totals.done} di {jobs.length}{totals.cancelled ? ` · ${totals.cancelled} annullati` : ''}{failed.length ? ` · ${failed.length} non caricati` : ''}</>}
      </p>
      {active
        ? <button type="button" className={buttonCls} onClick={onCancel}>Annulla</button>
        : <button type="button" className={`${buttonCls} min-w-10 px-2`} onClick={onDismiss} aria-label="Chiudi il riepilogo">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>}
    </div>
    {active && <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
      <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${percent}%` }} />
    </div>}
    {!!failed.length && <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
      {failed.map(job => <li key={job.key} className="text-2xs">
        <span className="font-semibold text-text-primary">{job.name}</span>
        <span className="text-error"> — {job.error}</span>
      </li>)}
    </ul>}
  </div>
}

/** Una conferma nella pagina: `confirm()` nativo non segue il tema e sparisce nelle anteprime. */
export function ConfirmDialog({ title, body, confirmLabel, pending, onConfirm, onClose }: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, pending])
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-4" onClick={() => { if (!pending) onClose() }}>
    <div role="alertdialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
      className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-pop animate-scale-in">
      <h2 className="font-heading text-base font-bold text-text-primary">{title}</h2>
      <div className="mt-2 text-sm text-text-secondary">{body}</div>
      <div className="mt-4 flex justify-end gap-2">
        <button ref={cancel} type="button" className={buttonCls} onClick={onClose} disabled={pending}>Annulla</button>
        <button type="button" onClick={onConfirm} disabled={pending}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-error px-3 py-1.5 text-2xs font-semibold text-on-error disabled:opacity-50">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{confirmLabel}
        </button>
      </div>
    </div>
  </div>
}
