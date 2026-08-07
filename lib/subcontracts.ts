/**
 * Il subappalto, letto allo stesso modo da tutte le sezioni — calcoli puri.
 *
 * Un lavoro affidato fuori è **un solo fatto** che si vede da quattro posti: la
 * scheda del progetto, il piano dei costi, il conto economico del mese e il
 * margine del cliente. Finché ogni posto se lo raccontava a modo suo i conti non
 * tornavano: nel conto economico si leggeva «Subappalto — Rata 2 di 6» senza
 * sapere di quale progetto né a chi, in Costi & budget si poteva cambiare
 * l'importo creando un secondo numero, e nel progetto non si vedeva se quella
 * rata fosse mai atterrata in un mese.
 *
 * ## La gerarchia, che è la cosa importante
 *
 *   1. **Sorgente: il progetto.** Un subappalto nasce, cambia, si sospende e si
 *      elimina dalla scheda Economics del progetto. Lì stanno importo, fornitore,
 *      frequenza e finestra di validità. È l'unico posto dove si *scrive* un patto.
 *
 *   2. **Atterraggio: il conto economico.** «Porta nel mese» crea l'occorrenza.
 *      Lì — e solo lì — si scrive **quanto è uscito davvero** e **se è stato
 *      pagato**: il preventivato resta quello del progetto, perché due numeri per
 *      lo stesso patto sono due numeri di cui nessuno si fida.
 *
 *   3. **Lettura: Costi & budget e il cliente.** Raggruppano e sommano — per
 *      subappaltatore il primo, per margine il secondo — e non modificano niente:
 *      ogni riga porta il link al progetto, che è dove si cambia.
 *
 * La regola in una riga: **il patto si scrive sul progetto, il fatto nel mese,
 * tutto il resto legge.**
 */

export type SubItem = {
  id: string
  label: string
  supplier: string | null
  amount: number
  frequency: string
  is_active: boolean
  project_id: string | null
  start_month?: string | null
  end_month?: string | null
}

export type SubLine = {
  id: string
  label: string
  budget: number
  actual: number
  paid: boolean
  project_id?: string | null
  cost_item_id?: string | null
  center_id?: string | null
  note?: string | null
}

/**
 * Lo stato di un subappalto nel mese che si sta guardando.
 *
 * `orfano` è quello che conta: una riga di costo con un progetto ma senza la sua
 * voce di piano è un subappalto che qualcuno ha scritto a mano o di cui è stata
 * cancellata la sorgente. Il margine del progetto continua a pagarlo, e nessuna
 * scheda progetto lo mostra: è esattamente il buco che fa non tornare i conti.
 */
export type SubStatus = 'pianificato' | 'nel mese' | 'pagato' | 'orfano' | 'scostato'

export type SubcontractView = {
  /** la voce di piano: la sorgente. `null` = riga orfana, senza patto dietro */
  itemId: string | null
  /** la riga del mese, quando c'è già */
  lineId: string | null
  label: string
  supplier: string | null
  projectId: string | null
  projectName: string | null
  clientId: string | null
  clientName: string | null
  /** quanto dice il patto per questo mese */
  planned: number
  /** quanto è atterrato nel conto economico */
  booked: number
  /** quanto è stato pagato davvero */
  paid: number
  /** booked − planned: se non è zero, uno dei due va corretto */
  drift: number
  status: SubStatus
  /** dove si modifica: sempre il progetto */
  href: string | null
  /** §193 — il mese in cui il patto la mette, quando non è questo */
  wrongMonth?: string | null
}

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0))

/** Ogni quanto torna una voce, in mesi. `una_tantum` non torna. */
const EVERY: Record<string, number> = {
  mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12,
}

const first = (m: string) => `${m.slice(0, 7)}-01`
const monthsApart = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)))

/**
 * Questa voce cade nel mese indicato?
 *
 * `una_tantum` cade nel suo mese d'inizio e in nessun altro. Un ricorrente cade
 * quando la distanza dall'inizio è un multiplo del passo — non ogni mese, che è
 * l'errore che fa sembrare un canone annuale dodici volte più caro.
 */
export function fallsIn(item: SubItem, month: string): boolean {
  if (!item.is_active) return false
  const m = first(month)
  const start = item.start_month ? first(item.start_month) : null
  const end = item.end_month ? first(item.end_month) : null
  if (start && m < start) return false
  if (end && m > end) return false
  if (item.frequency === 'una_tantum') return !start || start === m
  const step = EVERY[item.frequency] ?? 1
  if (!start) return true
  const d = monthsApart(start, m)
  return d >= 0 && d % step === 0
}

/**
 * Le viste di un mese: una per patto che cade, più le righe orfane.
 *
 * Si parte dalle **righe del mese** e non dal piano, perché una riga esiste anche
 * senza patto e va vista comunque. Poi si aggiungono i patti che dovrebbero
 * esserci e non sono ancora atterrati: quelli sono lavoro da fare, non un errore.
 */
export function subcontractViews(
  items: SubItem[],
  lines: SubLine[],
  month: string,
  names: {
    project: Record<string, string>
    client: Record<string, string>
    /** progetto → cliente: il subappalto è del progetto, il margine è del cliente */
    clientOf: Record<string, string>
  },
): SubcontractView[] {
  const own = items.filter(i => !!i.project_id)
  const byId = new Map(own.map(i => [i.id, i]))
  const out: SubcontractView[] = []
  const usati = new Set<string>()

  const nameOf = (projectId: string | null) => ({
    projectName: projectId ? (names.project[projectId] ?? null) : null,
    clientId: projectId ? (names.clientOf[projectId] ?? null) : null,
    clientName: projectId && names.clientOf[projectId]
      ? (names.client[names.clientOf[projectId]] ?? null) : null,
  })

  for (const l of lines.filter(x => !!x.project_id)) {
    const item = l.cost_item_id ? byId.get(l.cost_item_id) ?? null : null
    if (item) usati.add(item.id)
    const planned = item ? item.amount : l.budget
    const booked = l.actual
    const drift = r2(booked - planned)
    /* Il fornitore: dalla sorgente quando c'è, altrimenti dalla nota che
       «Porta nel mese» ci ha scritto. Una riga senza né l'una né l'altra è una
       riga di cui non si sa a chi è andato il denaro. */
    const supplier = item?.supplier ?? (l.note?.trim() || null)
    /* Una una tantum ha un mese suo: se la riga sta altrove, due mesi pagano lo
       stesso acconto. I ricorrenti tornano, quindi per loro non c'è mese sbagliato. */
    const wrongMonth = item && item.frequency === 'una_tantum' && item.start_month
      && item.start_month.slice(0, 7) !== month.slice(0, 7)
      ? item.start_month.slice(0, 7) : null
    out.push({
      itemId: item?.id ?? null, lineId: l.id,
      label: item?.label ?? l.label, supplier,
      projectId: l.project_id ?? null, ...nameOf(l.project_id ?? null),
      planned, booked, paid: l.paid ? booked : 0, drift,
      status: !item ? 'orfano'
        : Math.abs(drift) >= 0.01 ? 'scostato'
        : l.paid ? 'pagato' : 'nel mese',
      href: l.project_id ? `/progetti/${l.project_id}?tab=economics` : null,
      wrongMonth,
    })
  }

  // i patti che cadono in questo mese e non sono ancora atterrati
  for (const i of own) {
    if (usati.has(i.id) || !fallsIn(i, month)) continue
    out.push({
      itemId: i.id, lineId: null, label: i.label, supplier: i.supplier,
      projectId: i.project_id ?? null, ...nameOf(i.project_id ?? null),
      planned: i.amount, booked: 0, paid: 0, drift: 0,
      status: 'pianificato',
      href: i.project_id ? `/progetti/${i.project_id}?tab=economics` : null,
    })
  }

  return out.sort((a, b) => b.planned - a.planned || a.label.localeCompare(b.label, 'it'))
}

/** Per subappaltatore: è la domanda «quanto do a chi» e quella che si negozia. */
export function bySupplierView(views: SubcontractView[]): {
  supplier: string | null
  rows: SubcontractView[]
  planned: number; booked: number; paid: number
  projects: number
}[] {
  const map = new Map<string, SubcontractView[]>()
  for (const v of views) map.set(v.supplier ?? '', [...(map.get(v.supplier ?? '') ?? []), v])
  return Array.from(map, ([k, rows]) => ({
    supplier: k || null, rows,
    planned: sum(rows.map(r => r.planned)),
    booked: sum(rows.map(r => r.booked)),
    paid: sum(rows.map(r => r.paid)),
    projects: new Set(rows.map(r => r.projectId).filter(Boolean)).size,
  })).sort((a, b) => {
    // chi non ha un nome per ultimo: è il gruppo da sistemare, non da leggere
    if (!a.supplier) return 1
    if (!b.supplier) return -1
    return b.planned - a.planned
  })
}

export type ProjectMarginRow = {
  projectId: string | null
  projectName: string | null
  clientId: string | null
  clientName: string | null
  revenue: number
  external: number
  margin: number
  pct: number
  rows: SubcontractView[]
  /**
   * §207 — il ricavo di questo lavoro sta su un accordo che ne copre altri, e
   * quanto ne spetti a lui **non si sa**: dei 3.600 di iCura nessuno sa quanto
   * sia sito e quanto lead generation. Il margine qui non si può calcolare, e
   * mostrarne uno negativo perché il ricavo è finito altrove sarebbe peggio di
   * non mostrarlo: manderebbe a cercare una rata che è al posto giusto.
   */
  sharedRevenue: boolean
}

/**
 * Il margine del mese per progetto: ricavo meno i lavori affidati fuori.
 *
 * Vale il **booked** dove la riga è atterrata e il **planned** dove no: un
 * subappalto pianificato e non ancora registrato è un costo che arriverà, e
 * ignorarlo mostrerebbe un margine che il mese prossimo si sgonfia da solo.
 *
 * Il tempo del team interno non c'è, per scelta: sta nel costo del lavoro
 * aziendale. Metterlo qui darebbe un margine più corretto in teoria e
 * inutilizzabile in pratica, perché nessuno rileva le ore.
 */
export function byProjectMargin(
  views: SubcontractView[],
  revenueByProject: Record<string, number>,
  /** §207 — progetti il cui ricavo del mese vive su un accordo condiviso */
  sharedRevenue: Set<string> = new Set(),
): ProjectMarginRow[] {
  const ids = Array.from(new Set([
    ...views.map(v => v.projectId).filter((x): x is string => !!x),
    ...Object.keys(revenueByProject),
  ]))

  return ids.map(id => {
    const rows = views.filter(v => v.projectId === id)
    const external = sum(rows.map(r => (r.booked > 0 ? r.booked : r.planned)))
    const revenue = r2(revenueByProject[id] ?? 0)
    const margin = r2(revenue - external)
    // condiviso solo se il ricavo non è già suo per altra via: un progetto con
    // una sua rata nel mese ha un margine leggibile, accordo condiviso o no
    const shared = sharedRevenue.has(id) && revenue === 0
    return {
      projectId: id,
      projectName: rows[0]?.projectName ?? null,
      clientId: rows[0]?.clientId ?? null,
      clientName: rows[0]?.clientName ?? null,
      revenue, external, margin,
      pct: revenue > 0 ? margin / revenue : 0,
      rows,
      sharedRevenue: shared,
    }
  }).sort((a, b) => b.external - a.external || b.revenue - a.revenue)
}

/**
 * Il patto di un lavoro: quanto è stato venduto e quanto se ne dà via.
 *
 * È la vista che serve **mentre si quota**, e non è la stessa del mese: qui conta
 * il lavoro intero — 10.000 € di CRM contro 7.500 € di subappalto — perché la
 * domanda è «questo prezzo regge?», non «cosa è uscito a luglio».
 *
 * A corpo e a canone si tengono separati e non si sommano: un canone non ha un
 * totale finché non si sa quanto dura, e inventargliene uno darebbe un margine
 * percentuale che dipende da un orizzonte scelto a caso.
 */
export type DealView = {
  /** venduto a corpo: contratti one_off non in bozza */
  sold: number
  /** canone mensile venduto */
  recurring: number
  /** affidato fuori a corpo */
  external: number
  /** affidato fuori a canone, al mese */
  recurringExternal: number
  /** sold − external */
  margin: number
  /** margine in percentuale sul venduto a corpo */
  pct: number
  /** margine del canone, al mese */
  monthlyMargin: number
  /** ha almeno un contratto venduto: senza, il progetto è «da quotare» */
  quoted: boolean
  /** quotazioni ancora in bozza: valgono zero e vanno viste */
  draft: number
  suppliers: string[]
}

export function projectDeal(
  streams: { amount: number; billing: string; status: string }[],
  items: SubItem[],
): DealView {
  const venduti = streams.filter(s => s.status !== 'bozza')
  const sold = sum(venduti.filter(s => s.billing !== 'recurring').map(s => s.amount))
  const recurring = sum(venduti.filter(s => s.billing === 'recurring' && s.status === 'attivo').map(s => s.amount))
  const attivi = items.filter(i => i.is_active)
  const external = sum(attivi.filter(i => i.frequency === 'una_tantum').map(i => i.amount))
  const recurringExternal = sum(attivi.filter(i => i.frequency !== 'una_tantum').map(i => i.amount))
  const margin = r2(sold - external)
  return {
    sold, recurring, external, recurringExternal, margin,
    pct: sold > 0 ? margin / sold : 0,
    monthlyMargin: r2(recurring - recurringExternal),
    quoted: venduti.length > 0,
    draft: sum(streams.filter(s => s.status === 'bozza').map(s => s.amount)),
    suppliers: Array.from(new Set(attivi.map(i => i.supplier).filter((x): x is string => !!x))),
  }
}

export type SubFinding = {
  id: string
  severity: 'critico' | 'attenzione' | 'nota'
  title: string
  detail: string
  action?: string
  href?: string | null
  value?: number
}

/**
 * Cosa non torna, in ordine di quanto costa non saperlo.
 *
 * Non sono avvisi di stile: ognuno di questi casi è un modo in cui il margine di
 * un progetto risulta diverso dal vero, ed è il motivo per cui i conti non
 * tornavano prima che questa vista esistesse.
 */
export function subcontractFindings(
  views: SubcontractView[], margins: ProjectMarginRow[],
): SubFinding[] {
  const out: SubFinding[] = []

  for (const v of views.filter(x => x.status === 'orfano')) {
    out.push({
      id: `orfano-${v.lineId}`, severity: 'critico',
      title: `«${v.label}» non ha un patto dietro`,
      detail: `È una riga di costo su ${v.projectName ?? 'un progetto'} senza la voce che la genera: `
        + 'il margine del progetto la paga, ma nella scheda del progetto non si vede. '
        + 'O è stata scritta a mano nel mese, o la sorgente è stata eliminata dopo.',
      action: 'Crea il subappalto nella scheda Economics del progetto, o elimina la riga dal mese.',
      href: v.href, value: v.booked || v.planned,
    })
  }

  for (const v of views.filter(x => x.status === 'scostato')) {
    out.push({
      id: `scarto-${v.lineId}`, severity: 'attenzione',
      title: `«${v.label}»: nel mese ${eur(v.booked)} contro ${eur(v.planned)} a patto`,
      detail: v.booked > v.planned
        ? `Sono usciti ${eur(v.drift)} più del pattuito. Se il fornitore ha davvero chiesto di più, `
          + 'il patto sul progetto va aggiornato: altrimenti il margine di tutti i mesi che verranno resta sbagliato.'
        : `Sono usciti ${eur(Math.abs(v.drift))} meno del pattuito: o la fattura è parziale, o il patto è cambiato.`,
      action: 'Correggi l\'importo nella scheda del progetto, poi riallinea i preventivati del mese.',
      href: v.href, value: Math.abs(v.drift),
    })
  }

  for (const v of views.filter(x => !x.supplier)) {
    out.push({
      id: `senza-fornitore-${v.itemId ?? v.lineId}`, severity: 'attenzione',
      title: `«${v.label}» non dice a chi va`,
      detail: 'Senza il nome del subappaltatore non si può sapere quanto si sta dando a ciascuno, '
        + 'e la trattativa sul prezzo si fa alla cieca.',
      action: 'Scrivi il fornitore nella scheda Economics del progetto.',
      href: v.href,
    })
  }

  for (const m of margins.filter(x => x.revenue > 0 && x.margin < 0)) {
    out.push({
      id: `margine-${m.projectId}`, severity: 'critico',
      title: `${m.projectName ?? 'Progetto'}: margine negativo di ${eur(Math.abs(m.margin))}`,
      detail: `Il mese incassa ${eur(m.revenue)} e i lavori affidati fuori costano ${eur(m.external)}. `
        + 'Su un progetto digital la quota dei soci si calcola su questo margine: se è negativo, '
        + 'quel progetto non paga nemmeno chi lo consegna.',
      action: 'Verifica la rata del cliente e quella del subappaltatore: una delle due è nel mese sbagliato.',
      href: m.projectId ? `/progetti/${m.projectId}?tab=economics` : null,
      value: Math.abs(m.margin),
    })
  }

  /* §207 — «nessun ricavo nel mese» è vero solo se il ricavo non c'è. Se sta su
     un accordo che copre più lavori la rata è al posto suo, e mandare a
     cercarla sarebbe una caccia a un errore che non esiste. */
  for (const m of margins.filter(x => x.external > 0 && x.revenue === 0 && !x.sharedRevenue)) {
    out.push({
      id: `senza-ricavo-${m.projectId}`, severity: 'attenzione',
      title: `${m.projectName ?? 'Progetto'}: ${eur(m.external)} di subappalti e nessun ricavo nel mese`,
      detail: 'Il costo esterno cade in questo mese e la rata del cliente no: il margine del progetto '
        + 'si legge negativo adesso e gonfiato nel mese in cui arriverà la rata.',
      action: 'Allinea le due scadenze, o accetta lo sfasamento sapendo che è tuo.',
      href: m.projectId ? `/progetti/${m.projectId}?tab=economics` : null,
      value: m.external,
    })
  }

  /* §193 — una lavorazione una tantum atterrata in un mese che non è il suo. Il
     database ora lo impedisce, ma le righe scritte prima restano: il margine di
     due mesi diversi paga lo stesso acconto. */
  for (const v of views.filter(x => x.status === 'nel mese' || x.status === 'scostato')) {
    if (!v.itemId || !v.wrongMonth) continue
    out.push({
      id: `mese-sbagliato-${v.lineId}`, severity: 'critico',
      title: `«${v.label}» è nel mese sbagliato`,
      detail: `Il patto la mette a ${v.wrongMonth}, la riga sta qui: due mesi diversi pagano `
        + 'lo stesso acconto, e il margine di entrambi è falso.',
      action: 'Sposta la riga nel mese giusto, o correggi la data sul progetto.',
      href: v.href, value: v.booked,
    })
  }

  const pianificati = views.filter(v => v.status === 'pianificato')
  if (pianificati.length) {
    out.push({
      id: 'da-portare', severity: 'nota',
      title: `${pianificati.length} subappalt${pianificati.length === 1 ? 'o' : 'i'} da portare nel mese`,
      detail: `${eur(sum(pianificati.map(p => p.planned)))} pattuiti che cadono in questo mese e non sono `
        + 'ancora nel conto economico. Finché non ci sono, il margine dei loro progetti è più alto del vero.',
      action: '«Prepara il mese» li porta dentro.',
      value: sum(pianificati.map(p => p.planned)),
    })
  }

  const ordine = { critico: 0, attenzione: 1, nota: 2 }
  return out.sort((a, b) => ordine[a.severity] - ordine[b.severity] || (b.value ?? 0) - (a.value ?? 0))
}

const eur = (n: number) =>
  `${n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
