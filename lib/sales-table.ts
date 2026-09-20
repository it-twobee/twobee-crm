/**
 * §371 — le colonne del CRM commerciale, come stanno su Notion.
 *
 * L'elenco vive **qui e non nel componente** per tre motivi che valgono più
 * della comodità: il gate può verificare che combacino con l'export di Notion
 * senza montare React; l'azione che salva una cella può controllare che il
 * campo sia davvero modificabile invece di fidarsi di quello che arriva dal
 * browser; e chi aggiunge una colonna la aggiunge una volta sola, invece di
 * ricordarsi di toccare la tabella, il form e la whitelist.
 *
 * **Modificabile non è un dettaglio grafico, è un permesso.** `sheet_status`,
 * `imported_at` e la provenienza Meta si leggono e basta: sono quello che il
 * foglio ha detto, e riscriverli vorrebbe dire perdere l'unico riferimento a
 * cosa c'era scritto davvero. `created_at` non si tocca perché è la data del
 * lead, non quella dell'importazione.
 */

import { FASI } from './sales-stages'

export type TipoCella =
  | 'testo'
  | 'lunga'
  | 'email'
  | 'telefono'
  | 'url'
  | 'numero'
  | 'data'
  | 'scelta'
  | 'etichette'
  | 'si_no'
  | 'fase'
  | 'persone'
  | 'sola_lettura'

/**
 * §374 — dove sta il campo nella scheda.
 *
 * Ventitré campi in fila sono un modulo del catasto. Raggruppati per **cosa
 * stai facendo** diventano leggibili: chi devi chiamare, a che punto è,
 * com'è fatta l'azienda, come l'hai classificata, da dove è arrivata. Gli
 * ultimi due gruppi si guardano una volta ogni tanto e stanno in fondo.
 */
export const GRUPPI_SCHEDA = ['contatto', 'trattativa', 'azienda', 'classificazione', 'provenienza'] as const
export type GruppoScheda = (typeof GRUPPI_SCHEDA)[number]

export const TITOLO_GRUPPO: Record<GruppoScheda, string> = {
  contatto: 'Chi chiamare',
  trattativa: 'A che punto è',
  azienda: 'L\'azienda',
  classificazione: 'Come l\'abbiamo classificata',
  provenienza: 'Da dove arriva',
}

export type Colonna = {
  /** la colonna di `deals`, o una chiave sintetica per quelle calcolate */
  campo: string
  /** come si chiama su Notion, lettera per lettera */
  etichetta: string
  tipo: TipoCella
  /** larghezza in rem: la tabella scorre, non comprime */
  largh: number
  /** i valori ammessi, per `scelta` */
  valori?: readonly string[]
  /** fuori dall'elenco: i campi che non servono per decidere chi chiamare */
  secondaria?: boolean
  /** in quale riquadro della scheda finisce */
  gruppo: GruppoScheda
}

export const PRIORITA = ['High', 'Medium', 'Low'] as const
export const MEMBERSHIP = ['Member', 'Not Member', 'Potential'] as const

/**
 * L'ordine non è quello dell'export (che è alfabetico, perché Notion esporta
 * così): è l'ordine in cui si guarda una riga quando si lavora. Prima chi è e
 * a che punto è, poi come lo si raggiunge, poi il contorno.
 */
export const COLONNE: Colonna[] = [
  { campo: 'company_name',    etichetta: 'Company',        tipo: 'testo',     largh: 15, gruppo: 'contatto' },
  { campo: 'stage',           etichetta: 'Status',         tipo: 'fase',      largh: 12, gruppo: 'trattativa' },
  { campo: 'priority',        etichetta: 'Priority',       tipo: 'scelta',    largh: 7,  valori: PRIORITA, gruppo: 'trattativa' },
  { campo: 'contact_name',    etichetta: 'Contact Person', tipo: 'testo',     largh: 12, gruppo: 'contatto' },
  { campo: 'contact_phone',   etichetta: 'Phone',          tipo: 'telefono',  largh: 11, gruppo: 'contatto' },
  { campo: 'contact_email',   etichetta: 'Email',          tipo: 'email',     largh: 15, gruppo: 'contatto' },
  { campo: 'owners',          etichetta: 'Account Owner',  tipo: 'persone',   largh: 12, gruppo: 'trattativa' },
  { campo: 'membership',      etichetta: 'Membership',     tipo: 'scelta',    largh: 9,  valori: MEMBERSHIP, gruppo: 'trattativa' },
  { campo: 'tags',            etichetta: 'Tags',           tipo: 'etichette', largh: 14, gruppo: 'classificazione' },
  { campo: 'services',        etichetta: 'Services',       tipo: 'etichette', largh: 14, gruppo: 'classificazione' },
  { campo: 'referral',        etichetta: 'Referral',       tipo: 'testo',     largh: 8, gruppo: 'classificazione' },
  { campo: 'source',          etichetta: 'Lead Source',    tipo: 'testo',     largh: 11, gruppo: 'classificazione' },
  { campo: 'last_interaction_at', etichetta: 'Last Contact', tipo: 'data',    largh: 9, gruppo: 'trattativa' },
  { campo: 'started_on',      etichetta: 'Start',          tipo: 'data',      largh: 9, gruppo: 'trattativa' },
  { campo: 'fatturato',       etichetta: 'Fatturato',      tipo: 'numero',    largh: 10, secondaria: true, gruppo: 'azienda' },
  { campo: 'owner_name',      etichetta: 'Owner',          tipo: 'testo',     largh: 12, secondaria: true, gruppo: 'azienda' },
  { campo: 'website',         etichetta: 'Sito web',       tipo: 'url',       largh: 13, secondaria: true, gruppo: 'azienda' },
  { campo: 'address',         etichetta: 'Address',        tipo: 'lunga',     largh: 16, secondaria: true, gruppo: 'azienda' },
  { campo: 'drive_url',       etichetta: 'Drive',          tipo: 'url',       largh: 8,  secondaria: true, gruppo: 'azienda' },
  { campo: 'audit_requested', etichetta: 'Richiesta Audit', tipo: 'si_no',    largh: 7,  secondaria: true, gruppo: 'trattativa' },
  { campo: 'notes',           etichetta: 'Note',           tipo: 'lunga',     largh: 18, secondaria: true, gruppo: 'trattativa' },
  { campo: 'sheet_status',    etichetta: 'Status dal foglio', tipo: 'sola_lettura', largh: 11, secondaria: true, gruppo: 'provenienza' },
  { campo: 'created_at',      etichetta: 'Added',          tipo: 'sola_lettura', largh: 9, secondaria: true, gruppo: 'provenienza' },
]

/** i tipi che non si modificano: leggere non è scrivere */
const SOLA_LETTURA: TipoCella[] = ['sola_lettura']

export const modificabile = (c: Colonna) => !SOLA_LETTURA.includes(c.tipo)

/**
 * I campi che l'azione di salvataggio accetta. È **la** barriera: un'azione
 * `'use server'` esporta un endpoint, e chi ha il codice davanti conosce i
 * nomi delle colonne — senza questo elenco si potrebbe scrivere su
 * `client_id`, `revision` o `sheet_row_id` mandando il campo giusto nel
 * corpo della richiesta. Nascondere una cella non è una barriera (§329).
 */
export const CAMPI_SCRIVIBILI: string[] = COLONNE
  .filter(c => modificabile(c) && c.campo !== 'owners')
  .map(c => c.campo)

export const colonnaDi = (campo: string): Colonna | null =>
  COLONNE.find(c => c.campo === campo) ?? null

/** la vista stretta: quello che serve per lavorare una riga, senza scorrere */
export const COLONNE_PRINCIPALI = COLONNE.filter(c => !c.secondaria)

// ── validazione di quello che arriva dal browser ────────────────────────────

export type Verdetto =
  | { ok: true; valore: string | number | boolean | string[] | null }
  | { ok: false; motivo: string }

const vuoto = (v: string) => v.trim() === ''

/**
 * Controlla e converte. Il tipo lo decide la colonna, non chi chiama: una
 * data che arriva come «domani» o un numero che arriva come «tremila» vanno
 * respinti qui, o finiscono nel database come `null` senza che nessuno lo
 * dica — e un campo che si svuota da solo è peggio di un errore.
 */
export function validaCella(campo: string, grezzo: unknown): Verdetto {
  const c = colonnaDi(campo)
  if (!c) return { ok: false, motivo: `Colonna sconosciuta: ${campo}` }
  if (!modificabile(c)) return { ok: false, motivo: `«${c.etichetta}» non si modifica` }

  if (c.tipo === 'si_no') return { ok: true, valore: grezzo === true || grezzo === 'true' }

  if (c.tipo === 'etichette') {
    const lista = Array.isArray(grezzo)
      ? grezzo.map(String)
      : String(grezzo ?? '').split(',')
    const pulita = Array.from(new Set(lista.map(x => x.trim()).filter(Boolean)))
    return { ok: true, valore: pulita }
  }

  const v = String(grezzo ?? '')

  if (c.tipo === 'fase') {
    return FASI.some(f => f.chiave === v)
      ? { ok: true, valore: v }
      : { ok: false, motivo: `«${v}» non è una fase` }
  }

  if (c.tipo === 'scelta') {
    if (vuoto(v)) return { ok: true, valore: null }
    return (c.valori ?? []).includes(v)
      ? { ok: true, valore: v }
      : { ok: false, motivo: `«${v}» non è un valore di ${c.etichetta}` }
  }

  if (vuoto(v)) {
    // l'azienda è l'unica cosa senza cui la riga non è una riga
    return c.campo === 'company_name'
      ? { ok: false, motivo: 'Il nome azienda non può restare vuoto' }
      : { ok: true, valore: null }
  }

  if (c.tipo === 'numero') {
    const n = Number(v.replace(/[€\s.]/g, '').replace(',', '.'))
    return Number.isFinite(n) ? { ok: true, valore: n } : { ok: false, motivo: `«${v}» non è un numero` }
  }

  if (c.tipo === 'data') {
    return /^\d{4}-\d{2}-\d{2}$/.test(v.trim())
      ? { ok: true, valore: v.trim() }
      : { ok: false, motivo: 'La data va nel formato AAAA-MM-GG' }
  }

  if (c.tipo === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())) {
    return { ok: false, motivo: `«${v}» non sembra un'email` }
  }

  if (c.tipo === 'url' && !/^https?:\/\/\S+$/i.test(v.trim())) {
    return { ok: false, motivo: 'L\'indirizzo deve cominciare con http:// o https://' }
  }

  return { ok: true, valore: v.trim() }
}
