import { createClient } from '@/lib/supabase/server'
import { monthKey, monthLabel, shiftMonth, computeMonth, rowToPlConfig, type Partner } from '@/lib/pl'
import { linesForMonth, type Installment, type RevenueStream, type Coverage } from '@/lib/revenue'
import { plannedForMonth, isPayrollCenter, FREQUENCY_LABEL, type CostItem } from '@/lib/costs'
import { rowContext, toRevenueLine, toCostLine } from '@/lib/pl-rows'
import { costoLavoroPrevisto } from '@/lib/payroll-forecast'
import { eur2 } from '@/lib/money'

export const revalidate = 0

type Row = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0)
const r2 = (n: number) => Math.round(n * 100) / 100

const NOV = '2026-11-01'

export default async function NovembrePage({ searchParams }: { searchParams: { m?: string } }) {
  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : NOV
  const sb = await createClient()

  const [
    { data: streams }, { data: inst }, { data: streamProjects }, { data: items },
    { data: centers }, { data: cfg }, { data: partnerRows }, { data: clients }, { data: projects },
  ] = await Promise.all([
    sb.from('revenue_streams').select('*'),
    sb.from('revenue_installments').select('*'),
    sb.from('revenue_stream_projects').select('stream_id, project_id'),
    sb.from('cost_items').select('*').eq('is_active', true),
    sb.from('cost_centers').select('id, name'),
    sb.from('pl_config').select('*').eq('id', true).maybeSingle(),
    sb.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
    sb.from('clients').select('id, company_name, display_name, sales_owner_id, sales_owner_name'),
    sb.from('projects').select('id, name').is('deleted_at', null),
  ])

  const coverage: Coverage = new Map()
  for (const r of (streamProjects ?? []) as { stream_id: string; project_id: string }[]) {
    coverage.set(r.stream_id, [...(coverage.get(r.stream_id) ?? []), r.project_id])
  }
  const clientName = new Map(((clients ?? []) as Row[]).map(c => [String(c.id), String(c.display_name || c.company_name)]))
  const projectName = new Map(((projects ?? []) as Row[]).map(p => [String(p.id), String(p.name)]))
  const centerName = new Map(((centers ?? []) as Row[]).map(c => [String(c.id), String(c.name)]))

  /* Entrate: le stesse righe che «Prepara il mese» scriverebbe. */
  const lines = linesForMonth(
    (streams ?? []) as unknown as RevenueStream[], (inst ?? []) as unknown as Installment[], month, coverage)
  const revenue = r2(lines.reduce((s, l) => s + l.amount_net, 0))

  /* Uscite: le voci di piano che cadono nel mese. Il personale non si somma da qui:
     il costo del lavoro viene dall'organico, e le voci HR del piano restano
     elencate ma fuori dal totale — altrimenti il lavoro conta due volte. */
  const due = plannedForMonth((items ?? []) as unknown as CostItem[], month)
  const isHr = (i: CostItem) => isPayrollCenter(i.center_id ? centerName.get(i.center_id) : null)
  const subs = due.filter(i => i.project_id)
  const hr = due.filter(i => !i.project_id && isHr(i))
  const internal = due.filter(i => !i.project_id && !isHr(i))
  const sum = (xs: CostItem[]) => r2(xs.reduce((s, i) => s + i.amount, 0))

  const lavoroMap = await costoLavoroPrevisto(sb, [month])
  const lavoro = lavoroMap?.get(month)?.totale ?? null

  /* Compensi: lo stesso motore del conto economico, sulle righe attese. È il
     maturato di questo mese, non l'erogazione del 20 (vedi la nota in pagina). */
  const ctx = rowContext({
    month, clients: (clients ?? []) as Row[], streams: (streams ?? []) as Row[],
    streamProjects: (streamProjects ?? []) as { stream_id: string; project_id: string }[],
  })
  const revRows = lines.map((l, i) => toRevenueLine({
    id: `${l.stream_id}:${l.installment_id ?? 'canone'}:${i}`, label: l.label, client_id: l.client_id,
    plan_amount: l.amount_net, invoices: 1, amount_net: l.amount_net, vat_rate: l.vat_rate,
    kind: l.kind, sales_owner_id: l.sales_owner_id, stream_id: l.stream_id,
    installment_id: l.installment_id, project_id: l.project_id,
    pass_through: l.pass_through, sales_split: l.sales_split,
  }, ctx))
  const costRows = [
    ...[...internal, ...subs].map(i => toCostLine({
      id: i.id, center_id: i.center_id, cost_item_id: i.id, project_id: i.project_id ?? null,
      installment_id: i.installment_id ?? null, category: i.category, label: i.label,
      cost_type: i.cost_type, budget: i.amount, actual: i.amount,
      vat_applied: i.vat_applied, vat_rate: i.vat_rate,
    }, ctx)),
    ...(lavoro != null ? [toCostLine({
      id: 'lavoro', category: 'Personale', label: 'Costo del lavoro dall\'organico',
      cost_type: 'F', budget: lavoro, actual: lavoro,
    }, ctx)] : []),
  ]
  const t = computeMonth(revRows, costRows, rowToPlConfig(cfg as Row | null),
    ((partnerRows ?? []) as Row[]).map(p => ({
      id: String(p.id), label: String(p.label),
      takes_delivery: p.takes_delivery !== false, takes_residual: p.takes_residual !== false,
    })) as Partner[])

  const costoTot = r2(sum(internal) + sum(subs) + (lavoro ?? 0))
  const margine = r2(revenue - costoTot)

  const Card = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
    <section className="bg-surface border border-border rounded-xl mb-4 overflow-hidden">
      <header className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {note && <p className="text-2xs text-text-tertiary mt-0.5">{note}</p>}
      </header>
      {children}
    </section>
  )
  const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) =>
    <th className={`px-4 py-2 text-2xs font-semibold text-text-tertiary ${right ? 'text-right' : 'text-left'}`}>{children}</th>
  const Td = ({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) =>
    <td className={`px-4 py-2 text-2xs ${strong ? 'font-semibold text-text-primary' : 'text-text-secondary'} ${right ? 'text-right tabular-nums' : ''}`}>{children}</td>

  return (
    <div className="min-h-full p-6 max-w-4xl">
      <p className="text-2xs text-text-tertiary mb-1">Laboratorio · sola lettura, non scrive niente</p>
      <h1 className="text-lg font-semibold text-text-primary mb-1">{monthLabel(month)}</h1>
      <p className="text-sm text-text-secondary mb-5">
        Quello che il mese sarà, calcolato solo da contratti, rate, voci ricorrenti e organico.
        Nessun numero è digitato.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          ['Entrate previste', eur2(revenue), `${lines.length} righe, IVA esclusa`],
          ['Uscite previste', eur2(costoTot), lavoro == null ? 'senza costo del lavoro (n/d)' : 'struttura, subappalti e lavoro'],
          ['Margine', eur2(margine), revenue > 0 ? `${Math.round((margine / revenue) * 100)}% delle entrate` : 'nessuna entrata'],
        ].map(([k, v, n]) => (
          <div key={k} className="bg-surface border border-border rounded-xl px-4 py-3">
            <p className="text-2xs text-text-tertiary">{k}</p>
            <p className="text-lg font-semibold text-text-primary tabular-nums">{v}</p>
            <p className="text-2xs text-text-tertiary">{n}</p>
          </div>
        ))}
      </div>

      <Card title="Entrate" note="Canoni attivi e rate in scadenza nel mese: le righe che «Prepara il mese» scriverebbe.">
        {lines.length === 0 ? <p className="px-4 py-6 text-2xs text-text-tertiary">Nessun canone né rata in questo mese.</p> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr><Th>Cliente</Th><Th>Voce</Th><Th>Tipo</Th><Th right>Imponibile</Th></tr></thead>
            <tbody className="divide-y divide-border/60">
              {lines.map((l, i) => (
                <tr key={i}>
                  <Td strong>{(l.client_id && clientName.get(l.client_id)) || 'fuori anagrafica'}</Td>
                  <Td>{l.label}</Td><Td>{l.kind}{l.pass_through ? ' · partita di giro' : ''}</Td>
                  <Td right>{eur2(l.amount_net)}</Td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title="Uscite di struttura" note="Voci ricorrenti che cadono nel mese.">
        <div className="overflow-x-auto"><table className="w-full">
          <thead><tr><Th>Voce</Th><Th>Area</Th><Th>Frequenza</Th><Th right>Importo</Th></tr></thead>
          <tbody className="divide-y divide-border/60">
            {internal.map(i => (
              <tr key={i.id}>
                <Td strong>{i.label}</Td><Td>{i.center_id ? centerName.get(i.center_id) ?? '—' : '—'}</Td>
                <Td>{FREQUENCY_LABEL[i.frequency]}</Td><Td right>{eur2(i.amount)}</Td>
              </tr>
            ))}
            <tr><Td strong>Totale</Td><Td> </Td><Td> </Td><Td right strong>{eur2(sum(internal))}</Td></tr>
          </tbody>
        </table></div>
      </Card>

      <Card title="Costo del lavoro"
        note="Viene dall'organico (Personale). Le voci HR del piano costi sono elencate sotto ma non sommate: il lavoro conterebbe due volte.">
        <div className="px-4 py-3 text-2xs text-text-secondary">
          {lavoro == null
            ? <span className="text-warning">n/d: l&apos;organico non si legge o è vuoto. Non è zero.</span>
            : <>Dall&apos;organico: <strong className="text-text-primary tabular-nums">{eur2(lavoro)}</strong></>}
          {hr.length > 0 && (
            <p className="mt-2 text-text-tertiary">
              Voci HR nel piano (non sommate): {hr.map(i => `${i.label} ${eur2(i.amount)}`).join(' · ')} — totale {eur2(sum(hr))}
            </p>
          )}
        </div>
      </Card>

      <Card title="Lavori affidati fuori" note="Subappalti: voci di piano legate a un progetto. Tolgono margine a quel lavoro.">
        {subs.length === 0 ? <p className="px-4 py-6 text-2xs text-text-tertiary">Nessun subappalto previsto nel mese.</p> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr><Th>Fornitore</Th><Th>Progetto</Th><Th right>Importo</Th></tr></thead>
            <tbody className="divide-y divide-border/60">
              {subs.map(i => (
                <tr key={i.id}>
                  <Td strong>{i.supplier || i.label}</Td>
                  <Td>{(i.project_id && projectName.get(i.project_id)) || '—'}</Td>
                  <Td right>{eur2(i.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title="Compensi dei soci sul maturato del mese"
        note="Stima con le regole del piano compensi sulle righe attese. Non è l'erogazione del 20: quella paga il maturato del mese prima, incassato entro quel giorno, e quello che il cliente non ha pagato slitta alla finestra dopo.">
        <div className="overflow-x-auto"><table className="w-full">
          <thead><tr><Th>Socio</Th><Th right>Erogato</Th><Th right>Digital</Th><Th right>Provvigione</Th><Th right>Totale spettante</Th></tr></thead>
          <tbody className="divide-y divide-border/60">
            {t.perPartner.map(p => (
              <tr key={p.partner.id}>
                <Td strong>{p.partner.label}</Td>
                <Td right>{eur2(p.delivery + p.residual)}</Td><Td right>{eur2(p.digital)}</Td>
                <Td right>{eur2(p.salesShare)}</Td><Td right strong>{eur2(p.total)}</Td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      <p className="text-2xs text-text-tertiary">
        Mese precedente: <a className="text-gold-text underline" href={`/lab/novembre?m=${shiftMonth(month, -1)}`}>{monthLabel(shiftMonth(month, -1))}</a>
        {' · '}successivo: <a className="text-gold-text underline" href={`/lab/novembre?m=${shiftMonth(month, 1)}`}>{monthLabel(shiftMonth(month, 1))}</a>
        {' · '}oggi: <a className="text-gold-text underline" href={`/lab/novembre?m=${monthKey(new Date())}`}>{monthLabel(monthKey(new Date()))}</a>
      </p>
    </div>
  )
}
