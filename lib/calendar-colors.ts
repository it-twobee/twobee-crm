/**
 * Colore stabile per collega, derivato dal suo id.
 *
 * Deve essere: (1) deterministico — lo stesso collega ha sempre lo stesso colore,
 * anche dopo un reload; (2) leggibile su fondo chiaro e scuro. Per questo la
 * palette non usa i colori grezzi di Tailwind ma coppie calibrate, e il pallino
 * usa la variante "solida" mentre il testo usa quella ad alto contrasto.
 */

export interface CalendarColor {
  /** Riempimento del pallino / della barra evento */
  dot: string
  /** Sfondo tenue del chip */
  bg: string
  /** Testo del chip: sempre leggibile sul proprio sfondo */
  text: string
}

// Ogni voce funziona in entrambi i temi perché passa dai token, non da hex fissi.
const PALETTE: CalendarColor[] = [
  { dot: 'var(--color-gold)',    bg: 'var(--color-gold-dim)',    text: 'var(--color-gold-text)' },
  { dot: 'var(--color-info)',    bg: 'var(--color-info-dim)',    text: 'var(--color-info)' },
  { dot: 'var(--color-success)', bg: 'var(--color-success-dim)', text: 'var(--color-success)' },
  { dot: 'var(--color-accent)',  bg: 'var(--color-accent-dim)',  text: 'var(--color-accent)' },
  { dot: 'var(--color-orange)',  bg: 'var(--color-orange-dim)',  text: 'var(--color-orange)' },
  { dot: 'var(--color-error)',   bg: 'var(--color-error-dim)',   text: 'var(--color-error)' },
]

/** Hash stabile e semplice: due id diversi cadono raramente sullo stesso colore. */
function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function colorFor(profileId: string): CalendarColor {
  return PALETTE[hash(profileId) % PALETTE.length]
}

export const PALETTE_SIZE = PALETTE.length
