import { redirect } from 'next/navigation'
import { hasLabAccess } from '@/lib/lab-guard'

export default async function LabLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasLabAccess())) redirect('/dashboard')
  return <>{children}</>
}
