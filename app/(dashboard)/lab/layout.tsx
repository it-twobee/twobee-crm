import { redirect } from 'next/navigation'
import { hasLabAccess } from '@/lib/lab-guard'
import { Suspense } from 'react'
import { LabJourneyProvider } from '@/components/lab/LabJourney'
import { romeToday } from '@/lib/lab-bank'
import LabReconciliationProvider from '@/components/lab/LabReconciliationProvider'
import LabNavigation from '@/components/lab/LabNavigation'

export default async function LabLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasLabAccess())) redirect('/dashboard')
  return <div className="min-w-0"><Suspense fallback={<p className="p-4 text-sm text-text-secondary">Caricamento del percorso…</p>}><LabJourneyProvider today={romeToday()}><LabReconciliationProvider><LabNavigation />{children}</LabReconciliationProvider></LabJourneyProvider></Suspense></div>
}
