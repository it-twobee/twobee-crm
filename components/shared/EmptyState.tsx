import Link from 'next/link'
import type { ReactNode } from 'react'

interface Action {
  label: string
  onClick?: () => void
  href?: string
  icon?: ReactNode
}

/**
 * Stato vuoto riusabile: icona + messaggio + CTA. Sostituisce le tabelle/liste
 * vuote con una spiegazione utile e (dove ha senso) un'azione per creare il
 * primo elemento. Design token light/dark.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: Action
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16">
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-surface-hover border border-border flex items-center justify-center text-text-tertiary mb-4">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      {description && <p className="text-xs text-text-secondary mt-1 max-w-sm">{description}</p>}
      {action && (
        action.href ? (
          <Link href={action.href}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-bold rounded-lg hover:bg-gold/90 transition-colors">
            {action.icon}{action.label}
          </Link>
        ) : (
          <button onClick={action.onClick}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-bold rounded-lg hover:bg-gold/90 transition-colors">
            {action.icon}{action.label}
          </button>
        )
      )}
    </div>
  )
}
