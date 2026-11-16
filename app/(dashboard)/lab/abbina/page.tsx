import { redirect } from 'next/navigation'
import { requireLabAdmin } from '@/lib/lab-guard'
export const dynamic = 'force-dynamic'
export default async function LabMatchingPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireLabAdmin()
  const p = new URLSearchParams({ nuovo: '1' })
  for (const key of ['movimento', 'documento', 'm', 'from', 'origine']) { const value = searchParams[key]; if (typeof value === 'string') p.set(key, value) }
  redirect(`/lab/raccordi?${p}`)
}
