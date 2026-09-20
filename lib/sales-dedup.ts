/**
 * §377 — riconoscere un lead che c'è già.
 *
 * La regola è quella dei clienti (§326) e vale per la stessa ragione: **non
 * si unisce niente per somiglianza**. Un doppione trovato *blocca* e chiede
 * una scelta a chi sta inserendo — che è l'unico che sa se «Rossi Srl» e
 * «Rossi S.r.l.» sono la stessa azienda o due fratelli in due capannoni
 * diversi. Un programma che decide da solo sbaglia raramente, e quando
 * sbaglia unisce due storie commerciali senza modo di separarle.
 *
 * **Tre chiavi, in ordine di certezza.** Il telefono e l'email identificano
 * una persona: se coincidono è quasi sempre lo stesso lead, anche scritto in
 * un altro modo. Il nome azienda no — identifica un nome, e i nomi si
 * somigliano. Per questo il verdetto dice **su cosa** ha trovato la
 * somiglianza: «stesso telefono» e «nome simile» meritano due decisioni
 * diverse, e mostrarle uguali le farebbe trattare uguale.
 *
 * Gate: `npx tsx lib/sales-dedup.check.ts`.
 */

/** solo cifre, e poi le ultime nove: il prefisso internazionale non distingue nessuno */
export function telefonoChiave(v: string | null | undefined): string | null {
  const cifre = String(v ?? '').replace(/\D/g, '')
  if (cifre.length < 6) return null
  // +39 320 267 7770, 3202677770 e 0039 320 2677770 sono lo stesso numero
  return cifre.slice(-9)
}

export const emailChiave = (v: string | null | undefined): string | null => {
  const t = String(v ?? '').trim().toLowerCase()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null
}

/**
 * Il nome ridotto all'osso: minuscolo, senza forma societaria, senza
 * punteggiatura, spazi normalizzati.
 *
 * «Rossi S.r.l.», «ROSSI srl» e «Rossi  S R L» diventano `rossi`. Non è per
 * unirli — è per **accorgersene**: senza questo passaggio un doppione scritto
 * con un punto in più non verrebbe mai trovato, e il controllo servirebbe
 * solo contro il copia-incolla identico.
 */
/* Le forme societarie, **dopo** che la punteggiatura è già via: `s.r.l.`
   diventa `s r l`, quindi il modello deve accettare le lettere spaziate.
   Cercarle prima, con i punti, era il difetto — il gate l'ha preso al primo
   giro su «ROSSI SRL».

   Qui ci sono solo le forme giuridiche. `ditta`, `impresa`, `group` e
   `holding` sono rimaste fuori apposta: fanno parte del nome, e toglierle
   farebbe coincidere «Impresa Verdi» con «Verdi Srl», che sono due aziende
   diverse abbastanza spesso da non poterlo dare per scontato. */
const FORME = /\b(s\s?r\s?l\s?s?|s\s?p\s?a|s\s?n\s?c|s\s?a\s?s|societa a responsabilita limitata|società a responsabilità limitata|societa|società)\b/g

export function nomeChiave(v: string | null | undefined): string | null {
  const t = String(v ?? '')
    .toLowerCase()
    .replace(/[.,'"`’&]/g, ' ')
    .replace(/[^a-z0-9àèéìòù ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(FORME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length >= 3 ? t : null
}

export type Candidato = {
  id: string
  company_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  sheet_row_id?: string | null
  stage?: string | null
}

export type Nuovo = {
  companyName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  sheetRowId?: string | null
}

export type Motivo = 'riga_foglio' | 'telefono' | 'email' | 'nome'

export type Somiglianza = {
  esistente: Candidato
  motivi: Motivo[]
  /** `true` quando almeno un motivo identifica una persona, non un nome */
  certo: boolean
}

export const SPIEGA: Record<Motivo, string> = {
  riga_foglio: 'la stessa riga del foglio',
  telefono: 'lo stesso telefono',
  email: 'la stessa email',
  nome: 'un nome molto simile',
}

/**
 * Tutti i lead che potrebbero essere questo, col perché.
 *
 * Non restituisce «il» duplicato ma l'elenco: se un telefono compare su due
 * righe diverse, il problema non è quale scegliere — è che ce ne sono due, e
 * chi inserisce deve vederlo.
 */
export function somiglianze(nuovo: Nuovo, esistenti: Candidato[]): Somiglianza[] {
  const tel = telefonoChiave(nuovo.contactPhone)
  const mail = emailChiave(nuovo.contactEmail)
  const nome = nomeChiave(nuovo.companyName)
  const riga = (nuovo.sheetRowId ?? '').trim() || null

  const out: Somiglianza[] = []
  for (const e of esistenti) {
    const motivi: Motivo[] = []
    if (riga && (e.sheet_row_id ?? '').trim() === riga) motivi.push('riga_foglio')
    if (tel && telefonoChiave(e.contact_phone) === tel) motivi.push('telefono')
    if (mail && emailChiave(e.contact_email) === mail) motivi.push('email')
    if (nome && nomeChiave(e.company_name) === nome) motivi.push('nome')
    if (motivi.length) {
      out.push({ esistente: e, motivi, certo: motivi.some(m => m !== 'nome') })
    }
  }
  // prima i certi, poi chi ha più indizi: chi decide guarda il primo
  return out.sort((a, b) => Number(b.certo) - Number(a.certo) || b.motivi.length - a.motivi.length)
}

/** la frase da mostrare: dice cosa ha trovato, non «errore» */
export function spiegaSomiglianza(s: Somiglianza): string {
  const quali = s.motivi.map(m => SPIEGA[m]).join(' e ')
  return `${s.esistente.company_name || 'Un lead senza nome'} ha ${quali}`
}
