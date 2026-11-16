import LabReconciliations from '@/components/lab/LabReconciliations'
import { requireLabAdmin } from '@/lib/lab-guard'
import { romeToday } from '@/lib/lab-bank'
import { loadLabReconciliations } from '@/lib/lab-reconciliations-load'
export const dynamic = 'force-dynamic'
export default async function LabReconciliationsPage({ searchParams }: { searchParams: { nuovo?: string; movimento?: string; documento?: string } }) {
  await requireLabAdmin()
  try {
    const data = await loadLabReconciliations(romeToday())
    return <div className="mx-auto min-w-0 max-w-6xl space-y-5 px-4 py-5 sm:p-6"><header className="space-y-2"><h1 className="text-xl font-semibold text-text-primary">Raccordi banca e fatture</h1><p className="text-sm text-text-secondary">Collega, controlla e gestisci i pagamenti in un unico posto.</p></header><LabReconciliations initial={data} autoOpen={searchParams.nuovo === '1'} initialMovement={typeof searchParams.movimento === 'string' ? searchParams.movimento : undefined} initialDocument={typeof searchParams.documento === 'string' ? searchParams.documento : undefined} /></div>
  } catch { return <p role="alert" className="p-6 text-sm text-warning">Fonti dei raccordi non disponibili. Ricarica prima di verificare o modificare i collegamenti.</p> }
}
