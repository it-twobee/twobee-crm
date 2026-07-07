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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=League+Spartan:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background antialiased">
        {children}
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: '#FFFFFF',
            },
          }}
        />
      </body>
    </html>
  )
}
