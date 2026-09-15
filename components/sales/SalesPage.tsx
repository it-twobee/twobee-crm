import { redirect } from 'next/navigation'
import { getSalesAccess } from '@/lib/sales-guard'
import { getSalesData } from '@/app/actions/sales'
import { SalesWorkspace } from './SalesWorkspace'

export async function SalesPage({ base }: { base: string }) {
  if (!await getSalesAccess()) redirect(base ? '/workspace' : '/dashboard')
  try {
    const data = await getSalesData()
    return <SalesWorkspace initial={data} base={base} />
  } catch (error) {
    return <div className="p-6 space-y-3"><h1 className="text-2xl font-semibold text-text-primary">Commerciale</h1>
      <p role="alert" className="text-warning">{error instanceof Error ? error.message : 'Area commerciale non disponibile'}</p>
    </div>
  }
}
