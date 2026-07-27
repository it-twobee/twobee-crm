'use client'

import { useState, useMemo } from 'react'
import { Building2, Sparkles } from 'lucide-react'
import { StepHead, SearchInput, PickRow, Avatar, Empty } from '@/components/shared/formkit'
import type { ClientOpt, ClientChoice } from './types'

export function StepCliente({
  clients, value, onChange,
}: { clients: ClientOpt[]; value: ClientChoice | null; onChange: (c: ClientChoice) => void }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? clients.filter(c => c.name.toLowerCase().includes(t)) : clients
  }, [clients, q])

  return (
    <div>
      <StepHead title="Per chi è questo progetto?" hint="Un cliente a catalogo, oppure un'iniziativa tutta nostra." />

      <button type="button" onClick={() => onChange({ kind: 'internal' })}
        aria-pressed={value?.kind === 'internal'}
        className={`w-full flex items-start gap-3 p-4 rounded-2xl border text-left transition-colors mb-4 ${
          value?.kind === 'internal' ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
        }`}>
        <span className="w-9 h-9 rounded-xl bg-surface-active flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-gold-text" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-text-primary">Progetto interno</span>
          <span className="block text-2xs text-text-tertiary mt-0.5">
            Senza cliente: iniziativa TWO BEE, R&amp;D, progetto a sé. Non sarà mai visibile in nessun portale cliente.
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2 mb-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-2xs text-text-tertiary">oppure scegli un cliente</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Cerca cliente…" autoFocus />
        {filtered.length === 0 ? (
          <Empty>Nessun cliente per «{q}».</Empty>
        ) : (
          <div className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-1">
            {filtered.map(c => (
              <PickRow key={c.id}
                selected={value?.kind === 'client' && value.id === c.id}
                onClick={() => onChange({ kind: 'client', id: c.id, name: c.name })}
                icon={<Avatar name={c.name} />}
                title={c.name}
              />
            ))}
          </div>
        )}
        <p className="flex items-center gap-1.5 text-2xs text-text-tertiary">
          <Building2 className="w-3.5 h-3.5" />
          {clients.length} anagrafiche disponibili
        </p>
      </div>
    </div>
  )
}
