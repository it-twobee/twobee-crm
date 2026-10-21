/**
 * §358 — con quale area si apre il calendario, per chi lo apre.
 *
 * L'idea era leggere `profiles.area`. Misurata prima di scriverci sopra: è
 * **nulla per tutte e sette le persone attive**, quindi un default costruito su
 * quella colonna non avrebbe selezionato niente per nessuno — lo stesso difetto
 * di §339, un comportamento che nel codice esiste e nei dati no.
 *
 * Quindi l'area si **deduce dal lavoro**: quella che compare di più fra i
 * progetti in cui la persona è dentro, come membro o come PM. Sui dati veri
 * esce netta — chi fa marketing ha sei progetti marketing e uno digital — e non
 * chiede a nessuno di compilare un campo in più per far funzionare una
 * schermata.
 *
 * Resta un **default**, non un confine: è la prima cosa che si vede aprendo la
 * pagina, e si cambia con un clic. Per questo può permettersi di indovinare.
 */

/** l'ordine in cui le aree compaiono, e il criterio per sciogliere un pareggio */
export const AREE = ['growth', 'digital', 'marketing'] as const
export type Area = (typeof AREE)[number]
/** stringa vuota = «Tutte» */
export type AreaFiltro = '' | Area

const AMMESSE = new Set<string>(AREE)

/**
 * §484 — **il filtro area è un confine**: con «Marketing» scelto restano i soli
 * progetti marketing, nel calendario e nell'elenco. §358 teneva sempre visibili
 * i progetti in cui la persona è dentro, e su chi è dentro a tutto — una
 * manager che presidia growth e marketing — il filtro smetteva di filtrare:
 * scegliendo «Marketing» la riga di un cliente si apriva sul suo Lead
 * Generation. Segnalato due volte, il 9 e il 21 ottobre. Il lavoro proprio di
 * ogni area si vede con «Tutte».
 */
export function nellArea(areaProgetto: string | null | undefined, filtro: AreaFiltro): boolean {
  return !filtro || (areaProgetto ?? '').trim().toLowerCase() === filtro
}

/** chi governa non ha un'area: governa tutto, e il calendario glielo mostra */
export function vedeTutto(appRole: string | null | undefined): boolean {
  return appRole === 'admin' || appRole === 'founder' || appRole === 'super_admin'
}

export function areaDiPartenza(input: {
  appRole: string | null | undefined
  /** `profiles.area`, se qualcuno l'ha compilata: una scelta esplicita vince */
  areaProfilo?: string | null
  /** le aree dei progetti in cui la persona è dentro, una voce per progetto */
  areeDeiProgetti?: (string | null | undefined)[]
}): AreaFiltro {
  if (vedeTutto(input.appRole)) return ''
  const esplicita = (input.areaProfilo ?? '').trim().toLowerCase()
  if (AMMESSE.has(esplicita)) return esplicita as Area

  const conta = new Map<Area, number>()
  for (const a of input.areeDeiProgetti ?? []) {
    const k = (a ?? '').trim().toLowerCase()
    if (AMMESSE.has(k)) conta.set(k as Area, (conta.get(k as Area) ?? 0) + 1)
  }
  if (conta.size === 0) return ''

  /* A parità vince l'ordine di `AREE`: serve una risposta **stabile**, o la
     stessa persona aprirebbe la pagina su un'area diversa a ogni ricarico, e un
     default che cambia da solo è peggio di nessun default. */
  let scelta: Area = AREE[0]
  let max = -1
  for (const a of AREE) {
    const n = conta.get(a) ?? 0
    if (n > max) { max = n; scelta = a }
  }
  return max > 0 ? scelta : ''
}
