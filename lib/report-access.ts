/**
 * §344 — Il foglio riservato si chiede, non si nega.
 *
 * `/api/compensi` è un documento che si manda a **chi il compenso lo riceve**,
 * e chi lo riceve nel tool non entra (§334). Finché la porta rispondeva
 * «Permesso negato» in tre parole, il link condiviso diventava una telefonata:
 * chi lo apriva non sapeva a chi chiedere, e chi lo aveva mandato non sapeva
 * che qualcuno stava aspettando. Un rifiuto senza una strada non protegge
 * niente: fa solo rimbalzare la domanda su un altro canale, di solito peggiore.
 *
 * Tre regole governano il permesso:
 *
 *   1. **È del documento, non della persona.** Si approva «i compensi di agosto
 *      a Tizio», non «Tizio». Un altro mese è un'altra richiesta: costa un clic
 *      a chi approva e non regala dodici fogli a chi ne ha chiesto uno.
 *   2. **Scade.** Un permesso che non scade è un permesso che nessuno revoca:
 *      vale il tempo di leggere un bonifico, non quello di dimenticarselo
 *      aperto. Alla scadenza la porta torna a chiedere, non a negare.
 *   3. **Il nome non è un'identità, e il foglio non finge il contrario.** Chi
 *      approva sa quello che ha scritto chi chiede, più l'account se ne aveva
 *      uno. È la stessa fiducia di un link mandato via mail, con in più il
 *      gesto di qualcuno che dice sì — e la traccia di chi l'ha detto.
 *
 * Qui c'è solo il dominio: nessuna query, così il gate si prova senza database
 * (`npx tsx lib/report-access.check.ts`). La porta sta in `lib/report-gate.ts`.
 */

export type AccessStatus = 'pending' | 'approved' | 'denied'

/** La riga come sta a database: i nomi delle colonne, non quelli della UI. */
export type AccessRow = {
  id: string
  token: string
  resource: string
  scope: string
  first_name: string
  last_name: string
  requester_email: string | null
  status: AccessStatus
  created_at: string
  decided_at: string | null
  expires_at: string | null
  opened_n?: number | null
}

/** Sta sotto `/api`: è l'unico posto in cui questa chiave serve. */
export const ACCESS_COOKIE = 'tb_report_key'
/** Il browser ricorda chi è: un secondo mese si chiede senza riscrivere il nome. */
export const COOKIE_DAYS = 180
/** Quanto dura un sì. */
export const GRANT_DAYS = 14
/**
 * Quante richieste aperte sopporta un documento prima di chiudere il modulo.
 * Non è una difesa dai furbi — il cookie se lo cancella chiunque — è il tetto
 * che impedisce a un ciclo di riempire la campanella di chi deve decidere.
 */
export const MAX_PENDING = 30

export const RESOURCE_LABELS: Record<string, string> = { compensi: 'Compensi' }

/**
 * Lo stato che la porta deve mostrare. `scaduto` è diverso da `negato`: al
 * primo si offre di richiedere, al secondo no — o un rifiuto sarebbe solo
 * l'inizio di un ciclo.
 */
export type ViewState = 'nuovo' | 'attesa' | 'aperto' | 'scaduto' | 'negato'

export function viewState(row: AccessRow | null | undefined, now: string): ViewState {
  if (!row) return 'nuovo'
  if (row.status === 'denied') return 'negato'
  if (row.status === 'pending') return 'attesa'
  /* Approvato senza scadenza non lo produce nessuno, ma una porta non si chiude
     per un campo vuoto: chi ha detto sì l'ha detto. */
  if (!row.expires_at) return 'aperto'
  return new Date(row.expires_at).getTime() > new Date(now).getTime() ? 'aperto' : 'scaduto'
}

/** Il nome come lo scrive chi chiede, ripulito di quello che non è un nome. */
export function normName(s: string): string {
  return String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 40)
}

/* Si dice cosa **non** è un nome, non quali alfabeti lo sono: un elenco di
   lettere ammesse lascia sempre fuori qualcuno — «Nguyễn», «Trần», un cognome
   in cirillico — e il campo si chiama «Cognome», non «Cognome italiano». Quello
   che si tiene fuori sono cifre, markup e indirizzi: chi incolla un link nel
   campo del nome non sta scrivendo il proprio nome, e quel testo finisce
   davanti a chi deve decidere. */
const NON_NOME = /[0-9<>&"/\\@:;()[\]{}|*#$%^=+_~`!?,]/
const INIZIO_OK = /^[^\s.'’-]/

/** Il messaggio d'errore da mostrare, o `null` se va bene. */
export function checkNames(first: string, last: string): string | null {
  const f = normName(first)
  const l = normName(last)
  if (f.length < 2 || l.length < 2) return 'Servono nome e cognome, scritti per intero.'
  if (NON_NOME.test(f) || NON_NOME.test(l) || !INIZIO_OK.test(f) || !INIZIO_OK.test(l))
    return 'Nome e cognome accettano lettere, apostrofi e trattini.'
  return null
}

export function fullName(r: { first_name: string; last_name: string }): string {
  return `${normName(r.first_name)} ${normName(r.last_name)}`.trim()
}

/** Quando scade un sì dato adesso. */
export function grantEnd(now: string, days = GRANT_DAYS): string {
  return new Date(new Date(now).getTime() + days * 86_400_000).toISOString()
}

/**
 * La chiave del browser. Non è un segreto condiviso: chi ce l'ha è solo chi ha
 * chiesto, e da sola non apre niente finché un admin non decide.
 */
export function newToken(): string {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

/** `2026-08-01` → `agosto 2026`, senza tirarsi dietro il motore del conto economico. */
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export function scopeLabel(scope: string): string {
  const [y, m] = scope.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return scope
  return `${MESI[m - 1]} ${y}`
}

/** Il mese chiesto nell'indirizzo, o niente: uno `scope` non si inventa. */
export function monthParam(raw: string | null): string | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(raw.trim())
  if (!m) return null
  const mm = Number(m[2])
  if (mm < 1 || mm > 12) return null
  return `${m[1]}-${m[2]}-01`
}
