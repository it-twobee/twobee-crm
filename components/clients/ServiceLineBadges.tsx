'use client'

/**
 * Badge delle linee di servizio di un cliente, derivate dagli accordi economici
 * attivi (VIEW `client_service_lines`).
 *
 * Sostituisce `clients.client_type`, che era scritto a mano con tre soli valori
 * (growth | digital | growth_digital): non sapeva esprimere "Growth + Digital +
 * Marketing" e in produzione divergeva già dalla realtà su 3 clienti su 12.
 *
 * `fallback` copre il caso in cui la migration 123 non sia ancora applicata o il
 * cliente non abbia accordi: si mostra la vecchia etichetta, marcata come tale.
 */

const LABEL: Record<string, string> = {
  growth: 'Growth',
  digital: 'Digital',
  marketing: 'Marketing',
  ai: 'AI',
  hybrid: 'Hybrid',
  consulting: 'Consulting',
  other: 'Altro',
}

const STYLE: Record<string, string> = {
  growth: 'bg-gold/15 text-gold-text border-gold/30',
  digital: 'bg-info/15 text-info border-info/30',
  marketing: 'bg-accent/15 text-accent border-accent/30',
  ai: 'bg-warning/15 text-warning border-warning/30',
  hybrid: 'bg-surface-active text-text-secondary border-border',
  consulting: 'bg-surface-active text-text-secondary border-border',
  other: 'bg-surface-active text-text-tertiary border-border',
}

const badge = 'inline-flex items-center whitespace-nowrap text-2xs font-semibold px-2 py-0.5 rounded border'

export function ServiceLineBadges({ lines, fallback }: { lines?: string[]; fallback?: string | null }) {
  if (lines && lines.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        {lines.map(l => (
          <span key={l} className={`${badge} ${STYLE[l] ?? STYLE.other}`}>{LABEL[l] ?? l}</span>
        ))}
      </span>
    )
  }

  if (lines && lines.length === 0) {
    return (
      <span className={`${badge} border-border text-text-tertiary`} title="Nessun accordo economico attivo">
        Nessun accordo
      </span>
    )
  }

  // `lines` undefined: la VIEW non è disponibile, si ripiega sull'etichetta storica.
  const legacy = fallback ?? 'growth'
  return (
    <span className={`${badge} ${STYLE[legacy === 'growth_digital' ? 'hybrid' : legacy] ?? STYLE.other}`}
      title="Etichetta storica: gli accordi economici non sono ancora disponibili">
      {legacy === 'growth_digital' ? 'Growth + Digital' : (LABEL[legacy] ?? legacy)}
    </span>
  )
}
