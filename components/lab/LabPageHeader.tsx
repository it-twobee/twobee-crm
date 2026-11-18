import type { ReactNode } from 'react'
import {
  Archive, CalendarDays, ChartColumn, ChartNoAxesCombined, ClipboardCheck, FileText,
  FolderOpen, Handshake, Landmark, LayoutGrid, Link2, ReceiptText, UsersRound,
} from 'lucide-react'

export const labSectionIcons = {
  riepilogo: LayoutGrid,
  banca: Landmark,
  fatturazione: FileText,
  accordi: Handshake,
  risorse: UsersRound,
  iva: ReceiptText,
  'conto-economico': ChartColumn,
  previsionale: ChartNoAxesCombined,
  progetti: FolderOpen,
  verifiche: ClipboardCheck,
  fonti: Archive,
  raccordi: Link2,
  novembre: CalendarDays,
}

export default function LabPageHeader({ section, title, children, actions }: {
  section: keyof typeof labSectionIcons
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
}) {
  const Icon = labSectionIcons[section]
  return (
    <header className="relative isolate flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-soft sm:p-5">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-gradient-to-br from-gold-dim via-transparent to-transparent" />
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3 sm:gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-gold-text sm:h-12 sm:w-12">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-text-primary sm:text-2xl">{title}</h1>
          <div className="max-w-prose space-y-1">{children}</div>
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </header>
  )
}
