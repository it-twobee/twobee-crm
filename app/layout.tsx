import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'TWO BEE Gestionale',
  description: 'Piattaforma operativa interna TWO BEE S.R.L.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <body className="bg-background antialiased">
        {children}
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: '#1A1A1A',
              border: '1px solid #2A2A2A',
              color: '#FFFFFF',
            },
          }}
        />
      </body>
    </html>
  )
}
