/**
 * §345 — La geometria della barra di navigazione del calendario.
 *
 * Sta qui, e non dentro il componente, perché è l'unica parte della barra che
 * si può **sbagliare in silenzio**: un cursore che si stacca dal dito, o che
 * arriva in fondo alla pista mentre il calendario ha ancora tre giorni da
 * mostrare, non solleva nessun errore — si vede solo trascinandolo, ed è
 * esattamente la prova che nessuno rifà. Qui si prova senza browser:
 * `npx tsx lib/gantt-scroll.check.ts`.
 *
 * Le tre misure che contano, e la relazione che le lega:
 *
 *   - **la corsa del cursore** è `pista − larghezza del cursore`, non la pista;
 *   - **la corsa del calendario** è `totale − finestra`, non il totale;
 *   - il rapporto fra le due è il moltiplicatore del trascinamento. Usare
 *     `totale / pista` sembra equivalente — e lo è finché il cursore resta
 *     proporzionale — ma sotto la larghezza minima le due misure divergono e il
 *     calendario scorre più in fretta della mano.
 */

/** Sotto questa larghezza il cursore non si afferra più. */
export const MIN_THUMB = 28

export type ThumbGeom = {
  /** larghezza del cursore, in pixel di pista */
  w: number
  /** quanti pixel di pista può percorrere il cursore */
  travel: number
  /** quanti pixel può scorrere il calendario */
  max: number
}

export function thumbGeometry(
  view: number, total: number, trackW: number, minThumb = MIN_THUMB,
): ThumbGeom {
  const safeTotal = Math.max(1, total)
  const w = Math.min(trackW, Math.max(minThumb, (view / safeTotal) * trackW))
  return {
    w,
    /* Mai zero: è un divisore. Una pista più stretta del cursore minimo non è
       una barra usabile, ma non deve produrre un infinito. */
    travel: Math.max(1, trackW - w),
    max: Math.max(1, total - view),
  }
}

/** Dove sta il cursore, in pixel dalla sinistra della pista. */
export function thumbOffset(scrollLeft: number, g: ThumbGeom): number {
  return clamp(scrollLeft / g.max, 0, 1) * g.travel
}

/** Quanto si è avanzati, da 0 a 100: è il valore che legge uno screen reader. */
export function scrolledPercent(scrollLeft: number, g: ThumbGeom): number {
  return Math.round(clamp(scrollLeft / g.max, 0, 1) * 100)
}

/**
 * Trascinamento: dallo scorrimento di partenza e dai pixel percorsi dal
 * puntatore al nuovo scorrimento. Non si somma allo scorrimento corrente ma si
 * riparte sempre da quello di partenza: così trascinare oltre il bordo e poi
 * tornare indietro rimette il cursore sotto il dito, invece di accumulare uno
 * sfasamento a ogni frame.
 */
export function scrollFromDrag(startLeft: number, dx: number, g: ThumbGeom): number {
  return clamp(startLeft + dx * (g.max / g.travel), 0, g.max)
}

/**
 * Clic sulla pista: la finestra si sposta **centrata** sul punto premuto, che è
 * quello che si vuole guardare. Una barra che invece salta di una schermata
 * costringe a più clic per arrivare dove si sta già indicando.
 */
export function scrollFromTrack(fraction: number, view: number, total: number): number {
  return clamp(clamp(fraction, 0, 1) * total - view / 2, 0, Math.max(1, total - view))
}

/** Un passo di freccia: quasi una schermata, non tutta — un pezzo in comune fra
    la vista di prima e quella dopo dice dove si è finiti. */
export function stepOf(view: number): number {
  return Math.max(160, view * 0.8)
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}
