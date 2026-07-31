/**
 * Diagnosi del conto economico — calcoli puri, nessun I/O.
 *
 * Un numero da solo non dice se stai andando bene. Qui i numeri diventano
 * giudizi con una soglia esplicita e un'azione: ogni segnalazione dice cosa
 * non va, quanto pesa e cosa si può fare. Se non c'è niente da fare, non è
 * una segnalazione ed è meglio tacere.
 *
 * Le soglie stanno in `THRESHOLDS`, in un posto solo: cambiarle è una
 * decisione di gestione, non una modifica sparsa nel codice.
 */

import type { PlConfig, PlTotals, RevenueLine, CostLine } from '@/lib/pl'

export type Severity = 'critico' | 'attenzione' | 'buono'

export type Finding = {
  id: string
  severity: Severity
  title: string
  detail: string
  /** cosa fare: senza questo è rumore, non un avviso */
  action?: string
  metric?: string
}

export const THRESHOLDS = {
  /** quanto si può sforare il target costi prima di allarmarsi */
  costOverTarget: 0.05,
  costOverTargetHard: 0.15,
  /** quota massima di un singolo cliente prima che diventi dipendenza */
  clientConcentration: 0.30,
  clientConcentrationHard: 0.45,
  /** quota di maturato non ancora incassato */
  unpaid: 0.40,
  unpaidHard: 0.65,
  /** incidenza del costo del lavoro sulle entrate */
  hrShare: 0.45,
  /** calo di ricavo rispetto al mese prima */
  revenueDrop: 0.15,
  /** margine lordo minimo accettabile */
  grossMargin: 0.30,
}

const HR_CATEGORIES = ['HR', 'Outsourcing']
const pc = (n: number) => `${(n * 100).toFixed(0)}%`
const eur = (n: number) => `€${Math.round(n).toLocaleString('it-IT')}`

/**
 * Diagnosi di un mese (o di un periodo aggregato: i totali hanno la stessa forma).
 * `previous` serve solo al confronto temporale, è facoltativo.
 */
export function diagnose(
  t: PlTotals,
  revenue: RevenueLine[],
  costs: CostLine[],
  config: PlConfig,
  previous?: { accrued: number; costs: number },
): Finding[] {
  const out: Finding[] = []
  const rev = t.revenue.accrued
  if (rev <= 0) {
    return [{
      id: 'no-revenue', severity: 'attenzione',
      title: 'Nessuna entrata registrata',
      detail: 'Senza righe di ricavo il conto economico non dice niente e il piano compensi vale zero.',
      action: 'Precompila il mese dai contratti attivi, o aggiungi le voci a mano.',
    }]
  }

  // ── costi contro il target ────────────────────────────────────────────────
  const over = t.costs.ratio - config.cost_target_pct
  if (over > THRESHOLDS.costOverTargetHard) {
    out.push({
      id: 'cost-hard', severity: 'critico',
      title: `Costi al ${pc(t.costs.ratio)}, molto sopra il target`,
      detail: `Il piano regge se i costi stanno entro il ${pc(config.cost_target_pct)}. Qui sforano di ${eur(-t.costs.variance)}, che escono dalla cassa TwoBee.`,
      action: 'Guarda la scheda Uscite: la categoria in cima è dove intervenire.',
      metric: pc(t.costs.ratio),
    })
  } else if (over > THRESHOLDS.costOverTarget) {
    out.push({
      id: 'cost-soft', severity: 'attenzione',
      title: `Costi al ${pc(t.costs.ratio)}, sopra il target`,
      detail: `Sopra il ${pc(config.cost_target_pct)} di ${eur(-t.costs.variance)}. Non è un'emergenza, ma erode il margine.`,
      action: 'Verifica se è una spesa una tantum o strutturale.',
      metric: pc(t.costs.ratio),
    })
  } else if (t.costs.variance > 0 && t.costs.ratio > 0) {
    out.push({
      id: 'cost-ok', severity: 'buono',
      title: `Costi al ${pc(t.costs.ratio)}, sotto il target`,
      detail: `${eur(t.costs.variance)} risparmiati rispetto al ${pc(config.cost_target_pct)} previsto: restano in cassa.`,
      metric: pc(t.costs.ratio),
    })
  }

  // ── dipendenza da un cliente ──────────────────────────────────────────────
  const byClient = new Map<string, number>()
  for (const l of revenue) {
    const k = l.client_id ?? l.label
    byClient.set(k, (byClient.get(k) ?? 0) + l.amount_net)
  }
  const top = Array.from(byClient.entries()).sort((a, b) => b[1] - a[1])[0]
  if (top) {
    const share = top[1] / rev
    const name = revenue.find(l => (l.client_id ?? l.label) === top[0])?.label ?? 'Un cliente'
    if (share > THRESHOLDS.clientConcentrationHard) {
      out.push({
        id: 'concentration-hard', severity: 'critico',
        title: `${pc(share)} del fatturato viene da un solo cliente`,
        detail: `«${name}» vale ${eur(top[1])}. Se se ne va, il mese si dimezza e il piano compensi non regge.`,
        action: 'Nessuna azione immediata, ma è il numero da abbassare nei prossimi mesi.',
        metric: pc(share),
      })
    } else if (share > THRESHOLDS.clientConcentration) {
      out.push({
        id: 'concentration', severity: 'attenzione',
        title: `${pc(share)} del fatturato su un cliente solo`,
        detail: `«${name}» pesa ${eur(top[1])} sul periodo.`,
        action: 'Tieni d\'occhio la sua salute in anagrafica: un cliente così va presidiato.',
        metric: pc(share),
      })
    }
  }

  // ── incassato contro maturato ─────────────────────────────────────────────
  const unpaidShare = t.revenue.unpaid / rev
  if (unpaidShare > THRESHOLDS.unpaidHard) {
    out.push({
      id: 'unpaid-hard', severity: 'critico',
      title: `${pc(unpaidShare)} del maturato non è ancora incassato`,
      detail: `${eur(t.revenue.unpaid)} fuori dalla cassa. I compensi maturano lo stesso: stai anticipando tu.`,
      action: 'Controlla quali righe non hanno la spunta «pagato» e sollecita.',
      metric: eur(t.revenue.unpaid),
    })
  } else if (unpaidShare > THRESHOLDS.unpaid) {
    out.push({
      id: 'unpaid', severity: 'attenzione',
      title: `${eur(t.revenue.unpaid)} ancora da incassare`,
      detail: `Il ${pc(unpaidShare)} del maturato del periodo.`,
      action: 'Verifica le fatture inviate e non pagate.',
    })
  }

  // ── costo del lavoro ──────────────────────────────────────────────────────
  const hr = costs.filter(c => HR_CATEGORIES.includes(c.category)).reduce((s, c) => s + c.actual, 0)
  if (hr > 0 && hr / rev > THRESHOLDS.hrShare) {
    out.push({
      id: 'hr', severity: 'attenzione',
      title: `Il costo del lavoro è il ${pc(hr / rev)} delle entrate`,
      detail: `${eur(hr)} fra HR e outsourcing. Sopra il ${pc(THRESHOLDS.hrShare)} la struttura pesa più di quanto il fatturato regga.`,
      action: 'O sale il fatturato per persona, o va rivista la struttura.',
      metric: pc(hr / rev),
    })
  }

  // ── margine lordo ─────────────────────────────────────────────────────────
  const marginShare = t.margin.gross / rev
  if (marginShare < THRESHOLDS.grossMargin) {
    out.push({
      id: 'margin', severity: marginShare < 0 ? 'critico' : 'attenzione',
      title: marginShare < 0 ? 'Il periodo è in perdita' : `Margine lordo al ${pc(marginShare)}`,
      detail: marginShare < 0
        ? `I costi (${eur(t.costs.actual)}) superano le entrate (${eur(rev)}).`
        : `Sotto il ${pc(THRESHOLDS.grossMargin)}, dopo i compensi resta poco.`,
      action: 'Confronta la scheda Uscite col target: è lì che si recupera.',
    })
  }

  // ── andamento ─────────────────────────────────────────────────────────────
  if (previous && previous.accrued > 0) {
    const delta = (rev - previous.accrued) / previous.accrued
    if (delta < -THRESHOLDS.revenueDrop) {
      out.push({
        id: 'drop', severity: 'attenzione',
        title: `Entrate in calo del ${pc(-delta)}`,
        detail: `Da ${eur(previous.accrued)} a ${eur(rev)}.`,
        action: 'Controlla se è un contratto chiuso o solo una fatturazione slittata.',
        metric: pc(delta),
      })
    } else if (delta > THRESHOLDS.revenueDrop) {
      out.push({
        id: 'growth', severity: 'buono',
        title: `Entrate in crescita del ${pc(delta)}`,
        detail: `Da ${eur(previous.accrued)} a ${eur(rev)}.`,
        metric: pc(delta),
      })
    }
  }

  // ── righe da sistemare ────────────────────────────────────────────────────
  // Senza commerciale la provvigione non si perde: si divide fra i soci. Non è
  // un errore, è il caso della lead generation — va detto, non segnalato.
  const noOwner = revenue.filter(l => !l.sales_owner_id && !l.sales_owner).length
  if (noOwner > 0 && t.plan.salesPool > 0) {
    out.push({
      id: 'inbound', severity: 'buono',
      title: `${eur(t.plan.salesPool)} di provvigione divisa fra i soci`,
      detail: `${noOwner} rig${noOwner > 1 ? 'he' : 'a'} senza commerciale — clienti arrivati dalla lead generation. ${eur(t.plan.poolShare)} a testa.`,
      action: 'Se invece qualcuno li ha portati, impostalo in anagrafica cliente.',
      metric: eur(t.plan.poolShare),
    })
  }

  const zeroCosts = costs.filter(c => c.budget > 0 && c.actual === 0).length
  if (zeroCosts > 0) {
    out.push({
      id: 'cost-empty', severity: 'attenzione',
      title: `${zeroCosts} voci di costo a zero`,
      detail: 'Hanno un preventivato ma nessuna spesa registrata: o non sono state pagate, o il consuntivo non è stato inserito.',
      action: 'Nella tabella Uscite, «Allinea al preventivato» le compila in blocco.',
    })
  }

  const order: Record<Severity, number> = { critico: 0, attenzione: 1, buono: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity])
}

/** Un voto sintetico: serve a dire «sano o no» prima di leggere il dettaglio. */
export function healthScore(findings: Finding[]): { score: number; label: string; severity: Severity } {
  const critical = findings.filter(f => f.severity === 'critico').length
  const warnings = findings.filter(f => f.severity === 'attenzione').length
  const score = Math.max(0, 100 - critical * 30 - warnings * 10)
  if (critical > 0) return { score, label: 'Da correggere', severity: 'critico' }
  if (warnings > 1) return { score, label: 'Sotto controllo, con riserve', severity: 'attenzione' }
  if (warnings === 1) return { score, label: 'In salute', severity: 'attenzione' }
  return { score, label: 'In salute', severity: 'buono' }
}
