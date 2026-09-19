import Link from 'next/link'
import { getPortalData } from '@/lib/portal/server'
import { PHASE_LABELS, portalHref } from '@/lib/portal/model'
import { ActivityList, NoCompany, PortalHeading, ProjectList, SetupNotice, VersionList } from '@/components/portal/PortalContent'

export default async function PortalHome({ searchParams }: { searchParams: { client?: string } }) {
  const data = await getPortalData(searchParams.client)
  const phase = data.projects.find(p => p.phase)?.phase
  return <>
    <PortalHeading eyebrow="Il tuo spazio TwoBee" title={phase ? PHASE_LABELS[phase] ?? 'Il punto sul nostro lavoro.' : 'Il punto sul nostro lavoro.'}>Progetti, prossimi passi e ciò che serve da te. Tutto nello stesso posto.</PortalHeading>
    {!data.company ? <NoCompany /> : <>
      <SetupNotice legacy={data.legacy} />
      <section className="mb-12" aria-labelledby="actions-title"><div className="mb-5 flex items-center justify-between gap-4"><h2 id="actions-title" className="font-heading text-2xl font-semibold">Serve da te</h2><Link href={portalHref('/portale/da-fare', data.company.id)} className="text-sm text-gold-text">Vedi tutte le attività →</Link></div><ActivityList activities={data.activities.filter(a => a.status !== 'completata').slice(0, 3)} projects={data.projects} clientId={data.company.id} legacy={data.legacy} /></section>
      <section className="mb-12" aria-labelledby="projects-title"><h2 id="projects-title" className="mb-5 font-heading text-2xl font-semibold">I progetti, il prossimo passo</h2><ProjectList projects={data.projects} clientId={data.company.id} /></section>
      <section className="mb-12" aria-labelledby="delivery-title"><h2 id="delivery-title" className="mb-5 font-heading text-2xl font-semibold">Ultime consegne e aggiornamenti</h2><VersionList versions={data.versions.slice(0, 3)} />{data.projects.filter(p => p.update).map(p => <div key={p.id} className="mt-5 border-t border-border pt-5"><Link className="font-medium text-gold-text" href={portalHref(`/portale/progetti/${p.id}`, data.company?.id)}>{p.title}</Link><p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-secondary">{p.update}</p></div>)}</section>
      <div className="grid gap-8 border-t border-border pt-8 md:grid-cols-2"><section><h2 className="font-heading text-xl font-semibold">Prossimo incontro</h2><p className="mt-3 text-sm text-text-secondary">Nessun incontro pubblicato in questo spazio. Per le date già concordate, fai riferimento all’invito ricevuto.</p></section><section><h2 className="font-heading text-xl font-semibold">Parliamone</h2><p className="mt-3 text-sm text-text-secondary">{data.projects.find(p => p.contact)?.contact ? `Il tuo riferimento: ${data.projects.find(p => p.contact)?.contact}.` : 'Per un chiarimento, rivolgiti al tuo contatto TwoBee abituale.'}</p><Link href={portalHref('/portale/richieste', data.company.id, { nuova: '1' })} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-gold-text">Di cosa hai bisogno? →</Link></section></div>
    </>}
  </>
}
