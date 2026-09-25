/**
 * §428 — cosa serve adesso su un lead, e cosa sappiamo già senza chiederlo.
 *
 * La scheda mostrava ventitré campi tutti uguali, in cinque riquadri, ordinati
 * per argomento. Ordinare per argomento è giusto per **cercare** un dato; è
 * inutile per **lavorare**, perché chi apre una scheda non sta cercando un
 * campo: sta decidendo cosa fare adesso. E quello che serve adesso dipende da
 * dove sta la trattativa — a un lead appena arrivato si chiede un recapito, a
 * uno perso si chiede perché.
 *
 * Tre funzioni pure, nessuna delle quali scrive niente:
 *
 * - `prossimaAzione` — la frase in cima. Una sola, la più urgente: un elenco di
 *   sei cose da fare è un elenco che non si fa;
 * - `campiCheServono` — i campi vuoti che contano **in questa fase**, da
 *   riempire senza scorrere;
 * - `suggerimenti` — quello che sappiamo già da un'altra parte e che nessuno ha
 *   ricopiato. **Propone, non scrive**: un campo che si riempie da solo è un
 *   campo che nessuno ricontrolla, e la provenienza Meta è dichiarata dal lead,
 *   non verificata.
 *
 * Tutto ragiona sul **ruolo** della fase, mai sulla chiave: le fasi si
 * rinominano dalle impostazioni (§424).
 *
 * Gate: `npx tsx lib/sales-scheda.check.ts`.
 */

import { ruoloDi, type Fase } from './sales-stages'

export type RigaScheda = {
  stage?: string | null
  qualifica?: string | null
  motivo_perso?: string | null
  client_id?: string | null
  contact_phone?: unknown
  contact_email?: unknown
  contact_name?: unknown
  last_interaction_at?: string | null
  tentativi?: number | null
  lead_origine?: Record<string, string> | null
}

const pieno = (v: unknown) => typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined

export type Azione = {
  /** la frase, all'imperativo: è una cosa da fare, non una diagnosi */
  testo: string
  /** il campo da mettere a fuoco, quando l'azione è «riempi questo» */
  campo?: string
  /** blocca il lavoro: senza, la riga non si può lavorare affatto */
  urgente?: boolean
}

/** i giorni da un momento a oggi, `null` se la data non c'è o non si legge */
export function giorniDa(iso: string | null | undefined, oggiMs: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((oggiMs - t) / 86_400_000)
}

/**
 * Una sola cosa da fare, la più urgente.
 *
 * L'ordine è quello del danno, non quello della schermata: un lead senza
 * recapito non si lavora affatto, e dirgli «qualificalo» prima sarebbe un
 * consiglio che non si può seguire.
 */
export function prossimaAzione(fasi: Fase[], r: RigaScheda, oggiMs: number, fermoDopo = 14): Azione | null {
  const ruolo = ruoloDi(fasi, r.stage)

  if (!pieno(r.contact_phone) && !pieno(r.contact_email)) {
    return { testo: 'Manca il recapito: senza telefono né email questo lead non si può lavorare.', campo: 'contact_phone', urgente: true }
  }
  if (ruolo === 'perso' && !pieno(r.motivo_perso)) {
    return { testo: 'Segna perché è andato perso: senza il motivo è solo una riga in meno.', campo: 'motivo_perso' }
  }
  if (ruolo === 'vinto' && !r.client_id) {
    return { testo: 'Chiusa vinta ma non c’è l’anagrafica: crea il cliente.', campo: 'client_id', urgente: true }
  }
  if (ruolo === 'perso' || ruolo === 'vinto') return null

  /* §438 — i tentativi li conta il diario: tre chiamate a vuoto chiedono un
     altro canale, non una quarta chiamata alla stessa ora */
  const aVuoto = Number(r.tentativi ?? 0)
  if (aVuoto >= 3 && ruolo !== 'sospeso') {
    return { testo: `${aVuoto} tentativi senza risposta: prova un altro orario o scrivigli un messaggio.`, campo: 'last_interaction_at' }
  }
  if (ruolo === 'nuovo') {
    return aVuoto > 0
      ? { testo: `L’hai cercato ${aVuoto === 1 ? 'una volta' : `${aVuoto} volte`} senza risposta: riprova.`, campo: 'last_interaction_at' }
      : { testo: 'Non l’ha ancora sentito nessuno: chiama e segna com’è andata.', campo: 'last_interaction_at' }
  }
  if (r.qualifica === 'da_valutare' || !pieno(r.qualifica)) {
    return { testo: 'Non sai ancora se è in target: decidilo prima di lavorarci.', campo: 'qualifica' }
  }
  if (ruolo === 'sospeso') {
    const g = giorniDa(r.last_interaction_at, oggiMs)
    return { testo: g === null
      ? 'È ferma: richiamalo, o segnala persa.'
      : `Ferma da ${g} ${g === 1 ? 'giorno' : 'giorni'}: richiamalo, o segnala persa.` }
  }

  const g = giorniDa(r.last_interaction_at, oggiMs)
  if (g === null) return { testo: 'Non risulta nessun contatto: segna quando l’hai sentito.', campo: 'last_interaction_at' }
  if (g > fermoDopo) return { testo: `Sono passati ${g} giorni dall’ultimo contatto: fatti sentire.`, campo: 'last_interaction_at' }
  return null
}

/**
 * I campi vuoti che contano **in questa fase**.
 *
 * Non tutti i campi vuoti: quasi ogni riga ne ha dieci, e un elenco di dieci
 * cose mancanti è un elenco che si ignora. Qui ci sono solo quelli senza cui la
 * fase in cui sta adesso non ha senso.
 */
export function campiCheServono(fasi: Fase[], r: RigaScheda): string[] {
  const ruolo = ruoloDi(fasi, r.stage)
  const out: string[] = []

  if (!pieno(r.contact_phone) && !pieno(r.contact_email)) out.push('contact_phone', 'contact_email')
  else {
    if (!pieno(r.contact_phone)) out.push('contact_phone')
    if (!pieno(r.contact_email)) out.push('contact_email')
  }
  if (!pieno(r.contact_name)) out.push('contact_name')

  if (ruolo === 'perso') {
    if (!pieno(r.motivo_perso)) out.push('motivo_perso')
    /* Su un perso non si chiede altro: la riga è chiusa, e riempirla di campi
       obbligatori è il modo di far smettere di segnare i persi. */
    return Array.from(new Set(out))
  }
  if (ruolo === 'vinto') return Array.from(new Set(out))

  if (!pieno(r.qualifica) || r.qualifica === 'da_valutare') out.push('qualifica')
  if (!pieno(r.last_interaction_at)) out.push('last_interaction_at')

  return Array.from(new Set(out))
}

export type Suggerimento = { campo: string; valore: string; da: string }

/**
 * Quello che sappiamo già e che nessuno ha ricopiato.
 *
 * Viene tutto dalla provenienza Meta, che il lead ha dichiarato compilando il
 * modulo: è un dato buono per partire e **non è verificato**. Per questo si
 * propone e non si scrive — «fatturato 500k» in un campo che nessuno ha
 * guardato diventa un numero su cui si prende una decisione.
 */
export function suggerimenti(r: RigaScheda, valori: Record<string, unknown>): Suggerimento[] {
  const org = r.lead_origine ?? {}
  const out: Suggerimento[] = []
  const proponi = (campo: string, valore: string | null | undefined, da: string) => {
    if (!valore || pieno(valori[campo])) return
    out.push({ campo, valore: String(valore).trim(), da })
  }
  proponi('source', org.piattaforma, 'la piattaforma da cui è arrivato')
  proponi('fatturato', soloNumero(org.fatturato_dichiarato), 'il fatturato dichiarato nel modulo')
  proponi('notes', org.tempistica ? `Quando vuole partire: ${org.tempistica}` : null, 'la risposta nel modulo')
  return out
}

/** «circa 500.000 €» → «500000». `null` se dentro non c'è un numero. */
export function soloNumero(v: string | null | undefined): string | null {
  if (!v) return null
  const cifre = v.replace(/[^\d]/g, '')
  return cifre.length >= 3 ? cifre : null
}
