import LabMatching from '@/components/lab/LabMatching'
import { requireLabAdmin } from '@/lib/lab-guard'
import { romeToday } from '@/lib/lab-bank'
import { loadLabMatching } from '@/lib/lab-matching-load'
export const dynamic = 'force-dynamic'
export default async function LabMatchingPage({ searchParams }: { searchParams: { movimento?: string; documento?: string } }) {
  await requireLabAdmin()
  const data = await loadLabMatching(romeToday())
  return <div className="mx-auto max-w-5xl min-w-0 space-y-5 px-4 py-5 sm:p-6"><header className="space-y-2"><h1 className="text-xl font-semibold text-text-primary">Abbina movimenti e fatture</h1><p className="text-sm text-text-secondary">Un bonifico può pagare più fatture. Una fattura può ricevere più bonifici. Scegli le fonti e controlla le quote e ciò che resta, nella stessa schermata.</p><p className="text-2xs text-text-tertiary">Laboratorio · anteprima interattiva · nessun abbinamento salvato</p></header>{!data.ok ? <p role="alert" className="rounded-xl bg-warning-dim p-4 text-sm text-warning">Una fonte non è disponibile. Disponibilità e residui non vengono sostituiti con zero.</p> : <LabMatching key={`${searchParams.movimento ?? ''}:${searchParams.documento ?? ''}`} movements={data.movements} invoices={data.invoices} initialMovement={typeof searchParams.movimento === 'string' ? searchParams.movimento : undefined} initialDocument={typeof searchParams.documento === 'string' ? searchParams.documento : undefined} observedAt={data.observedAt} />}</div>
}
