import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { SharedKeysSettings } from '@/components/tracking/SharedKeysSettings'
import { sharedSettingsProps } from '@/lib/tracking/settings-data'
import { canManageAgencyKeys } from '@/lib/permissions'

export const revalidate = 0

/** §316 — chiavi condivise (service account GA4, token Meta) e riepilogo di definizioni e checklist. */
export default async function TrackingSettingsPage() {
  const { profile, isAdmin } = await getViewer()
  if (!profile) redirect('/login')
  if (!isAdmin && !canManageAgencyKeys(profile.app_role)) redirect('/dashboard')
  return <SharedKeysSettings {...sharedSettingsProps()} backHref="/tracking" />
}
