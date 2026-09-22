/**
 * §394 — i workstream preimpostati: la stessa lista, ovunque se ne apra uno.
 *
 * Il catalogo (`service_catalog`) è l'elenco di cosa sappiamo consegnare, ed è
 * quello da cui il wizard fa nascere le corsie di un progetto nuovo. Fuori dal
 * wizard non c'era: «Nuova workstream» chiedeva un nome in un campo vuoto, e un
 * campo vuoto produce «Setup», «setup» e «Impostazioni» sullo stesso lavoro —
 * nomi che non si raggruppano, non si confrontano fra progetti e non dicono a
 * chi arriva dopo che quella corsia è la stessa cosa che facciamo altrove.
 *
 * Qui sta la scelta — cosa proporre, in che ordine, e quando il testo scritto è
 * un workstream nuovo invece di uno che esiste già. La UI ci mette le righe.
 */

import { formaDiServizio, type Forma, type Periodo } from './periodi'
import { decidi, type CorsiaEsistente } from './generatore-periodi'

export type { Forma, CorsiaEsistente }

export type CatalogRow = {
  area: string
  service_type: string
  service_subtype: string | null
  label: string
  is_active?: boolean
}

export type Preset = {
  key: string
  label: string
  area: string
  service_type: string
  service_subtype: string | null
  /** viene da un'altra area: si dice, perché «Sito Web» su un progetto Growth è una scelta */
  altraArea: boolean
  /** un workstream con questo nome c'è già qui: si mostra lo stesso, marcato */
  presente: boolean
}

export const normalizza = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Il `service_type` di un workstream su misura. Stessa regola sul client e
 * dentro `createCatalogService`: due slug diversi per la stessa parola
 * vorrebbero dire due voci di catalogo che sembrano una.
 */
export const tipoServizio = (label: string) =>
  normalizza(label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48)

/**
 * Cosa proporre, in ordine: prima l'area del progetto, poi le altre.
 *
 * Quello che è **già** nel progetto resta in elenco, marcato: toglierlo
 * significherebbe far sembrare che il catalogo l'abbia perso, e chi cerca
 * «Reporting» per capire come si chiama da noi lo cerca proprio lì.
 */
export function proposte(rows: CatalogRow[], opts: {
  area: string
  query?: string
  altreAree?: boolean
  presenti?: string[]
}): Preset[] {
  const { area, query = '', altreAree = true, presenti = [] } = opts
  const q = normalizza(query)
  const gia = new Set(presenti.map(normalizza))
  const viste = new Set<string>()
  const out: Preset[] = []

  const prendi = (r: CatalogRow) => {
    if (r.is_active === false) return
    if (q && !normalizza(r.label).includes(q)) return
    const nome = normalizza(r.label)
    // lo stesso servizio in due aree è una riga sola: vince quella del progetto
    if (viste.has(nome)) return
    viste.add(nome)
    out.push({
      key: `${r.area}::${r.service_type}${r.service_subtype ? `::${r.service_subtype}` : ''}`,
      label: r.label,
      area: r.area,
      service_type: r.service_type,
      service_subtype: r.service_subtype,
      altraArea: r.area !== area,
      presente: gia.has(nome),
    })
  }

  rows.filter(r => r.area === area).forEach(prendi)
  if (altreAree) rows.filter(r => r.area !== area).forEach(prendi)
  return out
}

/**
 * Il testo scritto vale come workstream su misura? Solo se non è già una voce
 * **visibile** e non è già una corsia del progetto: la decisione si prende su
 * quello che l'utente ha davanti, o si finisce a offrire «crea Branding» sotto
 * la riga «Branding».
 */
export function suMisura(query: string, visibili: Preset[], presenti: string[] = []): string | null {
  const testo = query.replace(/\s+/g, ' ').trim()
  const q = normalizza(testo)
  if (!q) return null
  if (visibili.some(p => normalizza(p.label) === q)) return null
  if (presenti.some(p => normalizza(p) === q)) return null
  return testo
}

// ── §396 — dove le corsie sono i periodi ────────────────────────────────────

/**
 * Il ritmo del progetto, letto dal catalogo che il client ha già in mano.
 *
 * Su un servizio a trimestri la corsia **è** il periodo (§388): proporre
 * «Lead Generation» come nome di una corsia su un progetto Lead Generation
 * non è solo brutto, è la cosa sbagliata — quel progetto vuole «Q1 2027»,
 * con le sue date, la riga in `project_periods` e lo scheletro dentro, e
 * niente di tutto questo nasce da un `createWorkstream` scritto a mano.
 */
export function formaDelProgetto(
  services: { service_type: string; service_subtype?: string | null; period_shape?: Forma | null }[],
  progetto: { service_type: string | null; service_subtype: string | null },
): Forma {
  const righe = services.filter(s => s.service_type === (progetto.service_type ?? ''))
  return formaDiServizio(righe, progetto.service_subtype ?? null)
}

/**
 * I trimestri che mancano, guardando **le date delle corsie** che il progetto
 * ha già.
 *
 * Il registro (`project_periods`) dal browser non si legge — RLS senza policy,
 * lo vede solo il service role — e va bene così: per i trimestri le date sono
 * la verità comunque (§389), perché un trimestre aperto *è* una corsia con
 * quelle date. Per i **mesi** invece la risposta è vuota e non zero: un mese è
 * una tappa, quello che sappiamo qui non basta a dire quali ci sono, e
 * un elenco inventato sarebbe peggio di nessun elenco.
 */
export function trimestriMancanti(input: {
  oggi: string
  forma: Forma
  corsie: CorsiaEsistente[]
  orizzonte?: number
}): { mancanti: Periodo[]; coperti: { periodo: Periodo; corsia?: string }[] } {
  if (input.forma !== 'quarter') return { mancanti: [], coperti: [] }
  const d = decidi({ oggi: input.oggi, forma: 'quarter', chiaviAperte: [], corsie: input.corsie, orizzonte: input.orizzonte })
  return {
    mancanti: d.flatMap(x => x.fare === 'crea' ? [x.periodo] : []),
    coperti: d.flatMap(x => x.fare === 'salta' ? [{ periodo: x.periodo, corsia: x.corsia }] : []),
  }
}

/**
 * §400 — le corsie che di solito stanno dentro un servizio, dai suoi template.
 *
 * Scegliere «Lead Generation» e ritrovarsi una corsia sola che si chiama come
 * il servizio è il punto in cui il wizard smette di aiutare: le corsie di quel
 * lavoro le sappiamo già — stanno nei template, «Setup e tracciamento»,
 * «Advertising», «Governance» — e chiederle di nuovo a chi crea il progetto
 * vuol dire farsele riscrivere ogni volta con un nome diverso.
 *
 * Le più comuni per prime: una corsia che compare in tutti e quattro i template
 * del servizio è quella che serve quasi sempre. A parità resta l'ordine del
 * template, che è quello del lavoro.
 */
export type CorsiaProposta = {
  key: string
  nome: string
  tipo: 'project' | 'recurring'
  /** in quanti template del servizio compare */
  quante: number
}

export function corsieDeiTemplate(
  templates: { id: string; service_type: string; service_subtype: string | null; is_active?: boolean; kind?: string | null }[],
  nodi: { template_id: string; parent_id: string | null; node_type: string; name: string; workstream_type?: string | null; sort_order?: number }[],
  servizi: { service_type: string; service_subtype: string | null }[],
): CorsiaProposta[] {
  /* Gli scheletri di periodo (§391) sono un'altra cosa: descrivono cosa nasce
     **dentro** un trimestre, non le corsie del progetto. */
  const miei = new Set(templates
    .filter(t => t.is_active !== false && (t.kind ?? 'project') !== 'period'
      && servizi.some(s => s.service_type === t.service_type
        && (s.service_subtype ?? null) === (t.service_subtype ?? null)))
    .map(t => t.id))

  const per = new Map<string, CorsiaProposta>()
  nodi
    .filter(n => !n.parent_id && n.node_type === 'workstream' && miei.has(n.template_id))
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .forEach(n => {
      const k = normalizza(n.name)
      const gia = per.get(k)
      if (gia) { gia.quante++; return }
      per.set(k, {
        key: k, nome: n.name.trim(), quante: 1,
        tipo: n.workstream_type === 'recurring' ? 'recurring' : 'project',
      })
    })
  return Array.from(per.values()).sort((a, b) => b.quante - a.quante)
}
