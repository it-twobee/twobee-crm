/* §486 — L'ordine delle task dentro una milestone. Esegui il gate: npx tsx lib/task-order.check.ts

   Feedback del 21 ottobre 2026: costruendo il processo standard dei social
   serve che certe task stiano prima di altre nel riquadro della milestone,
   «come le playlist di Spotify». Fino a qui l'ordine era quello di creazione,
   e l'unico modo di cambiarlo era ricreare le task.

   `tasks.position` (migration 275) è un numero con i buchi: spostare una task
   ne scrive **una sola** — la sua posizione diventa la media fra le due vicine
   — invece di rinumerare la lista, che riempirebbe la cronologia di righe
   «posizione 3 → 4». Si rinumera tutto solo la prima volta, quando le
   posizioni non ci sono ancora, o quando fra due vicine non c'è più spazio. */

export type Ordinabile = { id: string; position?: number | null; created_at: string }

export const PASSO = 1024

/** La posizione scelta prima; senza, l'ordine di creazione — una task nuova va in fondo. */
export function ordinaTask<T extends Ordinabile>(list: T[]): T[] {
  return list.slice().sort((a, b) => {
    const pa = a.position ?? null
    const pb = b.position ?? null
    if (pa !== null && pb !== null && pa !== pb) return pa - pb
    if (pa !== null && pb === null) return -1
    if (pa === null && pb !== null) return 1
    return a.created_at.localeCompare(b.created_at)
  })
}

export function sposta<T>(list: T[], da: number, a: number): T[] {
  const out = list.slice()
  const [x] = out.splice(da, 1)
  out.splice(a, 0, x)
  return out
}

const rinumera = (list: Ordinabile[]) => list.map((t, i) => ({ id: t.id, position: (i + 1) * PASSO }))

/**
 * Le posizioni da scrivere per portare la task all'indice `da` all'indice `a`
 * di una lista già ordinata con `ordinaTask`. Torna solo le righe che cambiano.
 */
export function nuovePosizioni(list: Ordinabile[], da: number, a: number): { id: string; position: number }[] {
  if (da === a || da < 0 || a < 0 || da >= list.length || a >= list.length) return []
  const nuova = sposta(list, da, a)
  if (!list.every(t => typeof t.position === 'number' && Number.isFinite(t.position))) return rinumera(nuova)
  const prima = a > 0 ? nuova[a - 1].position as number : null
  const dopo = a < nuova.length - 1 ? nuova[a + 1].position as number : null
  const p = prima === null ? (dopo as number) - PASSO
    : dopo === null ? prima + PASSO
    : (prima + dopo) / 2
  /* dopo una cinquantina di spostamenti nello stesso buco la media coincide
     con una delle due vicine: lì si rinumera, una volta */
  if (p === prima || p === dopo || !Number.isFinite(p)) return rinumera(nuova)
  return [{ id: nuova[a].id, position: p }]
}
