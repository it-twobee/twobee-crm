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

/**
 * §436 — le regole di un elenco di voci, qualunque sia: motivi del perso,
 * priorità, membership. `chiave` è il vincolo sul formato della chiave, che per
 * i motivi c'è (258) e per priorità e membership no — lì le chiavi sono i valori
 * che i lead avevano già, `High` e `Not Member` compresi.
 */
export function problemiElenco(voci: Motivo[], opz: { perche: string; chiave?: RegExp }): string[] {
  const out: string[] = []
  if (!voci.some(m => m.attivo)) out.push(`Serve almeno una voce in uso: ${opz.perche}`)
  const chiavi = new Map<string, number>()
  const nomi = new Map<string, string[]>()
  for (const m of voci) {
    const e = m.etichetta.trim()
    if (!e) out.push('C\'è una voce senza nome.')
    else if (e.length > MAX_ETICHETTA) out.push(`«${e.slice(0, 20)}…» è troppo lungo: al massimo ${MAX_ETICHETTA} caratteri.`)
    if (opz.chiave ? !opz.chiave.test(m.chiave) : !m.chiave.trim() || m.chiave.length > MAX_ETICHETTA) {
      out.push(`«${e || m.chiave}» ha una chiave non valida.`)
    }
    chiavi.set(m.chiave, (chiavi.get(m.chiave) ?? 0) + 1)
    if (e) {
      const k = e.toLowerCase()
      nomi.set(k, [...(nomi.get(k) ?? []), e])
    }
  }
  for (const [k, n] of Array.from(chiavi.entries())) if (n > 1) out.push(`La chiave «${k}» compare ${n} volte.`)
  /* Due voci con lo stesso nome dividono in due la stessa risposta, e i
     conteggi le mostrerebbero come due cose diverse. */
  for (const [, v] of Array.from(nomi.entries())) if (v.length > 1) out.push(`«${v[0]}» compare due volte: tienine uno.`)
  return out
}

/** le cose che non stanno in piedi, in parole: vuoto vuol dire che si può salvare */
export const problemiMotivi = (motivi: Motivo[]) =>
  problemiElenco(motivi, { perche: 'senza, un lead perso non si può chiudere con un perché.', chiave: CHIAVE_MOTIVO })

/** l'ordine a decine, come le fasi: lascia spazio per inserire senza rinumerare tutto */
export const rinumera = (motivi: Motivo[]): Motivo[] => motivi.map((m, i) => ({ ...m, ordine: (i + 1) * 10 }))
