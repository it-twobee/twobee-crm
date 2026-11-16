import Link from '@/components/lab/LabLink'
import LabMonthPicker from '@/components/lab/LabMonthPicker'
import LabChecksExport from '@/components/lab/LabChecksExport'
import { LabReturnFields, LabRecordScope } from '@/components/lab/LabJourney'
import { requireLabAdmin } from '@/lib/lab-guard'
import { romeToday, labMonth } from '@/lib/lab-bank'
import { shiftMonth } from '@/lib/pl'
import { loadLabChecks } from '@/lib/lab-checks-load'
import { CHECK_AREAS, CHECK_PRIORITIES, filterLabChecks, labCheckAnchor } from '@/lib/lab-checks'
import { eur2 } from '@/lib/money'
export const dynamic = 'force-dynamic'
export default async function LabChecksPage({ searchParams }: { searchParams: { m?: string; area?: string; priorita?: string; q?: string } }) {
  await requireLabAdmin()
  const today = romeToday(), month = labMonth(searchParams.m, shiftMonth(`${today.slice(0, 7)}-01`, -1))
  const area = Object.hasOwn(CHECK_AREAS, searchParams.area ?? '') ? searchParams.area! : ''
  const priority = Object.hasOwn(CHECK_PRIORITIES, searchParams.priorita ?? '') ? searchParams.priorita! : ''
  const query = (searchParams.q ?? '').trim().slice(0, 200)
  const data = await loadLabChecks(month, today), visible = filterLabChecks(data.items, area, priority, query)
  const context = `Controllo mese ${month} · banca/fatture al ${data.upTo} · prove economiche osservate al ${today} · area ${area || 'tutte'} · priorità ${priority || 'tutte'} · ricerca ${query || 'nessuna'} · lettura ${data.observedAt}`
  const control = 'mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary'
  return <div className="mx-auto max-w-5xl min-w-0 space-y-5 px-4 py-5 sm:p-6">
    <header className="space-y-2"><h1 className="text-xl font-semibold text-text-primary">Verifiche e fonti da completare</h1><p className="text-sm text-text-secondary">Scegli un controllo, apri le prove e riprendi da questa lista. Le verifiche leggono le stesse fonti delle sezioni; non correggono automaticamente dati o collegamenti.</p><p className="text-2xs text-text-tertiary">Banca e competenze del mese · fatture e F24 storici fino al {data.upTo} · prove economiche e compensi osservati al {today} · sola lettura</p></header>
    <LabMonthPicker month={month} action="/lab/verifiche" parameters={{ area, priorita: priority, q: query }} label="Mese del controllo" />
    {data.unavailable.map(message => <p key={message} role="alert" className="rounded-xl bg-warning-dim p-3 text-sm text-warning">{message} La lista è parziale: l’assenza di voci non certifica che i controlli siano superati.</p>)}
    <div className="grid gap-3 sm:grid-cols-3">{Object.entries(CHECK_PRIORITIES).map(([key, label]) => <Link key={key} href={`/lab/verifiche?${new URLSearchParams({ m: month, priorita: key, area, q: query })}`} className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover"><p className="text-2xs text-text-secondary">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">{data.unavailable.length ? '≥ ' : ''}{data.items.filter(i => i.priority === key).length}</p><p className="mt-1 text-2xs text-text-secondary">Nelle fonti lette · prima dei filtri</p></Link>)}</div>
    <form action="/lab/verifiche" method="get" className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2"><LabReturnFields /><input type="hidden" name="m" value={month} />
      <label className="text-2xs text-text-secondary">Area<select name="area" defaultValue={area} className={control}><option value="">Tutte le aree</option>{Object.entries(CHECK_AREAS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      <label className="text-2xs text-text-secondary">Priorità<select name="priorita" defaultValue={priority} className={control}><option value="">Tutte le priorità</option>{Object.entries(CHECK_PRIORITIES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      <label className="text-2xs text-text-secondary">Cerca voce o motivo<input name="q" defaultValue={query} maxLength={200} className={control} /></label><button className="min-h-11 self-end rounded-xl bg-gold px-4 text-sm font-medium text-on-gold">Applica filtri</button>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-text-secondary">{visible.length} di {data.items.length} verifiche nelle fonti lette</p><LabChecksExport items={visible} context={context} /></div>
    {!visible.length && <p className="rounded-xl border border-border p-4 text-sm text-text-secondary">Nessuna voce per questi filtri. Non è una certificazione del mese: documenti mai acquisiti, copertura estratti e verifiche non implementate richiedono un controllo distinto.</p>}
    <ul className="space-y-3">{visible.map(item => <LabRecordScope key={item.id} anchor={labCheckAnchor(item.id)}><li id={labCheckAnchor(item.id)} className="scroll-mt-4 rounded-2xl border border-border bg-surface p-4 space-y-2"><div className="flex flex-wrap justify-between gap-2"><p className="text-2xs text-text-secondary">{CHECK_AREAS[item.area]} · {CHECK_PRIORITIES[item.priority]} · {item.date}</p>{item.amount != null && <span className="text-sm font-semibold tabular-nums text-text-primary">{item.currency === 'EUR' ? eur2(item.amount) : `${item.amount.toFixed(2)} ${item.currency ?? ''}`} · {item.amountLabel ?? 'Importo'}</span>}</div><h2 className="text-sm font-semibold text-text-primary break-words">{item.title}</h2><p className="text-sm text-text-secondary break-words">{item.why}</p><Link href={item.href} className="inline-flex min-h-11 items-center text-sm text-gold-text underline">{item.action}</Link></li></LabRecordScope>)}</ul>
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer py-2 text-sm text-gold-text">Perimetro e limiti dei controlli</summary><p className="mt-2 text-sm text-text-secondary">Una voce descrive un oggetto da verificare: lo stesso problema può coinvolgere un movimento e una fattura. I conteggi non si sommano come problemi indipendenti. Non si deducono mancati pagamenti dall’assenza di riferimenti. I controlli non provano la completezza degli archivi, le spettanze soci, la detraibilità o tutti gli obblighi fiscali. Le operazioni persistenti restano nei percorsi Economics esistenti.</p></details>
    <p className="text-2xs text-text-tertiary">{context}. Letture separate, non fotografia transazionale. Nessuna promozione delle sezioni in uso.</p>
  </div>
}
