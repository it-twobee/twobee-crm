import { LabRecordScope } from '@/components/lab/LabJourney'
import Link from '@/components/lab/LabLink'
import type { economicAccrual } from '@/lib/lab-economics'
import { economicMoney as money } from '@/lib/lab-economics-report'
import { REASON } from '@/lib/payout-report'

type Accrual = ReturnType<typeof economicAccrual>
type Props = { person: Accrual['soci'][number]; month: string; client: (id: unknown) => string; accrual: Accrual }
export default function LabPartnerCompensation({ person: p, month, client, accrual: a }: Props) {
  const partialMatured = p.matured == null, partialEligible = p.eligible == null
  const amount = p.matured ?? p.knownMatured, eligible = p.eligible ?? p.knownEligible
  const source = (r: { lineId: string; month: string | null }) => `/lab/conto-economico?${new URLSearchParams({ m: r.month ?? month, vista: 'maturato', riga: r.lineId, tipoRiga: 'ricavo' })}#righe-economiche`
  const details = (rows: typeof p.rows, label: string) => <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer py-1 text-sm text-gold-text">{label} · {new Set(rows.map(r => r.lineId)).size} righe</summary><ul className="mt-3 space-y-3">{rows.map((r, n) => <li key={`${r.lineId}:${r.reason}:${n}`} className="text-2xs text-text-secondary"><p className="font-medium text-text-primary">{client(r.clientId)} · {money(r.amount)}</p><p>{REASON[r.reason]} · base {money(r.base)}, esterni {money(r.external)}, quota {Math.round(r.pct * 10000) / 100}%.</p><Link className="inline-block py-2 text-gold-text underline" href={source(r)}>{r.month?.slice(0, 7)} · {r.label}</Link></li>)}</ul>{!rows.length && <p className="mt-2 text-2xs text-text-secondary">Nessuna riga calcolabile con le fonti attuali. Verifica i blocchi e i collegamenti della sezione.</p>}</details>
  const anchor = `socio-${p.partnerId ?? p.name.replace(/[^a-z0-9]/gi, '-')}`
  return <LabRecordScope anchor={anchor}><article id={anchor} className="min-w-0 rounded-2xl border border-border bg-surface p-4 space-y-4">
    <h3 className="text-base font-semibold text-text-primary">{p.name}</h3>
    <div className="rounded-xl bg-surface-hover p-3"><p className="text-2xs text-text-secondary">{partialMatured ? 'Quota sulle righe note · parziale' : 'Maturato dal registro del mese'}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{money(amount)}</p><p className="mt-1 text-2xs text-text-secondary">{partialMatured ? `Calcolate ${a.previewRevenueCount} righe ricavo coerenti. Il totale completo resta n/d e può cambiare completando le fonti.` : 'Calcolo del piano, distinto dall’incasso e dal bonifico.'}</p></div>
    <dl className="space-y-3 text-sm">{[
      [partialEligible ? 'Quota da incassi verificati · parziale' : 'Erogabile al taglio', eligible],
      ['Preparato nel registro compensi', p.prepared],
      ['Bonifici attribuiti · quote note', p.paidKnown],
      ['Residuo delle righe preparate', p.preparedResidual],
    ].map(([label, value]) => <div key={String(label)} className="flex flex-wrap justify-between gap-2"><dt className="text-text-secondary">{String(label)}</dt><dd className="font-semibold tabular-nums text-text-primary">{money(value as number | null)}</dd></div>)}</dl>
    <p className="text-2xs text-text-secondary">{partialEligible ? `${a.previewTakenCount} righe con incasso verificato e base calcolabile nella finestra. ` : ''}Il residuo riguarda le quote preparate nel registro: non è il debito completo verso il socio. Spese dal sottoconto e altre erogazioni da raccordare separatamente.</p>
    {p.registrationIssues.length > 0 && <ul className="rounded-xl bg-warning-dim p-3 text-2xs text-warning space-y-1">{p.registrationIssues.map(why => <li key={why}>{why}.</li>)}</ul>}
    {!p.partnerId && <p className="text-2xs text-warning">Identità del socio assente o ambigua nei diritti del piano: nessuna quota attribuita automaticamente.</p>}
    {details(p.rows, 'Da quali ricavi nasce la quota')}
    {details(p.eligibleRows, 'Ricavi coperti nella finestra')}
    {p.registered.length > 0 && <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer py-1 text-sm text-gold-text">Registro e prove dei bonifici</summary><ul className="mt-2 space-y-3 text-2xs text-text-secondary">{p.registered.map(r => <li key={r.id}><p>{r.kind === 'socio' ? 'Quota socio' : 'Provvigione'} preparata: {money(r.amount)} · {r.declaredPaid ? `pagata nel registro il ${r.declaredPaidOn ?? 'data non registrata'}` : 'non spuntata nel registro'}.</p>{r.entries.map((e, n) => <Link key={`${e.txId}:${n}`} className="block py-2 text-gold-text underline" href={`/lab/banca?${new URLSearchParams({ m: `${e.date.slice(0, 7)}-01`, conto: e.accountId, movimento: e.txId })}`}>{e.date} · quota bancaria {money(e.amount)}</Link>)}{!r.entries.length && <p>Movimento con quota certificata da collegare; la spunta non prova il pagamento.</p>}</li>)}</ul></details>}
    <Link href={`/economics?m=${month}`} className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Apri il registro di gestione</Link>
  </article></LabRecordScope>
}
