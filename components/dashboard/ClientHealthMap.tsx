'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Client } from '@/lib/types/database'

interface Props {
  clients: Pick<Client, 'id' | 'company_name' | 'client_label' | 'client_type' | 'mrr'>[]
}

const LABEL_COLOR: Record<string, string> = {
  stabile:  '#22C55E',
  in_bilico:'#F5C800',
  perso:    '#EF4444',
  partner:  '#A855F7',
}
const LABEL_TEXT: Record<string, string> = {
  stabile: 'Stabile', in_bilico: 'In bilico', perso: 'Perso', partner: 'Partner',
}

export function ClientHealthMap({ clients }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  const stable   = clients.filter(c => c.client_label === 'stabile').length
  const bilico   = clients.filter(c => c.client_label === 'in_bilico').length
  const perso    = clients.filter(c => c.client_label === 'perso').length

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">Client Health Map</p>
        <div className="flex items-center gap-3 text-[10px] text-text-secondary">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#22C55E' }} /> {stable} stabili</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#F5C800' }} /> {bilico} in bilico</span>
          {perso > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#EF4444' }} /> {perso} persi</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {clients.map(c => {
          const color = LABEL_COLOR[c.client_label ?? 'stabile'] ?? '#444'
          const isH = hovered === c.id
          const initials = c.company_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
          return (
            <Link key={c.id} href={`/clienti/${c.id}`}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
              className="relative group"
              title={`${c.company_name} · ${LABEL_TEXT[c.client_label ?? ''] ?? c.client_label}`}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-black transition-all duration-150 cursor-pointer"
                style={{
                  background: color + '20',
                  border: `1.5px solid ${color}${isH ? 'FF' : '60'}`,
                  color: color,
                  transform: isH ? 'scale(1.15)' : 'scale(1)',
                }}>
                {initials}
              </div>
              {/* Tooltip */}
              {isH && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none">
                  <div className="bg-surface border border-border rounded-lg px-2.5 py-1.5 text-center whitespace-nowrap shadow-xl">
                    <p className="text-[10px] font-bold text-text-primary">{c.company_name}</p>
                    <p className="text-[9px] mt-0.5" style={{ color }}>{LABEL_TEXT[c.client_label ?? ''] ?? c.client_label}</p>
                    {c.mrr && <p className="text-[9px] text-text-secondary">€{c.mrr?.toLocaleString('it-IT')}/mese</p>}
                  </div>
                </div>
              )}
            </Link>
          )
        })}
        {clients.length === 0 && (
          <p className="text-xs text-text-tertiary py-4">Nessun cliente ancora</p>
        )}
      </div>
    </div>
  )
}
