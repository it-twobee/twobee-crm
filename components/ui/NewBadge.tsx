// Badge "Nuovo": segnala un elemento appena creato che l'utente non ha ancora
// aperto. Sparisce (per lui) al primo click via useSeen().markSeen.
export function NewBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 text-2xs font-bold px-1.5 py-0.5 rounded-full bg-gold/10 text-gold-text border border-gold/25 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
      Nuovo
    </span>
  )
}
