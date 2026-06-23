import { Toaster } from 'sonner'

export default function TicketPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster theme="dark" position="top-right" />
    </>
  )
}
