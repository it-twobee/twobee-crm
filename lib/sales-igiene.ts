/**
 * §385 — i controlli sul commerciale: cosa non torna, e perché.
 *
 * `somiglianze` (§377) guarda **un lead alla volta, al momento di inserirlo**.
 * È la barriera giusta e ha un buco grosso: non dice niente su quello che è
 * già dentro. I doppioni entrano lo stesso da tre porte — l'import CSV che
 * salta il controllo a monte, il «aggiungi comunque» premuto per fretta, e
 * il giro dal foglio, che riconosce una riga dal suo `sheet_row_id` e non
 * dal telefono: la stessa azienda che ricompila il modulo due volte fa due
 * righe, e sono due righe legittime per il foglio e una sola per chi chiama.
 *
 * Qui dentro non c'è rete e non c'è database: entrano le righe, escono i
 * rilievi. È il motivo per cui il gate può provarlo su casi costruiti a mano
 * senza toccare niente.
 *
 * **Nessun controllo corregge.** Ognuno dice cosa ha visto e su quali righe,
 * e la decisione resta di chi guarda — unire due lead è irreversibile, e un
 * programma che unisce da solo sbaglia raramente e quando sbaglia fonde due
 * storie commerciali senza modo di separarle (§377).
 *
 * Gate: `npx tsx lib/sales-igiene.check.ts`.
 */

import { telefonoChiave, emailChiave, nomeChiave, SPIEGA, type Motivo } from './sales-dedup'
import { CHIAVI_FASE, faseDi } from './sales-stages'
import { COLONNE } from './sales-table'

export type RigaIgiene = {
  id: string
  company_name?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  sheet_row_id?: string | null
  client_id?: string | null
  stage?: string | null
  created_at?: string | null
  last_interaction_at?: string | null
}

/** quanto pesa: `grave` sono errori, `attenzione` sono cose da guardare */
export type Peso = 'grave' | 'attenzione'

export type Rilievo = {
  /** la chiave del controllo, stabile: serve al gate e ai filtri */
  chiave: string
  titolo: string
  /** cosa c'è di sbagliato e cosa fare: una riga, non un manuale */
  spiega: string
  peso: Peso
  /** le righe coinvolte. Per i doppioni sono il gruppo intero */
  gruppi: { ids: string[]; perche: string }[]
}

// ── i doppioni ───────────────────────────────────────────────────────────

/**
 * I gruppi di righe che sono probabilmente la stessa azienda.
 *
 * Non coppie: **gruppi**. Tre righe della stessa azienda fanno tre coppie, e
 * mostrarle come tre problemi separati porta a risolverne una e credere di
 * aver finito. Si uniscono per contagio — se A ha il telefono di B e B la
 * mail di C, sono tutte e tre la stessa storia — con una union-find, che è
 * dieci righe e la struttura giusta per «questi stanno insieme».
 *
 * `certo` distingue le chiavi che identificano una **persona** (telefono,
 * email, riga del foglio) da quella che identifica un **nome**: «Verdi Srl»
 * e «Verdi S.r.l.» sono quasi sempre la stessa azienda, ma «Rossi» e «Rossi»
 * possono essere due fratelli in due capannoni (§377). Un gruppo trovato
 * solo per nome si guarda, non si unisce a occhi chiusi.
 */
export function gruppiDoppioni(righe: RigaIgiene[]): { ids: string[]; motivi: Motivo[]; certo: boolean }[] {
  const padre = new Map<string, string>()
  const radice = (x: string): string => {
    const p = padre.get(x)
    if (!p || p === x) return x
    const r = radice(p)
    padre.set(x, r)
    return r
  }
  const unisci = (a: string, b: string) => {
    const [ra, rb] = [radice(a), radice(b)]
    if (ra !== rb) padre.set(ra, rb)
  }
  for (const r of righe) padre.set(r.id, r.id)

  /** per ogni chiave, chi la porta — e il motivo per cui li ha uniti */
  const motivoDi = new Map<string, Set<Motivo>>()
  const perChiave = (estrai: (r: RigaIgiene) => string | null, motivo: Motivo) => {
    const visti = new Map<string, string>()
    for (const r of righe) {
      const k = estrai(r)
      if (!k) continue
      const primo = visti.get(k)
      if (primo === undefined) { visti.set(k, r.id); continue }
      unisci(primo, r.id)
      for (const id of [primo, r.id]) {
        motivoDi.set(id, (motivoDi.get(id) ?? new Set()).add(motivo))
      }
    }
  }
  perChiave(r => (r.sheet_row_id ?? '').trim() || null, 'riga_foglio')
  perChiave(r => telefonoChiave(r.contact_phone), 'telefono')
  perChiave(r => emailChiave(r.contact_email), 'email')
  perChiave(r => nomeChiave(r.company_name), 'nome')

  const per = new Map<string, string[]>()
  for (const r of righe) {
    const k = radice(r.id)
    per.set(k, [...(per.get(k) ?? []), r.id])
  }

  const out: { ids: string[]; motivi: Motivo[]; certo: boolean }[] = []
  for (const ids of Array.from(per.values())) {
    if (ids.length < 2) continue
    const motivi: Motivo[] = Array.from(
      new Set(ids.flatMap((id: string) => Array.from(motivoDi.get(id) ?? []))))
    out.push({ ids, motivi, certo: motivi.some(m => m !== 'nome') })
  }
  // prima i certi, poi i gruppi più grandi: chi guarda parte dal danno maggiore
  return out.sort((a, b) => Number(b.certo) - Number(a.certo) || b.ids.length - a.ids.length)
}

// ── tutti i controlli ────────────────────────────────────────────────────

const giorniDa = (iso: string | null | undefined, oggi: string): number | null => {
  if (!iso) return null
  const d = Date.parse(iso.slice(0, 10))
  const o = Date.parse(oggi.slice(0, 10))
  return Number.isFinite(d) && Number.isFinite(o) ? Math.round((o - d) / 86400000) : null
}

/**
 * Tutti i rilievi, in ordine di peso.
 *
 * `fermiDa` è un parametro e non una costante perché è una scelta di
 * dominio: sessanta giorni su un canone ricorrente sono normali, su una
 * proposta inviata sono una trattativa persa. Chi chiama decide.
 */
export function controlla(
  righe: RigaIgiene[],
  oggi: string,
  fermiDa = 45,
): Rilievo[] {
  const nomeDi = (id: string) =>
    righe.find(r => r.id === id)?.company_name || 'Senza nome'
  const out: Rilievo[] = []

  const doppi = gruppiDoppioni(righe)
  if (doppi.length) {
    out.push({
      chiave: 'doppioni',
      titolo: 'Righe che sono la stessa azienda',
      spiega: 'Entrano dall’import CSV, dal «aggiungi comunque» e dal foglio, '
        + 'che riconosce una riga dal suo identificativo e non dal telefono. '
        + 'Vanno guardate una per una: unire due storie commerciali non si disfa.',
      peso: 'grave',
      gruppi: doppi.map(g => ({
        ids: g.ids,
        perche: `${g.ids.length} righe · ${g.motivi.map(m => SPIEGA[m]).join(', ')}`
          + (g.certo ? '' : ' — solo il nome, potrebbero essere due aziende diverse'),
      })),
    })
  }

  /* Un lead senza telefono e senza email non è un lead: è un nome. Nessuno
     lo chiamerà, e resta a gonfiare il conto delle trattative aperte. */
  const muti = righe.filter(r =>
    !telefonoChiave(r.contact_phone) && !emailChiave(r.contact_email)
    && faseDi(r.stage)?.chiusa !== true)
  if (muti.length) {
    out.push({
      chiave: 'senza_recapito',
      titolo: 'Aperti e senza un modo per raggiungerli',
      spiega: 'Né telefono né email, e la trattativa risulta viva: '
        + 'contano nelle statistiche e nessuno potrà chiamarli.',
      peso: 'grave',
      gruppi: muti.map(r => ({ ids: [r.id], perche: nomeDi(r.id) })),
    })
  }

  /* «Active Client» è la casella di chi è diventato cliente, e qui dentro
     cliente vuol dire una riga d'anagrafica. Senza, la pipeline dichiara
     clienti che in anagrafica non esistono (§379). */
  const senzaAnagrafica = righe.filter(r => r.stage === 'active_client' && !r.client_id)
  if (senzaAnagrafica.length) {
    out.push({
      chiave: 'cliente_senza_anagrafica',
      titolo: 'Dati per clienti, ma in anagrafica non ci sono',
      spiega: 'La fase dice «Active Client» e nessun cliente è collegato. '
        + 'Si chiude con «Lead convertito» nella scheda, che apre il modale vero.',
      peso: 'grave',
      gruppi: senzaAnagrafica.map(r => ({ ids: [r.id], perche: nomeDi(r.id) })),
    })
  }

  /* L'opposto: collegato a un cliente e ancora in una fase di lavorazione.
     Uno dei due dice il falso, e il conto delle trattative aperte ci crede. */
  const chiusiMale = righe.filter(r =>
    r.client_id && r.stage !== 'active_client' && faseDi(r.stage)?.chiusa !== true)
  if (chiusiMale.length) {
    out.push({
      chiave: 'collegato_ma_aperto',
      titolo: 'Già clienti, ma la trattativa risulta ancora aperta',
      spiega: 'Sono collegati a un’anagrafica e la fase dice che si sta ancora trattando: '
        + 'contano fra gli aperti e non dovrebbero.',
      peso: 'attenzione',
      gruppi: chiusiMale.map(r => ({ ids: [r.id], perche: `${nomeDi(r.id)} · ${r.stage}` })),
    })
  }

  /* Una fase che l'elenco non conosce non si filtra, non si conta e non si
     mostra: la riga sparisce da ogni vista senza essere sparita. */
  const faseIgnota = righe.filter(r => !CHIAVI_FASE.includes(String(r.stage ?? '')))
  if (faseIgnota.length) {
    out.push({
      chiave: 'fase_sconosciuta',
      titolo: 'In una fase che non esiste più',
      spiega: 'La fase non è fra le dodici: la riga non si filtra e non si conta, '
        + 'ma è ancora in tabella.',
      peso: 'grave',
      gruppi: faseIgnota.map(r => ({ ids: [r.id], perche: `${nomeDi(r.id)} · «${r.stage ?? 'vuota'}»` })),
    })
  }

  /* Fermi: aperti e senza un contatto da troppo. Non è un errore di dati —
     è lavoro che si sta perdendo, e sta qui perché è l'unico posto che
     guarda tutte le righe insieme. */
  const fermi = righe
    .map(r => ({ r, g: giorniDa(r.last_interaction_at ?? r.created_at, oggi) }))
    .filter(x => faseDi(x.r.stage)?.chiusa !== true && x.g !== null && x.g > fermiDa)
    .sort((a, b) => (b.g ?? 0) - (a.g ?? 0))
  if (fermi.length) {
    out.push({
      chiave: 'fermi',
      titolo: `Aperti e fermi da più di ${fermiDa} giorni`,
      spiega: 'Nessun contatto registrato da un pezzo e la trattativa risulta viva. '
        + 'O si riprende, o si chiude: restare aperta falsa il conto di quante ce ne sono.',
      peso: 'attenzione',
      gruppi: fermi.map(x => ({ ids: [x.r.id], perche: `${nomeDi(x.r.id)} · ${x.g} giorni` })),
    })
  }

  return out.sort((a, b) => Number(b.peso === 'grave') - Number(a.peso === 'grave'))
}

/** quante righe sono toccate da almeno un rilievo grave */
export const quanteGravi = (rilievi: Rilievo[]): number =>
  new Set(rilievi.filter(r => r.peso === 'grave').flatMap(r => r.gruppi.flatMap(g => g.ids))).size

// ── il confronto fra due righe che sono la stessa azienda ────────────────

/**
 * §386 — quale delle due tenere, e cosa si perde tenendola.
 *
 * Trovare il doppione è metà del lavoro. L'altra metà è la domanda che si fa
 * subito dopo, con le due righe davanti: **quale sovrascrive l'altra**. A
 * occhio si sceglie quella aperta per prima, o quella in cima, e si scopre
 * dopo che sull'altra c'erano le note della telefonata.
 *
 * Quindi non basta dire «tieni questa»: serve dire anche **cosa c'è
 * sull'altra e qui no**. È l'unica parte che rende sicuro l'accorpamento,
 * perché è l'elenco di quello che va ricopiato prima di eliminare.
 *
 * L'ordine delle regole è quello del danno, non della comodità:
 *
 *  1. **Chi è collegato a un cliente vince sempre.** Eliminare quella riga
 *     romperebbe il collegamento con l'anagrafica, che è l'unica cosa qui
 *     dentro che non si ricostruisce guardando i campi.
 *  2. **Poi chi è più avanti nel percorso**: una proposta inviata porta con
 *     sé un lavoro che una riga appena arrivata non ha.
 *  3. **Poi chi ha più campi pieni**, che è la definizione letterale della
 *     domanda.
 *  4. A parità, **la più vecchia**: è quella a cui puntano le cose nate
 *     prima, ed è la storia più lunga.
 */


export type RigaConfronto = Record<string, unknown> & { id: string }

/** i campi che si guardano, con l'etichetta di Notion: una fonte sola (§378) */
export const CAMPI_CONFRONTO: { campo: string; etichetta: string }[] = [
  ...COLONNE.filter(c => c.campo !== 'owners' && c.campo !== 'stage')
    .map(c => ({ campo: c.campo, etichetta: c.etichetta })),
]

/** il valore come si legge, o `null` se è vuoto: `[]`, `''` e `0` sono vuoti */
export function mostra(v: unknown): string | null {
  if (v === null || v === undefined || v === '' || v === false) return null
  if (Array.isArray(v)) return v.length ? v.join(', ') : null
  if (typeof v === 'object') {
    const n = Object.values(v as Record<string, unknown>).filter(Boolean).length
    return n ? `${n} voci` : null
  }
  if (typeof v === 'number') return v === 0 ? null : String(v)
  const t = String(v).trim()
  return t && t !== '-' ? t : null
}

/** quanti campi pieni ha questa riga, fra quelli che si confrontano */
export const completezza = (r: RigaConfronto): number =>
  CAMPI_CONFRONTO.filter(c => mostra(r[c.campo]) !== null).length

/**
 * A che punto del percorso è, in tre gradini.
 *
 * Non è l'indice in `FASI`: quell'ordine è la colonna di Notion, dove `lost`
 * e `inactive_client` stanno **in cima** (§367). Ordinare per indice
 * direbbe che un perso è più indietro di un lead nuovo, che è vero, e che un
 * lead nuovo è più indietro di un perso, che non lo è.
 */
export function rangoFase(stage: string | null | undefined): number {
  const f = faseDi(stage)
  if (!f) return 0
  if (f.chiave === 'active_client') return 3
  if (f.chiusa) return 1          // uscite: una storia finita, ma una storia
  return f.gruppo === 'in_progress' ? 2 : 1.5
}

export type Confronto = {
  ids: string[]
  /** l'id della riga da tenere */
  tieni: string
  /** perché quella: in ordine, la prima ragione che ha deciso */
  perche: string[]
  /** cosa hanno le altre e la scelta no: da ricopiare **prima** di eliminare */
  daPortare: { campo: string; etichetta: string; da: string; valore: string }[]
  /** i campi in cui le righe si differenziano, per metterle in parallelo */
  campi: { campo: string; etichetta: string; valori: (string | null)[] }[]
}

export function confronta(righe: RigaConfronto[]): Confronto | null {
  if (righe.length < 2) return null

  const punteggio = (r: RigaConfronto) => ({
    cliente: r.client_id ? 1 : 0,
    fase: rangoFase(r.stage as string),
    campi: completezza(r),
    /* il meno: a parità, la più vecchia vince, quindi la data più piccola
       deve dare il punteggio più alto */
    eta: -Date.parse(String(r.created_at ?? '2999-01-01')),
  })

  const ordinate = [...righe].sort((a, b) => {
    const [pa, pb] = [punteggio(a), punteggio(b)]
    return pb.cliente - pa.cliente || pb.fase - pa.fase || pb.campi - pa.campi || pb.eta - pa.eta
  })
  const vince = ordinate[0]
  const altre = ordinate.slice(1)

  const perche: string[] = []
  if (vince.client_id && altre.every(r => !r.client_id)) {
    perche.push('è l’unica collegata a un cliente in anagrafica')
  }
  if (altre.some(r => rangoFase(vince.stage as string) > rangoFase(r.stage as string))) {
    perche.push('è più avanti nel percorso')
  }
  const piu = completezza(vince)
  if (altre.some(r => piu > completezza(r))) {
    perche.push(`ha più campi compilati (${piu} contro ${altre.map(completezza).join(' e ')})`)
  }
  if (!perche.length) perche.push('è la più vecchia, e le altre non aggiungono niente')

  const daPortare: Confronto['daPortare'] = []
  for (const c of CAMPI_CONFRONTO) {
    if (mostra(vince[c.campo]) !== null) continue
    for (const r of altre) {
      const v = mostra(r[c.campo])
      if (v !== null) { daPortare.push({ campo: c.campo, etichetta: c.etichetta, da: r.id, valore: v }); break }
    }
  }

  /* Solo i campi in cui le righe **dicono cose diverse**: affiancare
     ventitré righe uguali nasconde le tre che contano. */
  const campi = CAMPI_CONFRONTO
    .map(c => ({ campo: c.campo, etichetta: c.etichetta, valori: ordinate.map(r => mostra(r[c.campo])) }))
    .filter(x => new Set(x.valori.map(v => v ?? '')).size > 1)

  return { ids: ordinate.map(r => r.id), tieni: vince.id, perche, daPortare, campi }
}
