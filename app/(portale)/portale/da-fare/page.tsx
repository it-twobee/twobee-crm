import { getPortalData } from '@/lib/portal/server'
import { ActivityList, NoCompany, PortalHeading, SetupNotice } from '@/components/portal/PortalContent'

export default async function PortalActivities({ searchParams }: { searchParams: { client?: string } }) {
  const data = await getPortalData(searchParams.client)
  return <><PortalHeading eyebrow="Da fare" title="Il tuo contributo, al momento giusto.">Materiali, risposte e approvazioni. Ogni richiesta indica cosa serve e a chi rivolgerti.</PortalHeading>{data.company ? <><SetupNotice legacy={data.legacy} /><ActivityList activities={data.activities} projects={data.projects} clientId={data.company.id} legacy={data.legacy} companyName={data.company.name} /><p className="mt-6 max-w-2xl text-sm text-text-secondary">Un’approvazione riguarda sempre una versione precisa. Una nuova versione richiederà una nuova verifica; aprire o scaricare un file non significa accettarlo.</p></> : <NoCompany />}</>
}
