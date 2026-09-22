import { getPortalData } from '@/lib/portal/server'
import { NoCompany, PortalHeading } from '@/components/portal/PortalContent'
import { MaterialUploader } from '@/components/portal/MaterialUploader'

export default async function PortalFiles({ searchParams }: { searchParams: { client?: string } }) {
  const data = await getPortalData(searchParams.client)
  if (!data.company) return <><PortalHeading eyebrow="I tuoi file" title="Lo spazio della tua azienda." /><NoCompany /></>

  /* Il totale si dichiara solo a chi vede tutta l'azienda: con l'accesso
     limitato ad alcuni progetti la somma sarebbe un numero plausibile e
     sbagliato. Il limite vero lo fa rispettare la rotta di caricamento. */
  const complete = data.company.scope === 'all'
  const used = complete ? data.materials.reduce((sum, m) => sum + Number(m.size ?? 0), 0) : 0

  return <>
    <PortalHeading eyebrow="I tuoi file" title="Lo spazio della tua azienda.">
      Carica quello che serve al lavoro — immagini, video, audio, documenti — e ritrovalo qui quando ti serve.
      Lo vedono i colleghi della tua azienda che hanno accesso al portale e il team TwoBee: nessun altro.
    </PortalHeading>
    <MaterialUploader
      clientId={data.company.id}
      viewerName={data.name ?? ''}
      canWrite={data.company.role !== 'lettore' && !data.preview}
      projects={data.projects.map(p => ({ id: p.id, title: p.title }))}
      materials={data.materials}
      usedBytes={used}
      showQuota={complete}
    />
  </>
}
