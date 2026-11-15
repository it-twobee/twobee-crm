'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { labContextMonth } from '@/lib/lab-context'

const modules = [
  { path: 'accordi', label: 'Accordi', note: 'Patti e rate' },
  { path: 'fatturazione', label: 'Fatture', note: 'Documenti e pagamenti' },
  { path: 'banca', label: 'Banca', note: 'Movimenti e saldi' },
  { path: 'risorse', label: 'Risorse & tasse', note: 'Persone e versamenti' },
  { path: 'iva', label: 'IVA', note: 'Dovuto e versato' },
  { path: 'conto-economico', label: 'Conto economico', note: 'Risultati e soci' },
  { path: 'previsionale', label: 'Previsionale', note: 'Accordi e scenari' },
]

export default function LabNavigation() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const selectedMonth = labContextMonth(params.get('m'))
  if (pathname === '/lab') return null
  return <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
    <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={selectedMonth ? `/lab?m=${selectedMonth}` : '/lab'} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-text-primary"><FlaskConical className="h-4 w-4 text-gold-text" aria-hidden />Economics · Laboratorio</Link>
        <span className="rounded-full bg-info-dim px-3 py-1 text-2xs text-info">Sola lettura · in verifica</span>
      </div>
      <label className="mt-2 block text-2xs text-text-secondary sm:hidden">Vai alla sezione
        <select value={modules.some(m => pathname === `/lab/${m.path}`) ? pathname : ''} onChange={event => {
          const module = modules.find(m => `/lab/${m.path}` === event.target.value)
          if (module) router.push(`/lab/${module.path}${selectedMonth ? `?m=${selectedMonth}` : ''}`)
        }} className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary">
          <option value="" disabled>Scegli una sezione</option>
          {modules.map(m => <option key={m.path} value={`/lab/${m.path}`}>{m.label}</option>)}
        </select>
      </label>
      <nav aria-label="Sezioni Economics del Laboratorio" className="mt-2 hidden gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        {modules.map(module => {
          const active = pathname === `/lab/${module.path}`
          const href = `/lab/${module.path}${selectedMonth ? `?m=${selectedMonth}` : ''}`
          return <Link key={module.path} href={href} aria-current={active ? 'page' : undefined} className={`min-w-0 break-words rounded-xl border p-3 ${active ? 'border-border-strong bg-surface-active' : 'border-border hover:bg-surface-hover'}`}>
            <span className={`block text-sm font-semibold ${active ? 'text-gold-text' : 'text-text-primary'}`}>{module.label}</span>
            <span className="mt-1 block text-2xs leading-snug text-text-secondary">{module.note}</span>
          </Link>
        })}
      </nav>
      <p className="mt-3 hidden sm:flex items-start gap-2 text-2xs leading-relaxed text-text-secondary"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Segui i riferimenti dei singoli accordi, documenti e movimenti per verificarne i collegamenti.{selectedMonth ? ' Banca, Risorse e Conto economico mantengono il mese selezionato.' : ''}</p>
    </div>
  </div>
}
