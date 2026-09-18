/**
 * §357 — le date che muovono le campagne.
 *
 * Il calendario milestone spegne i giorni in cui **non si consegna** (§355);
 * questo accende quelli in cui si lavora di più. Sono due domande opposte e
 * infatti hanno due colori diversi: il weekend e i festivi sono una colonna
 * spenta, una data marketing è una colonna che chiede attenzione.
 *
 * **Poche e vere.** Ogni data in più abbassa il valore di tutte le altre: una
 * colonna colorata dice «guarda qui» solo finché resta rara. Qui ci sono i
 * giorni che cambiano davvero il piano editoriale di un cliente — non le
 * giornate mondiali di qualcosa, che sono trecentosessantacinque.
 *
 * **La Black Week è una settimana, non un venerdì**: le creatività partono il
 * lunedì prima, e segnare il solo venerdì significherebbe segnare il giorno in
 * cui è già tardi. È l'unica finestra; tutto il resto è un giorno solo.
 *
 * Gate: `npx tsx lib/date-marketing.check.ts`.
 */

const MS = 86_400_000
const giorno = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const pad = (n: number) => String(n).padStart(2, '0')

export type Ricorrenza = {
  nome: string
  /** cosa vuol dire per chi pianifica: il riquadro lo mostra sotto il nome */
  nota: string
}

/** l'n-esimo `dow` del mese (dow: 0 domenica … 6 sabato) */
function nesimo(anno: number, mese: number, dow: number, n: number): string {
  const primo = new Date(Date.UTC(anno, mese - 1, 1))
  const salto = (dow - primo.getUTCDay() + 7) % 7
  return iso(primo.getTime() + (salto + (n - 1) * 7) * MS)
}

/** venerdì dopo il quarto giovedì di novembre */
export const blackFriday = (anno: number) => iso(giorno(nesimo(anno, 11, 4, 4)) + MS)
export const cyberMonday = (anno: number) => iso(giorno(blackFriday(anno)) + 3 * MS)
/** da lunedì a Cyber Monday: la settimana in cui si consegna davvero */
export const blackWeek = (anno: number) => ({
  da: iso(giorno(blackFriday(anno)) - 4 * MS),
  a: cyberMonday(anno),
})
export const festaDellaMamma = (anno: number) => nesimo(anno, 5, 0, 2)
/** primo sabato di luglio: la data nazionale dei saldi estivi */
export const saldiEstivi = (anno: number) => nesimo(anno, 7, 6, 1)
/** primo lunedì di settembre: il rientro, quando ripartono i piani */
export const rientro = (anno: number) => nesimo(anno, 9, 1, 1)

const FISSE: Record<string, Ricorrenza> = {
  '02-14': { nome: 'San Valentino', nota: 'Campagne coppia e regalo: si prepara da fine gennaio.' },
  '03-08': { nome: 'Festa della donna', nota: 'Comunicazione delicata: si sbaglia più per come si dice che per cosa.' },
  '03-19': { nome: 'Festa del papà', nota: 'Regalo e ristorazione, in Italia coincide con San Giuseppe.' },
  '10-31': { nome: 'Halloween', nota: 'Picco social e retail: i contenuti escono da metà ottobre.' },
  '11-11': { nome: 'Singles\' Day', nota: 'Il warm-up del Black Friday: chi vende online lo usa per testare.' },
  '12-01': { nome: 'Via il calendario dell\'avvento', nota: 'Da qui a Natale è un contenuto al giorno: si prepara a novembre.' },
  '01-05': { nome: 'Saldi invernali', nota: 'Data indicativa: cambia di qualche giorno da regione a regione.' },
}

/**
 * La ricorrenza di quel giorno, se ce n'è una.
 *
 * L'ordine conta: prima le date calcolate — Black Friday e Cyber Monday hanno
 * un nome proprio dentro la settimana che li contiene — poi la finestra, poi
 * le fisse.
 */
export function ricorrenzaMarketing(giornoIso: string): Ricorrenza | null {
  const anno = Number(giornoIso.slice(0, 4))

  if (giornoIso === blackFriday(anno)) {
    return { nome: 'Black Friday', nota: 'Il giorno. Se si prepara oggi, è già tardi da una settimana.' }
  }
  if (giornoIso === cyberMonday(anno)) {
    return { nome: 'Cyber Monday', nota: 'Coda del Black Friday, tutta online: ultima finestra utile.' }
  }
  const bw = blackWeek(anno)
  if (giornoIso >= bw.da && giornoIso <= bw.a) {
    return { nome: 'Black Week', nota: 'La settimana in cui si consegna: le creatività partono lunedì.' }
  }
  if (giornoIso === festaDellaMamma(anno)) {
    return { nome: 'Festa della mamma', nota: 'Seconda domenica di maggio: regalo, ristorazione, floreale.' }
  }
  if (giornoIso === saldiEstivi(anno)) {
    return { nome: 'Saldi estivi', nota: 'Primo sabato di luglio: la data nazionale, poi ogni regione fa da sé.' }
  }
  if (giornoIso === rientro(anno)) {
    return { nome: 'Rientro', nota: 'Primo lunedì di settembre: ripartono budget, piani e buoni propositi.' }
  }
  return FISSE[giornoIso.slice(5)] ?? null
}

export const isMarketing = (giornoIso: string) => ricorrenzaMarketing(giornoIso) !== null

/** utile ai gate e a chi vuole elencarle: le ricorrenze di un anno, in ordine */
export function ricorrenzeDi(anno: number): { data: string; nome: string }[] {
  const out: { data: string; nome: string }[] = []
  for (let t = giorno(`${anno}-01-01`); t <= giorno(`${anno}-12-31`); t += MS) {
    const d = iso(t)
    const r = ricorrenzaMarketing(d)
    if (r) out.push({ data: d, nome: r.nome })
  }
  return out
}

/** `MM-DD` → per i test leggibili */
export const mmdd = (anno: number, mese: number, g: number) => `${anno}-${pad(mese)}-${pad(g)}`
