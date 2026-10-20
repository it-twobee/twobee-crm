/**
 * Etichetta di campagna e fatturato dichiarato dei lead che arrivano dalle ads.
 *
 * Nessuna delle due è una colonna: stanno nel `lead_origine` di Meta e si
 * ricavano a ogni lettura, così un lead già importato prende l'etichetta senza
 * una migration né un backfill, e una regola corretta vale per tutti.
 *
 * Gate: `npx tsx lib/sales-ads.check.ts`.
 */

export type TipoAds = 'IA' | "E-commerce"
export const TIPI_ADS: TipoAds[] = ['IA', 'E-commerce']
export const SENZA_TIPO_ADS = '__senza_tipo__'

type Origine = Record<string, unknown> | null | undefined

/* «IA» si cerca come parola intera: come sottostringa prenderebbe «Italia»
   (adset «Centro-Nord Italia»), cioè quasi ogni campagna. */
const parole = (t: string) => t.toLowerCase().split(/[^a-zà-ú0-9]+/).filter(Boolean)
const ECOMMERCE = /e[\s_-]?commerce|shop(?:ify)?|woocommerce|negozio online/i

/** da campagna, adset e annuncio. Un lead può portarne due (campagna IA su un target e-commerce) */
export function tipiAds(o: Origine): TipoAds[] {
  if (!o) return []
  const testo = [o.campagna, o.adset, o.annuncio].map(v => (typeof v === 'string' ? v : '')).join(' | ')
  const p = parole(testo)
  const tipi: TipoAds[] = []
  if (p.includes('ia') || p.includes('ai')) tipi.push('IA')
  if (ECOMMERCE.test(testo)) tipi.push('E-commerce')
  return tipi
}

/**
 * Le fasce del modulo, dalla più alta: il modulo offre quattro risposte
 * chiuse, quindi si ordina per fascia e non per un importo inventato.
 * Una risposta fuori dalle quattro (o di prova) è `null`, non 0: un vuoto
 * finisce in fondo, uno zero direbbe «fatturato basso».
 */
const FASCE: { rango: number; corta: string; vale: RegExp }[] = [
  { rango: 4, corta: 'oltre 5 M€', vale: /oltre\s*5/i },
  { rango: 3, corta: '1–5 M€', vale: /^1\s*m.*5\s*m/i },
  { rango: 2, corta: '500k–1 M€', vale: /500\.?000.*1\s*m/i },
  { rango: 1, corta: '< 500k', vale: /meno\s+di\s*500/i },
]

export function fatturatoDichiarato(o: Origine): { rango: number; corta: string } | null {
  const v = o?.fatturato_dichiarato
  if (typeof v !== 'string') return null
  const f = FASCE.find(x => x.vale.test(v.trim()))
  return f ? { rango: f.rango, corta: f.corta } : null
}

export const rangoFatturato = (o: Origine): number | null => fatturatoDichiarato(o)?.rango ?? null
