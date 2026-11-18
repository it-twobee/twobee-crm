import LabPageHeader, { labSectionIcons } from '@/components/lab/LabPageHeader'
import Link from '@/components/lab/LabLink'
import { ArrowRight, ClipboardCheck } from 'lucide-react'
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
    { key: 'banca', label: 'Verifica i movimenti', note: 'Solo entrate e uscite reali: la base consolidata.' },
    { key: 'fatturazione', label: 'Raccorda le fatture', note: 'Entrate con emesse, uscite con ricevute; quote e rimborsi.' },
    { key: 'accordi', label: 'Consulta gli accordi', note: 'Cliente, lavoro e competenza che spiegano il documento.' },
    { key: 'conto-economico', label: 'Leggi il risultato', note: 'Competenza, parti mancanti e quote dei soci.' },
  ] as const

  return <div className="mx-auto min-w-0 max-w-7xl space-y-4 px-4 py-4 sm:px-6">
    <LabPageHeader section="riepilogo" title="Controlla il mese" actions={
      <Link href={`/lab/verifiche?m=${month}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-on-gold">
        <ClipboardCheck className="h-4 w-4" aria-hidden /> Apri le verifiche
      </Link>
    }>
      <p className="text-sm text-text-secondary">Segui i movimenti bancari fino alle fatture, agli accordi e al risultato del mese.</p>
    </LabPageHeader>
    <LabMonthPicker month={month} action="/lab" label="Mese di lavoro" />
    <section aria-label="Percorso di verifica" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {tasks.map(task => {
        const Icon = labSectionIcons[task.key]
        return <Link key={task.key} href={`/lab/${task.key}?m=${month}`} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-border-strong hover:bg-surface-hover">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-dim text-gold-text"><Icon className="h-5 w-5" aria-hidden /></span>
          <div><h2 className="text-sm font-semibold text-text-primary">{task.label}</h2><p className="mt-1 text-2xs text-text-secondary">{task.note}</p></div>
          <ArrowRight className="mt-1 h-4 w-4 text-gold-text motion-safe:transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      })}
    </section>
    <section id="controlli" className="space-y-3"><h2 className="text-base font-semibold text-text-primary">Collegamenti da controllare</h2>{!overview ? <p role="alert" className="rounded-xl bg-warning-dim p-4 text-sm text-warning">Fonte dei collegamenti non disponibile. Nessun conteggio sostituito con zero.</p> : <><div className="grid gap-3 sm:grid-cols-3">{[
      { label: 'Ricavi senza fattura', count: overview.registered ? overview.revenueWithoutInvoice : null, total: overview.revenue, href: missing('ricavo') },
      { label: 'Costi senza fattura', count: overview.registered ? overview.costsWithoutInvoice : null, total: overview.costs, href: missing('costo') },
      { label: 'Fatture risorse da collegare', count: overview.hrInvoicesWithoutDocument, total: overview.hrInvoices, href: `/lab/risorse?m=${month}&tipo=professionisti` },
    ].map(item => <Link key={item.label} href={item.href} originAnchor="controlli" className="rounded-2xl border border-border bg-surface p-4 hover:bg-surface-hover"><p className="text-2xs text-text-secondary">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">{item.count ?? 'n/d'}</p><p className="mt-2 text-2xs text-gold-text">Su {item.total} registrazioni · apri i dati</p></Link>)}</div><p className="text-2xs text-text-secondary">Controllo dei riferimenti delle registrazioni presenti: non rileva documenti mai acquisiti e non implica che ogni costo richieda una fattura. {!overview.registered && 'Mese economico non presente: conteggi ricavi/costi n/d.'}</p></>}</section>
    <section className="space-y-3"><h2 className="text-base font-semibold text-text-primary">Persone, imposte e scelte future</h2><div className="grid gap-3 sm:grid-cols-3">{LAB_MODULES.filter(m => ['risorse', 'iva', 'previsionale'].includes(m.key)).map(m => <Link key={m.key} href={`/lab/${m.key}?m=${month}`} className="rounded-2xl border border-border bg-surface p-4 hover:bg-surface-hover"><h3 className="text-sm font-semibold text-text-primary">{m.title}</h3><p className="mt-2 text-2xs text-text-secondary">{m.question}</p></Link>)}</div></section>
    <LabSourceActions actions={[{ label: 'Carica documenti e modelli', href: '/economics/carica' }]} />
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer py-1 text-sm text-gold-text">Progetti e viste precedenti</summary><div className="mt-3 flex flex-wrap gap-3 text-sm"><Link className="inline-flex min-h-11 items-center text-gold-text underline" href={`/lab/progetti?m=${month}`}>Patti dei progetti</Link><Link className="inline-flex min-h-11 items-center text-gold-text underline" href="/lab/novembre">Mese dalla banca · precedente</Link><Link className="inline-flex min-h-11 items-center text-gold-text underline" href="/lab/fatturazione/precedente">Fatture · precedente</Link></div></details>
    <p className="text-2xs text-text-tertiary">Letture separate al {today}, non snapshot transazionale. Le sezioni di gestione restano operative; nessuna promozione. I raccordi si salvano soltanto con conferma esplicita nel popup.</p>
  </div>
}
