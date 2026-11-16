import Link from '@/components/lab/LabLink'
import { ArrowRight } from 'lucide-react'
import LabMonthPicker from '@/components/lab/LabMonthPicker'
import LabSourceActions from '@/components/lab/LabSourceActions'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabConnections } from '@/lib/lab-connections-load'
import { connectionOverview } from '@/lib/lab-connections'
import { labMonth, romeToday } from '@/lib/lab-bank'
import { shiftMonth } from '@/lib/pl'
import { LAB_MODULES } from '@/lib/lab-experience'

export const revalidate = 0
export default async function LabPage({ searchParams }: { searchParams: { m?: string } }) {
  await requireLabAdmin()
  const today = romeToday(), month = labMonth(searchParams.m, shiftMonth(`${today.slice(0, 7)}-01`, -1))
  const connections = await loadLabConnections(today), overview = connections ? connectionOverview(connections, month) : null
  const missing = (side: string) => `/lab/conto-economico?m=${month}&vista=maturato&documenti=mancanti&tipoRiga=${side}#righe-economiche`
  const tasks = [
    { key: 'banca', label: '1 · Parti dalla banca', note: 'Solo entrate e uscite reali: la base consolidata.' },
    { key: 'fatturazione', label: '2 · Raccorda la fattura', note: 'Entrate con emesse, uscite con ricevute; quote e rimborsi.' },
    { key: 'accordi', label: '3 · Risali al patto', note: 'Cliente, lavoro e competenza che spiegano il documento.' },
    { key: 'conto-economico', label: '4 · Leggi il risultato', note: 'Competenza, parti mancanti e quote dei soci.' },
  ]

  return <div className="mx-auto min-w-0 max-w-5xl space-y-5 px-4 py-5 sm:p-6">
    <header className="space-y-2"><h1 className="text-xl font-semibold text-text-primary">Controlla il mese</h1><p className="text-sm text-text-secondary">La banca è la base consolidata. Dal movimento risali alla fattura, al patto e al risultato. Ogni dato apre la propria fonte e il percorso di ritorno conserva il mese e i filtri di pagina.</p><p className="text-2xs text-text-tertiary">Laboratorio · dati reali in sola lettura · verifiche da completare</p></header>
    <LabMonthPicker month={month} action="/lab" label="Mese di lavoro" />
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-3"><h2 className="text-base font-semibold text-text-primary">Da dove iniziare</h2><p className="text-sm text-text-secondary">Apri un movimento bancario reale da verificare. Segui i collegamenti fino al documento e al movimento: un riferimento da solo non certifica il pagamento.</p><Link href={`/lab/banca?m=${month}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-medium text-on-gold">Verifica movimenti e fatture<ArrowRight className="h-4 w-4" aria-hidden /></Link></section>
    <section aria-label="Percorso di verifica" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{tasks.map(task => <Link key={task.key} href={`/lab/${task.key}?m=${month}`} className="rounded-2xl border border-border bg-surface p-4 hover:bg-surface-hover"><h2 className="text-sm font-semibold text-text-primary">{task.label}</h2><p className="mt-2 text-2xs text-text-secondary">{task.note}</p><span className="mt-3 inline-flex min-h-9 items-center gap-2 text-2xs text-gold-text">Apri {LAB_MODULES.find(m => m.key === task.key)?.title}<ArrowRight className="h-4 w-4" aria-hidden /></span></Link>)}</section>
    <section id="controlli" className="space-y-3"><h2 className="text-base font-semibold text-text-primary">Collegamenti da controllare</h2>{!overview ? <p role="alert" className="rounded-xl bg-warning-dim p-4 text-sm text-warning">Fonte dei collegamenti non disponibile. Nessun conteggio sostituito con zero.</p> : <><div className="grid gap-3 sm:grid-cols-3">{[
      { label: 'Ricavi senza fattura', count: overview.registered ? overview.revenueWithoutInvoice : null, total: overview.revenue, href: missing('ricavo') },
      { label: 'Costi senza fattura', count: overview.registered ? overview.costsWithoutInvoice : null, total: overview.costs, href: missing('costo') },
      { label: 'Fatture risorse da collegare', count: overview.hrInvoicesWithoutDocument, total: overview.hrInvoices, href: `/lab/risorse?m=${month}&tipo=professionisti` },
    ].map(item => <Link key={item.label} href={item.href} originAnchor="controlli" className="rounded-2xl border border-border bg-surface p-4 hover:bg-surface-hover"><p className="text-2xs text-text-secondary">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">{item.count ?? 'n/d'}</p><p className="mt-2 text-2xs text-gold-text">Su {item.total} registrazioni · apri i dati</p></Link>)}</div><p className="text-2xs text-text-secondary">Controllo dei riferimenti delle registrazioni presenti: non rileva documenti mai acquisiti e non implica che ogni costo richieda una fattura. {!overview.registered && 'Mese economico non presente: conteggi ricavi/costi n/d.'}</p></>}</section>
    <section className="space-y-3"><h2 className="text-base font-semibold text-text-primary">Persone, imposte e scelte future</h2><div className="grid gap-3 sm:grid-cols-3">{LAB_MODULES.filter(m => ['risorse', 'iva', 'previsionale'].includes(m.key)).map(m => <Link key={m.key} href={`/lab/${m.key}?m=${month}`} className="rounded-2xl border border-border bg-surface p-4 hover:bg-surface-hover"><h3 className="text-sm font-semibold text-text-primary">{m.title}</h3><p className="mt-2 text-2xs text-text-secondary">{m.question}</p></Link>)}</div></section>
    <LabSourceActions actions={[{ label: 'Carica documenti e modelli', href: '/economics/carica' }]} />
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer py-1 text-sm text-gold-text">Progetti e viste precedenti</summary><div className="mt-3 flex flex-wrap gap-3 text-sm"><Link className="inline-flex min-h-11 items-center text-gold-text underline" href={`/lab/progetti?m=${month}`}>Patti dei progetti</Link><Link className="inline-flex min-h-11 items-center text-gold-text underline" href="/lab/novembre">Mese dalla banca · precedente</Link><Link className="inline-flex min-h-11 items-center text-gold-text underline" href="/lab/fatturazione/precedente">Fatture · precedente</Link></div></details>
    <p className="text-2xs text-text-tertiary">Letture separate al {today}, non snapshot transazionale. Le sezioni di gestione restano operative; nessuna promozione o conferma di dati dal Lab.</p>
  </div>
}
