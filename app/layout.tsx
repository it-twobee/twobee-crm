import type { Metadata } from 'next'
import { Inter, League_Spartan } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
})

const leagueSpartan = League_Spartan({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-league',
  display: 'swap',
})

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
    <html lang="it" className={`${inter.variable} ${leagueSpartan.variable}`}>
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
