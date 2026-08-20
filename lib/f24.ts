/**
 * Il modello F24 come documento. (§301)
 *
 * L'F24 è **un** foglio, e dentro ci sono cose che nel tool vivono in domini
 * diversi: l'IVA di un trimestre, le ritenute dei dipendenti, i contributi INPS,
 * i crediti da compensare. Finora quelle cose stavano in due tabelle che non si
 * parlavano — `vat_settlements` per l'IVA (§242) e `hr_f24` per il resto (§182)
 * — e il documento che le contiene non esisteva da nessuna parte.
 *
 * Il prezzo di quella mancanza si legge in un movimento: il 20 agosto dal conto
 * sono usciti **10.547,24 €**, che sono 9.669,33 di IVA più 877,91 di ritenute e
 * contributi. Al centesimo. Ma nessuna riga del tool valeva 10.547,24, quindi
 * quel movimento non si poteva agganciare a niente — ed è la voce più grossa fra
 * quelle che il ponte (§199) non spiega.
 *
 * **Il documento è il contenitore, non un nuovo dominio.** Ogni riga-tributo
 * dice a quale mondo appartiene e quel mondo resta l'autorità:
 *
 *   · `iva` → la liquidazione del trimestre. Il modello vince sulla stima
 *     (§242), e la data di versamento è quella del documento;
 *   · `ritenute`, `inps`, `inail` → costo del lavoro, e stanno in `hr_f24`.
 *     Sommarli all'IVA farebbe costare diecimila euro un mese di stipendi;
 *   · `credito` → si **sottrae**. È l'indennità L. 207/2024 che esce in busta e
 *     rientra qui (§235): contarla come debito la farebbe pagare due volte.
 *
 * Da qui la sola regola che il documento deve rispettare: **il totale versato è
 * la somma dei debiti meno i crediti**. Se non torna, il modello contiene una
 * riga che nessuno ha trascritto, e un F24 di cui non si conosce una riga è un
 * F24 che non si può riconciliare.
 */

const r2 = (n: number) => Math.round(n * 100) / 100
const TOL = 0.01

/** A quale mondo appartiene un tributo. Decide chi ne è l'autorità. */
export type TributeKind = 'iva' | 'ritenute' | 'inps' | 'inail' | 'credito' | 'altro'

export type F24Line = {
  id?: string
  /** il codice tributo del modello: 6032 è l'IVA del 2º trimestre */
  codice: string
  label: string
  kind: TributeKind
  /** sempre positivo: il verso lo dice `kind`, non il segno */
  amount: number
  /** il periodo di riferimento del tributo, non quello del versamento */
  period?: string | null
}

export type F24Doc = {
  id?: string
  /** quando si versa */
  dueDate: string
  paidOn?: string | null
  /** quello che il modello chiede in fondo */
  total: number
  docRef?: string | null
  lines: F24Line[]
}

const isCredit = (l: F24Line) => l.kind === 'credito'

/** I debiti del modello, al netto di niente. */
export const debits = (lines: F24Line[]) =>
  r2(lines.filter(l => !isCredit(l)).reduce((s, l) => s + l.amount, 0))

/** I crediti da compensare: si sottraggono, e vanno visti. */
export const credits = (lines: F24Line[]) =>
  r2(lines.filter(isCredit).reduce((s, l) => s + l.amount, 0))

/** Quello che dal conto esce davvero. */
export const netDue = (lines: F24Line[]) => r2(debits(lines) - credits(lines))

/**
 * Quanto di questo modello è **IVA** e quanto è **costo del lavoro**.
 *
 * È la ragione per cui il documento esiste: un movimento da 10.547,24 € non è
 * un costo da 10.547,24. L'IVA è un debito che si estingue — quei soldi non
 * erano mai stati nostri (§225) — mentre ritenute e contributi sono costo del
 * personale e devono finire lì, non in «Amministrazione».
 *
 * I crediti si imputano al mondo che li ha generati quando lo si sa; l'unico
 * caso vero è l'indennità in busta, che è costo del lavoro.
 */
export function split(lines: F24Line[]): { vat: number; payroll: number; other: number } {
  const of = (...k: TributeKind[]) =>
    r2(lines.filter(l => k.includes(l.kind)).reduce((s, l) => s + l.amount, 0))
  return {
    vat: of('iva'),
    // il credito abbatte il costo del lavoro: è l'indennità che rientra (§235)
    payroll: r2(of('ritenute', 'inps', 'inail') - credits(lines)),
    other: of('altro'),
  }
}

export type F24Check =
  | { ok: true }
  | { ok: false; why: string; gap: number }

/**
 * Il totale del modello contro la somma delle sue righe.
 *
 * Uno scarto qui non è un arrotondamento: è una riga che nessuno ha trascritto,
 * e senza quella riga il documento non si può usare per riconciliare — si
 * saprebbe *quanto* è uscito e non *per cosa*.
 */
export function check(doc: F24Doc): F24Check {
  if (!doc.lines.length) {
    return { ok: false, why: 'Il modello non ha nessuna riga: non si sa per cosa è stato versato.', gap: doc.total }
  }
  const somma = netDue(doc.lines)
  const gap = r2(doc.total - somma)
  if (Math.abs(gap) <= TOL) return { ok: true }
  return {
    ok: false,
    gap,
    why: `Il modello chiede ${doc.total.toFixed(2)} € e le sue righe fanno ${somma.toFixed(2)}: `
      + `${Math.abs(gap).toFixed(2)} € ${gap > 0 ? 'non sono stati trascritti' : 'sono di troppo'}.`,
  }
}

export type F24Finding = {
  id: string
  severity: 'critico' | 'attenzione'
  title: string
  detail: string
}

/**
 * Cosa non torna fra il modello, i domini che contiene e la banca.
 *
 * Tre confronti, e ognuno risponde a una domanda che prima non aveva un posto:
 * il documento è completo · quello che dice dell'IVA combacia con la
 * liquidazione · quello che è uscito dal conto combacia col documento.
 */
export function findings(i: {
  doc: F24Doc
  /** quello che la liquidazione del trimestre dice di dover versare (§242) */
  vatDeclared?: number | null
  /** quello che `hr_f24` porta per quel mese (§182) */
  payrollDeclared?: number | null
  /** il lordo dei movimenti agganciati a questo documento */
  moved?: number | null
}): F24Finding[] {
  const out: F24Finding[] = []
  const c = check(i.doc)
  if (!c.ok) {
    out.push({
      id: 'f24-somma',
      severity: 'critico',
      title: 'Il totale non è la somma delle righe',
      detail: c.why + ' Un modello di cui non si conosce una riga non si può riconciliare.',
    })
  }

  const s = split(i.doc.lines)
  if (i.vatDeclared != null && Math.abs(s.vat - i.vatDeclared) > TOL) {
    out.push({
      id: 'f24-iva',
      severity: 'attenzione',
      title: `Il modello versa ${s.vat.toFixed(2)} € di IVA, la liquidazione ne dichiara ${i.vatDeclared.toFixed(2)}`,
      detail: 'Il modello vince (§242), ma la differenza va guardata: di solito è '
        + 'fatturato del trimestre che il conto economico non ha ancora.',
    })
  }
  if (i.payrollDeclared != null && Math.abs(s.payroll - i.payrollDeclared) > TOL) {
    out.push({
      id: 'f24-payroll',
      severity: 'attenzione',
      title: `Ritenute e contributi: ${s.payroll.toFixed(2)} € nel modello, ${i.payrollDeclared.toFixed(2)} in organico`,
      detail: 'Il documento batte la stima (§182): se non combaciano, il cedolino '
        + 'trascritto e il modello versato dicono due cose diverse.',
    })
  }
  if (i.moved != null && Math.abs(i.moved - i.doc.total) > TOL) {
    out.push({
      id: 'f24-banca',
      severity: i.moved > i.doc.total ? 'critico' : 'attenzione',
      title: `Dal conto sono usciti ${i.moved.toFixed(2)} € contro ${i.doc.total.toFixed(2)} del modello`,
      detail: i.moved > i.doc.total
        ? 'Quel movimento paga anche qualcos\'altro, o il modello è incompleto.'
        : 'Il modello non è coperto per intero: manca una parte del versamento.',
    })
  }
  return out
}

/**
 * Il costo del lavoro che questo modello porta nel conto economico.
 *
 * È l'unica parte che è un **costo**: l'IVA è un debito che si estingue, e
 * metterla fra le uscite di competenza gonfierebbe il mese di soldi che non
 * erano nostri nemmeno il giorno prima (§225).
 */
export const costOf = (doc: F24Doc) => split(doc.lines).payroll
