import Link from 'next/link'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabDeals } from '@/lib/lab-deals-load'
import { dealProjects, dealState, installmentLines, knownAmount, type DealLine } from '@/lib/lab-deals'
import { romeToday } from '@/lib/lab-bank'
import { eur2 } from '@/lib/money'
import { economicsHref } from '@/lib/economics-source'

export const dynamic = 'force-dynamic'

const money = (value: unknown) => { const n = knownAmount(value); return n == null ? 'n/d' : eur2(n) }

export default async function LabDealsPage({ searchParams }: { searchParams: { q?: string; stato?: string } }) {
  await requireLabAdmin()
  const today = romeToday()
  const data = await loadLabDeals(today)
  const query = (searchParams.q ?? '').trim().slice(0, 200)
  const state = ['Da avviare', 'Attivo', 'Sospeso', 'Concluso'].includes(searchParams.stato ?? '') ? searchParams.stato! : ''
  const url = (value: string) => `/lab/accordi?${new URLSearchParams({ q: query, stato: value })}`

  return <div className="min-h-full max-w-5xl mx-auto px-4 py-5 sm:p-6 space-y-5">
    <Link href="/lab" className="text-sm text-gold-text underline">Laboratorio</Link>
    <header><h1 className="text-xl font-semibold text-text-primary">Accordi</h1>
      <p className="text-sm text-text-secondary">Cliente, progetto, patto e documenti: che cosa manca?</p>
      <p className="text-2xs text-text-tertiary mt-1">Sola lettura · importi pattuiti IVA esclusa · in verifica</p>
    </header>
    {!data.ok ? <p role="alert" className="rounded-xl bg-warning-dim text-warning text-sm p-4">{data.message}</p> : <>
      <aside className="bg-surface border border-border rounded-xl p-4 text-sm text-text-secondary">
        Lo stato del lavoro non è lo stato dei pagamenti. Un accordo concluso può avere rate, fatture e incassi da completare.
        Le spunte del piano sono dichiarazioni: il riscontro completo si verifica in Fatturazione e Banca. Nessun valore si modifica qui.
      </aside>
      <form method="get" className="flex gap-2">
        <input name="q" aria-label="Cerca cliente, progetto o accordo" defaultValue={query} maxLength={200} placeholder="Cerca cliente, progetto o accordo" className="min-w-0 flex-1 rounded-xl border border-border-interactive bg-surface px-3 py-2 text-sm text-text-primary" />
        {state && <input type="hidden" name="stato" value={state} />}
        <button type="submit" className="rounded-xl px-4 py-2 bg-gold text-on-gold text-sm font-medium">Cerca</button>
      </form>
      <nav aria-label="Stato del lavoro" className="flex flex-wrap gap-2">
        {['', 'Da avviare', 'Attivo', 'Sospeso', 'Concluso'].map(s => <Link key={s} href={url(s)} aria-current={state === s ? 'page' : undefined} className={`px-3 py-2 rounded-xl border text-sm ${state === s ? 'bg-surface-active border-border-strong text-text-primary' : 'border-border text-text-secondary'}`}>{s || 'Tutti'}</Link>)}
      </nav>
      {(() => {
        const clients = new Map(data.clients.map(c => [c.id, c.display_name || c.company_name]))
        const projects = new Map(data.projects.map(p => [p.id, p]))
        const covered = new Set(data.streams.flatMap(s => dealProjects(s, data.coverage).ids))
        const match = (text: string) => !query || text.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it'))
        const rows = data.streams.map(stream => ({ stream, scope: dealProjects(stream, data.coverage), status: dealState(stream, today) }))
          .filter(({ stream, scope, status }) => (!state || status.label === state)
            && match([stream.label, clients.get(stream.client_id ?? ''), ...scope.ids.map(id => projects.get(id)?.name)].filter(Boolean).join(' ')))
          .sort((a, b) => (clients.get(a.stream.client_id ?? '') ?? '').localeCompare(clients.get(b.stream.client_id ?? '') ?? '') || a.stream.label.localeCompare(b.stream.label))
        const without = data.projects.filter(p => p.client_id && !p.deleted_at && !covered.has(p.id) && match(`${p.name} ${clients.get(p.client_id) ?? ''}`))
        const lines = (records: DealLine[]) => records.length ? <ul className="mt-1 space-y-1">{records.map(line => <li key={line.id} className="text-2xs text-text-secondary">
          Competenza {data.months.get(line.month_id)?.slice(0, 7) ?? 'n/d'} · {line.invoice_id
            ? <Link className="text-gold-text underline" href={`/lab/fatturazione?documento=${encodeURIComponent(line.invoice_id)}`}>Apri fattura collegata</Link>
            : 'fattura non collegata alla riga'} · pagamento: da verificare in banca.
        </li>)}</ul> : <p className="text-2xs text-text-tertiary mt-1">Nessuna riga collegata: documento e pagamento n/d.</p>
        return <>
          <p className="text-2xs text-text-secondary">{rows.length} accordi per questa selezione. I contratti condivisi compaiono una volta sola.</p>
          <ul className="space-y-3">{rows.map(({ stream, scope, status }) => {
            const installments = data.installments.filter(i => i.stream_id === stream.id).sort((a, b) => a.due_month.localeCompare(b.due_month) || a.id.localeCompare(b.id))
            const costs = data.costs.filter(c => c.project_id && scope.ids.includes(c.project_id))
            return <li key={stream.id} className="rounded-2xl border border-border bg-surface p-4 space-y-3">
              <header><p className="text-2xs text-text-secondary">{stream.client_id && clients.has(stream.client_id)
                ? <Link className="text-gold-text underline" href={`${economicsHref(stream.client_id)}&from=${encodeURIComponent(url(state))}`}>{clients.get(stream.client_id)}</Link> : 'Cliente da verificare'}</p>
                <div className="flex justify-between items-start gap-3 mt-1"><h2 className="text-base font-semibold text-text-primary break-words">{stream.label}</h2><span className="text-sm font-semibold text-text-primary whitespace-nowrap">{money(stream.amount)}{stream.billing === 'recurring' ? '/mese' : stream.billing === 'one_off' ? ' a corpo' : ' · frequenza n/d'}</span></div>
              </header>
              <p className="text-2xs text-text-secondary"><strong className="text-text-primary">{status.label}</strong> · {status.detail}. Stato in fonte: {stream.status}.</p>
              <p className="text-2xs text-text-secondary">Dal {stream.start_date ?? 'n/d'} al {stream.end_date ?? 'termine non registrato'} · {stream.kind} · riscontri completi n/d.</p>
              <p className="text-2xs text-text-secondary">Progetti: {scope.ids.length ? scope.ids.map((id, index) => {
                const project = projects.get(id)
                return <span key={id}>{index > 0 && ' · '}{project && !project.deleted_at
                  ? <Link className="text-gold-text underline" href={`/progetti/${id}?from=${encodeURIComponent(url(state))}`}>{project.name}</Link>
                  : project ? `${project.name} (archiviato)` : 'Progetto da verificare'}</span>
              }) : 'nessun progetto attribuibile dalla fonte canonica'}.</p>
              {scope.shared && <p className="text-2xs text-warning">Accordo condiviso: il valore non viene ripartito sui progetti. Margine per progetto n/d.</p>}
              {scope.needsReview && <p className="text-2xs text-warning">Copertura singola e progetto principale non coincidono: verificare il collegamento, senza attribuzione automatica.</p>}
              <details><summary className="text-sm text-gold-text cursor-pointer py-1">Calendario e documenti</summary>
                {installments.length ? <ul className="divide-y divide-border">{installments.map(i => <li key={i.id} className="py-3">
                  <p className="text-sm text-text-primary">{i.due_month.slice(0, 7)} · {i.label || 'Rata'} · {money(i.amount)}</p>
                  <p className="text-2xs text-text-secondary">Nel piano: fatturata {i.invoiced ? 'sì' : 'no'}, pagata {i.paid ? 'sì' : 'no'}. Sono spunte dichiarate, non prove bancarie.</p>
                  {lines(installmentLines(i.id, data.revenue))}
                </li>)}</ul> : <>
                  <p className="text-2xs text-text-secondary mt-2">{stream.billing === 'recurring' ? 'Canone: riscontri delle competenze già registrate.' : 'Nessuna rata registrata. Il calendario resta da definire/verificare.'}</p>
                  {lines(data.revenue.filter(l => l.stream_id === stream.id))}
                </>}
              </details>
              <details><summary className="text-sm text-gold-text cursor-pointer py-1">Subappalti dei progetti coperti · {costs.length || 'da verificare'}</summary>
                <p className="text-2xs text-text-secondary mt-2">Voci condivise del progetto, non nuovi costi per ogni accordo. Non vengono sommate o attribuite a questo patto senza prova.</p>
                {!costs.length && <p className="text-2xs text-text-secondary mt-2">Nessun patto esterno in archivio per questi progetti: assenza di subappalto da confermare, importo n/d.</p>}
                <ul className="divide-y divide-border">{costs.map(c => <li key={c.id} className="py-3">
                  <p className="text-sm text-text-primary">{c.label} · {c.supplier || 'Fornitore n/d'} · {money(c.amount)} / {c.frequency}</p>
                  <p className="text-2xs text-text-secondary">{projects.get(c.project_id ?? '')?.name ?? 'Progetto n/d'} · voce {c.is_active ? 'attiva' : 'non attiva'} nel piano; stato del patto esterno n/d.</p>
                  {lines(data.costLines.filter(l => l.cost_item_id === c.id))}
                </li>)}</ul>
              </details>
            </li>
          })}</ul>
          {!rows.length && <p className="text-sm text-text-secondary">Nessun accordo per questa selezione.</p>}
          {!state && <section className="rounded-2xl border border-border bg-surface p-4"><h2 className="text-base text-text-primary font-semibold">Progetti senza accordo attribuibile · {without.length}</h2><p className="text-2xs text-text-secondary mt-1">Importo n/d. Nessun progetto riceve un valore zero per completare l’elenco.</p><ul className="mt-3 space-y-2">{without.map(p => <li key={p.id} className="text-sm text-text-secondary">{clients.get(p.client_id!) ?? 'Cliente n/d'} · <Link className="text-gold-text underline" href={`/progetti/${p.id}?from=${encodeURIComponent(url(state))}`}>{p.name}</Link></li>)}</ul></section>}
        </>
      })()}
      <p className="text-2xs text-text-tertiary">Fonte: accordi, rate, patti esterni e collegamenti documentali registrati. Lettura avviata {data.observedAt}; completezza e confronto con le sezioni in uso da verificare.</p>
    </>}
  </div>
}
