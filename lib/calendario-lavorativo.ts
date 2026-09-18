/**
 * §355 — quali giorni non si lavora, e perché il calendario sbagliava giorno.
 *
 * **Tutto in UTC, e «oggi» in locale.** Il Gantt costruiva le colonne con
 * `new Date(iso + 'T00:00:00')` — mezzanotte **locale** — e poi rileggeva ogni
 * colonna con `toISOString()`, che è UTC: a Roma sono due ore indietro, quindi
 * la cella del 19 si dichiarava «2026-09-18» e il segno di oggi finiva sul
 * giorno dopo. Misurato il 18 settembre 2026: l'evidenziato era sabato 19.
 * Qui le colonne si contano in UTC — come le ricorrenze (§337) — mentre «oggi»
 * si legge dall'orologio di chi guarda, che è l'unico che sa che giorno è per
 * lui.
 *
 * **I festivi sono italiani e nazionali.** Il patrono no: cambia da città a
 * città, e un calendario che spegne un giorno lavorativo per metà squadra fa più
 * danno di uno che non ne spegne nessuno.
 */

const MS = 86_400_000

/** mezzanotte **UTC** di una data ISO: l'unico modo di contare giorni senza fusi */
export const giornoUTC = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

/** la data di **chi guarda**, non quella del server */
export function oggiLocale(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** ISO di un istante UTC (i giorni della griglia sono costruiti in UTC) */
export const isoUTC = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * La domenica di Pasqua, algoritmo di Gauss/Meeus — serve solo per avere il
 * **lunedì dopo**, che in Italia è festivo. È l'unica festa mobile del gruppo:
 * le altre stanno su una data fissa e si potrebbero scrivere a mano.
 */
export function pasqua(anno: number): string {
  const a = anno % 19
  const b = Math.floor(anno / 100)
  const c = anno % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mese = Math.floor((h + l - 7 * m + 114) / 31)
  const giorno = ((h + l - 7 * m + 114) % 31) + 1
  const p = (n: number) => String(n).padStart(2, '0')
  return `${anno}-${p(mese)}-${p(giorno)}`
}

/**
 * Le feste nazionali a data fissa, **col nome**: una colonna spenta di lunedì
 * senza una spiegazione si legge come un errore del calendario, non come il 25
 * aprile.
 */
const FISSE: Record<string, string> = {
  '01-01': 'Capodanno',
  '01-06': 'Epifania',
  '04-25': 'Liberazione',
  '05-01': 'Festa del lavoro',
  '06-02': 'Festa della Repubblica',
  '08-15': 'Ferragosto',
  '11-01': 'Ognissanti',
  '12-08': 'Immacolata',
  '12-25': 'Natale',
  '12-26': 'Santo Stefano',
}

const cachePasquetta = new Map<number, string>()
/** il lunedì dopo Pasqua */
export function pasquetta(anno: number): string {
  const c = cachePasquetta.get(anno)
  if (c) return c
  const v = isoUTC(giornoUTC(pasqua(anno)) + MS)
  cachePasquetta.set(anno, v)
  return v
}

/** il nome della festa, o null se quel giorno si lavora */
export function nomeFestivo(iso: string): string | null {
  const fissa = FISSE[iso.slice(5)]
  if (fissa) return fissa
  const anno = Number(iso.slice(0, 4))
  if (iso === pasqua(anno)) return 'Pasqua'
  return iso === pasquetta(anno) ? 'Pasquetta' : null
}

export const isFestivo = (iso: string) => nomeFestivo(iso) !== null

/** sabato o domenica, **contati in UTC** come le colonne della griglia */
export function isWeekend(iso: string): boolean {
  const g = new Date(giornoUTC(iso)).getUTCDay()
  return g === 0 || g === 6
}

/** il giorno in cui, normalmente, nessuno consegna niente */
export const nonLavorativo = (iso: string) => isWeekend(iso) || isFestivo(iso)

/** l'etichetta del perché: serve al titolo della colonna spenta */
export function perche(iso: string): string | null {
  const festa = nomeFestivo(iso)
  if (festa) return festa
  if (isWeekend(iso)) return new Date(giornoUTC(iso)).getUTCDay() === 6 ? 'Sabato' : 'Domenica'
  return null
}
