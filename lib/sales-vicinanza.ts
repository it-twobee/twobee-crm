/**
 * §463 — quanto un lead è vicino a diventare cliente, per l'indicatore in riga.
 *
 * Due cose sole, scelte apposta (decisione 2026-10-02): **la fase** dà il
 * livello di base e **la recenza** lo abbassa. Tentativi, qualifica e priorità
 * non entrano: ognuno è già scritto in riga, e un numero che mescola cinque
 * segnali non dice più da cosa dipende.
 *
 * - base: la posizione della fase nel percorso vivo (ingresso + trattative
 *   vive, nell'ordine dichiarato), da 8 a 88. Il codice non nomina nessuna fase:
 *   chiede il ruolo (§424), quindi rinominare o aggiungere una fase non lo rompe;
 * - recenza: fino a 7 giorni dall'ultimo contatto non cambia niente; da lì
 *   scende in modo lineare fino a **metà** del livello a 45 giorni. Un lead mai
 *   sentito conta dall'arrivo;
 * - Cliente acquisito: 100, senza decadimento. Perso: 0, grigio. Pending: in
 *   pausa, grigio, a un livello fisso — non si sa a che punto era (una fase
 *   cambiata a mano non lascia traccia), e inventarlo sarebbe un numero
 *   plausibile e sbagliato.
 */
import { attive, faseDi, type Fase } from './sales-stages'
import { giorniFa } from './sales-timeline'

export type Vicinanza = {
  livello: number
  tono: 'vivo' | 'vinto' | 'perso' | 'fermo'
  giorniFermo: number | null
  /** §465 — come si arriva al numero, perché un cruscotto che non si spiega non si crede */
  faseEtichetta: string
  base: number
  /** quanto della base resta dopo la recenza, 0–1 */
  fattore: number
  /** la fase dopo questa nel percorso, o null se è l'ultima */
  prossima: string | null
}

const MIN = 8, MAX = 88
const SOGLIA_GIORNI = 7, TETTO_GIORNI = 45, FATTORE_MINIMO = 0.5
export const LIVELLO_FERMO = 40

export function fattoreRecenza(giorni: number | null): number {
  if (giorni === null || giorni <= SOGLIA_GIORNI) return 1
  if (giorni >= TETTO_GIORNI) return FATTORE_MINIMO
  return 1 - (1 - FATTORE_MINIMO) * (giorni - SOGLIA_GIORNI) / (TETTO_GIORNI - SOGLIA_GIORNI)
}

export function vicinanza(i: {
  fasi: Fase[]; stage: string; ultimoContatto: string | null; arrivo: string | null; adessoMs: number
}): Vicinanza | null {
  const f = faseDi(i.fasi, i.stage)
  if (!f) return null
  const chiusa = { giorniFermo: null, faseEtichetta: f.etichetta, fattore: 1, prossima: null }
  if (f.ruolo === 'vinto') return { ...chiusa, livello: 100, base: 100, tono: 'vinto' }
  if (f.ruolo === 'perso') return { ...chiusa, livello: 0, base: 0, tono: 'perso' }
  if (f.ruolo === 'sospeso') return { ...chiusa, livello: LIVELLO_FERMO, base: LIVELLO_FERMO, tono: 'fermo' }

  const percorso = attive(i.fasi).filter(x => x.ruolo === 'nuovo' || x.ruolo === 'in_corso')
  const idx = Math.max(0, percorso.findIndex(x => x.chiave === f.chiave))
  const base = percorso.length > 1 ? MIN + (idx / (percorso.length - 1)) * (MAX - MIN) : MIN
  const giorni = giorniFa(i.ultimoContatto ?? i.arrivo, i.adessoMs)
  const fattore = fattoreRecenza(giorni)
  return {
    livello: Math.round(base * fattore), tono: 'vivo', giorniFermo: giorni,
    faseEtichetta: f.etichetta, base: Math.round(base), fattore, prossima: percorso[idx + 1]?.etichetta ?? null,
  }
}

/** rosso → giallo → verde sui token del tema: mai un hex, o il tema chiaro si rompe */
export function coloreLivello(livello: number): string {
  const p = Math.max(0, Math.min(100, livello))
  return p < 50
    ? `color-mix(in srgb, var(--color-warning) ${Math.round(p * 2)}%, var(--color-error))`
    : `color-mix(in srgb, var(--color-success) ${Math.round((p - 50) * 2)}%, var(--color-warning))`
}
