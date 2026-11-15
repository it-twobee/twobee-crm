import { redirect } from 'next/navigation'
import { hasLabAccess } from '@/lib/lab-guard'
import { Suspense } from 'react'
import LabNavigation from '@/components/lab/LabNavigation'

export default async function LabLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasLabAccess())) redirect('/dashboard')
  return <div className="min-w-0"><Suspense fallback={null}><LabNavigation /></Suspense>{children}</div>
}
