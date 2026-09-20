/**
 * §363 — la riga di «Le mie attività», e il diritto di tacere.
 *
 * Il saluto ha sempre qualcosa da dire: quante ne hai aperte è un fatto che
 * esiste tutti i giorni. Qui no. Una lista di task in ordine, senza niente di
 * strano dentro, **non merita una frase** — e scriverla lo stesso è il modo
 * più veloce di insegnare a saltarla. Quindi `osserva()` può restituire `null`,
 * e allora non si chiama nessun modello e non compare nessuna riga.
 *
 * È il contrario di quello che fa §351, dove la frase c'è sempre, e la
 * differenza è voluta: là si saluta, qui si segnala. Un saluto che manca è
 * scortese, una segnalazione che manca vuol dire che va tutto bene.
 *
 * **Cosa cerca** è la parte che vale. Non «quante ne hai» — quello si vede
 * dalla lista — ma le cose che la lista **non** può mostrare perché stanno
 * fra due righe diverse, o fra una riga e il calendario delle ferie:
 *
 *  · la milestone di giovedì è tua e da mercoledì sei in ferie;
 *  · condividi tre task con Sabrina, che rientra fra otto giorni;
 *  · quella task è ferma da tre settimane — non in ritardo: **ferma**, che è
 *    un'altra cosa e nessuna colonna la mostra;
 *  · quattro aperte non hanno una data, quindi non compariranno mai in cima.
 *
 * Una sola osservazione per volta, la più urgente. Due segnalazioni insieme
 * sono zero segnalazioni.
 *
 * Gate: `npx tsx lib/attivita-copy.check.ts`.
 */

import type { Vocabolario } from './person-copy'
import { sistemaPer } from './person-copy-prompt'

const MS = 86_400_000
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const giorniDa = (iso: string, oggi: string) =>
  Math.floor((utc(oggi) - Date.parse(iso)) / MS)

// ── le soglie ────────────────────────────────────────────────────────────────

/* Sotto queste non è una notizia, è la normalità di chi lavora. Sono alte
   apposta: una segnalazione che scatta spesso è rumore, e il rumore si impara
   a saltare in tre giorni. Meglio tacere per una settimana e dire una cosa
   vera, che dirne una ogni mattina. */
const SOGLIE = {
  /** un collega in ferie conta se ci condividi almeno una task aperta */
  collegaEntroGiorni: 5,
  /** una milestone tua **imminente**: oggi, domani, dopodomani.
   *  Era sette giorni, e sui dati veri scattava per cinque persone su sette —
   *  mascherando una task scaduta da cinquantun giorni, che è la cosa che
   *  andava letta. Le milestone della settimana la pagina le mostra già: qui
   *  serve solo quella a cui non fai in tempo a pensare. */
  milestoneEntroGiorni: 2,
  /** scaduta da più di due settimane: non è un ritardo, è una dimenticanza */
  scadutaVecchiaGiorni: 14,
  /** non toccata da tre settimane */
  fermaGiorni: 21,
  /** senza data: due capitano, quattro sono un'abitudine */
  senzaDataMinimo: 4,
} as const

// ── quello che si guarda ─────────────────────────────────────────────────────

export type RigaTaskAttivita = {
  id: string
  status: string
  due_date: string | null
  created_at: string
  updated_at: string | null
}
export type RigaMilestone = { id: string; status: string; due_date: string | null; owner_id: string | null }
export type CollegaCondiviso = { nome: string; task: number; assenteDa: string | null; assenteA: string | null }

export type IngressoAttivita = {
  oggi: string
  nome: string
  tasks: RigaTaskAttivita[]
  milestone: RigaMilestone[]
  colleghi: CollegaCondiviso[]
}

export type Osservazione =
  | { tipo: 'collega_via'; collega: string; task: number; giorni: number }
  | { tipo: 'milestone'; giorni: number; quante: number }
  | { tipo: 'scadute_vecchie'; quante: number; giorni: number }
  | { tipo: 'ferma'; giorni: number }
  | { tipo: 'senza_data'; quante: number }

/**
 * La cosa più urgente, o `null` se non ce n'è nessuna.
 *
 * L'ordine non è alfabetico ed è la decisione più importante del file: prima
 * quello che **cambia cosa fai oggi** (un collega che sparisce, una consegna
 * tua che arriva), poi quello che si accumula. La pulizia delle date sta in
 * fondo perché nessuno ha mai perso un cliente per una task senza scadenza.
 */
export function osserva(i: IngressoAttivita): Osservazione | null {
  const { oggi } = i
  const aperte = i.tasks.filter(t => t.status !== 'completato')

  // 1. un collega con cui condividi lavoro sta per sparire, o è già via
  const via = i.colleghi
    .filter(c => c.task > 0 && c.assenteDa)
    .map(c => ({ c, giorni: Math.round((utc(c.assenteDa as string) - utc(oggi)) / MS) }))
    .filter(x => x.giorni <= SOGLIE.collegaEntroGiorni)
    .sort((a, b) => a.giorni - b.giorni)[0]
  if (via) {
    return { tipo: 'collega_via', collega: via.c.nome, task: via.c.task, giorni: Math.max(0, via.giorni) }
  }

  // 2. una milestone tua in arrivo: è una data che qualcun altro si aspetta
  const ms = i.milestone
    .filter(m => m.status !== 'completato' && m.due_date && m.due_date >= oggi)
    .map(m => Math.round((utc(m.due_date as string) - utc(oggi)) / MS))
    .filter(g => g <= SOGLIE.milestoneEntroGiorni)
    .sort((a, b) => a - b)
  if (ms.length) return { tipo: 'milestone', giorni: ms[0], quante: ms.length }

  // 3. scadute da tanto: il ritardo di ieri è normale, quello di tre settimane no
  const vecchie = aperte
    .filter(t => t.due_date && t.due_date < oggi)
    .map(t => Math.round((utc(oggi) - utc(t.due_date as string)) / MS))
    .filter(g => g >= SOGLIE.scadutaVecchiaGiorni)
    .sort((a, b) => b - a)
  if (vecchie.length) return { tipo: 'scadute_vecchie', quante: vecchie.length, giorni: vecchie[0] }

  /* 4. ferma ≠ in ritardo, ed è la distinzione che giustifica questa riga:
        una task senza scadenza non è mai «in ritardo», quindi non è rossa da
        nessuna parte e può stare aperta per mesi senza che una colonna lo
        dica. Si guarda `updated_at`, non `created_at`: una task vecchia ma
        lavorata ieri sta benissimo. */
  const ferme = aperte
    .map(t => giorniDa(t.updated_at ?? t.created_at, oggi))
    .filter(g => g >= SOGLIE.fermaGiorni)
    .sort((a, b) => b - a)
  if (ferme.length) return { tipo: 'ferma', giorni: ferme[0] }

  // 5. senza data non compaiono mai in cima: si perdono per omissione
  const senzaData = aperte.filter(t => !t.due_date).length
  if (senzaData >= SOGLIE.senzaDataMinimo) return { tipo: 'senza_data', quante: senzaData }

  // niente da segnalare, e allora non si dice niente
  return null
}

// ── il vocabolario ───────────────────────────────────────────────────────────

export const CHIAVI_ATTIVITA = [
  'nome', 'collega', 'collegaTask', 'collegaGiorni',
  'milestoneGiorni', 'milestoneQuante',
  'scaduteVecchie', 'scaduteGiorni', 'fermaGiorni', 'senzaData',
] as const
export type ChiaveAttivita = (typeof CHIAVI_ATTIVITA)[number]

const NUMERICHE_ATTIVITA: string[] = [
  'collegaTask', 'collegaGiorni', 'milestoneGiorni', 'milestoneQuante',
  'scaduteVecchie', 'scaduteGiorni', 'fermaGiorni', 'senzaData',
]

/* `collegaGiorni` e `milestoneGiorni` a zero vogliono dire **oggi**, che è il
   momento in cui contano di più: non sono contatori. Gli altri a zero non
   sarebbero nemmeno osservazioni, ma l'elenco resta esplicito perché la regola
   la applica il validatore, non la memoria di chi legge questo file. */
const CONTATORI_ATTIVITA: string[] = [
  'collegaTask', 'milestoneQuante', 'scaduteVecchie', 'senzaData',
]

export function valoriAttivita(o: Osservazione, nome: string): Record<string, string | number | null> {
  const v: Record<string, string | number | null> = {
    nome: nome || null,
    collega: null, collegaTask: null, collegaGiorni: null,
    milestoneGiorni: null, milestoneQuante: null,
    scaduteVecchie: null, scaduteGiorni: null, fermaGiorni: null, senzaData: null,
  }
  switch (o.tipo) {
    case 'collega_via':
      v.collega = o.collega; v.collegaTask = o.task; v.collegaGiorni = o.giorni; break
    case 'milestone':
      v.milestoneGiorni = o.giorni; v.milestoneQuante = o.quante; break
    case 'scadute_vecchie':
      v.scaduteVecchie = o.quante; v.scaduteGiorni = o.giorni; break
    case 'ferma':
      v.fermaGiorni = o.giorni; break
    case 'senza_data':
      v.senzaData = o.quante; break
  }
  return v
}

export function vocabolarioAttivita(o: Osservazione, nome: string, rosa: string[] = []): Vocabolario {
  return {
    dichiarate: [...CHIAVI_ATTIVITA],
    valori: valoriAttivita(o, nome),
    numeriche: NUMERICHE_ATTIVITA,
    contatori: CONTATORI_ATTIVITA,
    // solo sé stesso e, quando c'è, il collega di cui stiamo parlando
    citabili: [nome, ...(o.tipo === 'collega_via' ? [o.collega] : [])].filter(Boolean),
    rosa,
  }
}

// ── il prompt ────────────────────────────────────────────────────────────────

/** cosa significa ogni segnaposto: è l'unica descrizione che il modello legge */
export const GLOSSARIO_ATTIVITA: Record<ChiaveAttivita, string> = {
  nome: 'il suo nome',
  collega: 'il collega che sta per andare in ferie',
  collegaTask: 'quante task aperte condividono',
  collegaGiorni: 'fra quanti giorni parte (zero = è già via oggi)',
  milestoneGiorni: 'fra quanti giorni scade la sua milestone (zero = oggi)',
  milestoneQuante: 'quante sue milestone scadono entro la settimana',
  scaduteVecchie: 'quante task sono scadute da più di due settimane',
  scaduteGiorni: 'da quanti giorni è scaduta la più vecchia',
  fermaGiorni: 'da quanti giorni nessuno tocca la task più ferma',
  senzaData: 'quante task aperte non hanno una scadenza',
}

export const ESEMPI_ATTIVITA: string[] = [
  '{collega} parte fra {collegaGiorni} {collegaGiorni|giorno|giorni} e avete {collegaTask} task insieme. Parlatene oggi.',
  '{collega} è già via, e {collegaTask} task vi aspettavano insieme. Adesso aspettano te.',
  'La tua milestone scade fra {milestoneGiorni} {milestoneGiorni|giorno|giorni}. Qualcuno ci conta.',
  '{scaduteVecchie} {scaduteVecchie|ferma|ferme} da oltre due settimane: la più vecchia da {scaduteGiorni}.',
  'Una task non si muove da {fermaGiorni} {fermaGiorni|giorno|giorni}. Non è in ritardo: è dimenticata.',
  '{senzaData} {senzaData|aperta|aperte} senza una data: senza data non salgono mai in cima.',
]

/** cosa dire, per ogni osservazione: una sola, e il modello deve parlare di quella */
export function scenaAttivita(o: Osservazione): string {
  switch (o.tipo) {
    case 'collega_via':
      return o.giorni === 0
        ? 'un collega con cui condivide task è già in ferie da oggi'
        : 'un collega con cui condivide task sta per andare in ferie'
    case 'milestone':
      return 'una milestone di cui è responsabile scade a breve: è una data che qualcun altro si aspetta'
    case 'scadute_vecchie':
      return 'ha task scadute da settimane — non è il ritardo di ieri, è roba ferma'
    case 'ferma':
      return 'una task non viene toccata da settimane: non è «in ritardo», è ferma, e nessuna colonna lo dice'
    case 'senza_data':
      return 'molte task aperte non hanno una scadenza, quindi non compaiono mai in cima'
  }
}

export function utenteAttivita(o: Osservazione, nome: string, v: Vocabolario, usabili: string[]): string {
  return [
    `Persona: ${nome}.`,
    `Da segnalare: ${scenaAttivita(o)}.`,
    '',
    'Segnaposto disponibili (nome — significato — valore di adesso):',
    ...usabili.map(k => `  {${k}} — ${GLOSSARIO_ATTIVITA[k as ChiaveAttivita]} — ${v.valori[k]}`),
    '',
    'Scrivi la riga: parla di questo e di nient\'altro.',
  ].join('\n')
}

export const SISTEMA_ATTIVITA = sistemaPer([
  'Scrivi UNA riga in italiano per la pagina «Le mie attività» del gestionale interno di TwoBee.',
  'La legge la persona che ha appena aperto la sua lista di task.',
  'Non riassumere la lista — ce l\'ha davanti. Dici **una cosa sola**, quella che ti viene indicata,',
  'perché è una cosa che la lista da sola non mostra.',
], ESEMPI_ATTIVITA)

// ── il lato lettura ──────────────────────────────────────────────────────────

/**
 * La riga da mostrare adesso, o `null` — e `null` qui è la risposta normale,
 * non un ripiego.
 *
 * Stesso patto del saluto (§360): il template è di stamattina, i numeri sono
 * di adesso. In più una cosa che il saluto non ha — **se l'osservazione di
 * oggi non è più quella di stamattina, non si ripiega su una frase generica:
 * si tace.** Chi ha chiuso le tre task ferme non deve leggere una battuta di
 * consolazione, deve leggere niente.
 */
export function rigaAttivitaDiOggi(
  salvata: { template: string; situazione: string } | null,
  adesso: IngressoAttivita,
  rosa: string[],
  regole: { valida: (t: string, v: Vocabolario) => { ok: true; testo: string } | { ok: false; motivo: string } },
): string | null {
  if (!salvata) return null
  const o = osserva(adesso)
  if (!o || o.tipo !== salvata.situazione) return null
  const r = regole.valida(salvata.template, vocabolarioAttivita(o, adesso.nome, rosa))
  return r.ok ? r.testo : null
}
