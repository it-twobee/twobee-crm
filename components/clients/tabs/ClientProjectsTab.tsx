'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Briefcase, Loader2 } from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'

type Row = { id: string; name: string; status: string; area: string; service_type: string }

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-surface-active text-text-tertiary',
  active: 'bg-success-dim text-success',
  on_hold: 'bg-warning-dim text-warning',
  completed: 'bg-info-dim text-info',
  archived: 'bg-surface-active text-text-tertiary',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza', active: 'Attivo', on_hold: 'In pausa', completed: 'Completato', archived: 'Archiviato',
}
const AREA_TONE: Record<string, string> = {
  marketing: 'text-accent', growth: 'text-gold-text', digital: 'text-info',
}
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export function ClientProjectsTab({ clientId, canCreate }: { clientId: string; canCreate: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let alive = true
    createBrowserClient()
      .from('projects').select('id,name,status,area,service_type')
      .eq('client_id', clientId).is('deleted_at', null).order('created_at', { ascending: false })
      .then(({ data }) => { if (alive) setRows((data ?? []) as Row[]) })
    return () => { alive = false }
  }, [clientId])

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-primary">Progetti del cliente</h2>
        {canCreate && (
          <Link href={`/progetti?client=${clientId}`}
            className="flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg shadow-soft press">
            <Plus className="w-3.5 h-3.5" />Nuovo progetto
          </Link>
        )}
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />Carico…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Briefcase className="w-7 h-7 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Nessun progetto per questo cliente.</p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 animate-fade-in">
          {rows.map(p => (
            <Link key={p.id} href={`/progetti/${p.id}`}
              className="card-interactive bg-surface border border-border rounded-2xl flex items-center gap-3 px-4 py-3.5 no-tap-highlight">
              <div className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
                <Briefcase className="w-[18px] h-[18px] text-gold-text" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">{p.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-2xs font-semibold capitalize ${AREA_TONE[p.area] ?? 'text-text-tertiary'}`}>{pretty(p.area)}</span>
                  <span className="text-2xs text-text-tertiary">·</span>
                  <span className="text-2xs text-text-secondary truncate">{pretty(p.service_type)}</span>
                </div>
              </div>
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[p.status] ?? STATUS_BADGE.draft}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
