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
