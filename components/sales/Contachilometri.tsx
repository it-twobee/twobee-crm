import { coloreLivello, type Vicinanza } from '@/lib/sales-vicinanza'

/**
 * §463 — il semicerchio da contachilometri: quanto il lead è vicino a diventare
 * cliente. Rosso a sinistra, verde a destra, la lancetta dove siamo. I colori
 * sono i token del tema (`coloreLivello`), mai un hex. Un grigio dice che non
 * c'è una corsa in atto: perso, o in pausa.
 */
export function Contachilometri({ v, className = '' }: { v: Vicinanza; className?: string }) {
  const grigio = v.tono === 'perso' || v.tono === 'fermo'
  const colore = grigio ? 'var(--color-text-tertiary)' : coloreLivello(v.livello)
  const angolo = -90 + v.livello * 1.8
  const dettaglio = v.tono === 'vinto' ? 'Cliente acquisito'
    : v.tono === 'perso' ? 'Perso'
    : v.tono === 'fermo' ? 'In pausa'
    : `${v.livello}%${v.giorniFermo !== null && v.giorniFermo > 7 ? ` · fermo da ${v.giorniFermo} giorni` : ''}`
  const etichetta = `Vicinanza a diventare cliente: ${dettaglio}`
  return (
    <svg viewBox="0 0 44 27" width="44" height="27" role="img" aria-label={etichetta} className={`shrink-0 ${className}`}>
      <title>{etichetta}</title>
      <path d="M4 22 A18 18 0 0 1 40 22" fill="none" strokeWidth="5" strokeLinecap="round" pathLength={100}
        style={{ stroke: 'var(--color-border-strong)' }} />
      {v.livello > 0 && (
        <path d="M4 22 A18 18 0 0 1 40 22" fill="none" strokeWidth="5" strokeLinecap="round" pathLength={100}
          strokeDasharray={`${v.livello} 100`} style={{ stroke: colore }} />
      )}
      <g transform={`rotate(${angolo} 22 22)`}>
        <line x1="22" y1="22" x2="22" y2="9" strokeWidth="2" strokeLinecap="round" style={{ stroke: 'var(--color-text-primary)' }} />
      </g>
      <circle cx="22" cy="22" r="2.5" style={{ fill: 'var(--color-text-primary)' }} />
    </svg>
  )
}
