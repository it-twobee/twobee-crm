import { cn } from '@/lib/utils'

/**
 * Logo ufficiale TwoBee (gli asset arrivano da www.twobee.it).
 *
 * Il wordmark esiste in due incisioni, bianca e nera: non è colorabile via CSS
 * perché è un webp con alpha. Renderizziamo entrambe e ne mostriamo una sola in
 * base a [data-theme] (vedi .logo-on-dark / .logo-on-light in globals.css).
 * Niente JS: nessun lampeggio dell'incisione sbagliata al primo paint.
 *
 * `mark` è l'esagono gold — un solo file, leggibile su entrambi i fondi.
 */
export function Logo({
  variant = 'full',
  className,
  priority = false,
}: {
  variant?: 'full' | 'mark'
  className?: string
  priority?: boolean
}) {
  if (variant === 'mark') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/favicon.svg"
        alt="TwoBee"
        width={24}
        height={24}
        className={cn('w-6 h-6 shrink-0', className)}
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
    )
  }

  return (
    <span className={cn('inline-flex items-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-white.webp"
        alt="TwoBee"
        width={328}
        height={160}
        className="logo-on-dark h-full w-auto object-contain"
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-black.webp"
        alt=""
        aria-hidden="true"
        width={381}
        height={160}
        className="logo-on-light h-full w-auto object-contain"
      />
    </span>
  )
}
