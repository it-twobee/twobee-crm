import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getPortalContext } from '@/lib/portal/server'
import { PortalShell } from '@/components/portal/PortalShell'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Spazio cliente · TwoBee', description: 'Progetti, attività e richieste condivise con TwoBee.', robots: { index: false, follow: false } }

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const requested = (await headers()).get('x-portal-client') || undefined
  const context = await getPortalContext(requested)
  return <PortalShell companies={context.companies} selected={context.company?.id ?? null} preview={context.preview} name={context.name}>{children}</PortalShell>
}
