/**
 * §367 — le dodici fasi del CRM commerciale, come stanno sul Notion.
 *
 * Non è una pipeline inventata: è quella che il commerciale usa da prima che
 * questo tool esistesse, e replicarla identica è il motivo per cui qualcuno
 * smetterà di aprire Notion. Una fase in più o una rinominata «per chiarezza»
 * vuol dire due elenchi da tenere allineati a mano, cioè due elenchi che
 * divergono.
 *
 * **I tre gruppi vengono da lì e non si toccano**, anche dove sorprendono:
 * `lost` e `inactive_client` stanno in «To-do» e non in «Complete», che per una
 * pipeline è strano — sono uscite, non cose da fare. Ma è così che il gruppo
 * ragiona: un perso è una riga da riprendere in mano, non una pratica chiusa.
 * Se un giorno si sposta, si sposta **anche su Notion**, non solo qui.
 *
 * **Sui colori c'è un limite dichiarato.** Notion ne usa dodici distinti; il
 * design system ne ha sette per gli stati (`lib/globals.css`), e inventare
 * degli hex romperebbe il tema chiaro — la regola più vecchia di questo
 * progetto. Quindi qualche fase condivide il colore, e le coppie sono scelte
 * fra fasi lontane nel percorso: il colore dice **a che punto sei**, il nome
 * dice quale. Chi legge una riga legge l'etichetta, non solo il pallino.
 *
 * Gate: `npx tsx lib/sales-stages.check.ts`.
 */

/** i gruppi di Notion, nell'ordine in cui compaiono nella colonna */
export const GRUPPI = ['todo', 'in_progress', 'complete'] as const
export type Gruppo = (typeof GRUPPI)[number]

export const ETICHETTA_GRUPPO: Record<Gruppo, string> = {
  todo: 'Da fare',
  in_progress: 'In corso',
  complete: 'Chiuso',
}

/** i token di stato disponibili: `neutro` è l'assenza di colore, non un colore */
export type Tinta = 'error' | 'neutro' | 'info' | 'orange' | 'accent' | 'gold' | 'success'

export type Fase = {
  /** come sta nel database: minuscolo, senza spazi, mai tradotto */
  chiave: string
  /** come sta su Notion, lettera per lettera */
  etichetta: string
  gruppo: Gruppo
  tinta: Tinta
  /** la riga è fuori dalla pipeline attiva: non è un lavoro in corso */
  chiusa?: boolean
}

/**
 * L'ordine è quello della colonna su Notion, dall'alto in basso. Conta: è
 * l'ordine in cui compaiono nel menu a tendina e nelle colonne della bacheca,
 * e chi lo usa da mesi lo cerca dove sa che sta.
 */
export const FASI: Fase[] = [
  { chiave: 'lost',              etichetta: 'Lost',                   gruppo: 'todo',        tinta: 'error',   chiusa: true },
  { chiave: 'inactive_client',   etichetta: 'Inactive Client',        gruppo: 'todo',        tinta: 'neutro',  chiusa: true },
  { chiave: 'new_lead',          etichetta: 'New Lead',               gruppo: 'todo',        tinta: 'info' },
  { chiave: 'contacting',        etichetta: 'Contacting',             gruppo: 'todo',        tinta: 'orange' },
  { chiave: 'in_conversation',   etichetta: 'In Conversation',        gruppo: 'in_progress', tinta: 'accent' },
  { chiave: 'evento_osm',        etichetta: 'Evento OSM',             gruppo: 'in_progress', tinta: 'info' },
  { chiave: 'audit_richiesto',   etichetta: 'Audit richiesto',        gruppo: 'in_progress', tinta: 'accent' },
  { chiave: 'qualified',         etichetta: 'Qualified',              gruppo: 'in_progress', tinta: 'gold' },
  { chiave: 'pending',           etichetta: 'Pending',                gruppo: 'in_progress', tinta: 'neutro' },
  { chiave: 'strategia_preventivo', etichetta: 'Strategia + Preventivo', gruppo: 'in_progress', tinta: 'orange' },
  { chiave: 'contratto',         etichetta: 'Contratto',              gruppo: 'in_progress', tinta: 'gold' },
  { chiave: 'active_client',     etichetta: 'Active Client',          gruppo: 'complete',    tinta: 'success', chiusa: true },
]

export const CHIAVI_FASE = FASI.map(f => f.chiave)

const PER_CHIAVE = new Map(FASI.map(f => [f.chiave, f]))
export const faseDi = (chiave: string | null | undefined): Fase | null =>
  chiave ? PER_CHIAVE.get(chiave) ?? null : null

/** l'etichetta di Notion, o la chiave grezza se è una fase che non conosciamo più */
export const etichettaFase = (chiave: string | null | undefined): string =>
  faseDi(chiave)?.etichetta ?? (chiave ?? '—')

export const fasiDelGruppo = (g: Gruppo) => FASI.filter(f => f.gruppo === g)

/** le fasi in cui la trattativa è viva: tutto quello che non è un'uscita */
export const FASI_APERTE = FASI.filter(f => !f.chiusa).map(f => f.chiave)

/**
 * La fase da cui entra tutto quello che arriva dal foglio.
 *
 * Sta qui e non nell'importatore perché è una decisione di dominio, non di
 * trasporto: se un giorno i lead dovessero entrare già come `contacting`, si
 * cambia una riga in questo file e non si va a cercarla dentro un parser CSV.
 */
export const FASE_INGRESSO = 'new_lead'

/** classi del chip, dai token: mai un hex, o il tema chiaro si rompe */
export const CLASSI_TINTA: Record<Tinta, string> = {
  error:   'bg-error-dim text-error',
  neutro:  'bg-surface-active text-text-secondary',
  info:    'bg-info-dim text-info',
  orange:  'bg-orange-dim text-orange',
  accent:  'bg-accent-dim text-accent',
  gold:    'bg-gold-dim text-gold-text',
  success: 'bg-success-dim text-success',
}

export const classiFase = (chiave: string | null | undefined): string =>
  CLASSI_TINTA[faseDi(chiave)?.tinta ?? 'neutro']
