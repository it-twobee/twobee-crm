'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, ChevronRight, KeyRound } from 'lucide-react'
import { runQaAll } from '@/app/actions/tracking-qa'
import { SearchInput, Empty } from '@/components/shared/formkit'
import {
  ARCHETYPES, CHANNELS, archetypeByValue, trackingBadge, statusByValue, QA_CHECKS,
  type TrackingStatus, type ChannelKey,
} from '@/lib/tracking/vocab'
import type { QaSummary } from '@/lib/tracking/qa'
import type { ClientTracking, TrackingQaRun } from '@/lib/types/database'
import { Chip, GoldButton, StatusChip, fmtDate } from './ui'

export type TrackingListRow = {
  id: string
  name: string
  website: string | null
  tracking: ClientTracking | null
  qa: QaSummary | null
}

type Filter = 'tutti' | 'problemi' | 'active' | 'partial' | 'todo' | 'non_configurati'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'tutti', label: 'Tutti' },
  { value: 'problemi', label: 'Con problemi QA' },
  { value: 'active', label: 'Tracking attivo' },
  { value: 'partial', label: 'Parziale' },
  { value: 'todo', label: 'Da fare' },
  { value: 'non_configurati', label: 'Non configurati' },
]

const QA_LABEL: Record<string, string> = Object.fromEntries(QA_CHECKS.map(c => [c.key, c.label]))

export function TrackingList({ rows, lastRun, clientBase, settingsHref }: {
  rows: TrackingListRow[]; lastRun: TrackingQaRun | null; clientBase: string
  /** chiavi d'agenzia: solo per chi può gestirle (admin e manager) */
  settingsHref?: string | null
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('tutti')
  const [pending, start] = useTransition()
  const router = useRouter()

  const badges = useMemo(() => new Map(rows.map(r => [r.id, r.tracking ? trackingBadge(r.tracking) : null])), [rows])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter(r => {
      if (s && !`${r.name} ${r.website ?? ''} ${r.tracking?.cms ?? ''} ${r.tracking?.gtm_container_id ?? ''} ${archetypeByValue(r.tracking?.archetype)?.label ?? ''}`.toLowerCase().includes(s)) return false
      const b = badges.get(r.id) ?? null
      switch (filter) {
        case 'problemi': return r.qa?.status === 'problema'
        case 'non_configurati': return !r.tracking
        case 'tutti': return true
        default: return b === filter
      }
    })
  }, [rows, q, filter, badges])

  const problems = rows.filter(r => r.qa?.status === 'problema')
  const counts: Record<TrackingStatus | 'none', number> = { active: 0, partial: 0, todo: 0, na: 0, none: 0 }
  for (const r of rows) { const b = badges.get(r.id); if (!b) counts.none++; else counts[b]++ }

  const checkAll = () => start(async () => {
    const res = await runQaAll()
    if (!res.ok) { toast.error(res.error); return }
    toast[res.data.problems ? 'warning' : 'success'](`${res.data.clients} clienti controllati, ${res.data.problems} problemi`)
    router.refresh()
  })

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary font-heading">Tracking</h1>
          <p className="text-2xs text-text-tertiary mt-1">
            Stato dei canali per cliente e controllo giornaliero.
            {lastRun ? ` Ultimo giro ${fmtDate(lastRun.finished_at ?? lastRun.started_at)}: ${lastRun.clients} clienti, ${lastRun.problems} problemi.` : ' Nessun giro ancora eseguito.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {settingsHref && (
            <Link href={settingsHref} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-xl border border-border px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover">
              <KeyRound className="w-4 h-4" /> Chiavi d&apos;agenzia
            </Link>
          )}
          <GoldButton onClick={checkAll} pending={pending}><RefreshCw className="w-4 h-4" /> Controlla ora</GoldButton>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="rounded-2xl border border-border bg-error-dim p-4">
          <p className="text-sm font-semibold text-error flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {problems.length} clienti con problemi</p>
          <ul className="mt-2 space-y-1">
            {problems.map(r => (
              <li key={r.id} className="text-2xs text-text-secondary">
                <Link href={`${clientBase}/${r.id}?tab=6`} className="font-semibold text-text-primary hover:text-gold-text">{r.name}</Link>
                {' · '}{r.qa!.problems.map(p => `${QA_LABEL[p.key] ?? p.key}: ${p.detail}`).join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-2xs text-text-tertiary">
        <Chip tone="success">{counts.active} attivi</Chip>
        <Chip tone="warning">{counts.partial} parziali</Chip>
        <Chip tone="error">{counts.todo} da fare</Chip>
        <Chip tone="muted">{counts.none} non configurati</Chip>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1"><SearchInput value={q} onChange={setQ} placeholder="Cerca cliente, sito, CMS, container…" /></div>
        <select value={filter} onChange={e => setFilter(e.target.value as Filter)} aria-label="Filtro"
          className="bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary">
          {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? <Empty>Nessun cliente corrisponde.</Empty> : (
        <div className="overflow-x-auto bg-surface border border-border rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs text-text-tertiary text-left border-b border-border">
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-3 py-2.5 font-semibold">Archetipo</th>
                <th className="px-3 py-2.5 font-semibold">Tracking</th>
                {CHANNELS.map(c => <th key={c.key} className="px-3 py-2.5 font-semibold whitespace-nowrap">{c.label}</th>)}
                <th className="px-3 py-2.5 font-semibold">GSC</th>
                <th className="px-3 py-2.5 font-semibold">QA</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const b = badges.get(r.id) ?? null
                const badge = b ? statusByValue(b) : null
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2.5">
                      <Link href={`${clientBase}/${r.id}?tab=6`} className="font-semibold text-text-primary hover:text-gold-text">{r.name}</Link>
                      {r.website && <p className="text-2xs text-text-tertiary truncate max-w-[220px]">{r.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap">{archetypeByValue(r.tracking?.archetype)?.label ?? '—'}</td>
                    <td className="px-3 py-2.5">{badge ? <Chip tone={badge.tone}>{badge.label}</Chip> : <Chip tone="muted">non configurato</Chip>}</td>
                    {CHANNELS.map(c => <td key={c.key} className="px-3 py-2.5"><Dot value={r.tracking?.[`status_${c.key}` as keyof ClientTracking] as TrackingStatus | undefined} channel={c.key} archetype={r.tracking?.archetype ?? null} /></td>)}
                    <td className="px-3 py-2.5"><Dot value={r.tracking?.status_gsc} /></td>
                    <td className="px-3 py-2.5">
                      {r.qa ? <Chip tone={r.qa.status === 'ok' ? 'success' : r.qa.status === 'problema' ? 'error' : 'muted'}
                        title={r.qa.problems.map(p => `${QA_LABEL[p.key] ?? p.key}: ${p.detail}`).join('\n') || fmtDate(r.qa.checkedAt)}>
                        {r.qa.status === 'ok' ? 'OK' : r.qa.status === 'problema' ? `${r.qa.problems.length} problemi` : 'N/A'}
                      </Chip> : <Chip tone="muted">mai</Chip>}
                    </td>
                    <td className="px-2 py-2.5 text-text-tertiary"><ChevronRight className="w-4 h-4" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-2xs text-text-tertiary">
        Il badge Tracking guarda solo i canali pertinenti all&apos;archetipo ({ARCHETYPES.map(a => a.label).join(', ')}) e ignora i «N/A». Search Console non entra: è SEO.
      </p>
    </div>
  )
}

function Dot({ value, channel, archetype }: { value?: TrackingStatus; channel?: ChannelKey; archetype?: string | null }) {
  if (!value) return <span className="text-text-tertiary">—</span>
  return <StatusChip value={value} title={channel && archetype ? `${channel} · ${archetype}` : undefined} />
}
