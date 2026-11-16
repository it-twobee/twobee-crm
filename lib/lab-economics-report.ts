import type { loadLabEconomics } from '@/lib/lab-economics-load'
import { REASON } from '@/lib/payout-report'
import { eur2 } from '@/lib/money'

export type EconomicsLoaded = Extract<Awaited<ReturnType<typeof loadLabEconomics>>, { ok: true }>
export const economicMoney = (v: number | null | undefined) => v == null ? 'n/d' : eur2(v)

export function economicsReport(data: EconomicsLoaded) {
  const { input: i, accrual: a } = data
  const client = (id: string | null) => { const c = i.clients.find(c => c.id === id); return c ? String(c.display_name || c.company_name) : id ?? 'Cliente da attribuire' }
  const lineSource = (id: string) => {
    const r = i.revenue.find(r => r.id === id), p = a.proof.get(id)
    return `Riga ${id}; accordo ${r?.stream_id ?? 'n/d'}; rata ${r?.installment_id ?? 'n/d'}; fattura ${r?.invoice_id ?? 'n/d'}; copertura ${p?.completedOn ?? 'n/d'}`
  }
  const detail = (row: typeof a.soci[number]['rows'][number]) => ({
    lineId: row.lineId, client: client(row.clientId), project: row.projectId ?? 'Accordo condiviso / progetto da attribuire',
    label: row.label, month: row.month ?? i.month, kind: row.kind, reason: REASON[row.reason],
    base: row.base, external: row.external, pct: row.pct, amount: row.amount, source: lineSource(row.lineId),
  })
  return { version: 'lab-economics-v2', status: 'Bozza da completare', month: i.month, today: i.today, observedAt: data.observedAt,
    window: { ...a.window, observedCutoff: a.observedCutoff },
    people: a.soci.map(p => ({ name: p.name, matured: p.matured, eligible: p.eligible, settled: p.settled, remaining: p.remaining, knownMatured: p.knownMatured, knownEligible: p.knownEligible, prepared: p.prepared,
      registrationIssues: p.registrationIssues, registered: p.registered,
      rows: p.rows.map(detail), eligibleRows: p.eligibleRows.map(detail) })),
    otherSales: a.otherSales.map(p => ({ name: p.who, eligible: p.total, rows: p.rows.map(detail) })),
    exclusions: a.exclusions.map(e => ({ ...e, note: e.verdict === 'gia_erogata' ? 'Fuori finestra per regola temporale; non prova di bonifico già erogato' : e.verdict === 'scoperta' ? 'Copertura integrale/documento da verificare' : e.verdict })),
    limits: [
      'Regole canoniche del piano e della finestra. Le spunte non certificano incassi o pagamenti.',
      'Quote sulle righe note e sugli incassi verificati mostrate separatamente dai totali completi. Le quote parziali possono cambiare completando le fonti e non sono somme da bonificare.',
      'Bonifici attribuiti: sole quote esplicite e certificate del registro compensi, con verso, conto e capienza verificati. Residuo limitato alle righe preparate; non è il debito completo verso il socio. Spese personali e altre erogazioni restano da raccordare.',
      `Righe calcolabili: ${a.previewRevenueCount} del mese, ${a.previewTakenCount} coperte nella finestra.`,
      ...a.omitted.map(r => `${r.month.slice(0, 7)} ${r.label}: ${r.why}`),
      'Maturato dal registro economico: completezza di costi, personale e oneri da verificare; nessuna certificazione documentale dal solo totale.',
      `Occorrenze mancanti: ${a.missingRevenue.length} ricavi, ${a.missingCosts.length} costi. Configurazione ${a.configOk ? 'letta' : 'incompleta'}.`,
      ...a.blockers,
      'Download della fotografia della pagina: nessuna condivisione, registrazione o conferma di pagamento.',
      'Fonti lette con query separate: la fotografia della pagina non è uno snapshot transazionale del database.',
    ] }
}
export type EconomicsReport = ReturnType<typeof economicsReport>
