import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { AgencyKeysSettings } from '@/components/tracking/AgencyKeysSettings'
import { agencySettingsProps } from '@/lib/tracking/settings-data'
import { canManageAgencyKeys } from '@/lib/permissions'

export const revalidate = 0

/** §316 — stessa pagina dell'admin, per i manager confinati al workspace. */
export default async function WorkspaceTrackingSettingsPage() {
  const { profile, isAdmin } = await getViewer()
  if (!profile) redirect('/login')
  if (!isAdmin && !canManageAgencyKeys(profile.app_role)) redirect('/workspace/tracking')
  return <AgencyKeysSettings {...agencySettingsProps()} backHref="/workspace/tracking" />
}
