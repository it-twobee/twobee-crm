import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth'
import { isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { AsanaClient } from '@/components/asana/AsanaClient'

export const revalidate = 0

/**
 * §215 — Sezione **temporanea**: serve al travaso da Asana e va tolta quando è
 * finito. Il gate è qui e non solo nella voce di menu: nascondere un link non è
 * una barriera, e questa pagina legge il workspace intero con il token di Marco.
 */
export default async function AsanaPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  const isAdmin = isSuperAdminRaw(profile.email, profile.app_role)
    || isAdminRole(profile.app_role) || profile.role === 'admin'
  if (!isAdmin) redirect('/dashboard')

  return <AsanaClient />
}
