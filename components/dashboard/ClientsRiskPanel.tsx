'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, TrendingDown, ExternalLink } from 'lucide-react'
import type { Client } from '@/lib/types/database'

interface Props {
  clients: Client[]          // tutti i clienti (stabile + in_bilico + perso + partner)
  totalMrr: number           // MRR totale per calcolo churn
}

const packageShort: Record<string, string> = {
  'Worker Bee Start': 'WB Start',
  'Worker Bee Basic': 'WB Basic',
  'Hive Basic':       'Hive Basic',
  'Hive Custom':      'Hive Custom',
  'Royal Queen':      'Royal Queen',
  'IT Digital Partner':'IT Partner',
  'Partner Quota':    'Partner',
}

function daysSince(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
}

export function ClientsRiskPanel({ clients, totalMrr }: Props) {
  const [tab, setTab] = useState<'rischio' | 'persi'>('rischio')

  const atRisk = clients.filter(c => c.client_label === 'in_bilico')
  const lost   = clients.filter(c => c.client_label === 'perso')
  const total  = clients.length

  // Churn rate = clienti persi / totale clienti (inclusi persi)
  const churnRateCount  = total > 0 ? ((lost.length / total) * 100).toFixed(1) : '0.0'
  // Churn MRR = MRR perso / (MRR attivo + MRR perso)
  const lostMrr   = lost.reduce((s, c) => s + (c.mrr ?? 0), 0)
  const churnRateMrr = (totalMrr + lostMrr) > 0
    ? ((lostMrr / (totalMrr + lostMrr)) * 100).toFixed(1)
    : '0.0'

  const active = tab === 'rischio' ? atRisk : lost

  return (
    <div className="bg-surface border border-[#2A2A2A] rounded-xl overflow-hidden h-full flex flex-col">

      {/* Header con tabs */}
      <div className="flex items-center justify-between px-5 pt-4 pb-0">
        <div className="flex gap-1 bg-[#111] border border-[#2A2A2A] rounded-lg p-0.5">
          <button
            onClick={() => setTab('rischio')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              tab === 'rischio' ? 'bg-warning text-black' : 'text-text-secondary hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            In bilico
            {atRisk.length > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${tab === 'rischio' ? 'bg-black/20 text-black' : 'bg-warning/20 text-warning'}`}>
                {atRisk.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('persi')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              tab === 'persi' ? 'bg-error text-white' : 'text-text-secondary hover:text-white'
            }`}
          >
            <TrendingDown className="w-3 h-3" />
            Persi
            {lost.length > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${tab === 'persi' ? 'bg-white/20 text-white' : 'bg-error/20 text-error'}`}>
                {lost.length}
              </span>
            )}
          </button>
        </div>

        {/* Churn stats — visibili solo nel tab persi */}
        {tab === 'persi' && lost.length > 0 && (
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-[10px] text-text-secondary">Churn clienti</p>
              <p className="text-sm font-black text-error">{churnRateCount}%</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary">Churn MRR</p>
              <p className="text-sm font-black text-error">{churnRateMrr}%</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary">MRR perso</p>
              <p className="text-sm font-black text-error">
                -€{lostMrr.toLocaleString('it-IT')}
              </p>
            </div>
          </div>
        )}

        {tab === 'rischio' && atRisk.length > 0 && (
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-[10px] text-text-secondary">MRR a rischio</p>
              <p className="text-sm font-black text-warning">
                €{atRisk.reduce((s, c) => s + (c.mrr ?? 0), 0).toLocaleString('it-IT')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Contenuto */}
      <div className="p-5 flex-1 overflow-auto">
        {active.length === 0 ? (
          <div className="text-center py-6">
            <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center ${tab === 'rischio' ? 'bg-success/10' : 'bg-[#1A1A1A]'}`}>
              {tab === 'rischio'
                ? <AlertTriangle className="w-5 h-5 text-success" />
                : <TrendingDown className="w-5 h-5 text-[#444]" />}
            </div>
            <p className="text-sm font-bold text-white">
              {tab === 'rischio' ? 'Nessun cliente in bilico' : 'Nessun cliente perso'}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {tab === 'rischio' ? 'Tutti i clienti sono stabili' : 'Churn rate 0%'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map(c => {
              const daysSinceStart = daysSince(c.created_at)
              const ltv = (c.mrr ?? 0) * Math.max(1, Math.floor(daysSinceStart / 30))
              return (
                <Link
                  key={c.id}
                  href={`/clienti/${c.id}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors group ${
                    tab === 'rischio'
                      ? 'border-warning/20 bg-warning/5 hover:border-warning/40'
                      : 'border-error/20 bg-error/5 hover:border-error/40'
                  }`}
                >
                  {/* Initials */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                    tab === 'rischio' ? 'bg-warning/20 text-warning' : 'bg-error/20 text-error'
                  }`}>
                    {c.company_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white truncate">{c.company_name}</p>
                      <span className="text-[10px] text-text-secondary shrink-0">
                        {packageShort[c.package] ?? c.package}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-text-secondary">
                      <span className="capitalize">{c.client_type}</span>
                      {tab === 'persi' && (
                        <span>LTV stimato: <strong className="text-white">€{ltv.toLocaleString('it-IT')}</strong></span>
                      )}
                      {tab === 'rischio' && c.notes && (
                        <span className="truncate max-w-[160px]">{c.notes}</span>
                      )}
                    </div>
                  </div>

                  {/* MRR */}
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black ${tab === 'rischio' ? 'text-warning' : 'text-error line-through opacity-60'}`}>
                      €{(c.mrr ?? 0).toLocaleString('it-IT')}
                    </p>
                    <p className="text-[9px] text-text-secondary">/mese</p>
                  </div>

                  <ExternalLink className="w-3.5 h-3.5 text-[#333] group-hover:text-text-secondary shrink-0" />
                </Link>
              )
            })}
          </div>
        )}

        {/* Footer churn bar — solo tab persi */}
        {tab === 'persi' && lost.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#2A2A2A]">
            <div className="flex items-center justify-between text-[10px] text-text-secondary mb-1.5">
              <span>Distribuzione clienti</span>
              <span>{clients.filter(c => c.client_label === 'stabile').length} stabili · {atRisk.length} in bilico · {lost.length} persi</span>
            </div>
            <div className="h-2 bg-[#1A1A1A] rounded-full overflow-hidden flex gap-px">
              {clients.filter(c => c.client_label === 'stabile').length > 0 && (
                <div className="h-full bg-success rounded-l-full transition-all"
                  style={{ width: `${(clients.filter(c => c.client_label === 'stabile').length / total) * 100}%` }} />
              )}
              {atRisk.length > 0 && (
                <div className="h-full bg-warning transition-all"
                  style={{ width: `${(atRisk.length / total) * 100}%` }} />
              )}
              {lost.length > 0 && (
                <div className="h-full bg-error rounded-r-full transition-all"
                  style={{ width: `${(lost.length / total) * 100}%` }} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
