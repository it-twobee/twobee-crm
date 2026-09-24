/**
 * §435 — i motivi del perso, come elenco che si governa.
 *
 * Dalla 258 sono una tabella (`sales_motivi_perso`) e il menu della scheda li
 * legge da lì, ma non c'era un modo di cambiarli se non dal SQL Editor. Le
 * regole stanno qui, pure, perché le chiamano in tre — la schermata mentre si
 * scrive, l'azione prima di salvare, il gate — e tre copie della stessa regola
 * sono tre regole diverse (§425).
 *
 * **Un motivo usato non si elimina, si ritira.** Qui la differenza con le fasi
 * è più pericolosa: la chiave esterna dei motivi è `ON DELETE SET NULL`, quindi
 * eliminarne uno non darebbe nessun errore — svuoterebbe il motivo su tutti i
 * persi che lo avevano, in silenzio, e i numeri «perché perdiamo» cambierebbero
 * senza che nessuno li abbia toccati. Il blocco sta nell'azione, che conta
 * prima di cancellare.
 *
 * Gate: `npx tsx lib/sales-motivi.check.ts`.
 */

export type Motivo = { chiave: string; etichetta: string; ordine: number; attivo: boolean }

export const CHIAVE_MOTIVO = /^[a-z][a-z0-9_]{1,40}$/
export const MAX_ETICHETTA = 40

/** «Ha scelto un concorrente» → `ha_scelto_un_concorrente`, unica fra le esistenti */
export function chiaveDa(etichetta: string, esistenti: string[]): string {
  const base = etichetta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'm_$1').slice(0, 36)
  const radice = base.length >= 2 ? base : 'motivo'
  if (!esistenti.includes(radice)) return radice
  for (let n = 2; ; n++) if (!esistenti.includes(`${radice}_${n}`)) return `${radice}_${n}`
}

/** le cose che non stanno in piedi, in parole: vuoto vuol dire che si può salvare */
export function problemiMotivi(motivi: Motivo[]): string[] {
  const out: string[] = []
  if (!motivi.some(m => m.attivo)) out.push('Serve almeno un motivo in uso: senza, un lead perso non si può chiudere con un perché.')
  const chiavi = new Map<string, number>()
  const nomi = new Map<string, string[]>()
  for (const m of motivi) {
    const e = m.etichetta.trim()
    if (!e) out.push('C\'è un motivo senza nome.')
    else if (e.length > MAX_ETICHETTA) out.push(`«${e.slice(0, 20)}…» è troppo lungo: al massimo ${MAX_ETICHETTA} caratteri.`)
    if (!CHIAVE_MOTIVO.test(m.chiave)) out.push(`«${e || m.chiave}» ha una chiave non valida.`)
    chiavi.set(m.chiave, (chiavi.get(m.chiave) ?? 0) + 1)
    if (e) {
      const k = e.toLowerCase()
      nomi.set(k, [...(nomi.get(k) ?? []), e])
    }
  }
  for (const [k, n] of Array.from(chiavi.entries())) if (n > 1) out.push(`La chiave «${k}» compare ${n} volte.`)
  /* Due motivi con lo stesso nome dividono in due la stessa risposta, e il
     conteggio «perché perdiamo» li mostrerebbe come due cause diverse. */
  for (const [, v] of Array.from(nomi.entries())) if (v.length > 1) out.push(`«${v[0]}» compare due volte: tienine uno.`)
  return out
}

/** l'ordine a decine, come le fasi: lascia spazio per inserire senza rinumerare tutto */
export const rinumera = (motivi: Motivo[]): Motivo[] => motivi.map((m, i) => ({ ...m, ordine: (i + 1) * 10 }))
