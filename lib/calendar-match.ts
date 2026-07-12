/**
 * Matching fra eventi di calendario e cliente/progetto (§16).
 * Niente `LIKE '%nome%'` grezzo: i nomi si normalizzano (minuscole, accenti, punteggiatura,
 * spazi) e si confrontano per token. Il match è su cliente OR progetto (D13).
 */

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // via accenti
    .replace(/[^a-z0-9\s]/g, ' ')                        // via punteggiatura (- _ . & …)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parole troppo generiche per identificare un cliente/progetto da sole. */
const STOP = new Set(['srl', 'spa', 'sas', 'snc', 'the', 'di', 'e', 'and', 'group', 'holding', 'project', 'progetto'])

export function tokens(s: string): string[] {
  const all = normalizeName(s).split(' ').filter(t => t.length >= 3 && !STOP.has(t))
  // Se il nome è fatto solo di stopword ("Holding S.r.l."), meglio tenerle che non
  // avere token: senza token non si può matchare nulla.
  return all.length ? all : normalizeName(s).split(' ').filter(t => t.length >= 3)
}

/** Un token dell'evento combacia se è uguale o è prefisso/estensione (seven ~ sevens). */
function tokenHit(hayTokens: string[], t: string): boolean {
  return hayTokens.some(h => h === t || h.startsWith(t) || t.startsWith(h))
}

export type MatchLevel = 'sicuro' | 'suggerito' | 'no'

/**
 * Confronta il titolo (+ descrizione) di un evento con un nome di riferimento.
 *  - `sicuro`    → il nome normalizzato compare per intero nel testo
 *  - `suggerito` → almeno metà dei token significativi combacia (min 1)
 */
export function matchEvent(text: string, name: string | null | undefined): MatchLevel {
  if (!name) return 'no'
  const hay = normalizeName(text)
  const needle = normalizeName(name)
  if (!needle || !hay) return 'no'
  if (hay.includes(needle)) return 'sicuro'

  const nt = tokens(name)
  if (nt.length === 0) return 'no'
  const hayTokens = hay.split(' ').filter(Boolean)
  const hit = nt.filter(t => tokenHit(hayTokens, t)).length
  if (hit === 0) return 'no'
  if (hit === nt.length) return 'sicuro'
  // Anche un solo token forte (≥4 lettere, es. "seven") basta come suggerimento.
  if (hit >= Math.ceil(nt.length / 2) || nt.some(t => t.length >= 4 && tokenHit(hayTokens, t))) return 'suggerito'
  return 'no'
}

/** Match dell'evento sul progetto O sul cliente (D13). Vince il livello più alto. */
export function matchEventToContext(
  text: string,
  opts: { projectName?: string | null; clientName?: string | null },
): MatchLevel {
  const a = matchEvent(text, opts.projectName)
  if (a === 'sicuro') return 'sicuro'
  const b = matchEvent(text, opts.clientName)
  if (b === 'sicuro') return 'sicuro'
  return a === 'suggerito' || b === 'suggerito' ? 'suggerito' : 'no'
}
