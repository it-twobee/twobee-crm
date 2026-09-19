import { getPortalData } from '@/lib/portal/server'
import { NoCompany, PortalHeading, ProjectList, SetupNotice } from '@/components/portal/PortalContent'

export default async function PortalProjects({ searchParams }: { searchParams: { client?: string } }) {
  const data = await getPortalData(searchParams.client)
  return <><PortalHeading eyebrow="Progetti" title="Dove siamo. Dove andiamo.">Il perimetro condiviso, le consegne e i prossimi passi di ogni progetto.</PortalHeading>{data.company ? <><SetupNotice legacy={data.legacy} /><ProjectList projects={data.projects} clientId={data.company.id} /></> : <NoCompany />}</>
}
