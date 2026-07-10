import type { Metadata } from 'next'
import { Inter, League_Spartan } from 'next/font/google'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemedToaster } from '@/components/theme/ThemedToaster'
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('twobee-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-background antialiased">
        <ThemeProvider>
          {children}
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
