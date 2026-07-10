'use client'

import Link from 'next/link'
import { TrendingUp, Users, Clock, MessageSquare, FileText, AlertTriangle, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface KpiCardsProps {
  mrr: number
  activeClients: number
  tasksDueSoon: number
  unreadMessages: number
  invoicesPending: number
  clientsAtRisk: number      // in_bilico
  clientsLost: number        // perso
  totalClients: number       // per churn rate
  isAdmin: boolean
  approvalsPending?: number
}

export function KpiCards({
  mrr, activeClients, tasksDueSoon, unreadMessages,
  invoicesPending, clientsAtRisk, clientsLost, totalClients,
  isAdmin, approvalsPending = 0,
}: KpiCardsProps) {
  const churnRate = totalClients > 0
    ? ((clientsLost / totalClients) * 100).toFixed(1)
    : '0.0'

  const cards = [
    {
      label: 'MRR Totale',
      value: isAdmin ? formatCurrency(mrr) : '—',
      sub: isAdmin ? `${activeClients} clienti attivi` : null,
      icon: TrendingUp,
      color: 'text-gold-text',
      bg: 'bg-gold/10',
      border: 'border-gold/20',
      href: '/clienti',
      show: true,
    },
    {
      label: 'Clienti Attivi',
      value: activeClients.toString(),
      sub: 'Totale portafoglio',
      icon: Users,
      color: 'text-success',
      bg: 'bg-success/10',
      border: 'border-success/20',
      href: '/clienti',
      show: true,
    },
    {
      label: 'Task in Scadenza',
      value: tasksDueSoon.toString(),
      sub: 'Prossimi 7 giorni',
      icon: Clock,
      color: tasksDueSoon > 0 ? 'text-warning' : 'text-success',
      bg: tasksDueSoon > 0 ? 'bg-warning/10' : 'bg-success/10',
      border: tasksDueSoon > 0 ? 'border-warning/20' : 'border-success/20',
      href: '/task',
      show: true,
    },
    {
      label: 'Messaggi Non Letti',
      value: unreadMessages.toString(),
      sub: unreadMessages > 0 ? 'Da leggere' : 'Tutto letto',
      icon: MessageSquare,
      color: unreadMessages > 0 ? 'text-error' : 'text-success',
      bg: unreadMessages > 0 ? 'bg-error/10' : 'bg-success/10',
      border: unreadMessages > 0 ? 'border-error/20' : 'border-success/20',
      href: '/chat',
      show: true,
    },
    {
      label: 'Fatture in Attesa',
      value: invoicesPending.toString(),
      sub: 'Da inviare o in ritardo',
      icon: FileText,
      color: invoicesPending > 0 ? 'text-warning' : 'text-success',
      bg: invoicesPending > 0 ? 'bg-warning/10' : 'bg-success/10',
      border: invoicesPending > 0 ? 'border-warning/20' : 'border-success/20',
      href: '/fatturazione',
      show: isAdmin,
    },
    {
      label: 'In Bilico',
      value: clientsAtRisk.toString(),
      sub: clientsAtRisk > 0 ? 'Intervieni subito' : 'Nessuno a rischio',
      icon: AlertTriangle,
      color: clientsAtRisk > 0 ? 'text-warning' : 'text-success',
      bg: clientsAtRisk > 0 ? 'bg-warning/10' : 'bg-success/10',
      border: clientsAtRisk > 0 ? 'border-warning/20' : 'border-success/20',
      href: '/clienti',
      show: true,
    },
    {
      label: 'Clienti Persi',
      value: clientsLost.toString(),
      sub: clientsLost > 0 ? `Churn ${churnRate}%` : 'Churn 0%',
      icon: TrendingDown,
      color: clientsLost > 0 ? 'text-error' : 'text-success',
      bg: clientsLost > 0 ? 'bg-error/10' : 'bg-success/10',
      border: clientsLost > 0 ? 'border-error/20' : 'border-success/20',
      href: '/clienti',
      show: true,
    },
  ].filter((c) => c.show)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className={`bg-surface border ${card.border} rounded-card p-4 hover:border-opacity-60 hover:scale-[1.02] transition-all duration-150 group`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`${card.bg} p-2 rounded-lg`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
          </div>
          <p className={`text-2xl font-black ${card.color} mb-1`}>{card.value}</p>
          <p className="text-text-secondary text-xs font-medium leading-tight">{card.label}</p>
          {card.sub && (
            <p className="text-text-secondary text-xs mt-1 opacity-70">{card.sub}</p>
          )}
        </Link>
      ))}
    </div>
  )
}
