'use client'

import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Client } from '@/lib/types/database'

interface ClientsStatusTableProps {
  clients: Client[]
}

const statusIcon: Record<string, string> = {
  verde: '🟢',
  giallo: '🟡',
  rosso: '🔴',
}

const packageShort: Record<string, string> = {
  'Worker Bee Start': 'WB Start',
  'Worker Bee Basic': 'WB Basic',
  'Hive Basic': 'Hive Basic',
  'Hive Custom': 'Hive Custom',
  'Royal Queen': 'Royal Queen',
  'IT Digital Partner': 'IT Partner',
  'Partner Quota': 'Partner',
}

export function ClientsStatusTable({ clients }: ClientsStatusTableProps) {
  return (
    <div className="bg-surface border border-border rounded-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-bold text-text-primary">Stato Progetti</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['Cliente', 'Pacchetto', 'MRR', 'Stato', 'Pagamenti', 'Canali'].map((h) => (
                <th
                  key={h}
                  className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((client, i) => (
              <tr
                key={client.id}
                className={`border-b border-border hover:bg-overlay/3 transition-colors ${
                  i === clients.length - 1 ? 'border-b-0' : ''
                }`}
              >
                <td className="px-5 py-3.5">
                  <Link
                    href={`/clienti/${client.id}`}
                    className="font-semibold text-text-primary hover:text-gold-text transition-colors text-sm"
                  >
                    {client.company_name}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-xs text-text-secondary bg-background px-2 py-1 rounded">
                    {packageShort[client.package] ?? client.package}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm font-semibold text-gold-text">
                  {formatCurrency(client.mrr)}
                </td>
                <td className="px-5 py-3.5 text-sm">
                  {statusIcon[client.status] ?? '⚪'}{' '}
                  <span className="text-text-secondary capitalize">{client.status}</span>
                </td>
                <td className="px-5 py-3.5">
                  <PaymentBadge status={client.payment_status} />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1 flex-wrap">
                    {client.active_channels.slice(0, 3).map((ch) => (
                      <span
                        key={ch}
                        className="text-xs bg-background border border-border px-1.5 py-0.5 rounded text-text-secondary"
                      >
                        {ch}
                      </span>
                    ))}
                    {client.active_channels.length > 3 && (
                      <span className="text-xs text-text-secondary">
                        +{client.active_channels.length - 3}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pagato: { label: 'Pagato', cls: 'bg-success/20 text-success' },
    in_attesa: { label: 'In attesa', cls: 'bg-warning/20 text-warning' },
    scaduto: { label: 'Scaduto', cls: 'bg-error/20 text-error' },
  }
  const b = map[status] ?? { label: status, cls: 'bg-surface text-text-secondary' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${b.cls}`}>
      {b.label}
    </span>
  )
}
