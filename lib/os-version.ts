/**
 * Le versioni del TwoBee OS.
 *
 * Un ciclo dura 15 giorni e parte dal 2026-08-01, che è la v1.0.0. Ogni ciclo
 * chiuso alza la **minore** (1.0.0 → 1.1.0): la data dice da sola in che
 * versione sei, senza che nessuno debba ricordarsi di numerare. Dentro un ciclo
 * una modifica sostanziale può alzare la **patch** (1.1.0 → 1.1.1) — succede
 * quando qualcosa esce prima della fine del ciclo e va raccontato subito.
 *
 * Qui dentro solo calendario e numeri: nessuna query, nessun colore.
 */

export const CYCLE_DAYS = 15
/** Il giorno zero: la v1.0.0 copre i 15 giorni che partono da qui. */
export const CYCLE_EPOCH = '2026-08-01'

const DAY = 86_400_000

/** Data ISO (YYYY-MM-DD) → millisecondi a mezzanotte UTC. Niente fusi. */
export function isoToMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1)
}

export function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Il giorno di una data, senza ora: due modifiche dello stesso giorno stanno nello stesso ciclo. */
export function dayOf(date: Date | string): string {
  return typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10)
}

export type Cycle = {
  /** 0 = il ciclo della v1.0.0 */
  index: number
  start: string
  end: string
}

/** In che ciclo cade una data. Prima dell'epoca, il ciclo 0. */
export function cycleOf(date: Date | string): Cycle {
  const days = Math.floor((isoToMs(dayOf(date)) - isoToMs(CYCLE_EPOCH)) / DAY)
  const index = Math.max(0, Math.floor(days / CYCLE_DAYS))
  return cycleAt(index)
}

export function cycleAt(index: number): Cycle {
  const start = isoToMs(CYCLE_EPOCH) + index * CYCLE_DAYS * DAY
  return { index, start: msToIso(start), end: msToIso(start + (CYCLE_DAYS - 1) * DAY) }
}

/** Quanti giorni mancano alla chiusura del ciclo in corso (0 = si chiude oggi). */
export function daysLeftInCycle(date: Date | string): number {
  const c = cycleOf(date)
  return Math.round((isoToMs(c.end) - isoToMs(dayOf(date))) / DAY)
}

export type Version = { major: number; minor: number; patch: number }

export function parseVersion(v: string): Version | null {
  const m = v.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

export function formatVersion(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}`
}

/** Ordine decrescente: la più nuova prima. */
export function compareVersions(a: Version, b: Version): number {
  return b.major - a.major || b.minor - a.minor || b.patch - a.patch
}

/** Il numero che spetta a un ciclo, se nessuno ha alzato la maggiore. */
export function versionForCycle(index: number, major = 1): Version {
  return { major, minor: index, patch: 0 }
}

/**
 * Il prossimo numero da proporre.
 * - `ciclo`: si chiude il ciclo, si alza la minore (o si prende quella del ciclo corrente, se è più avanti)
 * - `sostanziale`: qualcosa esce a metà ciclo, si alza la patch
 * - `major`: lo decide una persona, mai il calendario
 */
export function nextVersion(latest: Version | null, kind: 'ciclo' | 'sostanziale' | 'major', at: Date | string): Version {
  const cycleVersion = versionForCycle(cycleOf(at).index, latest?.major ?? 1)
  if (!latest) return { major: 1, minor: 0, patch: 0 }
  if (kind === 'major') return { major: latest.major + 1, minor: 0, patch: 0 }
  if (kind === 'sostanziale') return { ...latest, patch: latest.patch + 1 }
  // il ciclo corrente vince se il registro è rimasto indietro di più cicli
  return compareVersions(cycleVersion, latest) < 0 ? cycleVersion : { ...latest, minor: latest.minor + 1, patch: 0 }
}

export type ChangeKind = 'novita' | 'miglioramento' | 'correzione' | 'rimozione' | 'sicurezza'

export const CHANGE_KINDS: { key: ChangeKind; label: string; hint: string }[] = [
  { key: 'novita',        label: 'Novità',       hint: 'qualcosa che prima non si poteva fare' },
  { key: 'miglioramento', label: 'Miglioramento', hint: 'si faceva già, ora si fa meglio' },
  { key: 'correzione',    label: 'Correzione',   hint: 'faceva la cosa sbagliata' },
  { key: 'rimozione',     label: 'Rimozione',    hint: 'non c\'è più, e va detto' },
  { key: 'sicurezza',     label: 'Sicurezza',    hint: 'chi vede cosa' },
]

export const IMPACTS = ['alto', 'medio', 'basso'] as const
export type Impact = (typeof IMPACTS)[number]

/** Conta le voci per tipo: è l'unica sintesi onesta di una release. */
export function countByKind<T extends { kind: ChangeKind }>(changes: T[]): Record<ChangeKind, number> {
  const out: Record<ChangeKind, number> = { novita: 0, miglioramento: 0, correzione: 0, rimozione: 0, sicurezza: 0 }
  for (const c of changes) out[c.kind] = (out[c.kind] ?? 0) + 1
  return out
}
