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
