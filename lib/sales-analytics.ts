/**
 * §372 — i numeri del commerciale, per decidere dove spendere il prossimo euro.
 *
 * Non è un cruscotto: è la risposta a **una** domanda — *cosa converte?* — e
 * tutto quello che non serve a rispondere resta fuori. Un pannello con dodici
 * grafici si guarda una volta; tre numeri che dicono quale campagna porta
 * clienti si guardano prima di ogni riunione.
 *
 * **Il tasso di conversione ha un denominatore, e va dichiarato.** Qui è
 * `Active Client / tutti quelli che hanno finito il percorso`, dove «finito»
 * vuol dire vinto o perso. Contare anche chi è ancora in trattativa
 * abbasserebbe il tasso di una quota che non è una sconfitta ma un'attesa, e
 * farebbe sembrare peggiore una campagna aperta da tre giorni rispetto a una
 * chiusa da sei mesi. Le righe ancora aperte si contano a parte, perché sono
 * la cosa su cui si può ancora agire.
 *
 * **Sotto una certa soglia un tasso non è un tasso.** Una campagna con due
 * lead e un cliente non converte al cinquanta per cento: ha portato un
 * cliente. `affidabile` dice quando il numero regge, e chi lo mostra ha il
 * dovere di dirlo — una percentuale su due righe è il modo più elegante di
 * prendere una decisione sbagliata.
 *
 * Gate: `npx tsx lib/sales-analytics.check.ts`.
 */

import { attive, ruoloDi, type Fase } from './sales-stages'

/** sotto questo numero di righe concluse il tasso si mostra, ma avvisato */
export const SOGLIA_AFFIDABILITA = 8

export type RigaAnalisi = {
  stage: string
  source?: string | null
  created_at?: string | null
  closed_at?: string | null
  lead_origine?: Record<string, string> | null
  /** §431 — i numeri si leggono anche per persona e per qualifica */
  owners?: string[] | null
  qualifica?: string | null
}

/* §424 — il ruolo, non la chiave. Con le fasi configurabili un
   `stage === 'active_client'` smetterebbe di combaciare il giorno in cui
   qualcuno la rinomina, e un confronto che non combacia non è un errore: è un
   `false` che fa scendere il tasso di conversione a zero senza dirlo. */
const vinta = (fasi: Fase[], stage: string) => ruoloDi(fasi, stage) === 'vinto'
const persa = (fasi: Fase[], stage: string) => ruoloDi(fasi, stage) === 'perso'
const conclusa = (fasi: Fase[], stage: string) => {
  const r = ruoloDi(fasi, stage)
  return r === 'vinto' || r === 'perso'
}

export type Tasso = {
  vinti: number
  persi: number
  /** vinti + persi: il denominatore, scritto perché nessuno lo debba indovinare */
  conclusi: number
  aperti: number
  /** 0..1, oppure null quando non c'è ancora niente di concluso */
  tasso: number | null
  /** il numero regge, o è un aneddoto con una percentuale davanti */
  affidabile: boolean
}

export function tassoDi(fasi: Fase[], righe: RigaAnalisi[]): Tasso {
  const vinti = righe.filter(r => vinta(fasi, r.stage)).length
  const persi = righe.filter(r => persa(fasi, r.stage)).length
  const conclusi = vinti + persi
  return {
    vinti,
    persi,
    conclusi,
    aperti: righe.filter(r => !conclusa(fasi, r.stage)).length,
    tasso: conclusi ? vinti / conclusi : null,
    affidabile: conclusi >= SOGLIA_AFFIDABILITA,
  }
}

// ── l'imbuto ────────────────────────────────────────────────────────────────

export type PassoImbuto = { chiave: string; etichetta: string; quante: number }

/**
 * Quante righe ferme in ogni fase, nell'ordine di Notion.
 *
 * È una **fotografia**, non un imbuto storico: dice dove sono adesso, non
 * quante ne sono passate di lì. Distinzione che conta, perché una fase vuota
 * può voler dire «nessuno ci arriva» oppure «non ci si ferma mai», e sono due
 * problemi opposti. Per il secondo servirebbe lo storico dei passaggi, che non
 * abbiamo: meglio un numero onesto che uno che sembra dire di più.
 */
export function imbuto(fasi: Fase[], righe: RigaAnalisi[]): PassoImbuto[] {
  return attive(fasi).map(f => ({
    chiave: f.chiave,
    etichetta: f.etichetta,
    quante: righe.filter(r => r.stage === f.chiave).length,
  }))
}

// ── per dimensione: da dove arrivano quelli che chiudono ────────────────────

export type Riga = { valore: string; totale: number } & Tasso

/**
 * Raggruppa e calcola, ordinando per **clienti portati** e non per
 * percentuale: una campagna al cento per cento con un cliente sta sotto una
 * al trenta con nove, ed è giusto così — il budget si sposta su quello che
 * porta gente, non su quello che ha la frazione più bella.
 */
export function perDimensione(
  fasi: Fase[],
  righe: RigaAnalisi[],
  /* §431 — anche più valori per riga: un lead seguito da due persone conta
     per tutte e due, perché tutte e due ci hanno lavorato. La somma dei gruppi
     allora supera il totale, e chi mostra la tabella lo deve dire. */
  chiave: (r: RigaAnalisi) => string | string[] | null | undefined,
  etichettaVuoto = 'Non indicato',
): Riga[] {
  const gruppi = new Map<string, RigaAnalisi[]>()
  for (const r of righe) {
    const grezzo = chiave(r)
    const valori = (Array.isArray(grezzo) ? grezzo : [grezzo ?? ''])
      .map(v => String(v ?? '').trim()).filter(Boolean)
    for (const k of Array.from(new Set(valori.length ? valori : [etichettaVuoto]))) {
      const g = gruppi.get(k) ?? []
      g.push(r)
      gruppi.set(k, g)
    }
  }
  return Array.from(gruppi.entries())
    .map(([valore, g]) => ({ valore, totale: g.length, ...tassoDi(fasi, g) }))
    .sort((a, b) => b.vinti - a.vinti || b.totale - a.totale || a.valore.localeCompare(b.valore))
}

/** una chiave della provenienza Meta: campagna, annuncio, tipologia, tempistica… */
export const daOrigine = (campo: string) => (r: RigaAnalisi) => r.lead_origine?.[campo]

// ── il periodo ──────────────────────────────────────────────────────────────

/**
 * §431 — da quando si contano i lead: per **data di arrivo**, non di chiusura.
 *
 * La domanda è «come stanno andando i lead che abbiamo preso negli ultimi tre
 * mesi», e la risposta deve comprendere anche quelli ancora aperti: filtrare per
 * chiusura terrebbe solo chi ha già finito, e il tasso sembrerebbe migliore di
 * com'è. Il prezzo è dichiarato: un periodo corto ha molti aperti, e il tasso è
 * su pochi conclusi — lo dice `affidabile`.
 *
 * Una riga senza data di arrivo sta fuori da ogni periodo e dentro «tutto»: non
 * sappiamo quando è arrivata, e metterla negli ultimi trenta giorni sarebbe
 * inventarlo.
 */
export const PERIODI = [
  { chiave: 'tutto', etichetta: 'Da sempre', giorni: null },
  { chiave: '30', etichetta: 'Ultimi 30 giorni', giorni: 30 },
  { chiave: '90', etichetta: 'Ultimi 3 mesi', giorni: 90 },
  { chiave: '365', etichetta: 'Ultimo anno', giorni: 365 },
] as const
export type Periodo = (typeof PERIODI)[number]['chiave']

export function nelPeriodo<T extends RigaAnalisi>(righe: T[], periodo: Periodo, oggiMs: number): T[] {
  const giorni = PERIODI.find(p => p.chiave === periodo)?.giorni ?? null
  if (giorni === null) return righe
  const da = oggiMs - giorni * 86_400_000
  return righe.filter(r => {
    const t = r.created_at ? Date.parse(r.created_at) : NaN
    return Number.isFinite(t) && t >= da
  })
}

// ── quanto ci mette ─────────────────────────────────────────────────────────

/**
 * I giorni fra l'arrivo del lead e la chiusura, sulle sole righe vinte.
 *
 * La **mediana** e non la media: un lead firmato dopo otto mesi sposterebbe
 * la media di settimane e farebbe pianificare su un numero che non è successo
 * a nessuno. La mediana dice quanto ci mette il caso normale, che è la
 * domanda vera quando si decide se richiamare adesso o la settimana prossima.
 */
export function giorniPerChiudere(fasi: Fase[], righe: RigaAnalisi[]): { mediana: number | null; campione: number } {
  const giorni = righe
    .filter(r => vinta(fasi, r.stage) && r.created_at && r.closed_at)
    .map(r => Math.round((Date.parse(r.closed_at as string) - Date.parse(r.created_at as string)) / 86_400_000))
    .filter(g => Number.isFinite(g) && g >= 0)
    .sort((a, b) => a - b)
  if (!giorni.length) return { mediana: null, campione: 0 }
  const m = Math.floor(giorni.length / 2)
  return {
    mediana: giorni.length % 2 ? giorni[m] : Math.round((giorni[m - 1] + giorni[m]) / 2),
    campione: giorni.length,
  }
}

/** la percentuale come si scrive, o «n/d» quando non c'è un denominatore (§ invariante) */
export const perCento = (t: number | null): string =>
  t === null ? 'n/d' : `${Math.round(t * 100)}%`
