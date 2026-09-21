import Link from 'next/link'
import { getPortalData } from '@/lib/portal/server'
import { portalDate, portalHref, REQUEST_KINDS, REQUEST_STATUS } from '@/lib/portal/model'
import { EmptyState, NoCompany, PortalHeading, SetupNotice } from '@/components/portal/PortalContent'
import { RequestComposer } from '@/components/portal/RequestComposer'

export default async function PortalRequests({ searchParams }: { searchParams: { client?: string; nuova?: string; progetto?: string } }) {
  const data = await getPortalData(searchParams.client)
  const project = data.projects.find(p => p.id === searchParams.progetto)
  return <><PortalHeading eyebrow="Richieste" title="Un punto di contatto, per ogni esigenza.">Domande, nuove attività e feedback: qui potrai seguire le risposte e sapere a che punto sono.</PortalHeading>{data.company ? <>
    <SetupNotice legacy={data.legacy} />
    {searchParams.nuova === '1' ? <RequestComposer key={`${data.userId}:${data.company.id}`} draftKey={`twobee-portal-draft:${data.userId}:${data.company.id}`} companyName={data.company.name} projects={data.projects.map(p => ({ id: p.id, title: p.title }))} initialProject={project?.id} /> : <Link href={portalHref('/portale/richieste', data.company.id, { nuova: '1' })} className="mb-8 inline-flex min-h-11 items-center text-sm font-medium text-gold-text">Prepara una richiesta →</Link>}
    <h2 className="mb-5 font-heading text-2xl font-semibold">Le tue richieste</h2>
    {!data.requests.length ? <EmptyState title={data.legacy ? 'Il centro richieste è in preparazione.' : 'Non ci sono richieste in questo spazio.'}>{data.legacy ? 'Dopo l’attivazione troverai qui le richieste inviate e le risposte del team. Le conversazioni precedenti non vengono pubblicate automaticamente.' : 'Quando invierai una richiesta, potrai seguirne qui lo stato.'}</EmptyState> : <div className="divide-y divide-border">{data.requests.map(r => <details key={r.id} className="py-5"><summary className="cursor-pointer break-words text-base font-medium">{r.title} <span className="ml-2 text-sm font-normal text-text-secondary">{REQUEST_STATUS[r.status] ?? 'Da verificare'}</span></summary><p className="mt-3 text-xs text-text-secondary">{REQUEST_KINDS[r.kind as keyof typeof REQUEST_KINDS]?.label ?? 'Richiesta'} · {portalDate(r.created_at)}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm text-text-secondary">{r.body}</p></details>)}</div>}
  </> : <NoCompany />}</>
}
