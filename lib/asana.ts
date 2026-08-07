/**
 * §215 · Asana — leggere un workspace che non ha una gerarchia
 *
 * Sezione **temporanea**: serve a portare dentro il lavoro che vive ancora su
 * Asana, e a sparire quando il travaso è finito. Per questo non tocca niente —
 * né su Asana né sul database: legge, classifica e dice cosa non torna.
 *
 * **La gerarchia sta nei nomi delle board, non nell'API.** I portfolio del PAT
 * di Marco sono zero e Asana vieta di listare quelli altrui (403), quindi
 * `"Fatima Leo - WEB SITE"` è una checklist di servizio e `"Fatima Leo"` è la
 * board master solo perché si chiamano così. Trattarle come progetti di pari
 * livello produce una lista piatta — errore già fatto e annullato il 2026-07-16.
 *
 * Il trattino da solo non basta a decidere: `"Josè Restaurant - Tenuta Villa
 * Guerra"` è un cliente con un nome che contiene un trattino, `"Elettra -GOOGLE
 * ADS"` è un servizio scritto senza spazio. Quello che distingue è il
 * **vocabolario dei servizi**: se la coda dopo il trattino è un servizio noto,
 * allora è una checklist; altrimenti il trattino fa parte del nome.
 *
 * Tutto qui dentro è puro e verificato da `asana.check.ts`.
 */

/** I servizi del catalogo, come compaiono nei nomi delle board. */
export const SERVICES = [
  'ANALISI & STRATEGIA', 'MARKETING AUTOMATION', 'META ADS', 'GOOGLE ADS',
  'REPORTING', 'TRACKING', 'WEB SITE', 'SOCIAL', 'SEO', 'COPY', 'BRANDING',
] as const

export type BoardKind = 'master' | 'servizio' | 'adhoc' | 'prospect' | 'interna'

export type Board = { gid: string; name: string }

export type BoardView = {
  gid: string
  name: string
  kind: BoardKind
  /** il nome del cliente ricavato dal nome della board, già normalizzato */
  clientName: string | null
  /** il servizio, solo sulle checklist */
  service: string | null
}

/** Confronto fra nomi scritti da persone: accenti, doppi spazi, maiuscole. */
export function norm(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * I refusi ci sono e non si correggono su Asana: si mappano qui.
 * «Sartoria Cpndotti», «Propsect - Land srl», «Plusvending» sono nomi veri
 * letti dal workspace il 2026-08-07. Correggerli là romperebbe i link che le
 * persone hanno nei preferiti; correggerli qui costa una riga.
 */
const TYPOS: Record<string, string> = {
  'sartoria cpndotti': 'sartoria condotti',
  plusvending: 'plus vending',
  icura: 'icura impresa',
  propsect: 'prospect',
}

const fixTypos = (s: string) => TYPOS[norm(s)] ?? norm(s)

/** Il servizio in coda al nome, se c'è. Tollera «-GOOGLE ADS» senza spazio. */
function tailService(name: string): { head: string; service: string } | null {
  const i = name.lastIndexOf('-')
  if (i < 0) return null
  const head = name.slice(0, i).trim()
  const tail = name.slice(i + 1).trim()
  if (!head || !tail) return null
  const hit = SERVICES.find(s => norm(s) === norm(tail))
  return hit ? { head, service: hit } : null
}

/**
 * Che cos'è una board. L'ordine dei controlli è la regola:
 *
 * 1. `Prospect - X` è pipeline commerciale, non lavoro da consegnare. Va
 *    riconosciuto **per primo** perché «Prospect - Sea Power» ha un cliente
 *    omonimo che è anche cliente vero: senza questo controllo il suo lavoro
 *    commerciale finirebbe fra le consegne.
 * 2. `Ad Hoc - X` sono richieste una tantum del cliente X.
 * 3. `X - SERVIZIO` è una checklist, solo se il servizio è nel vocabolario.
 * 4. Le board interne (TwoBee, sezioni orfane, duplicati) non hanno un cliente.
 * 5. Quello che resta è una board master: il progetto del cliente.
 */
export function classify(name: string): BoardView['kind'] {
  const n = norm(name)
  if (/^(prospect|propsect)\b/.test(n)) return 'prospect'
  if (n.startsWith('ad hoc')) return 'adhoc'
  if (tailService(name)) return 'servizio'
  // Una board che si chiama come un servizio e basta è una sezione orfana, non
  // il lavoro di qualcuno: «META ADS», «MARKETING AUTOMATION».
  if (SERVICES.some(s => norm(s) === n)) return 'interna'
  if (/\btwo ?bee\b|\bduplicate\b|\bonboarding\b|\battivita gia assegnate\b/.test(n)) return 'interna'
  return 'master'
}

/** Il cliente a cui la board si riferisce, come nome. `null` sulle interne. */
export function clientOf(name: string): string | null {
  const kind = classify(name)
  if (kind === 'interna') return null
  if (kind === 'prospect') return fixTypos(name.replace(/^\s*(prospect|propsect)\s*-\s*/i, ''))
  if (kind === 'adhoc') {
    const rest = name.replace(/^\s*ad hoc\s*-?\s*/i, '').trim()
    // «Ad Hoc TwoBee Interno» non ha un cliente
    return /two ?bee/i.test(rest) || !rest ? null : fixTypos(rest)
  }
  const t = tailService(name)
  return fixTypos(t ? t.head : name)
}

export function boardView(b: Board): BoardView {
  const kind = classify(b.name)
  return {
    gid: b.gid, name: b.name, kind,
    clientName: clientOf(b.name),
    service: kind === 'servizio' ? (tailService(b.name)?.service ?? null) : null,
  }
}

// ── Il travaso ──────────────────────────────────────────────────────────────

export type AsanaTask = {
  gid: string
  name: string
  boardGid: string
  section: string | null
  assigneeEmail: string | null
  dueOn: string | null
  notes: string | null
  isMilestone: boolean
  /** §217 — chiudere Asana vuol dire guardare anche quelle chiuse */
  completed: boolean
}

export type TaskRow = AsanaTask & {
  board: BoardView
  /** l'id del cliente TwoBee, quando il nome combacia */
  clientId: string | null
  /** §221 — come si è arrivati a quel cliente: un prefisso va controllato */
  clientMatch: 'esatto' | 'prefisso' | null
  /** l'id del profilo TwoBee, quando l'email combacia */
  profileId: string | null
  /** cosa impedisce di portarla dentro così com'è */
  blockers: string[]
}

/**
 * §221 — Il cliente della board, cercato in due passaggi.
 *
 * Prima il nome esatto. Poi, solo se non c'è, il **prefisso**: la board
 * «Industrial Service and Facility» è il cliente «Industrial Service», scritto
 * per esteso da chi l'ha creata. Senza questo passaggio finiva fra le orfane, e
 * l'unica alternativa sarebbe stata creare un secondo cliente uguale.
 *
 * Il prefisso si applica **solo se il candidato è uno**: due clienti che
 * cominciano allo stesso modo — «Fatima Leo» e «Fatima Leo Academy» — non si
 * scelgono da soli, perché indovinare male attacca il lavoro al cliente
 * sbagliato, che è peggio di lasciarlo orfano. E l'esito viaggia con la riga
 * (`esatto` / `prefisso`), così un abbinamento dedotto si può controllare invece
 * di scoprirlo dopo.
 */
export function matchClient(
  name: string | null,
  byName: Map<string, string>,
): { id: string | null; how: 'esatto' | 'prefisso' | null } {
  if (!name) return { id: null, how: null }
  const exact = byName.get(name)
  if (exact) return { id: exact, how: 'esatto' }

  const cands = Array.from(byName.entries()).filter(([k]) =>
    k !== name && (name.startsWith(k + ' ') || k.startsWith(name + ' ')))
  const ids = Array.from(new Set(cands.map(([, v]) => v)))
  return ids.length === 1 ? { id: ids[0], how: 'prefisso' } : { id: null, how: null }
}

/**
 * Ogni riga dice **se è pronta e perché no**, invece di essere scartata in
 * silenzio. Una task che non trova il cliente non è un errore da nascondere: è
 * la riga da guardare per capire se manca un'anagrafica o è solo un refuso.
 */
export function mapTasks(
  tasks: AsanaTask[],
  boards: Board[],
  clients: { id: string; name: string }[],
  profiles: { id: string; email: string }[],
): TaskRow[] {
  const byGid = new Map(boards.map(b => [b.gid, boardView(b)]))
  const clientByName = new Map(clients.map(c => [fixTypos(c.name), c.id]))
  const profileByEmail = new Map(profiles.map(p => [p.email.toLowerCase(), p.id]))

  return tasks.map(t => {
    const board = byGid.get(t.boardGid) ?? boardView({ gid: t.boardGid, name: '—' })
    const { id: clientId, how: clientMatch } = matchClient(board.clientName, clientByName)
    const profileId = t.assigneeEmail ? profileByEmail.get(t.assigneeEmail.toLowerCase()) ?? null : null

    const blockers: string[] = []
    if (board.kind === 'prospect') blockers.push('board commerciale, non lavoro da consegnare')
    if (board.kind === 'interna') blockers.push('board interna, nessun cliente')
    if (board.clientName && !clientId) blockers.push(`cliente «${board.clientName}» non in anagrafica`)
    if (t.assigneeEmail && !profileId) blockers.push(`«${t.assigneeEmail}» non ha un profilo`)
    if (!t.assigneeEmail) blockers.push('nessun assegnatario')

    return { ...t, board, clientId, clientMatch, profileId, blockers }
  })
}

/** Quante ne passerebbero, quante no, e per quale ragione. */
export function summarize(rows: TaskRow[]) {
  const reasons = new Map<string, number>()
  for (const r of rows) for (const b of r.blockers) reasons.set(b, (reasons.get(b) ?? 0) + 1)
  const ready = rows.filter(r => r.blockers.length === 0)
  return {
    total: rows.length,
    ready: ready.length,
    blocked: rows.length - ready.length,
    byKind: (['master', 'servizio', 'adhoc', 'prospect', 'interna'] as BoardKind[])
      .map(k => ({ kind: k, count: rows.filter(r => r.board.kind === k).length }))
      .filter(x => x.count > 0),
    reasons: Array.from(reasons, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  }
}

/**
 * §219 — Quante task si cancellano su Asana in una sola chiamata.
 *
 * Mille task sono mille richieste HTTP: in una server action sola andrebbe in
 * timeout a metà, lasciando cancellato un pezzo e nessuno che sa quale. Il
 * chiamante cicla su lotti di questa misura e mostra l'avanzamento — quaranta
 * sta comodamente dentro il tempo di una richiesta anche col 429 di mezzo.
 */
export const ASANA_DELETE_BATCH = 40

// ── Il triage ───────────────────────────────────────────────────────────────

/** Tre risposte, e nessuna è «forse»: chi resta senza riga è ancora da decidere. */
export type Decision = 'tieni' | 'elimina' | 'migrata'

/**
 * La struttura vista per cliente: è così che si decide cosa buttare.
 *
 * Guardare 146 board in ordine alfabetico non aiuta — «Icura - META ADS» e
 * «Ad Hoc - Icura» sono lo stesso cliente e si decidono insieme. Raggruppare per
 * cliente mette davanti la domanda vera: *di questo cliente, cosa resta da fare?*
 *
 * Le board senza cliente (interne, commerciali) finiscono in un gruppo apposta e
 * non spariscono: sono esattamente quelle che di solito si buttano, e una lista
 * che le nasconde fa chiudere Asana con dentro roba mai guardata.
 */
export type ClientGroup = {
  clientName: string | null
  clientId: string | null
  boards: {
    board: BoardView
    total: number
    open: number
    decided: number
  }[]
  total: number
  open: number
  decided: number
}

export function groupByClient(rows: TaskRow[], decided: Set<string>): ClientGroup[] {
  const groups = new Map<string, ClientGroup>()
  for (const r of rows) {
    const key = r.board.clientName ?? '\u0000senza'
    let g = groups.get(key)
    if (!g) {
      g = { clientName: r.board.clientName, clientId: r.clientId, boards: [], total: 0, open: 0, decided: 0 }
      groups.set(key, g)
    }
    // l'id del cliente lo porta la prima riga che ce l'ha: alcune board dello
    // stesso cliente non lo agganciano (refusi già corretti a monte, non tutti)
    if (!g.clientId && r.clientId) g.clientId = r.clientId
    let b = g.boards.find(x => x.board.gid === r.board.gid)
    if (!b) { b = { board: r.board, total: 0, open: 0, decided: 0 }; g.boards.push(b) }
    const isDecided = decided.has(r.gid)
    b.total++; g.total++
    if (!r.completed) { b.open++; g.open++ }
    if (isDecided) { b.decided++; g.decided++ }
  }
  Array.from(groups.values()).forEach(g => g.boards.sort((a, b) => b.open - a.open || a.board.name.localeCompare(b.board.name)))
  return Array.from(groups.values()).sort((a, b) => {
    // Il gruppo senza cliente per ultimo: è quello che si guarda alla fine.
    if (!a.clientName !== !b.clientName) return a.clientName ? -1 : 1
    return b.open - a.open || (a.clientName ?? '').localeCompare(b.clientName ?? '')
  })
}

/** Quanto manca: è la sola cosa che rende finito un lavoro che sembra infinito. */
export function triageProgress(rows: TaskRow[], decided: Set<string>) {
  const total = rows.length
  const done = rows.filter(r => decided.has(r.gid)).length
  return { total, done, left: total - done, pct: total ? Math.round((done / total) * 100) : 100 }
}

// ── Le risorse ──────────────────────────────────────────────────────────────

export type AsanaUser = { gid: string; name: string; email: string | null }

export type ResourceView = {
  gid: string
  name: string
  email: string | null
  /** il profilo TwoBee, quando l'email combacia */
  profileId: string | null
  /** quante task attive ha addosso, e quante di quelle sono pronte */
  tasks: number
  ready: number
}

/**
 * Le persone prima delle task, perché è da lì che si guarda una migrazione:
 * «cosa ha in mano Michele» è la domanda con cui si decide cosa spostare, non
 * «quali task esistono». Chi non ha un profilo TwoBee resta in elenco con zero
 * al posto dell'aggancio — sparire sarebbe il modo di non accorgersi che a
 * qualcuno mancano venti task.
 */
export function resourceViews(
  users: AsanaUser[],
  rows: TaskRow[],
  profiles: { id: string; email: string }[],
): ResourceView[] {
  const byEmail = new Map(profiles.map(p => [p.email.toLowerCase(), p.id]))
  const counted = new Map<string, { tasks: number; ready: number }>()
  for (const r of rows) {
    const k = (r.assigneeEmail ?? '').toLowerCase()
    const cur = counted.get(k) ?? { tasks: 0, ready: 0 }
    counted.set(k, { tasks: cur.tasks + 1, ready: cur.ready + (r.blockers.length === 0 ? 1 : 0) })
  }

  const views = users.map(u => {
    const k = (u.email ?? '').toLowerCase()
    /* Una risorsa Asana senza email non è «la persona a cui vanno le task senza
       assegnatario»: sono due vuoti diversi. Confonderli faceva contare due
       volte le orfane — una qui e una nella riga apposta — e la somma delle
       risorse non tornava col totale. */
    const c = (k ? counted.get(k) : undefined) ?? { tasks: 0, ready: 0 }
    return {
      gid: u.gid, name: u.name, email: u.email,
      profileId: k ? byEmail.get(k) ?? null : null,
      tasks: c.tasks, ready: c.ready,
    }
  })

  /* Le task senza assegnatario non appartengono a nessuno ma esistono: una riga
     apposta, altrimenti la somma delle risorse non fa il totale e non si capisce
     dove siano finite. */
  const orphan = counted.get('')
  if (orphan) {
    views.push({ gid: '', name: 'Nessun assegnatario', email: null, profileId: null, ...orphan })
  }

  return views.sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name))
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'board', 'tipo', 'cliente', 'cliente_id', 'servizio', 'sezione',
  'task', 'assegnatario', 'profilo_id', 'scadenza', 'milestone', 'completata',
  'decisione', 'note', 'blocchi', 'asana_gid',
] as const

/** Le virgolette si raddoppiano: un titolo con un apice spaccava la colonna. */
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: TaskRow[], decisions: Map<string, Decision> = new Map()): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const r of rows) {
    lines.push([
      r.board.name, r.board.kind, r.board.clientName ?? '', r.clientId ?? '',
      r.board.service ?? '', r.section ?? '', r.name, r.assigneeEmail ?? '',
      r.profileId ?? '', r.dueOn ?? '', r.isMilestone ? 'sì' : '',
      r.completed ? 'sì' : '', decisions.get(r.gid) ?? '',
      (r.notes ?? '').replace(/\s+/g, ' ').slice(0, 500),
      r.blockers.join(' · '), r.gid,
    ].map(cell).join(','))
  }
  // BOM: senza, Excel in italiano legge gli accenti come simboli
  return '﻿' + lines.join('\n')
}
