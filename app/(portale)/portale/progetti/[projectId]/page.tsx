import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPortalData } from '@/lib/portal/server'
import { portalDate, portalHref, PROJECT_STATUS } from '@/lib/portal/model'
import { ActivityList, PortalHeading, SetupNotice, VersionList } from '@/components/portal/PortalContent'

export default async function PortalProjectPage({ params, searchParams }: { params: { projectId: string }; searchParams: { client?: string } }) {
  const data = await getPortalData(searchParams.client)
  const project = data.projects.find(p => p.id === params.projectId)
  if (!project || !data.company) notFound()
  return <>
    <Link href={portalHref('/portale/progetti', data.company.id)} className="mb-6 inline-flex min-h-11 items-center text-sm text-text-secondary">← Tutti i progetti</Link>
    <PortalHeading eyebrow={`${project.area} · ${PROJECT_STATUS[project.status] ?? 'Stato da aggiornare'}`} title={project.title}>{project.published_at ? `Ultima pubblicazione: ${portalDate(project.published_at)}` : 'Aggiornamento condiviso non ancora disponibile. Lo stato operativo non certifica che il progetto sia nei tempi.'}</PortalHeading>
    <SetupNotice legacy={data.legacy} />
    <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-9">{[['Obiettivo', project.objective], ['Perimetro condiviso', project.scope], ['Ultimo aggiornamento', project.update]].map(([title, text]) => <section key={title}><h2 className="font-heading text-2xl font-semibold">{title}</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">{text || 'Non ancora pubblicato dal referente.'}</p></section>)}</div>
      <aside className="self-start rounded-xl bg-surface p-6"><h2 className="font-heading text-xl font-semibold">Il prossimo passo</h2><p className="mt-3 break-words text-sm">{project.next_step || 'In attesa di un aggiornamento condiviso.'}</p><dl className="mt-6 space-y-4 text-sm"><div><dt className="text-xs text-text-secondary">Data {project.date_kind}</dt><dd className="mt-1">{portalDate(project.target_date)}</dd></div><div><dt className="text-xs text-text-secondary">Referente</dt><dd className="mt-1">{project.contact || 'Da comunicare'}</dd></div></dl><Link href={portalHref('/portale/richieste', data.company.id, { nuova: '1', progetto: project.id })} className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-gold-text">Chiedi su questo progetto →</Link></aside>
    </div>
    <section className="mt-12"><h2 className="mb-5 font-heading text-2xl font-semibold">Le tue attività</h2><ActivityList activities={data.activities.filter(a => a.project_id === project.id)} projects={[project]} clientId={data.company.id} legacy={data.legacy} companyName={data.company.name} /></section>
    <section className="mt-12"><h2 className="mb-5 font-heading text-2xl font-semibold">Consegne e documenti</h2><VersionList versions={data.versions.filter(v => v.project_id === project.id)} /></section>
  </>
}
