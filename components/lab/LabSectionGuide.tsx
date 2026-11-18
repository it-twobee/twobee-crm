import { ArrowDown, BookOpen, ChartColumn, LayoutDashboard } from 'lucide-react'
import Link from '@/components/lab/LabLink'
import { LAB_MODULES, type LabModuleKey } from '@/lib/lab-experience'

const shortcut = 'inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary'

export default function LabSectionGuide({ section, showChart = true }: { section: LabModuleKey; showChart?: boolean }) {
  const module = LAB_MODULES.find(m => m.key === section)!
  return (
    <div className="rounded-xl border border-border bg-surface p-1.5">
      <div className="flex flex-wrap items-start gap-1">
        <nav aria-label="In questa sezione" className="flex flex-wrap gap-1">
          <Link href="#sintesi" className={shortcut}><LayoutDashboard className="h-4 w-4" aria-hidden />Sintesi</Link>
          {showChart && <Link href="#analisi" className={shortcut}><ChartColumn className="h-4 w-4" aria-hidden />Grafici</Link>}
          <Link href="#dati-prove" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gold-dim px-3 text-sm font-semibold text-gold-text hover:bg-surface-hover">
            {module.action}<ArrowDown className="h-4 w-4 shrink-0" aria-hidden />
          </Link>
        </nav>
        <details className="group min-w-0 grow sm:ml-auto sm:grow-0 sm:max-w-sm">
          <summary className={shortcut + ' cursor-pointer list-none [&::-webkit-details-marker]:hidden'}>
            <BookOpen className="h-4 w-4" aria-hidden />Fonti e criteri
          </summary>
          <p className="px-3 pb-2 text-2xs leading-relaxed text-text-secondary">{module.source}. Apri il dettaglio per verificare il documento o il movimento collegato. «n/d» indica un dato da verificare.</p>
        </details>
      </div>
    </div>
  )
}
