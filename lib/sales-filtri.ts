/**
 * §376 — ordinare e filtrare i lead, su tutte le variabili.
 *
 * Sta in un modulo puro e non dentro il componente perché l'ordinamento è la
 * cosa che sbaglia in silenzio: una data confrontata come stringa funziona
 * per caso finché il formato non cambia, un numero confrontato come testo
 * mette «1.500.000» prima di «900.000», e nessuno dei due errori si vede
 * guardando la pagina — si vede solo quando qualcuno chiama il lead sbagliato
 * perché era in cima. Qui si provano con dei dati, non con gli occhi.
 *
 * **I vuoti stanno sempre in fondo**, in salita come in discesa. È l'unica
 * scelta che regge: ordinare per «ultimo contatto» mettendo davanti chi non
 * è mai stato contattato è vero e inutile, perché la domanda era «chi ho
 * lasciato più indietro», non «di chi non so niente».
 */

import { COLONNE, colonnaDi, type TipoCella } from './sales-table'
import { attive, type Fase } from './sales-stages'

/* L'ordine della pipeline, non l'alfabeto: «In contatto» viene prima di
   «Preventivo inviato» perché viene prima, non perché comincia per I. Si
   costruisce dall'elenco vero a ogni ordinamento: con le fasi configurabili una
   mappa fatta all'import resterebbe quella di quando è partito il server. */
const ordineFase = (fasi: Fase[]) => new Map(attive(fasi).map((f, i) => [f.chiave, i]))

export type Verso = 'su' | 'giu'
export type Riga = Record<string, unknown>

/** su cosa si può ordinare: tutto, tranne quello che non ha un ordine */
export const ORDINABILI = COLONNE.filter(c => c.tipo !== 'etichette' && c.campo !== 'owners')

/**
 * Il valore da confrontare, portato al tipo giusto.
 *
 * `null` vuol dire «vuoto» e finisce in fondo: non è zero e non è stringa
 * vuota, che si ordinerebbero come valori veri.
 */
function chiave(fasi: Fase[], v: unknown, tipo: TipoCella): number | string | null {
  if (v === null || v === undefined || v === '') return null
  if (tipo === 'fase') return ordineFase(fasi).get(String(v)) ?? null
  if (tipo === 'numero') { const n = Number(v); return Number.isFinite(n) ? n : null }
  if (tipo === 'data' || tipo === 'sola_lettura') {
    const t = Date.parse(String(v))
    return Number.isFinite(t) ? t : String(v).toLowerCase()
  }
  if (tipo === 'si_no') return v ? 1 : 0
  if (tipo === 'scelta') return ORDINE_SCELTA.get(String(v)) ?? String(v).toLowerCase()
  return String(v).toLowerCase()
}



/* `High` prima di `Low` non è alfabetico: una priorità si ordina per urgenza,
   o l'ordinamento risponde a una domanda che nessuno ha fatto. */
const ORDINE_SCELTA = new Map<string, number>([
  ['High', 0], ['Medium', 1], ['Low', 2],
  ['Member', 0], ['Potential', 1], ['Not Member', 2],
])

export function confronta(fasi: Fase[], a: Riga, b: Riga, campo: string, verso: Verso): number {
  const tipo = colonnaDi(campo)?.tipo ?? 'testo'
  const x = chiave(fasi, a[campo], tipo)
  const y = chiave(fasi, b[campo], tipo)
  // i vuoti in fondo in entrambi i versi: chi non ha il dato non è «il primo»
  if (x === null && y === null) return 0
  if (x === null) return 1
  if (y === null) return -1
  const segno = verso === 'su' ? 1 : -1
  if (typeof x === 'number' && typeof y === 'number') return (x - y) * segno
  return String(x).localeCompare(String(y), 'it') * segno
}

export const ordina = (fasi: Fase[], righe: Riga[], campo: string, verso: Verso): Riga[] =>
  [...righe].sort((a, b) => confronta(fasi, a, b, campo, verso))

// ── i filtri ────────────────────────────────────────────────────────────────

/**
 * Le variabili su cui si filtra a scelta multipla: quelle con un vocabolario
 * chiuso o comunque corto. Il testo libero si cerca, non si filtra — un menu
 * con cinquantacinque nomi di azienda è un menu che nessuno apre.
 */
export const FILTRABILI: { campo: string; etichetta: string; da?: string }[] = [
  { campo: 'stage', etichetta: 'Fase' },
  { campo: 'priority', etichetta: 'Priorità' },
  { campo: 'membership', etichetta: 'Membership' },
  { campo: 'source', etichetta: 'Fonte' },
  { campo: 'referral', etichetta: 'Referral' },
  { campo: 'tags', etichetta: 'Tag' },
  { campo: 'services', etichetta: 'Servizi' },
  { campo: 'piattaforma', etichetta: 'Piattaforma', da: 'lead_origine' },
  { campo: 'campagna', etichetta: 'Campagna', da: 'lead_origine' },
  { campo: 'tipologia', etichetta: 'Tipo attività', da: 'lead_origine' },
  { campo: 'tempistica', etichetta: 'Quando vuole partire', da: 'lead_origine' },
]

/** i valori che una riga ha per quella variabile: zero, uno o molti (i tag) */
export function valoriDi(r: Riga, f: { campo: string; da?: string }): string[] {
  const grezzo = f.da ? (r[f.da] as Record<string, unknown> | null)?.[f.campo] : r[f.campo]
  if (grezzo === null || grezzo === undefined || grezzo === '') return []
  if (Array.isArray(grezzo)) return grezzo.map(String).filter(Boolean)
  return [String(grezzo)]
}

/** i valori presenti, col conteggio: si offre solo quello che esiste davvero */
export function opzioni(righe: Riga[], f: { campo: string; da?: string }): { valore: string; quante: number }[] {
  const conta = new Map<string, number>()
  for (const r of righe) for (const v of valoriDi(r, f)) conta.set(v, (conta.get(v) ?? 0) + 1)
  return Array.from(conta.entries())
    .map(([valore, quante]) => ({ valore, quante }))
    .sort((a, b) => b.quante - a.quante || a.valore.localeCompare(b.valore, 'it'))
}

export type Scelte = Record<string, string[]>

/**
 * Applica i filtri: **OR dentro una variabile, AND fra variabili**.
 *
 * È la regola che la gente si aspetta senza saperla dire: «Meta Ads o
 * Referral» dentro Fonte, ma «Fonte *e* Priorità alta» fra le due. L'altra
 * combinazione — AND dentro — darebbe zero risultati ogni volta che si
 * spuntano due valori della stessa cosa, e chi la usa penserebbe che sia rotto.
 */
export function applica(righe: Riga[], scelte: Scelte): Riga[] {
  const attivi = Object.entries(scelte).filter(([, v]) => v.length)
  if (!attivi.length) return righe
  return righe.filter(r => attivi.every(([campo, ammessi]) => {
    const f = FILTRABILI.find(x => x.campo === campo)
    if (!f) return true
    const suoi = valoriDi(r, f)
    return suoi.some(v => ammessi.includes(v))
  }))
}

export const quantiFiltri = (s: Scelte) =>
  Object.values(s).reduce((n, v) => n + v.length, 0)

/** il testo cercato, su tutto quello che è testo: azienda, persone, recapiti, note */
export function cerca(righe: Riga[], q: string): Riga[] {
  const t = q.trim().toLowerCase()
  if (!t) return righe
  const campi = COLONNE
    .filter(c => ['testo', 'lunga', 'email', 'telefono', 'url', 'etichette'].includes(c.tipo))
    .map(c => c.campo)
  return righe.filter(r => campi.some(c => {
    const v = r[c]
    if (Array.isArray(v)) return v.some(x => String(x).toLowerCase().includes(t))
    return String(v ?? '').toLowerCase().includes(t)
  }))
}
