/**
 * Il colore della persona: il pallino del responsabile nel calendario milestone,
 * gli eventi e le assenze nel Calendario. Esegui il gate: npx tsx lib/calendar-colors.check.ts
 *
 * §483 — **lo sceglie la persona**, in «Il mio profilo» (`profiles.avatar_color`).
 * Nel calendario milestone il pallino è largo dieci pixel: una foto lì dentro
 * non si riconosce, un colore sì. Chi non ha scelto ne riceve uno stabile,
 * derivato dal suo id — deterministico, quindi uguale dopo ogni ricarica.
 *
 * Otto tinte categoriali in un ordine validato in tutti e due i temi, e solo
 * otto: una nona generata a mano finirebbe accanto a una delle altre. Il testo
 * non indossa mai la tinta (sul bianco tre di queste stanno sotto 3:1): resta
 * `text-primary`, e il colore lo porta il bordo o il pallino accanto.
 */

export const COLORI_PERSONA = ['blu', 'arancio', 'acqua', 'giallo', 'magenta', 'verde', 'viola', 'rosso'] as const
export type ColorePersona = typeof COLORI_PERSONA[number]

export const NOME_COLORE: Record<ColorePersona, string> = {
  blu: 'Blu', arancio: 'Arancio', acqua: 'Acqua', giallo: 'Giallo',
  magenta: 'Magenta', verde: 'Verde', viola: 'Viola', rosso: 'Rosso',
}

export interface CalendarColor {
  /** Riempimento del pallino, bordo dell'evento */
  dot: string
  /** Sfondo tenue del chip */
  bg: string
  /** Testo del chip: mai la tinta, sempre leggibile sul proprio sfondo */
  text: string
}

export const isColorePersona = (v: unknown): v is ColorePersona =>
  typeof v === 'string' && (COLORI_PERSONA as readonly string[]).includes(v)

/** Hash stabile e semplice: due id diversi cadono raramente sullo stesso colore. */
function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** La tinta di una persona: quella scelta, se è una delle otto; altrimenti quella del suo id. */
export function colorePersona(profileId: string, scelto?: string | null): ColorePersona {
  return isColorePersona(scelto) ? scelto : COLORI_PERSONA[hash(profileId) % COLORI_PERSONA.length]
}

export function coloreDa(c: ColorePersona): CalendarColor {
  const v = `var(--color-persona-${c})`
  return { dot: v, bg: `color-mix(in srgb, ${v} 16%, transparent)`, text: 'var(--color-text-primary)' }
}

export function colorFor(profileId: string, scelto?: string | null): CalendarColor {
  return coloreDa(colorePersona(profileId, scelto))
}

export const PALETTE_SIZE = COLORI_PERSONA.length
