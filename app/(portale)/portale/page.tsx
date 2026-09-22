import Link from 'next/link'
import { ArrowRight, CalendarDays, FolderOpen, ListChecks, MessageSquare, PackageCheck, type LucideIcon } from 'lucide-react'
import { getPortalData } from '@/lib/portal/server'
import { ACTIVITY_STATUS, PHASE_LABELS, portalDate, portalHref } from '@/lib/portal/model'
import { NoCompany } from '@/components/portal/PortalContent'

function HomeCard({ id, title, icon: Icon, tone, children, footer, className = '' }: {
  id: string; title: string; icon: LucideIcon; tone: 'gold' | 'info' | 'accent'
  children: React.ReactNode; footer: React.ReactNode; className?: string
}) {
  const colors = {
    gold: { surface: 'bg-gold-dim', heading: 'text-gold-text', icon: 'bg-gold text-on-gold' },
    info: { surface: 'bg-surface', heading: 'text-info', icon: 'bg-info-dim text-info' },
    accent: { surface: 'bg-surface', heading: 'text-accent', icon: 'bg-accent-dim text-accent' },
  }[tone]
  return <section aria-labelledby={id} className={`flex min-w-0 flex-col rounded-xl border border-border p-4 ${colors.surface} ${className}`}>
    <div className="mb-3 flex items-center gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <h2 id={id} className={`font-heading text-xl font-semibold ${colors.heading}`}>{title}</h2>
    </div>
    <div className="flex-1">{children}</div>
    <div className="mt-3 border-t border-border pt-2">{footer}</div>
  </section>
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-text-primary hover:text-gold-text">{children}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
}

export default async function PortalHome({ searchParams }: { searchParams: { client?: string } }) {
  const data = await getPortalData(searchParams.client)
  const phase = data.projects.find(p => p.phase)?.phase
  const activities = data.activities.filter(a => a.status !== 'completata')
  const contact = data.projects.find(p => p.contact)?.contact
  const latest = [
    ...data.versions.map(v => ({ id: v.id, projectId: v.project_id, title: v.title, label: `Consegna · versione ${v.version}`, date: v.published_at })),
    ...data.projects.filter(p => p.update).map(p => ({ id: p.id, projectId: p.id, title: p.update!, label: p.title, date: p.published_at })),
  ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 2)

  return <>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{phase ? PHASE_LABELS[phase] ?? 'Il punto sul nostro lavoro.' : 'Il punto sul nostro lavoro.'}</h1>
        <p className="mt-1 text-sm text-text-secondary">Cosa serve da te, cosa stiamo facendo, le ultime novità.</p>
      </div>
      {data.company && <span className="rounded-lg bg-info-dim px-3 py-2 text-xs font-medium text-info">Consultazione · gli invii dal portale non sono ancora attivi</span>}
    </div>
    {!data.company ? <NoCompany /> : <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <HomeCard id="actions-title" title="Serve da te" icon={ListChecks} tone="gold" footer={<CardLink href={portalHref('/portale/da-fare', data.company.id)}>Le tue attività{activities.length > 0 ? ` (${activities.length})` : ''}</CardLink>}>
          {activities.length ? <ul className="space-y-3">{activities.slice(0, 2).map(a => <li key={a.id}>
            <Link href={portalHref('/portale/da-fare', data.company?.id)} className="block break-words text-sm font-semibold hover:underline">{a.title}</Link>
            <p className="mt-1 text-xs text-text-primary">{ACTIVITY_STATUS[a.status] ?? 'Da verificare'} · {portalDate(a.due_date)}</p>
          </li>)}</ul> : <>
            <p className="text-sm font-semibold">{data.legacy ? 'Attività in preparazione' : 'Nessuna attività richiesta'}</p>
            <p className="mt-2 text-sm text-text-primary">{data.legacy ? 'Qui troverai materiali da inviare, risposte e approvazioni.' : 'Quando servirà il tuo contributo, lo troverai qui.'}</p>
          </>}
        </HomeCard>
        <HomeCard id="projects-title" title="I tuoi progetti" icon={FolderOpen} tone="info" footer={<CardLink href={portalHref('/portale/progetti', data.company.id)}>Tutti i progetti{data.projects.length > 0 ? ` (${data.projects.length})` : ''}</CardLink>}>
          {data.projects.length ? <ul className="space-y-3">{data.projects.slice(0, 2).map(p => <li key={p.id}>
            <Link href={portalHref(`/portale/progetti/${p.id}`, data.company?.id)} className="block break-words text-sm font-semibold hover:text-info">{p.title}</Link>
            <p className="mt-1 line-clamp-2 break-words text-xs text-text-secondary">{p.next_step || 'Prossimo passo: aggiornamento da condividere.'}</p>
          </li>)}</ul> : <>
            <p className="text-sm font-semibold">Nessun progetto condiviso</p>
            <p className="mt-2 text-sm text-text-secondary">Il tuo referente pubblicherà i progetti e i prossimi passi.</p>
          </>}
        </HomeCard>
        <HomeCard id="delivery-title" title="Ultime novità" icon={PackageCheck} tone="accent" className="md:col-span-2 xl:col-span-1" footer={<CardLink href={portalHref('/portale/progetti', data.company.id)}>Consegne e aggiornamenti</CardLink>}>
          {latest.length ? <ul className="space-y-3">{latest.map(item => <li key={item.id}>
            <p className="truncate text-xs text-text-secondary">{item.label}</p>
            <Link href={portalHref(`/portale/progetti/${item.projectId}`, data.company?.id)} className="mt-1 line-clamp-2 break-words text-sm font-medium hover:text-accent">{item.title}</Link>
          </li>)}</ul> : <>
            <p className="text-sm font-semibold">Nessuna novità pubblicata</p>
            <p className="mt-2 text-sm text-text-secondary">Consegne e aggiornamenti appariranno qui, appena condivisi.</p>
          </>}
        </HomeCard>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section aria-labelledby="meeting-title" className="flex min-w-0 items-start gap-4 rounded-xl border border-border bg-surface p-5 xl:col-span-2">
          <CalendarDays className="mt-1 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
          <div><h2 id="meeting-title" className="font-heading text-xl font-semibold">Prossimo incontro</h2><p className="mt-1 text-sm text-text-secondary">Nessun incontro pubblicato. Per quelli già concordati, fa fede l’invito ricevuto.</p></div>
        </section>
        <section aria-labelledby="support-title" className="min-w-0 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3"><MessageSquare className="h-5 w-5 shrink-0 text-gold-text" aria-hidden="true" /><h2 id="support-title" className="font-heading text-xl font-semibold">Il tuo riferimento</h2></div>
          <p className="mt-1 break-words text-sm text-text-secondary">{contact || 'Il tuo contatto TwoBee abituale.'}</p>
          <Link href={portalHref('/portale/richieste', data.company.id, { nuova: '1' })} className="mt-1 inline-flex min-h-10 items-center text-sm font-medium text-gold-text">Fai una richiesta →</Link>
        </section>
      </div>
    </>}
  </>
}
