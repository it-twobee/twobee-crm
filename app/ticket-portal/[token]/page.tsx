import { getPortalInfo, getPortalTickets } from '@/app/actions/ticket-portal'
import { TicketPortalClient } from '@/components/ticket/TicketPortalClient'
import { notFound } from 'next/navigation'

export const revalidate = 0

interface Props {
  params: { token: string }
}

export default async function TicketPortalPage({ params }: Props) {
  const [portalInfo, tickets] = await Promise.all([
    getPortalInfo(params.token),
    getPortalTickets(params.token),
  ])

  if (!portalInfo) notFound()

  return (
    <TicketPortalClient
      token={params.token}
      portalInfo={portalInfo}
      initialTickets={tickets}
    />
  )
}
