import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr))
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'ora'
  if (diffMins < 60) return `${diffMins}m fa`
  if (diffHours < 24) return `${diffHours}h fa`
  if (diffDays < 7) return `${diffDays}g fa`
  return formatDate(dateStr)
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'verde': return 'text-success'
    case 'giallo': return 'text-warning'
    case 'rosso': return 'text-error'
    default: return 'text-text-secondary'
  }
}

export function getStatusBg(status: string): string {
  switch (status) {
    case 'verde': return 'bg-success/20 text-success'
    case 'giallo': return 'bg-warning/20 text-warning'
    case 'rosso': return 'bg-error/20 text-error'
    default: return 'bg-surface text-text-secondary'
  }
}

export function getPaymentBadge(status: string): string {
  switch (status) {
    case 'pagato': return 'bg-success/20 text-success'
    case 'in_attesa': return 'bg-warning/20 text-warning'
    case 'scaduto': return 'bg-error/20 text-error'
    default: return 'bg-surface text-text-secondary'
  }
}

export function getPriorityBadge(priority: string): string {
  switch (priority) {
    case 'alta': return 'bg-error/20 text-error'
    case 'media': return 'bg-warning/20 text-warning'
    case 'bassa': return 'bg-success/20 text-success'
    default: return 'bg-surface text-text-secondary'
  }
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
