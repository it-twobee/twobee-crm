/**
 * §461 — le regole con cui un'interazione sposta la fase del lead.
 *
 * Il **motore sta nel database** (`sales_fase_attesa`, nel trigger sul diario):
 * qui ci sono solo la forma delle regole e i controlli che valgono sia nel
 * pannello di Configurazione sia nell'azione che salva. Non c'è una seconda
 * copia della decisione «che fase segue questa interazione»: sarebbe la regola
 * scritta due volte, e la seconda sarebbe sempre quella che non si aggiorna.
 */
import type { Fase } from './sales-stages'

export type RegolaStato = {
  /** `tipo:esito`, `tipo:verso` o `tipo:-` — la combinazione che il diario sa produrre */
  chiave: string
  etichetta: string
  /** null = quell'interazione non sposta niente */
  fase: string | null
  /** manda una notifica ai super admin quando la fase cambia per questa regola */
  avvisa: boolean
  ordine: number
}

/** le fasi in cui un'interazione può portare un lead: solo trattative vive.
 *  Mai la porta d'ingresso (un lead non torna «nuovo» perché l'hai chiamato) e
 *  mai le uscite — Perso, Cliente acquisito e Pending li decide una persona. */
export const fasiDiArrivo = (fasi: Fase[]): Fase[] =>
  fasi.filter(f => f.attiva && f.ruolo === 'in_corso').sort((a, b) => a.ordine - b.ordine)

export function problemiRegole(regole: RegolaStato[], fasi: Fase[], chiaviNote: string[]): string[] {
  const ammesse = new Set(fasiDiArrivo(fasi).map(f => f.chiave))
  const note = new Set(chiaviNote)
  const problemi: string[] = []
  const viste = new Set<string>()
  for (const r of regole) {
    if (!note.has(r.chiave)) problemi.push(`«${r.chiave}» non è una regola che esiste.`)
    if (viste.has(r.chiave)) problemi.push(`«${r.etichetta}» compare due volte.`)
    viste.add(r.chiave)
    if (r.fase !== null && !ammesse.has(r.fase)) {
      problemi.push(`«${r.etichetta}»: la fase di arrivo deve essere una trattativa viva (non l'ingresso, non una chiusura).`)
    }
    if (r.avvisa && r.fase === null) problemi.push(`«${r.etichetta}»: senza fase non c'è un cambio da notificare.`)
  }
  return problemi
}
