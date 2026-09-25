/**
 * §440 — lo stato dell'elenco dei lead: cosa si cerca, cosa si filtra, come si
 * ordina. Uno solo, e **serializzabile**: vive nell'indirizzo (un link
 * incollato a un collega apre la stessa vista, «indietro» torna al filtro
 * giusto), si ricorda fra una visita e l'altra, e si salva con un nome.
 *
 * Prima erano sette `useState` sparsi nel componente, e al ricarico sparivano.
 * Tre copie dello stesso stato — URL, memoria del browser, vista salvata —
 * sono tre stati diversi a meno che non passino tutte da qui: `scrivi` e
 * `leggi` sono l'unica strada, e `leggi` accetta solo quello che conosce.
 */

import { FILTRABILI, ORDINABILI, applica, cerca, confronta, type Riga, type Scelte, type Verso } from './sales-filtri'
import { ruoloDi, type Fase } from './sales-stages'
import { giornoEOraRoma, istanteRoma } from './sales-timeline'

// ── le date ─────────────────────────────────────────────────────────────────

export const CAMPI_DATA = ['last_interaction_at', 'created_at', 'next_followup_at'] as const
export type CampoData = typeof CAMPI_DATA[number]
export const ETICHETTA_DATA: Record<CampoData, string> = {
  last_interaction_at: 'Ultimo contatto',
  created_at: 'Arrivo',
  next_followup_at: 'Prossimo follow-up',
}

/**
 * Un filtro su una data. Gli intervalli pronti sono quelli che si chiedono
 * davvero; l'intervallo libero è per tutto il resto. `vuoto` è «mai sentito»
 * o «nessun follow-up»: una domanda vera, che senza voce non avrebbe risposta.
 */
export type FiltroData =
  | { tipo: 'oggi' }
  | { tipo: 'ultimi'; giorni: number }
  | { tipo: 'prossimi'; giorni: number }
  | { tipo: 'piu_vecchio'; giorni: number }
  | { tipo: 'scaduto' }
  | { tipo: 'vuoto' }
  | { tipo: 'intervallo'; dal: string | null; al: string | null }

/** i pronti, per campo: «prossimi 7 giorni» non ha senso sull'arrivo */
export const PRONTI: Record<CampoData, { etichetta: string; filtro: FiltroData }[]> = {
  last_interaction_at: [
    { etichetta: 'Oggi', filtro: { tipo: 'oggi' } },
    { etichetta: 'Ultimi 7 giorni', filtro: { tipo: 'ultimi', giorni: 7 } },
    { etichetta: 'Ultimi 30 giorni', filtro: { tipo: 'ultimi', giorni: 30 } },
    { etichetta: 'Più di 7 giorni fa', filtro: { tipo: 'piu_vecchio', giorni: 7 } },
    { etichetta: 'Più di 14 giorni fa', filtro: { tipo: 'piu_vecchio', giorni: 14 } },
    { etichetta: 'Più di 30 giorni fa', filtro: { tipo: 'piu_vecchio', giorni: 30 } },
    { etichetta: 'Mai sentito', filtro: { tipo: 'vuoto' } },
  ],
  created_at: [
    { etichetta: 'Oggi', filtro: { tipo: 'oggi' } },
    { etichetta: 'Ultimi 7 giorni', filtro: { tipo: 'ultimi', giorni: 7 } },
    { etichetta: 'Ultimi 30 giorni', filtro: { tipo: 'ultimi', giorni: 30 } },
    { etichetta: 'Più di 30 giorni fa', filtro: { tipo: 'piu_vecchio', giorni: 30 } },
  ],
  next_followup_at: [
    { etichetta: 'Scaduto', filtro: { tipo: 'scaduto' } },
    { etichetta: 'Oggi', filtro: { tipo: 'oggi' } },
    { etichetta: 'Prossimi 7 giorni', filtro: { tipo: 'prossimi', giorni: 7 } },
    { etichetta: 'Nessuno in programma', filtro: { tipo: 'vuoto' } },
  ],
}

const GIORNO = 86_400_000
const inizioGiorno = (giorno: string) => Date.parse(istanteRoma(giorno, '00:00') ?? `${giorno}T00:00:00Z`)
const dopo = (giorno: string, n: number) => new Date(Date.parse(`${giorno}T12:00:00Z`) + n * GIORNO).toISOString().slice(0, 10)

/** vale per quel valore? Tutto contato sui giorni di Roma */
export function dentroData(v: unknown, f: FiltroData, adessoMs: number): boolean {
  const ms = typeof v === 'string' && v ? Date.parse(v) : NaN
  if (f.tipo === 'vuoto') return !Number.isFinite(ms)
  if (!Number.isFinite(ms)) return false
  const oggi = giornoEOraRoma(adessoMs).giorno
  const da0 = inizioGiorno(oggi)
  switch (f.tipo) {
    case 'oggi': return ms >= da0 && ms < inizioGiorno(dopo(oggi, 1))
    case 'ultimi': return ms >= inizioGiorno(dopo(oggi, -(f.giorni - 1))) && ms <= adessoMs + 5 * 60_000
    case 'prossimi': return ms >= adessoMs && ms < inizioGiorno(dopo(oggi, f.giorni + 1))
    case 'piu_vecchio': return ms < inizioGiorno(dopo(oggi, -f.giorni + 1))
    case 'scaduto': return ms < adessoMs
    case 'intervallo':
      return (!f.dal || ms >= inizioGiorno(f.dal)) && (!f.al || ms < inizioGiorno(dopo(f.al, 1)))
  }
}

const dataIt = (g: string) => `${g.slice(8)}/${g.slice(5, 7)}/${g.slice(0, 4)}`
export function etichettaFiltroData(campo: CampoData, f: FiltroData): string {
  const pronto = PRONTI[campo].find(p => JSON.stringify(p.filtro) === JSON.stringify(f))
  if (pronto) return pronto.etichetta
  if (f.tipo === 'intervallo') {
    if (f.dal && f.al) return f.dal === f.al ? dataIt(f.dal) : `${dataIt(f.dal)} – ${dataIt(f.al)}`
    if (f.dal) return `dal ${dataIt(f.dal)}`
    if (f.al) return `fino al ${dataIt(f.al)}`
    return 'qualunque'
  }
  if (f.tipo === 'ultimi') return `Ultimi ${f.giorni} giorni`
  if (f.tipo === 'prossimi') return `Prossimi ${f.giorni} giorni`
  if (f.tipo === 'piu_vecchio') return `Più di ${f.giorni} giorni fa`
  return f.tipo
}

// ── le viste rapide ─────────────────────────────────────────────────────────

export const RAPIDE = ['miei', 'richiamare', 'fermi'] as const
export type Rapida = typeof RAPIDE[number]
export const ETICHETTA_RAPIDA: Record<Rapida, string> = {
  miei: 'Miei',
  richiamare: 'Da richiamare',
  fermi: 'Fermi da più di 7 giorni',
}
export const FERMO_DOPO = 7

const aperto = (fasi: Fase[], r: Riga) => { const ruolo = ruoloDi(fasi, String(r.stage ?? '')); return ruolo !== 'vinto' && ruolo !== 'perso' }
/** fermo: aperto, e l'ultimo contatto — o l'arrivo, se nessuno l'ha mai sentito — è più vecchio di sette giorni */
const fermo = (fasi: Fase[], r: Riga, adessoMs: number) =>
  aperto(fasi, r) && dentroData(r.last_interaction_at ?? r.created_at, { tipo: 'piu_vecchio', giorni: FERMO_DOPO }, adessoMs)

export function inRapida(q: Rapida, r: Riga, ctx: { fasi: Fase[]; io: string; adessoMs: number }): boolean {
  switch (q) {
    case 'miei': return Array.isArray(r.owners) && (r.owners as string[]).includes(ctx.io)
    /* chi ha un follow-up scaduto o di oggi, più chi è fermo senza niente in
       programma: quello con un follow-up già fissato la settimana prossima
       non è da richiamare, è già in agenda */
    case 'richiamare': {
      if (!aperto(ctx.fasi, r)) return false
      const f = r.next_followup_at
      if (f) return dentroData(f, { tipo: 'scaduto' }, ctx.adessoMs) || dentroData(f, { tipo: 'oggi' }, ctx.adessoMs)
      return fermo(ctx.fasi, r, ctx.adessoMs)
    }
    case 'fermi': return fermo(ctx.fasi, r, ctx.adessoMs)
  }
}

// ── lo stato intero ─────────────────────────────────────────────────────────

export type Criterio = { campo: string; verso: Verso }

export type StatoElenco = {
  q: string
  gruppo: string
  rapida: Rapida | null
  scelte: Scelte
  date: Partial<Record<CampoData, FiltroData>>
  /** uno o due criteri: «per fase, poi per ultimo contatto» */
  ordine: Criterio[]
}

export const ORDINE_BASE: Criterio[] = [{ campo: 'created_at', verso: 'giu' }]
export const VUOTO: StatoElenco = { q: '', gruppo: 'tutti', rapida: null, scelte: {}, date: {}, ordine: ORDINE_BASE }

/** i campi su cui si ordina: le colonne, più il prossimo follow-up che una colonna non è */
export const CRITERI: { campo: string; etichetta: string }[] = [
  { campo: 'last_interaction_at', etichetta: 'Ultimo contatto' },
  { campo: 'next_followup_at', etichetta: 'Prossimo follow-up' },
  { campo: 'created_at', etichetta: 'Arrivo' },
  { campo: 'stage', etichetta: 'Fase' },
  { campo: 'company_name', etichetta: 'Azienda' },
  { campo: 'priority', etichetta: 'Priorità' },
  { campo: 'tentativi', etichetta: 'Tentativi' },
  ...ORDINABILI
    .filter(c => !['last_interaction_at', 'created_at', 'stage', 'company_name', 'priority', 'tentativi'].includes(c.campo))
    .map(c => ({ campo: c.campo, etichetta: c.etichetta })),
]
/** i primi, che si mostrano senza cercare: gli altri stanno sotto «altri campi» */
export const CRITERI_FREQUENTI = 5

export const quantiAttivi = (s: StatoElenco) =>
  Object.values(s.scelte).filter(v => v.length).length + Object.keys(s.date).length + (s.rapida ? 1 : 0)

/** cercare, filtrare, ordinare. Il gruppo di fasi è un filtro fra gli altri */
export function applicaStato(righe: Riga[], s: StatoElenco, ctx: {
  fasi: Fase[]; io: string; adessoMs: number
  ordini?: Record<string, string[]>
  /** il gruppo della fase di una riga: lo sa il componente, che ha le fasi con i loro gruppi */
  gruppoDi?: (r: Riga) => string | null
}, opzioni: { senzaGruppo?: boolean } = {}): Riga[] {
  let out = cerca(righe, s.q)
  if (s.gruppo !== 'tutti' && !opzioni.senzaGruppo && ctx.gruppoDi) out = out.filter(r => ctx.gruppoDi!(r) === s.gruppo)
  if (s.rapida) out = out.filter(r => inRapida(s.rapida!, r, ctx))
  out = applica(out, s.scelte)
  for (const [campo, f] of Object.entries(s.date) as [CampoData, FiltroData][]) out = out.filter(r => dentroData(r[campo], f, ctx.adessoMs))
  const criteri = s.ordine.length ? s.ordine : ORDINE_BASE
  return [...out].sort((a, b) => {
    for (const c of criteri) {
      const d = confronta(ctx.fasi, a, b, c.campo, c.verso, ctx.ordini ?? {})
      if (d) return d
    }
    return 0
  })
}

// ── nell'indirizzo ──────────────────────────────────────────────────────────

const giornoOk = (g: string | null | undefined) => !!g && /^\d{4}-\d{2}-\d{2}$/.test(g) && Number.isFinite(Date.parse(g))
const ABBREV: Record<CampoData, string> = { last_interaction_at: 'contatto', created_at: 'arrivo', next_followup_at: 'followup' }

function dataInTesto(f: FiltroData): string {
  switch (f.tipo) {
    case 'oggi': case 'scaduto': case 'vuoto': return f.tipo
    case 'ultimi': case 'prossimi': case 'piu_vecchio': return `${f.tipo}:${f.giorni}`
    case 'intervallo': return `${f.dal ?? ''}..${f.al ?? ''}`
  }
}
function dataDaTesto(t: string): FiltroData | null {
  if (t === 'oggi' || t === 'scaduto' || t === 'vuoto') return { tipo: t }
  const m = /^(ultimi|prossimi|piu_vecchio):(\d{1,3})$/.exec(t)
  if (m) { const g = Number(m[2]); return g >= 1 && g <= 365 ? { tipo: m[1] as 'ultimi', giorni: g } : null }
  const i = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/.exec(t)
  if (i && (i[1] || i[2])) {
    const dal = i[1] && giornoOk(i[1]) ? i[1] : null, al = i[2] && giornoOk(i[2]) ? i[2] : null
    if (!dal && !al) return null
    return dal && al && al < dal ? { tipo: 'intervallo', dal: al, al: dal } : { tipo: 'intervallo', dal, al }
  }
  return null
}

/** lo stato come query: solo quello che differisce dal vuoto, così l'indirizzo resta corto */
export function scrivi(s: StatoElenco): string {
  const p = new URLSearchParams()
  if (s.q.trim()) p.set('q', s.q.trim())
  if (s.gruppo !== 'tutti') p.set('gruppo', s.gruppo)
  if (s.rapida) p.set('vista', s.rapida)
  for (const f of FILTRABILI) { const v = s.scelte[f.campo]; if (v?.length) p.set(`f.${f.campo}`, v.join('|')) }
  for (const c of CAMPI_DATA) { const f = s.date[c]; if (f) p.set(`d.${ABBREV[c]}`, dataInTesto(f)) }
  const ordine = s.ordine.map(c => `${c.campo}:${c.verso}`).join(',')
  if (ordine !== ORDINE_BASE.map(c => `${c.campo}:${c.verso}`).join(',')) p.set('ordine', ordine)
  return p.toString()
}

/**
 * Dall'indirizzo allo stato, **accettando solo quello che si conosce**: un
 * link si scrive a mano e si incolla male, e un campo inventato non deve
 * diventare un filtro che esclude tutto senza dire perché.
 */
export function leggi(query: string | URLSearchParams, gruppiAmmessi: readonly string[]): StatoElenco {
  const p = typeof query === 'string' ? new URLSearchParams(query) : query
  const s: StatoElenco = { ...VUOTO, scelte: {}, date: {}, ordine: [...ORDINE_BASE] }
  s.q = (p.get('q') ?? '').slice(0, 200)
  const g = p.get('gruppo'); if (g && gruppiAmmessi.includes(g)) s.gruppo = g
  const v = p.get('vista'); if (v && (RAPIDE as readonly string[]).includes(v)) s.rapida = v as Rapida
  for (const f of FILTRABILI) {
    const x = p.get(`f.${f.campo}`)
    if (x) s.scelte[f.campo] = Array.from(new Set(x.split('|').map(y => y.trim()).filter(Boolean))).slice(0, 50)
  }
  for (const c of CAMPI_DATA) {
    const x = p.get(`d.${ABBREV[c]}`)
    const f = x ? dataDaTesto(x) : null
    if (f && (f.tipo !== 'prossimi' || c === 'next_followup_at') && (f.tipo !== 'scaduto' || c === 'next_followup_at')) s.date[c] = f
  }
  const o = p.get('ordine')
  if (o) {
    const campi = new Set(CRITERI.map(c => c.campo))
    const criteri = o.split(',').map(x => x.split(':')).filter(([c, v]) => campi.has(c) && (v === 'su' || v === 'giu'))
      .map(([campo, verso]) => ({ campo, verso: verso as Verso }))
      .filter((c, i, a) => a.findIndex(y => y.campo === c.campo) === i).slice(0, 2)
    if (criteri.length) s.ordine = criteri
  }
  return s
}

/** le chiavi dell'indirizzo che sono nostre: le altre (`?lead=`) si lasciano stare */
export const eNostra = (k: string) => ['q', 'gruppo', 'vista', 'ordine'].includes(k) || k.startsWith('f.') || k.startsWith('d.')
