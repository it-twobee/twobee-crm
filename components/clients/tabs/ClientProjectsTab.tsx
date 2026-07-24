'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Briefcase, Loader2 } from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'

type Row = { id: string; name: string; status: string; area: string; service_type: string }

const STATUS_TONE: Record<string, string> = {
  draft: 'text-text-tertiary', active: 'text-success', on_hold: 'text-warning',
  completed: 'text-info', archived: 'text-text-tertiary',
}

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
            className="flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded">
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
        <div className="border border-border rounded-lg divide-y divide-border">
          {rows.map(p => (
            <Link key={p.id} href={`/progetti/${p.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors">
              <Briefcase className="w-4 h-4 text-gold-text shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">{p.name}</div>
                <div className="text-2xs text-text-tertiary">{p.area} · {p.service_type}</div>
              </div>
              <span className={`text-2xs font-semibold ${STATUS_TONE[p.status] ?? 'text-text-tertiary'}`}>{p.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
