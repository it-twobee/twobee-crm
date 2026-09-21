import Link from 'next/link'
import { getSessionProfile } from '@/lib/auth'
import { canPreviewClientPortal } from '@/lib/permissions'

export async function ClientPortalPreviewLink() {
  const profile = await getSessionProfile()
  if (!canPreviewClientPortal(profile)) return null
  return <Link href="/portale" className="inline-flex min-h-11 items-center text-sm font-semibold text-gold-text">Apri portale cliente →</Link>
}
